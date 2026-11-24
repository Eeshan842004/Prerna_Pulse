"""Feelings, the alert rules, class weather (no names), the silent-band check and class activities.

The rules are plain thresholds, versioned, so they can be shown to students and parents and
tested. A single feeling is private: nobody is told. The same difficult feeling on 5 of the last
10 school days reaches the counsellor, with the name. Class weather hides any group under 10."""
from __future__ import annotations

import json
import statistics
from datetime import datetime, timedelta

from . import casework, model
from .content import ACTIVITIES, ACTIVITY_FOR, DIFFICULT, FEELINGS
from .db import Tx
from .schoolcal import SchoolCalendar

MIN_CELL = 10
COOLDOWN = timedelta(days=14)
RULES = {
    "persistent": {"version": 2, "text": "The same difficult feeling on 5 of the last 10 school days: the counsellor, with the name"},
    "goes_quiet": {"version": 2, "text": "3 band questions skipped in a row: a quiet note to the chosen adult"},
    "band_silent": {"version": 1, "text": "No contact for a whole school day: the class teacher (check battery or fit)"},
    "class_tension": {"version": 2, "text": "Share of difficult feelings at least 2x the school median for 3 school days: the class teacher gets an activity, no names"},
    "unanswered": {"version": 1, "text": "Nobody responded at any level: management and the principal"},
}


async def _recent_alert(tx: Tx, rule: str, student_id, at: datetime, within: timedelta = COOLDOWN, code: int | None = None) -> bool:
    q = "SELECT 1 FROM alerts WHERE rule = %s AND student_id = %s AND at > %s"
    args: list = [rule, student_id, at - within]
    if code is not None:
        q += " AND (detail->>'code')::int = %s"
        args.append(code)
    return bool(await tx.val(q + " LIMIT 1", *args))


async def _raise(tx: Tx, school_id, rule: str, student_id, to_user, at: datetime, **detail) -> None:
    await tx.run("INSERT INTO alerts (school_id, rule, rule_version, student_id, to_user, detail, at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                 school_id, rule, RULES[rule]["version"], student_id, to_user, json.dumps(detail, default=str), at)


async def ctx_at(tx: Tx, student: dict, ts: datetime, **extra) -> dict:
    """The context the model uses: time of day, weekday, current period from the timetable."""
    sch = await casework.school(tx, student["school_id"])
    cal = SchoolCalendar(sch)
    loc = cal.local(ts)
    period = "none"
    if cal.is_school_day(loc.date()) and student.get("class_id"):
        row = await tx.one("SELECT subject FROM timetable WHERE class_id = %s AND weekday = %s AND start_time <= %s AND end_time > %s",
                           student["class_id"], loc.isoweekday(), loc.time(), loc.time())
        period = row["subject"] if row else "none"
    return {"tod": model.tod_of(loc.hour, loc.minute), "dow": str(min(6, loc.isoweekday())), "period": period, **extra}


async def record_feeling(tx: Tx, student: dict, meta: dict, at: datetime) -> dict:
    code = meta["code"]
    ctx = await ctx_at(tx, student, at, rise=["self", "r20", "r30", "r45"][meta["rise"]], move="still" if meta["asked"] else "light")
    row = await tx.one("INSERT INTO feelings (school_id, student_id, code, accepted, ctx, source, at) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *",
                       student["school_id"], student["id"], code, meta["accepted"], json.dumps(ctx), "band-ask" if meta["asked"] else "band-self", at)
    if student.get("class_id") and code != 9:  # anonymous, for class weather
        await tx.run("INSERT INTO mood (school_id, class_id, code, at) VALUES (%s,%s,%s,%s)", student["school_id"], student["class_id"], code, at)
    if code in DIFFICULT:
        await rule_persistent(tx, student, code, at)
    return row


async def school_model(tx: Tx) -> dict:
    v = await tx.val("SELECT value FROM app_settings WHERE key = 'school_model'")
    return v if v else model.new_model()


async def save_school_model(tx: Tx, m: dict) -> None:
    await tx.run("INSERT INTO app_settings (key, value) VALUES ('school_model', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", json.dumps(m))


async def learn_from(tx: Tx, student: dict, suggested: int, accepted: bool, move: int, at: datetime) -> None:
    """The band follows each choice with what it suggested and how the child was moving: the model learns from it."""
    f = await tx.one("SELECT * FROM feelings WHERE student_id = %s AND NOT skipped AND NOT model_updated AND at >= %s ORDER BY at DESC LIMIT 1",
                     student["id"], at - timedelta(minutes=2))
    if not f:
        return
    ctx = dict(f["ctx"])
    if move < 3:
        ctx["move"] = ["still", "light", "active"][move]
    await tx.run("UPDATE feelings SET suggested = %s, accepted = %s, ctx = %s, model_updated = true WHERE id = %s",
                 suggested or None, accepted, json.dumps(ctx), f["id"])
    band = await casework.band_of(tx, student["id"])
    if band:
        m = band["model"]
        model.update(m, ctx, f["code"])
        await tx.run("UPDATE bands SET model = %s WHERE id = %s", json.dumps(m), band["id"])
    sm = await school_model(tx)
    model.update(sm, ctx, f["code"])
    await save_school_model(tx, sm)


async def rule_persistent(tx: Tx, student: dict, code: int, at: datetime) -> None:
    sid = student["school_id"]
    cal = SchoolCalendar(await casework.school(tx, sid))
    days = cal.school_days_back(at, 10)
    rows = await tx.all("SELECT at FROM feelings WHERE student_id = %s AND code = %s AND at >= %s",
                        student["id"], code, datetime.combine(days[0], datetime.min.time(), tzinfo=cal.tz))
    hit = {cal.local(r["at"]).date() for r in rows} & set(days)
    if len(hit) < 5 or await _recent_alert(tx, "persistent", student["id"], at, code=code):
        return
    counsellors = await casework.staff_with_roles(tx, sid, ["counsellor"])
    to = counsellors[0] if counsellors else None
    await _raise(tx, sid, "persistent", student["id"], to, at, code=code, days=len(hit))
    if to:
        await casework.enqueue(tx, sid, "push", to, "pattern",
                               {"who": await casework.who_line(tx, student["id"]), "code": code, "n": len(hit), "sid": str(student["id"])}, None, at)


async def record_skip(tx: Tx, student: dict, at: datetime) -> None:
    sid = student["school_id"]
    await tx.run("INSERT INTO feelings (school_id, student_id, code, skipped, at) VALUES (%s,%s,0,true,%s)", sid, student["id"], at)
    last3 = await tx.all("SELECT skipped FROM feelings WHERE student_id = %s AND (skipped OR source = 'band-ask') ORDER BY at DESC, id DESC LIMIT 3", student["id"])
    if len(last3) == 3 and all(r["skipped"] for r in last3) and not await _recent_alert(tx, "goes_quiet", student["id"], at):
        counsellors = await casework.staff_with_roles(tx, sid, ["counsellor"])
        adult = await casework.chosen_adult(tx, student["id"]) or (counsellors[0] if counsellors else None)
        await _raise(tx, sid, "goes_quiet", student["id"], adult, at)
        if adult:
            await casework.enqueue(tx, sid, "push", adult, "quiet", {"who": await casework.who_line(tx, student["id"])}, None, at)


async def check_silent(tx: Tx, school_id, now: datetime) -> int:
    """After the school day ends, a band with no contact all day tells the class teacher (once a day)."""
    sch = await casework.school(tx, school_id)
    cal = SchoolCalendar(sch)
    loc = cal.local(now)
    if not cal.is_school_day(loc.date()) or loc.time() < sch["day_end"]:
        return 0
    start = datetime.combine(loc.date(), datetime.min.time(), tzinfo=cal.tz)
    n = 0
    for b in await tx.all("SELECT * FROM bands WHERE school_id = %s AND NOT revoked AND student_id IS NOT NULL", school_id):
        if b["last_seen"] and b["last_seen"] >= start:
            continue
        if await _recent_alert(tx, "band_silent", b["student_id"], now, within=timedelta(hours=23)):
            continue
        counsellors = await casework.staff_with_roles(tx, school_id, ["counsellor"])
        to = await casework.class_teacher(tx, b["student_id"]) or (counsellors[0] if counsellors else None)
        await _raise(tx, school_id, "band_silent", b["student_id"], to, now, band=b["id"])
        if to:
            await casework.enqueue(tx, school_id, "push", to, "silent", {"who": await casework.who_line(tx, b["student_id"]), "band": b["id"]}, None, now)
        n += 1
    return n

# ---------------------------------------------------------------- class weather (no names, k >= 10)


async def class_mood(tx: Tx, school_id, class_id, now: datetime) -> dict:
    sch = await casework.school(tx, school_id)
    cal = SchoolCalendar(sch)
    days = cal.school_days_back(now, 10)
    start = datetime.combine(days[0], datetime.min.time(), tzinfo=cal.tz)
    classes = await tx.all("SELECT id, name FROM classes WHERE school_id = %s ORDER BY name", school_id)
    rows = await tx.all("SELECT class_id, code, at FROM mood WHERE school_id = %s AND at >= %s", school_id, start)
    by: dict = {}
    for r in rows:
        by.setdefault((r["class_id"], cal.local(r["at"]).date()), []).append(r)
    cells_of = {}
    for cl in classes:
        cells = []
        for d in days:
            rr = by.get((cl["id"], d), [])
            n = len(rr)
            hard = sum(1 for r in rr if r["code"] in DIFFICULT)
            cells.append({"date": d.isoformat(), "share": hard / n if n >= MIN_CELL else None, "hidden": n < MIN_CELL})
        cells_of[cl["id"]] = cells
    med = []
    for i in range(len(days)):
        vals = [c[i]["share"] for c in cells_of.values() if c[i]["share"] is not None]
        med.append(statistics.median(vals) if vals else None)
    out = []
    week_start = datetime.combine(days[max(0, len(days) - 5)], datetime.min.time(), tzinfo=cal.tz)
    for cl in classes:
        cells, streak = cells_of[cl["id"]], 0
        for i, c in enumerate(cells):
            c["hot"] = c["share"] is not None and med[i] is not None and c["share"] >= max(2 * med[i], 0.15)
            streak = streak + 1 if c["hot"] else 0
        flag = streak >= 3  # the last 3 school days in a row
        vis = [c for c in cells if not c["hidden"]][-3:]
        avg = sum(c["share"] for c in vis) / len(vis) if vis else None
        weather = "storm" if flag else "none" if avg is None else "rain" if avg >= 0.3 else "mixed" if avg >= 0.15 else "sun"
        week = [r for r in rows if r["class_id"] == cl["id"] and r["at"] >= week_start]
        counts: dict = {}
        for r in week:
            if r["code"] in DIFFICULT:
                counts[r["code"]] = counts.get(r["code"], 0) + 1
        top = [c for c, _ in sorted(counts.items(), key=lambda x: -x[1])[:3]] if len(week) >= MIN_CELL else []
        activity = None
        if flag:
            title = ACTIVITY_FOR.get(FEELINGS[top[0]][0] if top else "", "Two kind things")
            activity = next((a for a in ACTIVITIES if a["title"] == title), ACTIVITIES[0])
        done = None
        if activity:
            done = await tx.val("SELECT done_at FROM activities WHERE class_id = %s AND activity_code = %s AND day = %s",
                                cl["id"], activity["code"], cal.local(now).date())
        out.append({"class_id": str(cl["id"]), "class": cl["name"], "cells": cells, "flag": flag, "weather": weather,
                    "top": top, "activity": activity, "activity_done": done})
    row = next((r for r in out if r["class_id"] == str(class_id)), None) if class_id else None
    return {"days": [d.isoformat() for d in days], "rows": out, "row": row, "min_cell": MIN_CELL, "rule": RULES["class_tension"]}
