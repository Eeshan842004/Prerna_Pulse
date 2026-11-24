"""Cases (band-only): talk requests with a reply clock, "Call to talk", and SOS with live location.

The rules here are the heart of the product. A child's "talk to someone" goes to the adult the
child chose, a deadline is set from the school calendar, and if no real response arrives the case
moves up a level on its own. An adult answers by calling the child to a room; that response, which
appears on the band, is the only thing that stops the clock. An SOS alerts several people at once,
shows where the child is (the strongest gateway), and repeats by SMS and call until someone goes.
Every step is written to an append-only, hash-chained event log."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, time, timedelta
from typing import Any
from uuid import UUID

from . import texts
from .content import GW, WHEN, WHERE
from .db import Tx
from .erp import erp
from .schoolcal import SchoolCalendar
from .security import seal, unseal, unwrap_school_key

SOS_ACK_MINUTES = 10
SOS_SMS_CAP = 6          # per child per day; SOS alerts themselves are never dropped
SIGHT_WINDOW = timedelta(seconds=30)
SOS_KINDS = ("sos", "medical_sos")

# ---------------------------------------------------------------- lookups


async def school(tx: Tx, school_id) -> dict:
    return await tx.one("SELECT * FROM schools WHERE id = %s", school_id)


async def school_key(tx: Tx, school_id) -> bytes:
    row = await tx.one("SELECT data_key_wrapped FROM schools WHERE id = %s", school_id)
    return unwrap_school_key(bytes(row["data_key_wrapped"]))


async def user(tx: Tx, user_id) -> dict | None:
    return await tx.one(
        "SELECT u.*, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE u.id = %s", user_id)


def name_of(u: dict | None) -> str:
    return erp.name(u["erp_ref"]) if u else "Someone"


def label(u: dict | None) -> str:
    """Staff names as children see them: 'Ms Mehta'."""
    if not u:
        return "Someone"
    full = name_of(u)
    parts = full.split(" ")
    return f"{parts[0]} {parts[-1]}" if parts[0] in ("Ms", "Mr", "Mrs", "Dr", "Nurse") else full


async def who_line(tx: Tx, student_id) -> str:
    st = await user(tx, student_id) if student_id else None
    return f"{name_of(st)} ({st['class_name']})" if st else "A student"


async def staff_with_roles(tx: Tx, school_id, roles: list[str]) -> list[UUID]:
    rows = await tx.all("SELECT id FROM users WHERE school_id = %s AND role = ANY(%s) ORDER BY erp_ref", school_id, roles)
    return [r["id"] for r in rows]


async def chosen_adult(tx: Tx, student_id) -> UUID | None:
    return await tx.val("SELECT adult_id FROM trusted_adults WHERE student_id = %s", student_id)


async def class_teacher(tx: Tx, student_id) -> UUID | None:
    return await tx.val("SELECT c.class_teacher_id FROM users u JOIN classes c ON c.id = u.class_id WHERE u.id = %s", student_id)


async def band_of(tx: Tx, student_id) -> dict | None:
    return await tx.one("SELECT * FROM bands WHERE student_id = %s", student_id)


def fmt_time(cal: SchoolCalendar, ts: datetime | None, ref: datetime | None = None) -> str:
    if ts is None:
        return ""
    loc = cal.local(ts)
    t = loc.strftime("%I:%M %p").lstrip("0").replace("AM", "am").replace("PM", "pm")
    if ref is not None and cal.local(ref).date() != loc.date():
        diff = (loc.date() - cal.local(ref).date()).days
        return f"{t} tomorrow" if diff == 1 else f"{t} {loc.strftime('%a %d %b')}"
    return t

# ---------------------------------------------------------------- audit chain


def _event_hash(prev: bytes, case_id, at: datetime, kind: str, detail: dict, actor) -> bytes:
    payload = json.dumps([str(case_id), at.isoformat(), kind, detail, str(actor) if actor else None],
                         sort_keys=True, default=str).encode()
    return hashlib.sha256(prev + payload).digest()


async def add_event(tx: Tx, case: dict, event: str, at: datetime, actor=None, **detail: Any) -> None:
    prev = await tx.val("SELECT hash FROM case_events WHERE case_id = %s ORDER BY id DESC LIMIT 1", case["id"])
    prev = bytes(prev) if prev else b"\x00" * 32
    h = _event_hash(prev, case["id"], at, event, detail, actor)
    await tx.run("INSERT INTO case_events (school_id, case_id, at, actor_id, kind, detail, prev_hash, hash) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                 case["school_id"], case["id"], at, actor, event, json.dumps(detail, default=str), prev, h)


async def verify_chain(tx: Tx, case_id) -> bool:
    rows = await tx.all("SELECT * FROM case_events WHERE case_id = %s ORDER BY id", case_id)
    prev = b"\x00" * 32
    for r in rows:
        if bytes(r["prev_hash"]) != prev:
            return False
        if bytes(r["hash"]) != _event_hash(prev, r["case_id"], r["at"], r["kind"], r["detail"], r["actor_id"]):
            return False
        prev = bytes(r["hash"])
    return True

# ---------------------------------------------------------------- notifications and band messages


async def enqueue(tx: Tx, school_id, channel: str, to_user, kind: str, vars: dict, case_id, at: datetime) -> None:
    """Alerts leave through the outbox, so a crash can repeat one but never lose one."""
    title, body = texts.make(kind, vars)
    await tx.run("INSERT INTO outbox (school_id, channel, to_user, kind, vars, title, body, case_id, created_at, next_attempt_at) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", school_id, channel, to_user, kind, json.dumps(vars, default=str),
                 title, body, case_id, at, at)


async def broadcast(tx: Tx, case: dict, users: list) -> None:
    ids = {str(u) for u in users if u}
    ids |= {str(u) for u in case.get("ever_recipients") or []}
    await tx.notify({"school": str(case["school_id"]), "type": "case", "case_id": str(case["id"]), "users": sorted(ids)})


async def band_message(tx: Tx, school_id, student_id, case_id, from_user, kind: str, vars: dict, at: datetime) -> dict | None:
    """A short message (max 60 characters) for the child's band. The band fetches it after a receipt says one is waiting."""
    band = await band_of(tx, student_id)
    if not band:
        return None
    if kind == "call":
        when = WHEN.get(vars["when"], vars["when"])
        where = WHERE.get(vars["where"], vars["where"])
        text = f"{vars['who']} will see you {'tomorrow ' if vars.get('tomorrow') else ''}{when}, {where}"
    elif kind == "coming":
        text = f"{vars['who']} is coming"
    else:
        text = f"{vars['who']} will contact you"
    row = await tx.one("INSERT INTO band_messages (school_id, band_id, case_id, from_user, kind, vars, text, created_at) "
                       "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *", school_id, band["id"], case_id, from_user, kind,
                       json.dumps(vars, default=str), text[:60], at)
    await tx.notify({"school": str(school_id), "type": "band_message", "band_id": band["id"]})
    return row

# ---------------------------------------------------------------- routing ladder for talk requests


def _ladder(route: str):
    """Each rung: (who, how the deadline is set). The last rung flags management, with no clock."""
    eod = ("eod", None)
    if route == "adult":
        return [("chosen", eod), ("counsellor", ("next_at", time(12, 0))), ("principal", ("next_at", "staff_end")), ("management", None)]
    if route == "counsellor":
        return [("counsellor", eod), ("principal", ("next_at", "staff_end")), ("management", None)]
    if route == "staff":
        return [("principal+pocso", ("same_day_staff", None)), ("management", None)]
    raise ValueError(route)


async def _rung_recipients(tx: Tx, case: dict, who: str) -> list[UUID]:
    sid = case["school_id"]
    if who == "chosen":
        adult = await chosen_adult(tx, case["student_id"]) if case["student_id"] else None
        ids = [adult] if adult else []
    elif who == "counsellor":
        ids = await staff_with_roles(tx, sid, ["counsellor"])
    elif who == "principal":
        ids = await staff_with_roles(tx, sid, ["principal"])
    elif who == "principal+pocso":
        ids = await staff_with_roles(tx, sid, ["principal", "pocso"])
    elif who == "management":
        ids = await staff_with_roles(tx, sid, ["management"])
    else:
        ids = []
    # A report about a staff member never reaches that person.
    return [i for i in ids if i != case.get("about_staff_id")]


def _deadline(cal: SchoolCalendar, sch: dict, rule, at: datetime) -> datetime | None:
    if rule is None:
        return None
    kind, arg = rule
    if kind == "eod":
        return cal.end_of_school_day(at)
    if kind == "next_at":
        return cal.next_school_day_at(at, sch["staff_end"] if arg == "staff_end" else arg)
    if kind == "same_day_staff":
        return cal.same_school_day_staff(at)
    raise ValueError(kind)


async def stop_timers(tx: Tx, case_id) -> None:
    await tx.run("UPDATE timers SET done = true WHERE case_id = %s AND NOT done", case_id)


async def _apply_level(tx: Tx, case: dict, level: int, at: datetime, reason: str) -> dict:
    """Route the case to a rung, set its deadline and timers. Skips rungs with nobody on them."""
    sch = await school(tx, case["school_id"])
    cal = SchoolCalendar(sch)
    ladder = _ladder(case["route"])
    while level <= len(ladder):
        who, rule = ladder[level - 1]
        recipients = await _rung_recipients(tx, case, who)
        if recipients:
            break
        level += 1
    else:
        level, who, rule, recipients = len(ladder), "management", None, []

    deadline = _deadline(cal, sch, rule, at)
    ever = list({*(case.get("ever_recipients") or []), *recipients})
    case = await tx.one(
        "UPDATE cases SET level = %s, rung = %s, recipients = %s::uuid[], ever_recipients = %s::uuid[], deadline = %s, "
        "level_started_at = %s, last_activity_at = %s, version = version + 1 WHERE id = %s RETURNING *",
        level, who, recipients, ever, deadline, at, at, case["id"])
    await stop_timers(tx, case["id"])
    if deadline:
        window = deadline - at
        for pct in (50, 80):
            await tx.run("INSERT INTO timers (school_id, case_id, kind, level, due_at, detail) VALUES (%s,%s,'remind',%s,%s,%s)",
                         case["school_id"], case["id"], level, at + window * pct / 100, json.dumps({"pct": pct}))
        await tx.run("INSERT INTO timers (school_id, case_id, kind, level, due_at) VALUES (%s,%s,'escalate',%s,%s)",
                     case["school_id"], case["id"], level, deadline)
    await add_event(tx, case, "routed", at, level=level, rung=who, recipients=[str(r) for r in recipients],
                    deadline=deadline.isoformat() if deadline else None, reason=reason)
    return case


async def _announce(tx: Tx, case: dict, at: datetime, previous: list | None = None, by=None) -> None:
    sch = await school(tx, case["school_id"])
    cal = SchoolCalendar(sch)
    st = await user(tx, case["student_id"])
    vars = {"who": await who_line(tx, case["student_id"]), "first": name_of(st).split(" ")[0] if st else "A student",
            "due": fmt_time(cal, case["deadline"], at)}
    kind = "talk_handover" if by else "talk_moved_you" if previous else "talk_new"
    if by:
        vars["by"] = label(await user(tx, by))
    for r in case["recipients"]:
        await enqueue(tx, case["school_id"], "push", r, kind, vars, case["id"], at)
    if case["rung"] == "management" or (not case["recipients"] and case["level"] >= len(_ladder(case["route"]))):
        for r in [*await staff_with_roles(tx, case["school_id"], ["management"]), *await staff_with_roles(tx, case["school_id"], ["principal"])]:
            await enqueue(tx, case["school_id"], "push", r, "unanswered", vars, case["id"], at)
        await tx.run("INSERT INTO alerts (school_id, rule, rule_version, student_id, detail, at) VALUES (%s,'unanswered',1,%s,%s,%s)",
                     case["school_id"], case["student_id"], json.dumps({"case": case["ref"]}), at)
    if previous:
        names = [label(await user(tx, r)) for r in case["recipients"]]
        to = " and ".join(names) or "management"
        for prev in previous:
            if prev not in case["recipients"]:
                await enqueue(tx, case["school_id"], "push", prev, "talk_moved_on", {**vars, "to": to}, case["id"], at)
        if case["recipients"]:
            await band_message(tx, case["school_id"], case["student_id"], case["id"], None, "moved",
                               {"who": label(await user(tx, case["recipients"][0]))}, at)

# ---------------------------------------------------------------- talk requests


async def _new_case(tx: Tx, school_id, **f) -> dict:
    ref = f"PP-{await tx.val('SELECT nextval(%s)', 'case_ref_seq')}"
    at = f.pop("created_at")
    cols = {"school_id": school_id, "ref": ref, "created_at": at, "last_activity_at": at, **f}
    cast = {"recipients": "%s::uuid[]", "ever_recipients": "%s::uuid[]", "trail": "%s::jsonb", "call": "%s::jsonb"}
    names = ", ".join(cols)
    marks = ", ".join(cast.get(k, "%s") for k in cols)
    vals = [json.dumps(v, default=str) if k in ("trail", "call") and v is not None else v for k, v in cols.items()]
    return await tx.one(f"INSERT INTO cases ({names}) VALUES ({marks}) RETURNING *", *vals)


async def create_talk(tx: Tx, school_id, student_id, to_whom: str, at: datetime) -> dict:
    route = "counsellor" if to_whom == "counsellor" else "adult"
    case = await _new_case(tx, school_id, student_id=student_id, kind="talk", route=route, created_at=at)
    await add_event(tx, case, "created", at, student_id, kind="talk", to=route, source="band")
    case = await _apply_level(tx, case, 1, at, "new")
    await _announce(tx, case, at)
    await broadcast(tx, case, case["recipients"])
    return case


async def lock_case(tx: Tx, case_id) -> dict | None:
    return await tx.one("SELECT * FROM cases WHERE id = %s FOR UPDATE", case_id)


async def escalate(tx: Tx, case: dict, at: datetime) -> dict:
    """Called by the timer worker when a deadline passes with no response."""
    previous = list(case["recipients"])
    await add_event(tx, case, "deadline_missed", at, level=case["level"])
    case = await _apply_level(tx, case, case["level"] + 1, at, "deadline missed")
    await _announce(tx, case, at, previous=previous)
    await broadcast(tx, case, previous)
    return case


async def call_to_talk(tx: Tx, case_id, staff: dict, when: str, where: str, at: datetime) -> dict:
    """The adult calls the child to a room. This response, shown on the band, is the only thing that stops the clock."""
    case = await lock_case(tx, case_id)
    if case["kind"] != "talk":
        raise ValueError("only talk requests")
    if when not in WHEN or where not in WHERE:
        raise ValueError("choose when and where")
    sch = await school(tx, case["school_id"])
    cal = SchoolCalendar(sch)
    loc = cal.local(at)
    tomorrow = loc.time() >= sch["day_end"] or not cal.is_school_day(loc.date())
    msg = await band_message(tx, case["school_id"], case["student_id"], case["id"], staff["id"], "call",
                             {"who": label(staff), "when": when, "where": where, "tomorrow": tomorrow}, at)
    call = {"by": str(staff["id"]), "when": when, "where": where, "tomorrow": tomorrow, "message_id": msg["id"] if msg else None}
    case = await tx.one("UPDATE cases SET status = 'responded', first_response_at = COALESCE(first_response_at, %s), "
                        "last_activity_at = %s, call = %s, version = version + 1 WHERE id = %s RETURNING *",
                        at, at, json.dumps(call), case["id"])
    await stop_timers(tx, case["id"])
    await add_event(tx, case, "called", at, staff["id"], when=when, where=where, tomorrow=tomorrow)
    await broadcast(tx, case, [])
    return case


async def talked(tx: Tx, case_id, staff: dict, note: str, at: datetime) -> dict:
    case = await lock_case(tx, case_id)
    case = await tx.one("UPDATE cases SET status = 'resolved', last_activity_at = %s WHERE id = %s RETURNING *", at, case["id"])
    await stop_timers(tx, case["id"])
    await add_event(tx, case, "talked", at, staff["id"], note=note or "")
    await broadcast(tx, case, [])
    return case


async def handover(tx: Tx, case_id, staff: dict, to: str, at: datetime) -> dict:
    """"Needs counsellor" (or about a staff member, to the principal and POCSO): a new owner and a fresh clock."""
    case = await lock_case(tx, case_id)
    previous = list(case["recipients"])
    route = "staff" if to == "staff" else "counsellor"
    case = await tx.one("UPDATE cases SET route = %s, status = 'open' WHERE id = %s RETURNING *", route, case["id"])
    await add_event(tx, case, "handover", at, staff["id"], to=route)
    case = await _apply_level(tx, case, 1, at, "handover")
    await _announce(tx, case, at, by=staff["id"])
    for p in previous:
        if p not in case["recipients"] and p != staff["id"]:
            names = " and ".join(label(await user(tx, r)) for r in case["recipients"])
            await enqueue(tx, case["school_id"], "push", p, "talk_moved_on",
                          {"who": await who_line(tx, case["student_id"]), "to": names}, case["id"], at)
    await broadcast(tx, case, previous)
    return case


async def remind(tx: Tx, case: dict, pct: int, at: datetime) -> None:
    cal = SchoolCalendar(await school(tx, case["school_id"]))
    who = await who_line(tx, case["student_id"])
    for r in case["recipients"]:
        await enqueue(tx, case["school_id"], "push", r, "remind", {"who": who, "pct": pct, "due": fmt_time(cal, case["deadline"], at)}, case["id"], at)
    await add_event(tx, case, "reminder", at, pct=pct)

# ---------------------------------------------------------------- SOS with live location


async def locate(tx: Tx, band_id, now: datetime) -> dict | None:
    """The strongest gateway heard in the last 30 seconds (else the last few): room or corridor level."""
    pool = await tx.all("SELECT gateway_id, rssi, at FROM sightings WHERE band_id = %s AND at >= %s", band_id, now - SIGHT_WINDOW)
    live = bool(pool)
    if not pool:
        pool = await tx.all("SELECT gateway_id, rssi, at FROM (SELECT * FROM sightings WHERE band_id = %s ORDER BY at DESC LIMIT 6) s", band_id)
    if not pool:
        return None
    best = max(pool, key=lambda r: (r["rssi"], r["at"]))
    last_at = max(r["at"] for r in pool if r["gateway_id"] == best["gateway_id"])
    return {"gw": best["gateway_id"], "rssi": best["rssi"], "at": last_at, "live": live}


async def sos_recipients(tx: Tx, school_id, student_id, medical: bool) -> list[UUID]:
    r = [*await staff_with_roles(tx, school_id, ["counsellor"]), *await staff_with_roles(tx, school_id, ["principal"])]
    ct = await class_teacher(tx, student_id)
    if ct:
        r.append(ct)
    nurse_flag = await tx.val("SELECT nurse_on_sos FROM health_profiles WHERE student_id = %s", student_id)
    if medical or nurse_flag:
        r += await staff_with_roles(tx, school_id, ["nurse"])
    if await tx.val("SELECT pocso_on_sos FROM schools WHERE id = %s", school_id):
        r += await staff_with_roles(tx, school_id, ["pocso"])
    return list(dict.fromkeys(r))


async def create_sos(tx: Tx, school_id, student_id, medical: bool, at: datetime) -> dict:
    open_ = await tx.one("SELECT * FROM cases WHERE student_id = %s AND kind = ANY(%s) AND status IN ('open','acknowledged')",
                         student_id, list(SOS_KINDS))
    if open_:
        return open_  # a second press while help is on the way doesn't make a second alert
    band = await band_of(tx, student_id)
    loc = await locate(tx, band["id"], at) if band else None
    recipients = await sos_recipients(tx, school_id, student_id, medical)
    deadline = at + timedelta(minutes=SOS_ACK_MINUTES)
    case = await _new_case(tx, school_id, student_id=student_id, kind="medical_sos" if medical else "sos", route=None,
                           recipients=recipients, ever_recipients=recipients, deadline=deadline, level_started_at=at, created_at=at,
                           location_gateway=loc["gw"] if loc else None, location_at=loc["at"] if loc else None,
                           trail=[{"gw": loc["gw"], "at": at.isoformat()}] if loc else [])
    await add_event(tx, case, "created", at, student_id, kind=case["kind"], source="band", location=loc["gw"] if loc else None)
    await tx.run("INSERT INTO timers (school_id, case_id, kind, level, due_at) VALUES (%s,%s,'sos_repeat',1,%s)", school_id, case["id"], deadline)
    vars = {"who": await who_line(tx, student_id), "gw": loc["gw"] if loc else None, "medical": medical}
    for r in recipients:
        await enqueue(tx, school_id, "push", r, "sos", vars, case["id"], at)
    await enqueue(tx, school_id, "panel", None, "sos", vars, case["id"], at)
    nurse_flag = await tx.val("SELECT nurse_on_sos FROM health_profiles WHERE student_id = %s", student_id)
    if medical or nurse_flag:
        await add_event(tx, case, "nurse_added", at, reason="child chose Unwell" if medical else "health profile")
    await broadcast(tx, case, recipients)
    return case


async def note_sighting(tx: Tx, band: dict, gw: str, rssi: int, now: datetime) -> None:
    """Every gateway that hears a band reports signal strength. While an SOS is open the pin follows the child."""
    await tx.run("INSERT INTO sightings (school_id, band_id, gateway_id, rssi, at) VALUES (%s,%s,%s,%s,%s)", band["school_id"], band["id"], gw, rssi, now)
    case = await tx.one("SELECT * FROM cases WHERE student_id = %s AND kind = ANY(%s) AND status IN ('open','acknowledged') FOR UPDATE",
                        band["student_id"], list(SOS_KINDS))
    if not case:
        return
    loc = await locate(tx, band["id"], now)
    if not loc:
        return
    trail = list(case["trail"] or [])
    if loc["gw"] != case["location_gateway"]:
        trail.append({"gw": loc["gw"], "at": now.isoformat()})
        case = await tx.one("UPDATE cases SET location_gateway = %s, location_at = %s, trail = %s WHERE id = %s RETURNING *",
                            loc["gw"], loc["at"], json.dumps(trail), case["id"])
        await tx.notify({"school": str(case["school_id"]), "type": "sos_location", "case_id": str(case["id"]), "users": [str(u) for u in case["recipients"]]})
    else:
        await tx.run("UPDATE cases SET location_at = %s WHERE id = %s", loc["at"], case["id"])


async def sos_repeat(tx: Tx, case: dict, at: datetime) -> None:
    """SOS not answered in 10 minutes: SMS and a call task to everyone, every 10 minutes, with a daily cap."""
    sent = await tx.val(
        "SELECT count(*) FROM case_events e JOIN cases c ON c.id = e.case_id WHERE c.student_id = %s AND e.kind = 'sos_unanswered' "
        "AND (e.detail->>'sms_sent')::boolean AND e.at >= %s", case["student_id"], at - timedelta(hours=24))
    vars = {"who": await who_line(tx, case["student_id"]), "gw": case["location_gateway"]}
    send = sent < SOS_SMS_CAP
    if send:
        for r in case["recipients"]:
            await enqueue(tx, case["school_id"], "sms", r, "sos_sms", vars, case["id"], at)
            await enqueue(tx, case["school_id"], "call_task", r, "sos_call", vars, case["id"], at)
    await add_event(tx, case, "sos_unanswered", at, sms_sent=send)
    await tx.run("INSERT INTO timers (school_id, case_id, kind, level, due_at) VALUES (%s,%s,'sos_repeat',1,%s)",
                 case["school_id"], case["id"], at + timedelta(minutes=SOS_ACK_MINUTES))
    await broadcast(tx, case, [])


async def going(tx: Tx, case_id, staff: dict, at: datetime) -> dict:
    case = await lock_case(tx, case_id)
    if case["kind"] not in SOS_KINDS:
        raise ValueError("only SOS")
    first = case["going_by"] is None
    case = await tx.one("UPDATE cases SET status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END, "
                        "acknowledged_at = COALESCE(acknowledged_at, %s), going_by = COALESCE(going_by, %s), last_activity_at = %s "
                        "WHERE id = %s RETURNING *", at, staff["id"], at, case["id"])
    await stop_timers(tx, case["id"])
    await add_event(tx, case, "going", at, staff["id"], first=first)
    if first:
        await band_message(tx, case["school_id"], case["student_id"], case["id"], staff["id"], "coming", {"who": label(staff)}, at)
        who = await who_line(tx, case["student_id"])
        for r in case["recipients"]:
            if r != staff["id"]:
                await enqueue(tx, case["school_id"], "push", r, "sos_going", {"who": who, "by": label(staff)}, case["id"], at)
    await broadcast(tx, case, [])
    return case


async def reached(tx: Tx, case_id, staff: dict, note: str, at: datetime) -> dict:
    case = await lock_case(tx, case_id)
    case = await tx.one("UPDATE cases SET status = 'resolved', last_activity_at = %s WHERE id = %s RETURNING *", at, case["id"])
    await stop_timers(tx, case["id"])
    await add_event(tx, case, "reached", at, staff["id"], note=note or "")
    who = await who_line(tx, case["student_id"])
    for r in case["recipients"]:
        if r != staff["id"]:
            await enqueue(tx, case["school_id"], "push", r, "sos_reached", {"who": who, "by": label(staff)}, case["id"], at)
    await broadcast(tx, case, [])
    return case


async def cancel_sos(tx: Tx, student_id, at: datetime) -> dict | None:
    case = await tx.one("SELECT * FROM cases WHERE student_id = %s AND kind = ANY(%s) AND status = 'open' AND created_at > %s "
                        "ORDER BY created_at DESC LIMIT 1 FOR UPDATE", student_id, list(SOS_KINDS), at - timedelta(seconds=60))
    if not case:
        return None
    case = await tx.one("UPDATE cases SET status = 'cancelled', last_activity_at = %s WHERE id = %s RETURNING *", at, case["id"])
    await stop_timers(tx, case["id"])
    await add_event(tx, case, "cancelled_by_child", at, student_id)
    who = await who_line(tx, student_id)
    for r in case["recipients"]:
        await enqueue(tx, case["school_id"], "push", r, "sos_cancel", {"who": who}, case["id"], at)
    await broadcast(tx, case, [])
    return case

# ---------------------------------------------------------------- parent messages (encrypted at rest)


async def share_with_parent(tx: Tx, school_id, student_id, staff: dict, text: str, at: datetime) -> None:
    key = await school_key(tx, school_id)
    nonce, ct = seal(key, text, f"parent:{student_id}")
    await tx.run("INSERT INTO parent_messages (school_id, student_id, from_user, nonce, text_enc, created_at) VALUES (%s,%s,%s,%s,%s,%s)",
                 school_id, student_id, staff["id"], nonce, ct, at)
    await tx.run("INSERT INTO access_log (school_id, user_id, key, student_id, reason, at) VALUES (%s,%s,%s,%s,%s,%s)",
                 school_id, staff["id"], f"parent:{student_id}", student_id, "Informed parent", at)
    await tx.notify({"school": str(school_id), "type": "parent"})


async def parent_messages(tx: Tx, school_id, student_id) -> list[dict]:
    key = await school_key(tx, school_id)
    rows = await tx.all("SELECT * FROM parent_messages WHERE student_id = %s ORDER BY id DESC", student_id)
    return [{"text": unseal(key, r["nonce"], r["text_enc"], f"parent:{student_id}"), "from_user": r["from_user"], "at": r["created_at"]} for r in rows]
