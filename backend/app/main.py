"""Prerana Pulse API (FastAPI), v2: band-only.

The child uses only the band, which talks to gateways (POST /api/gw/ingest). Adults use one app
with four roles (teacher, counsellor, principal, parent). The routes below match what the web app
calls, so the same app runs against the in-browser engine or this server."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import statistics
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from . import casework, clock, ingest, insights, manage, model, seed, workers
from .config import settings
from .content import DIFFICULT, GW, WHEN, WHERE, timetable_for
from .db import db
from .erp import erp
from .schoolcal import SchoolCalendar
from .security import issue_session, read_session

STAFF = {"teacher", "counsellor", "principal", "pocso", "nurse", "management", "admin"}
SOS_KINDS = ("sos", "medical_sos")
_card: dict | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.open()
    async with db.tx(system=True) as tx:
        off = await tx.val("SELECT value FROM app_settings WHERE key = 'clock_offset'")
    clock.set_offset(float(off) if off is not None else 0.0)
    tasks = workers.start_background()
    yield
    for t in tasks:
        t.cancel()
    await db.close()


app = FastAPI(title="Prerana Pulse API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------- auth


async def current_user(request: Request, authorization: str | None = Header(None)) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip() or request.query_params.get("token", "")
    uid = read_session(token) if token else None
    if not uid:
        raise HTTPException(401, "sign in first")
    async with db.tx(system=True) as tx:
        u = await casework.user(tx, uid)
    if not u:
        raise HTTPException(401, "unknown user")
    return u


def need(u: dict, *roles: str) -> None:
    if u["role"] not in roles:
        raise HTTPException(403, "not allowed for your role")


def person(u: dict | None) -> dict | None:
    if not u:
        return None
    row = next((r for r in erp.roster() if r["erp_ref"] == u["erp_ref"]), {})
    return {"id": str(u["id"]), "name": casework.name_of(u), "label": casework.label(u), "role": u["role"],
            "title": row.get("title"), "class": u.get("class_name")}


@app.get("/api/config")
async def config():
    return {"demo_mode": settings.demo_mode, "version": app.version, "engine": "fastapi"}


@app.get("/api/auth/demo-users")
async def demo_users():
    async with db.tx(system=True) as tx:
        rows = await tx.all("SELECT u.*, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id "
                            "WHERE u.role <> 'student' ORDER BY u.role, u.erp_ref")
    return [person(r) for r in rows]


class Login(BaseModel):
    user_id: str


@app.post("/api/auth/login")
async def login(body: Login):
    async with db.tx(system=True) as tx:
        u = await casework.user(tx, body.user_id)
    if not u:
        raise HTTPException(404, "no such user")
    return {"token": issue_session(str(u["id"])), "user": person(u)}


@app.get("/api/me")
async def me(u: dict = Depends(current_user)):
    out: dict[str, Any] = {"user": person(u)}
    async with db.tx(u["school_id"]) as tx:
        cl = await tx.one("SELECT id, name FROM classes WHERE class_teacher_id = %s", u["id"])
        if cl:
            out["class"] = {"id": str(cl["id"]), "name": cl["name"]}
        rows = await tx.all("SELECT u.*, c.name AS class_name FROM trusted_adults t JOIN users u ON u.id = t.student_id "
                            "LEFT JOIN classes c ON c.id = u.class_id WHERE t.adult_id = %s ORDER BY u.erp_ref", u["id"])
        out["chosen_by"] = [person(r) for r in rows]
        if u["role"] == "parent" and u["child_id"]:
            out["child"] = person(await casework.user(tx, u["child_id"]))
    return out

# ---------------------------------------------------------------- cases


async def _summary(tx, case: dict, viewer: dict) -> dict:
    st = await casework.user(tx, case["student_id"]) if case["student_id"] else None
    msg = None
    if case["call"] and case["call"].get("message_id"):
        msg = await tx.one("SELECT * FROM band_messages WHERE id = %s", case["call"]["message_id"])
    else:
        msg = await tx.one("SELECT * FROM band_messages WHERE case_id = %s ORDER BY id DESC LIMIT 1", case["id"])
    loc = None
    if case["location_gateway"]:
        g = GW.get(case["location_gateway"])
        loc = {"gw": case["location_gateway"], "at": case["location_at"], "x": g[3] if g else None, "y": g[4] if g else None}
    nurse = await tx.val("SELECT nurse_on_sos FROM health_profiles WHERE student_id = %s", case["student_id"]) if st else False
    going = await casework.user(tx, case["going_by"]) if case["going_by"] else None
    return {
        "id": str(case["id"]), "ref": case["ref"], "kind": case["kind"], "route": case["route"], "status": case["status"],
        "level": case["level"], "rung": case["rung"], "student": person(st),
        "recipients": [person(await casework.user(tx, r)) for r in case["recipients"]],
        "mine": viewer["id"] in case["recipients"], "deadline": case["deadline"], "created_at": case["created_at"],
        "first_response_at": case["first_response_at"], "acknowledged_at": case["acknowledged_at"], "going_by": person(going),
        "call": case["call"],
        "message": {"kind": msg["kind"], "vars": msg["vars"], "text": msg["text"], "delivered": msg["delivered_at"] is not None,
                    "seen": msg["seen_at"] is not None} if msg else None,
        "location": loc, "trail": case["trail"] or [], "health_note": "nurse" if nurse else None,
    }


def can_open(u: dict, case: dict) -> bool:
    if u["role"] == "principal":
        return True
    if u["id"] in (case["ever_recipients"] or []):
        return True
    return u["role"] == "counsellor" and case["route"] != "staff"


async def _load_case(tx, case_id: str, u: dict) -> dict:
    try:
        case = await tx.one("SELECT * FROM cases WHERE id = %s", case_id)
    except psycopg.errors.InvalidTextRepresentation:
        case = None
    if not case or not can_open(u, case):
        raise HTTPException(404, "case not found")
    return case


class Reason(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


async def _log_access(tx, u: dict, key: str, reason: str, case_id=None, student_id=None) -> None:
    await tx.run("INSERT INTO access_log (school_id, user_id, key, case_id, student_id, reason, at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                 u["school_id"], u["id"], key, case_id, student_id, reason, clock.now())


async def _has_access(tx, u: dict, key: str) -> bool:
    return bool(await tx.val("SELECT 1 FROM access_log WHERE key = %s AND user_id = %s AND at > %s LIMIT 1", key, u["id"], clock.now() - timedelta(hours=12)))


@app.get("/api/queue")
async def queue(u: dict = Depends(current_user), include_closed: bool = False):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT * FROM cases WHERE school_id = %s AND (%s OR status NOT IN ('resolved','cancelled')) "
                            "ORDER BY created_at DESC LIMIT 200", u["school_id"], include_closed)
        visible = [c for c in rows if can_open(u, c) and (u["role"] in ("principal", "counsellor") or u["id"] in c["ever_recipients"])]

        def rank(c):
            sos_open = c["kind"] in SOS_KINDS and c["status"] in ("open", "acknowledged")
            return (0 if sos_open else 1 if c["status"] == "open" else 2, c["deadline"] or datetime.max.replace(tzinfo=clock.now().tzinfo))
        visible.sort(key=rank)
        return [await _summary(tx, c, u) for c in visible]


@app.post("/api/cases/{case_id}/open")
async def open_case(case_id: str, body: Reason, u: dict = Depends(current_user)):
    """Staff give a reason before reading a case. It is logged, and the history shows who opened it and why."""
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        await _log_access(tx, u, str(case["id"]), body.reason, case_id=case["id"], student_id=case["student_id"])
        await casework.add_event(tx, case, "opened", clock.now(), u["id"], reason=body.reason)
    return {"ok": True}


@app.get("/api/cases/{case_id}")
async def get_case(case_id: str, u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        if case["kind"] not in SOS_KINDS and not await _has_access(tx, u, str(case["id"])):
            raise HTTPException(428, "give a reason before opening this request")
        out = await _summary(tx, case, u)
        log = await tx.all("SELECT * FROM access_log WHERE case_id = %s ORDER BY at", case["id"])
        out["opened_by"] = [{"who": person(await casework.user(tx, r["user_id"])), "reason": r["reason"], "at": r["at"]} for r in log]
        ev = await tx.all("SELECT * FROM case_events WHERE case_id = %s ORDER BY id", case["id"])
        out["timeline"] = [{"at": e["at"], "kind": e["kind"], "detail": e["detail"],
                            "actor": casework.label(await casework.user(tx, e["actor_id"])) if e["actor_id"] else None} for e in ev]
        out["chain_ok"] = await casework.verify_chain(tx, case["id"])
    return out


class CallBody(BaseModel):
    when: str
    where: str


@app.post("/api/cases/{case_id}/call")
async def call(case_id: str, body: CallBody, u: dict = Depends(current_user)):
    need(u, *STAFF)
    if body.when not in WHEN or body.where not in WHERE:
        raise HTTPException(422, "choose when and where")
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        try:
            case = await casework.call_to_talk(tx, case["id"], u, body.when, body.where, clock.now())
        except ValueError as e:
            raise HTTPException(400, str(e))
        return await _summary(tx, case, u)


class Note(BaseModel):
    note: str = ""


@app.post("/api/cases/{case_id}/talked")
async def talked(case_id: str, body: Note, u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        await casework.talked(tx, case["id"], u, body.note, clock.now())
    return {"ok": True}


class Handover(BaseModel):
    to: str = "counsellor"


@app.post("/api/cases/{case_id}/handover")
async def handover(case_id: str, body: Handover, u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        await casework.handover(tx, case["id"], u, body.to, clock.now())
    return {"ok": True}


@app.post("/api/cases/{case_id}/ack")
async def ack(case_id: str, u: dict = Depends(current_user)):
    """"I'm going": the first adult to tap it is shown to the others and on the child's band."""
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        try:
            await casework.going(tx, case["id"], u, clock.now())
        except ValueError as e:
            raise HTTPException(400, str(e))
    return {"ok": True}


@app.post("/api/cases/{case_id}/resolve")
@app.post("/api/cases/{case_id}/reached")
async def resolve(case_id: str, body: Note, u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        case = await _load_case(tx, case_id, u)
        if case["kind"] in SOS_KINDS:
            await casework.reached(tx, case["id"], u, body.note, clock.now())
        else:
            await casework.talked(tx, case["id"], u, body.note, clock.now())
    return {"ok": True}


@app.get("/api/cases/{case_id}/verify")
async def verify(case_id: str, u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        await _load_case(tx, case_id, u)
        return {"chain_ok": await casework.verify_chain(tx, case_id)}

# ---------------------------------------------------------------- SOS, patterns, children


@app.get("/api/sos/active")
async def sos_active(u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT * FROM cases WHERE school_id = %s AND kind = ANY(%s) AND status IN ('open','acknowledged') ORDER BY created_at DESC",
                            u["school_id"], list(SOS_KINDS))
        rows = [c for c in rows if u["id"] in c["ever_recipients"] or u["role"] in ("principal", "counsellor")]
        return [await _summary(tx, c, u) for c in rows]


@app.get("/api/sos/history")
async def sos_history(u: dict = Depends(current_user)):
    need(u, *STAFF)
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT * FROM cases WHERE school_id = %s AND kind = ANY(%s) ORDER BY created_at DESC LIMIT 10", u["school_id"], list(SOS_KINDS))
        rows = [c for c in rows if u["id"] in c["ever_recipients"] or u["role"] in ("principal", "counsellor")]
        out = []
        for c in rows:
            s = await _summary(tx, c, u)
            s["minutes_to_reach"] = round((c["acknowledged_at"] - c["created_at"]).total_seconds() / 60) if c["acknowledged_at"] else None
            out.append(s)
        return out


@app.get("/api/patterns")
async def patterns(u: dict = Depends(current_user)):
    need(u, "counsellor", "principal")
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT * FROM alerts WHERE school_id = %s AND rule = 'persistent' ORDER BY at DESC", u["school_id"])
        return [{"id": r["id"], "student": person(await casework.user(tx, r["student_id"])), "code": r["detail"]["code"],
                 "days": r["detail"]["days"], "at": r["at"]} for r in rows]


@app.post("/api/students/{student_id}/open")
async def open_student(student_id: str, body: Reason, u: dict = Depends(current_user)):
    need(u, "counsellor", "principal")
    async with db.tx(u["school_id"]) as tx:
        await _log_access(tx, u, f"st:{student_id}", body.reason, student_id=student_id)
    return {"ok": True}


class TalkCheckin(BaseModel):
    when: str
    where: str
    reason: str | None = None


@app.post("/api/students/{student_id}/call")
async def call_student(student_id: str, body: TalkCheckin, u: dict = Depends(current_user)):
    """A check-in the counsellor starts from a pattern note (no request from the child): the same band message."""
    need(u, "counsellor", "principal")
    if body.when not in WHEN or body.where not in WHERE:
        raise HTTPException(422, "choose when and where")
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        st = await casework.user(tx, student_id)
        if not st or st["role"] != "student":
            raise HTTPException(404, "no such student")
        case = await casework._new_case(tx, u["school_id"], student_id=st["id"], kind="talk", route="counsellor", rung="counsellor",
                                        recipients=[u["id"]], ever_recipients=[u["id"]], level_started_at=now, created_at=now)
        await casework.add_event(tx, case, "created", now, u["id"], kind="checkin", reason=body.reason or "Feelings pattern")
        await _log_access(tx, u, str(case["id"]), body.reason or "Feelings pattern", case_id=case["id"], student_id=st["id"])
        case = await casework.call_to_talk(tx, case["id"], u, body.when, body.where, now)
        return await _summary(tx, case, u)


class Text(BaseModel):
    text: str = Field(min_length=1, max_length=400)


@app.post("/api/students/{student_id}/inform-parent")
async def inform_parent(student_id: str, body: Text, u: dict = Depends(current_user)):
    """Parents hear from the counsellor, only what the counsellor chooses to share. Never automatic."""
    need(u, "counsellor", "principal")
    async with db.tx(u["school_id"]) as tx:
        await casework.share_with_parent(tx, u["school_id"], student_id, u, body.text.strip(), clock.now())
    return {"ok": True}


@app.get("/api/students/{student_id}")
async def student_page(student_id: str, u: dict = Depends(current_user)):
    need(u, "counsellor", "principal")
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        st = await casework.user(tx, student_id)
        if not st or st["role"] != "student":
            raise HTTPException(404, "no such student")
        if not await _has_access(tx, u, f"st:{st['id']}"):
            raise HTTPException(428, "give a reason before opening a child's page")
        consent = await tx.one("SELECT sensing, feelings_to_counsellor, given_by, given_at FROM consents WHERE student_id = %s", st["id"])
        reported = bool(await tx.val("SELECT 1 FROM alerts WHERE student_id = %s AND rule = 'persistent' LIMIT 1", st["id"]))
        visible = consent["feelings_to_counsellor"] or reported
        timeline = None
        if visible:
            cal = SchoolCalendar(await casework.school(tx, u["school_id"]))
            days = cal.school_days_back(now, 14)
            rows = await tx.all("SELECT code, at FROM feelings WHERE student_id = %s AND NOT skipped AND at >= %s ORDER BY at",
                                st["id"], datetime.combine(days[0], datetime.min.time(), tzinfo=cal.tz))
            timeline = []
            for d in days:
                codes = [r["code"] for r in rows if cal.local(r["at"]).date() == d]
                pick = next((c for c in codes if c in DIFFICULT), codes[-1] if codes else None)
                timeline.append({"date": d.isoformat(), "code": pick, "all": codes})
        adult = await casework.chosen_adult(tx, st["id"])
        cases = await tx.all("SELECT * FROM cases WHERE student_id = %s ORDER BY created_at DESC LIMIT 6", st["id"])
        opened = await tx.all("SELECT * FROM access_log WHERE student_id = %s ORDER BY at", st["id"])
        pm = await casework.parent_messages(tx, u["school_id"], st["id"])
        return {"student": person(st), "consent": consent, "visible": visible, "reported": reported, "timeline": timeline,
                "adult": person(await casework.user(tx, adult)) if adult else None,
                "cases": [await _summary(tx, c, u) for c in cases],
                "opened_by": [{"who": person(await casework.user(tx, r["user_id"])), "reason": r["reason"], "at": r["at"]} for r in opened],
                "parent_messages": [{"text": m["text"], "at": m["at"]} for m in pm]}

# ---------------------------------------------------------------- class weather, timetable, activities


@app.get("/api/class/{class_id}/mood")
async def class_mood(class_id: str, u: dict = Depends(current_user)):
    need(u, "teacher", "counsellor", "principal")
    async with db.tx(u["school_id"]) as tx:
        return await insights.class_mood(tx, u["school_id"], class_id, clock.now())


@app.get("/api/class/{class_id}/timetable")
async def class_timetable(class_id: str, u: dict = Depends(current_user)):
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        cl = await tx.one("SELECT * FROM classes WHERE id = %s", class_id)
        if not cl:
            raise HTTPException(404, "no class")
        cal = SchoolCalendar(await casework.school(tx, u["school_id"]))
        loc = cal.local(now)
        hm = loc.strftime("%H:%M")
        periods = timetable_for(cl["name"])
        cur = next((dict(p) for p in periods if cal.is_school_day(loc.date()) and p["start"] <= hm < p["end"]), {"subject": "none", "pauses": False})
        pt = await tx.val("SELECT count(*) FROM bands b JOIN users s ON s.id = b.student_id WHERE s.class_id = %s AND b.pt_until > %s", cl["id"], now)
    return {"class": cl["name"], "periods": periods, "now": cur, "pt_bands": pt}


class Done(BaseModel):
    code: str


@app.post("/api/activities/{class_id}/done")
async def activity_done(class_id: str, body: Done, u: dict = Depends(current_user)):
    need(u, "teacher")
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        cal = SchoolCalendar(await casework.school(tx, u["school_id"]))
        await tx.run("INSERT INTO activities (school_id, class_id, activity_code, day, done_at) VALUES (%s,%s,%s,%s,%s) "
                     "ON CONFLICT (class_id, activity_code, day) DO UPDATE SET done_at = EXCLUDED.done_at",
                     u["school_id"], class_id, body.code, cal.local(now).date(), now)
        await tx.notify({"school": str(u["school_id"]), "type": "activity"})
    return {"ok": True}

# ---------------------------------------------------------------- notifications, reports, devices


@app.get("/api/notifications")
async def notifications(u: dict = Depends(current_user)):
    async with db.tx(u["school_id"]) as tx:
        panel = u["role"] in ("principal",)
        rows = await tx.all("SELECT * FROM notifications WHERE school_id = %s AND (user_id = %s OR (%s AND user_id IS NULL)) "
                            "ORDER BY id DESC LIMIT 40", u["school_id"], u["id"], panel)
    return [{"id": r["id"], "channel": r["channel"], "kind": r["kind"], "vars": r["vars"], "title": r["title"], "body": r["body"],
             "case_id": str(r["case_id"]) if r["case_id"] else None, "at": r["created_at"], "read": r["read_at"] is not None,
             "panel": r["user_id"] is None} for r in rows]


@app.post("/api/notifications/read")
async def notifications_read(u: dict = Depends(current_user)):
    async with db.tx(u["school_id"]) as tx:
        await tx.run("UPDATE notifications SET read_at = %s WHERE user_id = %s AND read_at IS NULL", clock.now(), u["id"])
    return {"ok": True}


@app.get("/api/insights/rules")
async def rules():
    return insights.RULES


@app.get("/api/reports/response")
async def response_report(u: dict = Depends(current_user)):
    need(u, "principal", "management", "counsellor")
    return await _report(u)


async def _report(u: dict) -> dict:
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT * FROM cases WHERE school_id = %s AND created_at > %s", u["school_id"], now - timedelta(days=30))
        missed = await tx.all("SELECT DISTINCT case_id FROM case_events WHERE school_id = %s AND kind = 'deadline_missed' AND at > %s",
                              u["school_id"], now - timedelta(days=30))
    missed_ids = {m["case_id"] for m in missed}
    talks = [c for c in rows if c["kind"] == "talk" and c["first_response_at"]]
    mins = [(c["first_response_at"] - c["created_at"]).total_seconds() / 60 for c in talks]
    sos = [c for c in rows if c["kind"] != "talk"]
    ack = [(c["acknowledged_at"] - c["created_at"]).total_seconds() / 60 for c in sos if c["acknowledged_at"]]

    def count(f):
        return sum(1 for c in rows if f(c))
    return {
        "window_days": 30, "cases": len(rows),
        "by_kind": {"talk": count(lambda c: c["kind"] == "talk"), "sos": count(lambda c: c["kind"] == "sos"), "medical_sos": count(lambda c: c["kind"] == "medical_sos")},
        "by_route": {k: count(lambda c, k=k: c["route"] == k) for k in ("adult", "counsellor", "staff")},
        "median_response_minutes": round(statistics.median(mins)) if mins else None,
        "on_time_share": round(sum(1 for c in talks if c["id"] not in missed_ids) / len(talks), 2) if talks else None,
        "moved_up": len(missed_ids), "open": count(lambda c: c["status"] in ("open", "acknowledged", "responded")), "sos": len(sos),
        "open_sos": count(lambda c: c["kind"] != "talk" and c["status"] in ("open", "acknowledged")),
        "median_sos_ack_minutes": round(statistics.median(ack), 1) if ack else None,
        "unanswered": count(lambda c: c["kind"] == "talk" and c["rung"] == "management" and c["status"] == "open"),
        "basis": "Supreme Court of India, Sukdeb Saha v. State of Andhra Pradesh (25 Jul 2025): confidential reporting and counselling",
    }


@app.get("/api/reports/response.csv", response_class=PlainTextResponse)
async def response_csv(u: dict = Depends(current_user)):
    need(u, "principal", "management")
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT ref, kind, route, status, level, created_at, first_response_at, acknowledged_at, deadline FROM cases "
                            "WHERE school_id = %s ORDER BY created_at", u["school_id"])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ref", "kind", "route", "status", "level", "created_at", "first_response_at", "deadline", "minutes_to_respond"])
    for r in rows:
        t = r["first_response_at"] or r["acknowledged_at"]
        w.writerow([r["ref"], r["kind"], r["route"] or "", r["status"], r["level"], r["created_at"], t or "", r["deadline"] or "",
                    round((t - r["created_at"]).total_seconds() / 60) if t else ""])
    return buf.getvalue()


@app.get("/api/gateways")
async def gateways(u: dict = Depends(current_user)):
    need(u, "admin", "principal", "counsellor")
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        gws = await tx.all("SELECT * FROM gateways WHERE school_id = %s ORDER BY id", u["school_id"])
        heard = await tx.all("SELECT unnest(gateways) AS g, count(*) AS n FROM band_events WHERE school_id = %s AND received_at > %s GROUP BY 1",
                             u["school_id"], now - timedelta(hours=8))
        bands = await tx.all("SELECT b.id, b.battery, b.last_seen, u.erp_ref, c.name AS class_name FROM bands b "
                             "LEFT JOIN users u ON u.id = b.student_id LEFT JOIN classes c ON c.id = u.class_id WHERE b.school_id = %s ORDER BY b.id", u["school_id"])
        cal = SchoolCalendar(await casework.school(tx, u["school_id"]))
    hmap = {h["g"]: h["n"] for h in heard}
    out = []
    for g in gws:
        age = (now - g["last_heartbeat"]).total_seconds() if g["last_heartbeat"] else None
        ok = age is not None and age < settings.gateway_stale_seconds
        out.append({"id": g["id"], "kind": g["kind"], "location": g["location"], "x": g["map_x"], "y": g["map_y"], "version": g["version"], "ok": ok,
                    "last_heartbeat": g["last_heartbeat"], "messages_today": hmap.get(g["id"], 0),
                    "status": "Online" if ok else f"No gateway heard since {casework.fmt_time(cal, g['last_heartbeat'], now)}"})
    band_rows = [{"id": b["id"], "student": erp.name(b["erp_ref"]) if b["erp_ref"] else None, "class": b["class_name"], "battery": b["battery"],
                  "last_seen": b["last_seen"], "low_battery": (b["battery"] if b["battery"] is not None else 100) < 25,
                  "silent_today": not b["last_seen"] or cal.local(b["last_seen"]).date() != cal.local(now).date()} for b in bands]
    return {"gateways": out, "bands": band_rows}


@app.get("/api/classes")
async def classes(u: dict = Depends(current_user)):
    async with db.tx(u["school_id"]) as tx:
        rows = await tx.all("SELECT id, name FROM classes WHERE school_id = %s ORDER BY name", u["school_id"])
    return [{"id": str(r["id"]), "name": r["name"]} for r in rows]

# ---------------------------------------------------------------- parents


@app.get("/api/parent/home")
async def parent_home(u: dict = Depends(current_user)):
    need(u, "parent")
    now = clock.now()
    async with db.tx(u["school_id"]) as tx:
        st = await casework.user(tx, u["child_id"])
        band = await casework.band_of(tx, st["id"])
        cal = SchoolCalendar(await casework.school(tx, u["school_id"]))
        consent = await tx.one("SELECT sensing, feelings_to_counsellor, given_by, given_at FROM consents WHERE student_id = %s", st["id"])
        note = await tx.val("SELECT note FROM health_profiles WHERE student_id = %s", st["id"])
        msgs = await casework.parent_messages(tx, u["school_id"], st["id"])
        out_msgs = [{"text": m["text"], "from": person(await casework.user(tx, m["from_user"])), "at": m["at"]} for m in msgs]
    b = None
    if band:
        b = {"id": band["id"], "battery": band["battery"], "last_seen": band["last_seen"], "charge_tonight": (band["battery"] or 100) < 40,
             "worn_today": bool(band["last_seen"]) and cal.local(band["last_seen"]).date() == cal.local(now).date()}
    return {"child": person(st), "band": b, "messages": out_msgs, "consent": consent, "health_note": note, "language": u["language"]}


class Consent(BaseModel):
    sensing: bool | None = None
    feelings_to_counsellor: bool | None = None
    health_note: str | None = Field(None, max_length=300)
    language: str | None = None


@app.post("/api/parent/consent")
async def parent_consent(body: Consent, u: dict = Depends(current_user)):
    need(u, "parent")
    async with db.tx(u["school_id"]) as tx:
        sid = u["child_id"]
        if body.sensing is not None:
            await tx.run("UPDATE consents SET sensing = %s WHERE student_id = %s", body.sensing, sid)
        if body.feelings_to_counsellor is not None:
            await tx.run("UPDATE consents SET feelings_to_counsellor = %s WHERE student_id = %s", body.feelings_to_counsellor, sid)
        if body.health_note is not None:
            await tx.run("UPDATE health_profiles SET note = %s WHERE student_id = %s", body.health_note, sid)
        if body.language:
            await tx.run("UPDATE users SET language = %s WHERE id = %s", "hi" if body.language == "hi" else "en", u["id"])
        await tx.run("UPDATE consents SET given_by = %s, given_at = %s WHERE student_id = %s", casework.name_of(u), clock.now(), sid)
        consent = await tx.one("SELECT sensing, feelings_to_counsellor FROM consents WHERE student_id = %s", sid)
        await tx.notify({"school": str(u["school_id"]), "type": "consent"})
    return {"ok": True, "consent": consent}

# ---------------------------------------------------------------- the emotion model


@app.get("/api/model/card")
async def model_card():
    global _card
    if _card is None:
        _card = {k: v for k, v in model.evaluate().items() if k != "school"}
    return _card


@app.get("/api/model/suggest")
async def model_suggest(band: int, rise: str = "r30", move: str = "still"):
    async with db.tx(system=True) as tx:
        b = await tx.one("SELECT * FROM bands WHERE id = %s", band)
        if not b:
            raise HTTPException(404, "no band")
        st = await casework.user(tx, b["student_id"])
        ctx = await insights.ctx_at(tx, st, clock.now(), rise=rise, move=move)
        return model.suggest(b["model"], await insights.school_model(tx), ctx)

# ---------------------------------------------------------------- gateway API


class IngestItem(BaseModel):
    hex: str
    rssi: int | None = None


class Ingest(BaseModel):
    packets: list[str | IngestItem] = Field(max_length=64)


async def gateway_auth(x_gateway_id: str = Header(...), authorization: str = Header(...)) -> dict:
    gw = await ingest.authenticate_gateway(x_gateway_id, authorization.removeprefix("Bearer ").strip())
    if not gw:
        raise HTTPException(401, "unknown gateway")
    return gw


@app.post("/api/gw/ingest")
async def gw_ingest(body: Ingest, gw: dict = Depends(gateway_auth)):
    results = []
    for item in body.packets:
        hx, rssi = (item, None) if isinstance(item, str) else (item.hex, item.rssi)
        try:
            raw = bytes.fromhex(hx)
        except ValueError:
            results.append({"status": "rejected", "reason": "not hex"})
            continue
        results.append(await ingest.ingest_one(gw, raw, rssi))
    return {"results": results}


class Heartbeat(BaseModel):
    version: str | None = None
    queued: int = 0


@app.post("/api/gw/heartbeat")
async def gw_heartbeat(body: Heartbeat, gw: dict = Depends(gateway_auth)):
    await ingest.heartbeat(gw, body.version)
    return {"ok": True, "server_time": clock.now(), "epoch": int(clock.now().timestamp() // 900)}


@app.get("/api/gw/time")
async def gw_time():
    return {"server_time": clock.now(), "unix": clock.now().timestamp(), "epoch": int(clock.now().timestamp() // 900)}

# ---------------------------------------------------------------- live events


@app.get("/api/events")
async def events(request: Request, u: dict = Depends(current_user)):
    q = workers.broker.subscribe(u)

    async def stream():
        try:
            yield "event: hello\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {json.dumps(item)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            workers.broker.unsubscribe(q)

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

# ---------------------------------------------------------------- demo controls


def demo_only() -> None:
    if not settings.demo_mode:
        raise HTTPException(404, "not found")


@app.get("/api/demo/clock", dependencies=[Depends(demo_only)])
async def demo_clock():
    return {"now": clock.now(), "offset_seconds": clock.offset_seconds()}


class ClockMove(BaseModel):
    advance_minutes: float | None = None
    set_local: str | None = Field(None, pattern=r"^\d{1,2}:\d{2}$")


@app.post("/api/demo/clock", dependencies=[Depends(demo_only)])
async def move_clock(body: ClockMove):
    new = clock.offset_seconds()
    if body.advance_minutes:
        new += body.advance_minutes * 60
    if body.set_local:
        async with db.tx(system=True) as tx:
            sch = await tx.one("SELECT * FROM schools LIMIT 1")
        cal = SchoolCalendar(sch)
        loc = cal.local(clock.now())
        hh, mm = map(int, body.set_local.split(":"))
        target = loc.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if target < loc:
            raise HTTPException(400, "the demo clock only moves forward")
        new += (target - loc).total_seconds()
    async with db.tx(system=True) as tx:
        await tx.run("INSERT INTO app_settings (key, value) VALUES ('clock_offset', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", json.dumps(new))
        await tx.notify({"type": "clock", "offset": new})
    clock.set_offset(new)
    await workers.run_timers_once()
    await workers.run_outbox_once()
    return {"now": clock.now()}


@app.post("/api/demo/reset", dependencies=[Depends(demo_only)])
async def demo_reset():
    async with await psycopg.AsyncConnection.connect(settings.owner_dsn, row_factory=dict_row) as conn:
        async with conn.transaction():
            out = await manage.reseed(conn)
    ingest.invalidate_rid_cache()
    return out


@app.get("/api/demo/bands", dependencies=[Depends(demo_only)])
async def demo_bands():
    """Demo only: the virtual band needs its key. Real bands get keys at handout, and the key never leaves the server."""
    async with db.tx(system=True) as tx:
        rows = await tx.all("SELECT b.*, u.erp_ref, u.id AS sid, u.age_pack, u.class_id, c.name AS class_name FROM bands b "
                            "JOIN users u ON u.id = b.student_id LEFT JOIN classes c ON c.id = u.class_id ORDER BY b.id")
        school_m = await insights.school_model(tx)
        out = []
        now = clock.now()
        for r in rows:
            hp = await tx.val("SELECT pause_sensing FROM health_profiles WHERE student_id = %s", r["sid"])
            consent = await tx.val("SELECT sensing FROM consents WHERE student_id = %s", r["sid"])
            adult = await casework.chosen_adult(tx, r["sid"])
            out.append({"band_id": r["id"], "key": seed.demo_band_key(r["id"]).hex(), "student": erp.name(r["erp_ref"]), "student_id": str(r["sid"]),
                        "class": r["class_name"], "counter": r["last_counter"], "battery": r["battery"], "junior": r["age_pack"] == "junior",
                        "pause_sensing": bool(hp) or consent is False,
                        "pt_until": r["pt_until"] if r["pt_until"] and r["pt_until"] > now else None,
                        "adult": person(await casework.user(tx, adult)) if adult else None,
                        "timetable": timetable_for(r["class_name"]), "model": r["model"], "school": school_m})
    return out


@app.get("/api/demo/band-inbox", dependencies=[Depends(demo_only)])
async def demo_band_inbox(band: int):
    out = await ingest.band_inbox(band)
    if not out:
        raise HTTPException(404, "no band")
    return out


@app.get("/api/demo/gateway-tokens", dependencies=[Depends(demo_only)])
async def demo_gateway_tokens():
    from .content import GATEWAYS
    return [{"id": g[0], "token": seed.demo_gateway_token(g[0]), "location": g[2]} for g in GATEWAYS]


# ---------------------------------------------------------------- web app
app.mount("/", StaticFiles(directory=settings.web_dir, html=True, check_dir=False), name="web")
