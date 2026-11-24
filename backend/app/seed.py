"""Demo data: one fictional school. Every name here is made up.

Band keys are derived from a fixed string so the virtual band can use them. That is for the
demo only: real bands get a random key flashed at handout, and the key never leaves the server."""
from __future__ import annotations

import hashlib
import json
import os
import random
from datetime import date, datetime, time, timedelta

from . import casework, clock, model
from .content import DIFFICULT, GATEWAYS, timetable_for
from .db import Tx
from .erp import erp
from .schoolcal import SchoolCalendar
from .security import hash_token, wrap_school_key

SCHOOL_NAME = "Sunrise Public School (demo)"
CLASSES = ["4A", "6A", "6B", "7A", "7B", "8A", "8B", "9A"]
CLASS_TEACHER = {"7B": "T01", "4A": "T03"}


def demo_band_key(band_id: int) -> bytes:
    return hashlib.sha256(f"demo-band-{band_id}".encode()).digest()[:16]


def demo_gateway_token(gateway_id: str) -> str:
    return f"demo-token-{gateway_id}"


def demo_day_offset(school_tz: str = "Asia/Kolkata", at: time = time(10, 40)) -> float:
    """Clock offset that puts 'now' at 10:40 on today's (or the next) school day."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo(school_tz)
    real = datetime.now(tz)
    d = real.date()
    while d.isoweekday() == 7:
        d += timedelta(days=1)
    return (datetime.combine(d, at, tzinfo=tz) - real).total_seconds()


def _at(cal: SchoolCalendar, d: date, hm: str) -> datetime:
    h, m = map(int, hm.split(":"))
    return datetime.combine(d, time(h, m), tzinfo=cal.tz)


def _ctx(cal: SchoolCalendar, class_name: str, ts: datetime, rise: str, move: str) -> dict:
    loc = cal.local(ts)
    t = loc.strftime("%H:%M")
    period = next((p["subject"] for p in timetable_for(class_name) if p["start"] <= t < p["end"]), "none")
    return {"tod": model.tod_of(loc.hour, loc.minute), "dow": str(min(6, loc.isoweekday())), "period": period, "rise": rise, "move": move}


async def seed(tx: Tx) -> dict:
    rnd = random.Random(7)
    now = clock.now()
    dek = os.urandom(32)
    sch = await tx.one("INSERT INTO schools (name, data_key_wrapped) VALUES (%s, %s) RETURNING *", SCHOOL_NAME, wrap_school_key(dek))
    sid = sch["id"]
    cal = SchoolCalendar(sch)

    class_ids = {}
    for name in CLASSES:
        class_ids[name] = await tx.val("INSERT INTO classes (school_id, name) VALUES (%s,%s) RETURNING id", sid, name)
        for wd in range(1, 7):
            for p in timetable_for(name):
                await tx.run("INSERT INTO timetable (school_id, class_id, weekday, start_time, end_time, subject, pauses_sensing) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                             sid, class_ids[name], wd, p["start"], p["end"], p["subject"], p["pauses"])

    users = {}
    for r in erp.roster():
        cls = class_ids.get(r.get("class")) if r["role"] == "student" else None
        pack = "junior" if r.get("class", "").startswith(("3", "4", "5")) else "teen"
        users[r["erp_ref"]] = await tx.val(
            "INSERT INTO users (school_id, role, erp_ref, class_id, age_pack, can_be_chosen) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id",
            sid, r["role"], r["erp_ref"], cls, pack, bool(r.get("chosen")))
    for r in erp.roster():
        if r.get("child"):
            await tx.run("UPDATE users SET child_id = %s WHERE id = %s", users[r["child"]], users[r["erp_ref"]])
    for cname, ref in CLASS_TEACHER.items():
        await tx.run("UPDATE classes SET class_teacher_id = %s WHERE id = %s", users[ref], class_ids[cname])

    bands = {}
    for r in erp.roster():
        if r["role"] != "student":
            continue
        uid = users[r["erp_ref"]]
        await tx.run("INSERT INTO consents (student_id, school_id, feelings_to_counsellor, given_at) VALUES (%s,%s,%s,%s)",
                     uid, sid, r["erp_ref"] != "S8A02", now - timedelta(days=120))
        await tx.run("INSERT INTO health_profiles (student_id, school_id, nurse_on_sos, note) VALUES (%s,%s,%s,%s)",
                     uid, sid, bool(r.get("nurse_on_help")), "Asthma: inhaler in bag" if r.get("nurse_on_help") else "")
        if r.get("adult"):
            await tx.run("INSERT INTO trusted_adults (student_id, school_id, adult_id, chosen_at) VALUES (%s,%s,%s,%s)",
                         uid, sid, users[r["adult"]], now - timedelta(days=20))
        if r.get("band"):
            bands[r["erp_ref"]] = r["band"]
            await tx.run("INSERT INTO bands (id, school_id, student_id, key, last_counter, last_seen, battery) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                         r["band"], sid, uid, demo_band_key(r["band"]), 40, now - timedelta(minutes=rnd.randint(5, 50)), rnd.randint(55, 96))
    await tx.run("UPDATE bands SET battery = 64 WHERE id = 1001")
    prev_day = cal.school_days_back(now - timedelta(days=1), 2)[0]
    await tx.run("UPDATE bands SET battery = 3, last_seen = %s WHERE id = 1005", _at(cal, prev_day, "14:20"))

    for gid, kind, loc, x, y in GATEWAYS:
        hb = _at(cal, cal.local(now).date(), "08:35") if gid == "gw-blockb" else now - timedelta(seconds=20)
        await tx.run("INSERT INTO gateways (id, school_id, kind, location, map_x, map_y, token_hash, last_heartbeat, version) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'0.4.0')",
                     gid, sid, kind, loc, x, y, hash_token(demo_gateway_token(gid)), hb)

    school_m = model.new_model()
    band_models = {b: model.new_model() for b in bands.values()}
    days = cal.school_days_back(now - timedelta(days=1), 24)       # oldest first, ending yesterday
    recent, older = days[-9:], days[:-9]

    async def add_feeling(ref: str, d: date, hm: str, code: int, asked=True, rise=1):
        uid = users[ref]
        st = next(r for r in erp.roster() if r["erp_ref"] == ref)
        ts = _at(cal, d, hm)
        ctx = _ctx(cal, st["class"], ts, ["self", "r20", "r30", "r45"][rise] if asked else "self", "active" if code == 10 else "still")
        await tx.run("INSERT INTO feelings (school_id, student_id, code, accepted, ctx, source, model_updated, at) VALUES (%s,%s,%s,%s,%s,%s,true,%s)",
                     sid, uid, code, None, json.dumps(ctx), "band-ask" if asked else "band-self", ts)
        if ref in bands:
            model.update(band_models[bands[ref]], ctx, code)
        model.update(school_m, ctx, code)

    # Riya: worried in Maths, sad on 4 of the last 9 school days (today's sad is the 5th, which reaches the counsellor).
    for i, d in enumerate(older):
        await add_feeling("S7B01", d, "10:45", 2 if rnd.random() < 0.7 else 1, True, 2)
        if i % 2 == 0:
            await add_feeling("S7B01", d, "13:40", 1, True, 1)
        if i % 3 == 0:
            await add_feeling("S7B01", d, "11:35", 10, True, 3)
    plan = {8: [3], 7: [2], 6: [3], 5: [2, 1], 4: [1], 3: [3], 2: [2], 1: [10], 0: [3]}
    for back, codes in plan.items():
        d = recent[len(recent) - 1 - back]
        for code in codes:
            await add_feeling("S7B01", d, {2: "10:50", 10: "11:40", 3: "13:45"}.get(code, "09:30"), code, code != 3, 3 if code == 10 else 1)
    # Everyone else with a band: simulated habits mapped onto real days (kept calm in the recent window).
    seed_n = 500
    for ref in bands:
        if ref == "S7B01":
            continue
        sim = model.simulate_child(seed_n, len(days))
        seed_n += 1
        slot = {"English": "08:30", "Hindi": "09:10", "Science": "09:50", "Maths": "10:45", "PT": "11:30", "Lunch": "12:15",
                "Social Studies": "12:55", "Computer": "13:35", "Art": "14:15", "Library": "15:00"}
        for ev in sim["events"]:
            if ev["code"] in DIFFICULT and ev["day"] >= len(days) - 10 and rnd.random() < 0.5:
                continue
            await add_feeling(ref, days[ev["day"]], slot.get(ev["ctx"]["period"], "10:00"), ev["code"], ev["ctx"]["rise"] != "self",
                              {"self": 0, "r20": 1, "r30": 2, "r45": 3}[ev["ctx"]["rise"]])
    for b, m in band_models.items():
        await tx.run("UPDATE bands SET model = %s WHERE id = %s", json.dumps(m), b)
    await tx.run("INSERT INTO app_settings (key, value) VALUES ('school_model', %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", json.dumps(school_m))

    # Aarav skipped the last 2 band questions; one more sends a quiet note to his chosen adult.
    for d, hm in ((recent[-1], "15:20"), (cal.local(now).date(), "09:31")):
        await tx.run("INSERT INTO feelings (school_id, student_id, code, skipped, at) VALUES (%s,%s,0,true,%s)", sid, users["S7B02"], min(_at(cal, d, hm), now - timedelta(minutes=40)))
    # Zoya's band was silent all of yesterday: the class teacher was told at the end of the day.
    yd = recent[-1]
    told = _at(cal, yd, "15:30")
    who = "Zoya Ali (7B)"
    await tx.run("INSERT INTO alerts (school_id, rule, rule_version, student_id, to_user, detail, at) VALUES (%s,'band_silent',1,%s,%s,%s,%s)",
                 sid, users["S7B05"], users["T01"], json.dumps({"band": 1005}), told)
    from . import texts
    title, body = texts.make("silent", {"who": who, "band": 1005})
    await tx.run("INSERT INTO notifications (school_id, user_id, channel, kind, vars, title, body, created_at) VALUES (%s,%s,'push','silent',%s,%s,%s,%s)",
                 sid, users["T01"], json.dumps({"who": who, "band": 1005}), title, body, told)

    # Anonymous class answers for the last 10 school days (no student ids). 7B has felt tense for 3 days.
    mdays = cal.school_days_back(now, 10)
    easy = [(1, 0.8), (10, 0.09), (2, 0.04), (6, 0.03), (3, 0.02), (8, 0.02)]
    tense = [(1, 0.42), (8, 0.2), (2, 0.15), (6, 0.1), (3, 0.07), (4, 0.06)]
    for name, cid in class_ids.items():
        for i, d in enumerate(mdays):
            today = d == cal.local(now).date()
            n = rnd.randint(16, 20) if today else rnd.randint(14, 24)
            if name == "9A" and i == 6:
                n = 7  # an exam day: too few answers, so the cell stays hidden
            dist = tense if (name == "7B" and i >= 7) else easy
            for _ in range(n):
                ts = _at(cal, d, "08:10") + timedelta(minutes=rnd.randint(0, 400))
                if ts > now:
                    ts = now - timedelta(minutes=rnd.randint(2, 120))
                u, acc, code = rnd.random(), 0.0, dist[0][0]
                for c, pr in dist:
                    acc += pr
                    if u < acc:
                        code = c
                        break
                await tx.run("INSERT INTO mood (school_id, class_id, code, at) VALUES (%s,%s,%s,%s)", sid, cid, code, ts)

    await _history(tx, sch, users, rnd, now)
    return {"school_id": str(sid)}


async def _history(tx: Tx, sch: dict, users: dict, rnd: random.Random, now: datetime) -> None:
    """Closed cases from the last four weeks, so the principal's report has numbers."""
    cal = SchoolCalendar(sch)
    days = cal.school_days_back(now - timedelta(days=1), 22)
    students = [users[k] for k in ("S7B03", "S7B04", "S6A01", "S8A01", "S8A02", "S4A01", "S7B05", "S7B02")]
    delays = [35, 80, 140, 20, 290, 45, 15, 60, 210, 25, 95, 50, 40, 30, 70, 110]
    kinds = ["talk"] * 7 + ["sos"] + ["talk"] * 5 + ["medical_sos", "talk", "talk"]
    counsellor = users["C01"]
    for i, kind in enumerate(kinds):
        sos = kind != "talk"
        created = _at(cal, days[i + 3], "09:10") + timedelta(minutes=rnd.randint(0, 240))
        responded = created + timedelta(minutes=rnd.randint(2, 6) if sos else delays[i])
        deadline = created + timedelta(minutes=10) if sos else cal.end_of_school_day(created)
        late = responded > deadline
        st = rnd.choice(students)
        route = "counsellor" if i % 3 == 2 else "adult"
        adult = await casework.chosen_adult(tx, st)
        by = counsellor if (sos or late or route == "counsellor") else (adult or counsellor)
        case = await casework._new_case(
            tx, sch["id"], student_id=st, kind=kind, route=None if sos else route, status="resolved", level=2 if late else 1,
            recipients=[by], ever_recipients=[by], deadline=deadline, level_started_at=created, created_at=created,
            acknowledged_at=responded if sos else None, first_response_at=responded, last_activity_at=responded + timedelta(hours=1),
            going_by=by if sos else None, location_gateway="gw-stairs" if sos else None)
        await casework.add_event(tx, case, "created", created, st, kind=kind, seeded=True)
        if late:
            await casework.add_event(tx, case, "deadline_missed", deadline, level=1)
        await casework.add_event(tx, case, "going" if sos else "called", responded, by, first=True)
        await casework.add_event(tx, case, "reached" if sos else "talked", responded + timedelta(hours=1), by, note="Seeded history")
