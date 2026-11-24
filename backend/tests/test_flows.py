"""End-to-end rules (band-only v2): ingest, exactly-once, replay, private feelings, the 5-of-10 rule,
the reply clock, Call to talk, SOS with live location, PT mode, class weather, parents, audit."""
import asyncio
from datetime import datetime, timedelta

import pytest

from app import casework, clock, ingest, insights, protocol, workers
from app.content import rssi_from
from app.db import db
from app.schoolcal import SchoolCalendar
from app.seed import demo_band_key

from .conftest import advance, owner_sql

pytestmark = pytest.mark.anyio


async def gateway(gid="gw-7b"):
    return await ingest.authenticate_gateway(gid, f"demo-token-{gid}")


def packet(band, counter, mtype, arg=0):
    epoch = protocol.epoch_of(clock.now().timestamp())
    return protocol.build_packet(demo_band_key(band), counter, epoch, mtype, arg)


_counter = [1000]


async def send(band, mtype, arg=0, near="gw-7b"):
    """The band sends one message; the gateway nearest it hears it, and reports its signal strength."""
    _counter[0] += 1
    return await ingest.ingest_one(await gateway(near), packet(band, _counter[0], mtype, arg), rssi_from(near, near))


async def one(sql, *args):
    async with db.tx(system=True) as tx:
        return await tx.one(sql, *args)


async def rows(sql, *args):
    async with db.tx(system=True) as tx:
        return await tx.all(sql, *args)


async def count(sql, *args):
    async with db.tx(system=True) as tx:
        return await tx.val(sql, *args)


async def user(erp_ref):
    return await one("SELECT u.*, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE erp_ref = %s", erp_ref)


async def settle():
    await workers.run_timers_once()
    await workers.run_outbox_once()


async def notes(erp_ref, kind=None):
    u = await user(erp_ref)
    return await rows("SELECT * FROM notifications WHERE user_id = %s" + (" AND kind = %s" if kind else ""), u["id"], *([kind] if kind else []))


async def test_two_gateways_one_case_same_receipt(fresh):
    pkt = packet(1001, 200, protocol.T_TALK, 0)
    a = await ingest.ingest_one(await gateway("gw-7b"), pkt, -50)
    b = await ingest.ingest_one(await gateway("gw-stairs"), pkt, -70)
    assert a["status"] == "ok" and b["status"] == "duplicate"
    assert a["receipt"] == b["receipt"]
    rid = protocol.parse_header(pkt).rid
    assert protocol.verify_receipt(demo_band_key(1001), bytes.fromhex(a["receipt"]), rid, 200) == protocol.R_OK
    assert await count("SELECT count(*) FROM cases WHERE kind = 'talk' AND status = 'open'") == 1
    ev = await one("SELECT gateways FROM band_events WHERE band_id = 1001 AND counter = 200")
    assert sorted(ev["gateways"]) == ["gw-7b", "gw-stairs"]


async def test_two_gateways_at_the_same_moment_still_make_one_case(fresh):
    pkt = packet(1003, 900, protocol.T_TALK, 1)
    r = await asyncio.gather(ingest.ingest_one(await gateway("gw-7b"), pkt, -50), ingest.ingest_one(await gateway("gw-office"), pkt, -80))
    assert sorted(x["status"] for x in r) == ["duplicate", "ok"]
    assert await count("SELECT count(*) FROM cases WHERE status = 'open'") == 1


async def test_replay_and_forgery_rejected(fresh):
    gw = await gateway()
    assert (await ingest.ingest_one(gw, packet(1001, 300, protocol.T_FEELING, 1)))["status"] == "ok"
    old = await ingest.ingest_one(gw, packet(1001, 260, protocol.T_SOS, 0))
    assert old["status"] == "rejected" and "replay" in old["reason"]
    forged = bytearray(packet(1001, 301, protocol.T_SOS, 0))
    forged[-1] ^= 0xFF
    assert (await ingest.ingest_one(gw, bytes(forged)))["status"] == "rejected"
    assert await count("SELECT count(*) FROM cases WHERE kind = 'sos' AND status = 'open'") == 0


async def test_one_difficult_feeling_is_private_nobody_is_told(fresh):
    before = (await count("SELECT count(*) FROM outbox"), await count("SELECT count(*) FROM notifications"))
    await send(1001, protocol.T_FEELING, protocol.pack_feeling(2, 2, True, True))   # worried: Riya's 4th such day, still private
    await settle()
    after = (await count("SELECT count(*) FROM outbox"), await count("SELECT count(*) FROM notifications"))
    assert before == after
    assert await count("SELECT count(*) FROM alerts WHERE rule = 'persistent'") == 0


async def test_fifth_day_of_the_same_feeling_reaches_the_counsellor_with_the_name_not_before(fresh):
    kabir = await user("S7B03")
    sch = await one("SELECT * FROM schools")
    days = SchoolCalendar(sch).school_days_back(clock.now(), 10)
    await owner_sql("DELETE FROM feelings WHERE student_id = %s", kabir["id"])

    async def feel(day, code=8):
        at = datetime.combine(day, datetime.min.time().replace(hour=11), tzinfo=SchoolCalendar(sch).tz)
        async with db.tx(kabir["school_id"]) as tx:
            await insights.record_feeling(tx, kabir, {"code": code, "rise": 1, "asked": True, "accepted": False}, at)

    for d in days[0:8:2]:
        await feel(d)                                                  # 4 days: stays private
    assert await count("SELECT count(*) FROM alerts WHERE rule = 'persistent' AND student_id = %s", kabir["id"]) == 0
    await feel(days[9])                                                # the 5th day
    assert await count("SELECT count(*) FROM alerts WHERE rule = 'persistent' AND student_id = %s", kabir["id"]) == 1

    # Riya has sad on 4 of the last 9 days; today's sad is her 5th.
    await send(1001, protocol.T_FEELING, protocol.pack_feeling(3, 0, False, False))
    await settle()
    pattern = [n for n in await notes("C01", "pattern") if n["vars"].get("n") == 5 and "Riya Sharma" in n["body"]]
    assert len(pattern) == 1
    await send(1001, protocol.T_FEELING, protocol.pack_feeling(3, 0, False, False))   # a second sad today: no second note
    await settle()
    assert len([n for n in await notes("C01", "pattern") if "Riya Sharma" in n["body"]]) == 1


async def test_three_skipped_questions_send_a_quiet_note_to_the_chosen_adult(fresh):
    await send(1002, protocol.T_SKIPPED)
    await settle()
    assert any("Aarav" in n["body"] for n in await notes("T02", "quiet"))


async def test_talk_clock_moves_up_call_to_talk_stops_it_and_reaches_the_band(fresh):
    await send(1001, protocol.T_TALK, 0)
    await settle()
    case = await one("SELECT * FROM cases WHERE kind = 'talk' AND status = 'open'")
    t01 = await user("T01")
    assert case["recipients"] == [t01["id"]] and await notes("T01", "talk_new")

    advance((case["deadline"] - clock.now()).total_seconds() / 60 + 1)
    await settle()
    case = await one("SELECT * FROM cases WHERE id = %s", case["id"])
    c01 = await user("C01")
    assert case["level"] == 2 and case["recipients"] == [c01["id"]]
    assert await notes("T01", "talk_moved_on")
    assert await count("SELECT count(*) FROM band_messages WHERE kind = 'moved' AND text = 'Ms Khan will contact you'") == 1

    async with db.tx(c01["school_id"]) as tx:
        case = await casework.call_to_talk(tx, case["id"], c01, "lunch", "counselling", clock.now())
    assert case["status"] == "responded"
    msg = await one("SELECT * FROM band_messages WHERE kind = 'call'")
    assert msg["text"] == "Ms Khan will see you tomorrow at lunch, Counselling room" and len(msg["text"]) <= 60
    assert await count("SELECT count(*) FROM timers WHERE case_id = %s AND NOT done", case["id"]) == 0

    # the band fetches the message (its receipt said one was waiting: see the test below) and presses Okay
    inbox = await ingest.band_inbox(1001)
    assert any(m["kind"] == "call" for m in inbox["messages"])
    await send(1001, protocol.T_SEEN, msg["id"] & 255)
    assert (await one("SELECT seen_at FROM band_messages WHERE id = %s", msg["id"]))["seen_at"] is not None

    advance(60 * 24)                                                    # nothing moves after a real response
    await settle()
    assert (await one("SELECT level FROM cases WHERE id = %s", case["id"]))["level"] == 2


async def test_receipt_tells_the_band_a_message_is_waiting(fresh):
    c01 = await user("C01")
    await send(1001, protocol.T_TALK, 1)
    case = await one("SELECT * FROM cases WHERE kind = 'talk' AND status = 'open'")
    async with db.tx(c01["school_id"]) as tx:
        await casework.call_to_talk(tx, case["id"], c01, "now", "room12", clock.now())
    _counter[0] += 1
    pkt = packet(1001, _counter[0], protocol.T_STATUS)
    res = await ingest.ingest_one(await gateway(), pkt, -50)
    assert protocol.verify_receipt(demo_band_key(1001), bytes.fromhex(res["receipt"]), protocol.parse_header(pkt).rid, _counter[0]) == protocol.R_REPLY_WAITING


async def test_sos_alerts_three_at_once_with_location_that_follows_the_child(fresh):
    await send(1001, protocol.T_SOS, 0, near="gw-stairs")
    await settle()
    case = await one("SELECT * FROM cases WHERE kind = 'sos' AND status = 'open'")
    ids = {u: (await user(u))["id"] for u in ("C01", "P01", "T01")}
    assert sorted(case["recipients"]) == sorted(ids.values())
    assert case["location_gateway"] == "gw-stairs"
    for ref in ids:
        assert await notes(ref, "sos")
    # the band beacons; every gateway that hears it reports signal strength; the strongest is the place
    _counter[0] += 1
    pkt = packet(1001, _counter[0], protocol.T_STATUS)
    for g in ("gw-library", "gw-stairs", "gw-7b"):
        await ingest.ingest_one(await gateway(g), pkt, rssi_from("gw-library", g))
    case = await one("SELECT * FROM cases WHERE id = %s", case["id"])
    assert case["location_gateway"] == "gw-library" and len(case["trail"]) == 2
    c01 = await user("C01")
    async with db.tx(c01["school_id"]) as tx:
        await casework.going(tx, case["id"], c01, clock.now())
    case = await one("SELECT * FROM cases WHERE id = %s", case["id"])
    assert case["going_by"] == c01["id"] and case["status"] == "acknowledged"
    assert await count("SELECT count(*) FROM band_messages WHERE kind = 'coming' AND text = 'Ms Khan is coming'") == 1
    await settle()
    assert await notes("P01", "sos_going")


async def test_a_second_press_while_help_is_coming_makes_no_second_alert(fresh):
    await send(1001, protocol.T_SOS, 0)
    await send(1001, protocol.T_SOS, 0)
    assert await count("SELECT count(*) FROM cases WHERE kind = 'sos' AND status = 'open'") == 1


async def test_sos_not_answered_in_10_minutes_repeats_by_sms_and_call_with_a_daily_cap(fresh):
    await send(1004, protocol.T_SOS, 0, near="gw-playground")
    case = await one("SELECT * FROM cases WHERE kind = 'sos' AND status = 'open'")
    assert (await user("N01"))["id"] in case["recipients"]               # Meera's health profile adds the nurse
    n = len(case["recipients"])
    advance(11)
    await settle()
    assert await count("SELECT count(*) FROM notifications WHERE channel = 'sms' AND case_id = %s", case["id"]) == n
    assert await count("SELECT count(*) FROM notifications WHERE channel = 'call_task' AND case_id = %s", case["id"]) == n
    advance(10)
    await settle()
    assert await count("SELECT count(*) FROM notifications WHERE channel = 'sms' AND case_id = %s", case["id"]) == 2 * n
    for _ in range(8):                                                   # the cap: repeats stop, the alert itself is never dropped
        advance(10)
        await settle()
    assert await count("SELECT count(*) FROM notifications WHERE channel = 'sms' AND case_id = %s", case["id"]) <= 6 * n
    c01 = await user("C01")
    async with db.tx(c01["school_id"]) as tx:
        await casework.going(tx, case["id"], c01, clock.now())
    before = await count("SELECT count(*) FROM notifications WHERE channel = 'sms'")
    advance(30)
    await settle()
    assert await count("SELECT count(*) FROM notifications WHERE channel = 'sms'") == before  # "I'm going" stops the repeats


async def test_unwell_and_need_the_nurse_sends_a_medical_sos(fresh):
    await send(1003, protocol.T_SOS, 1, near="gw-lab")
    case = await one("SELECT * FROM cases WHERE kind = 'medical_sos' AND status = 'open'")
    assert (await user("N01"))["id"] in case["recipients"] and (await user("C01"))["id"] in case["recipients"]


async def test_the_child_can_cancel_sos_within_60_seconds(fresh):
    await send(1001, protocol.T_SOS, 0)
    await send(1001, protocol.T_CANCEL, 0)
    assert (await one("SELECT status FROM cases WHERE kind = 'sos' ORDER BY created_at DESC LIMIT 1"))["status"] == "cancelled"
    await settle()
    assert await notes("C01", "sos_cancel")


async def test_pt_mode_pauses_noticing_and_the_timetable_marks_pt_periods(fresh):
    await send(1001, protocol.T_PAUSE, 30)
    band = await one("SELECT pt_until FROM bands WHERE id = 1001")
    assert band["pt_until"] > clock.now() + timedelta(minutes=29)
    inbox = await ingest.band_inbox(1001)
    assert inbox["pt_until"] is not None and inbox["sensing"] is True
    pt = await rows("SELECT * FROM timetable WHERE class_id = (SELECT id FROM classes WHERE name = '7B') AND weekday = 2 AND pauses_sensing")
    assert len(pt) == 1 and pt[0]["subject"] == "PT" and str(pt[0]["start_time"]) == "11:20:00"


async def test_class_weather_7b_is_tense_small_groups_hidden_no_names(fresh):
    t01 = await user("T01")
    cls = await one("SELECT id FROM classes WHERE name = '7B'")
    async with db.tx(t01["school_id"]) as tx:
        m = await insights.class_mood(tx, t01["school_id"], cls["id"], clock.now())
    assert m["row"]["weather"] == "storm" and m["row"]["activity"] and m["row"]["top"]
    assert sum(1 for r in m["rows"] if r["flag"]) == 1
    assert next(r for r in m["rows"] if r["class"] == "9A")["cells"][6]["hidden"]
    assert "Riya" not in str(m)


async def test_parents_get_no_automatic_alerts_and_counsellor_messages_are_encrypted(fresh):
    await send(1001, protocol.T_SOS, 0)
    await send(1001, protocol.T_FEELING, protocol.pack_feeling(3))
    await send(1001, protocol.T_TALK, 0)
    advance(30)
    await settle()
    assert await notes("G01") == []
    c01, riya = await user("C01"), await user("S7B01")
    secret = "We spoke with Riya today. Everything is fine."
    async with db.tx(c01["school_id"]) as tx:
        await casework.share_with_parent(tx, c01["school_id"], riya["id"], c01, secret, clock.now())
        got = await casework.parent_messages(tx, c01["school_id"], riya["id"])
    assert got[0]["text"] == secret
    raw = await one("SELECT text_enc FROM parent_messages")
    assert secret.encode() not in bytes(raw["text_enc"])


async def test_silent_band_tells_the_class_teacher_after_school(fresh):
    advance(5 * 60 + 5)                                               # past 15:30
    await settle()
    assert any("1005" in n["body"] for n in await notes("T01", "silent"))
    n = len(await notes("T01", "silent"))
    await settle()
    assert len(await notes("T01", "silent")) == n                       # once a day


async def test_emotion_model_beats_the_baseline_on_held_out_children_and_suggests_worried_for_riya(fresh):
    from app import model
    card = model.evaluate()
    assert card["top1"] > card["baseline_top1"] and card["top3"] > card["baseline_top3"], card
    band = await one("SELECT * FROM bands WHERE id = 1001")
    ctx = {"tod": "morning", "dow": "2", "period": "Maths", "rise": "r30", "move": "still"}
    async with db.tx(system=True) as tx:
        top = model.suggest(band["model"], await insights.school_model(tx), ctx)[0]
    assert top["code"] == 2


async def test_audit_chain_detects_tampering(fresh):
    await send(1001, protocol.T_TALK, 0)
    case = await one("SELECT * FROM cases WHERE kind = 'talk' AND status = 'open'")
    async with db.tx(system=True) as tx:
        assert await casework.verify_chain(tx, case["id"])
    with pytest.raises(Exception):
        await owner_sql("UPDATE case_events SET kind = 'x' WHERE case_id = %s", case["id"])   # append-only trigger
    await owner_sql("ALTER TABLE case_events DISABLE TRIGGER case_events_append_only")
    await owner_sql("UPDATE case_events SET detail = '{\"to\":\"x\"}' WHERE case_id = %s AND kind = 'created'", case["id"])
    await owner_sql("ALTER TABLE case_events ENABLE TRIGGER case_events_append_only")
    async with db.tx(system=True) as tx:
        assert not await casework.verify_chain(tx, case["id"])


async def test_row_level_security_isolates_schools(fresh):
    other = await owner_sql("INSERT INTO schools (name, data_key_wrapped) VALUES ('Other school', %s) RETURNING id", b"x" * 40)
    async with db.tx(other[0]["id"]) as tx:
        assert await tx.val("SELECT count(*) FROM cases") == 0 and await tx.val("SELECT count(*) FROM feelings") == 0
        assert await tx.val("SELECT count(*) FROM users") == 0
    riya = await user("S7B01")
    async with db.tx(riya["school_id"]) as tx:
        assert await tx.val("SELECT count(*) FROM users") > 10


async def test_handover_to_staff_route_hides_the_case_from_the_class_chain(fresh):
    await send(1001, protocol.T_TALK, 0)
    case = await one("SELECT * FROM cases WHERE kind = 'talk' AND status = 'open'")
    t01 = await user("T01")
    async with db.tx(t01["school_id"]) as tx:
        case = await casework.handover(tx, case["id"], t01, "staff", clock.now())
    assert case["route"] == "staff"
    assert {r["role"] for r in await rows("SELECT role FROM users WHERE id = ANY(%s)", case["recipients"])} == {"principal", "pocso"}
    from app.main import can_open
    assert not can_open(await user("C01"), case)       # the counsellor's own chain does not see a staff route
    assert can_open(await user("P01"), case)


async def test_report_and_device_health(fresh):
    from app.main import _report
    p01 = await user("P01")
    rep = await _report(p01)
    assert rep["cases"] >= 10 and rep["median_response_minutes"] and rep["on_time_share"] > 0.5
    gw = await one("SELECT last_heartbeat FROM gateways WHERE id = 'gw-blockb'")
    assert gw["last_heartbeat"] < clock.now() - timedelta(minutes=1)
    assert (await one("SELECT battery FROM bands WHERE id = 1005"))["battery"] < 25


async def test_a_child_with_no_chosen_adult_still_gets_an_answer_from_the_counsellor(fresh):
    assert await count("SELECT count(*) FROM trusted_adults WHERE student_id = (SELECT id FROM users WHERE erp_ref = 'S7B05')") == 0
    await send(1005, protocol.T_TALK, 0)                                  # Zoya never chose an adult
    case = await one("SELECT * FROM cases WHERE kind = 'talk' AND status = 'open'")
    assert case["recipients"] == [(await user("C01"))["id"]] and case["level"] == 2   # the empty rung is skipped, never dropped
    await settle()
    assert await notes("C01", "talk_new")


async def test_two_sos_at_once_each_keep_their_own_location_and_recipients(fresh):
    await send(1001, protocol.T_SOS, 0, near="gw-stairs")
    await send(1004, protocol.T_SOS, 0, near="gw-playground")               # Meera, whose profile adds the nurse
    cases = await rows("SELECT * FROM cases WHERE kind = 'sos' AND status = 'open' ORDER BY created_at")
    assert [c["location_gateway"] for c in cases] == ["gw-stairs", "gw-playground"]
    nurse = (await user("N01"))["id"]
    assert nurse not in cases[0]["recipients"] and nurse in cases[1]["recipients"]
    c01 = await user("C01")
    async with db.tx(c01["school_id"]) as tx:
        await casework.going(tx, cases[0]["id"], c01, clock.now())
    assert (await one("SELECT status FROM cases WHERE id = %s", cases[1]["id"]))["status"] == "open"   # one going doesn't close the other


async def test_a_junior_band_and_a_paused_band_are_reported_by_the_demo_endpoint(fresh):
    from app.main import demo_bands
    bands = {b["student"]: b for b in await demo_bands()}
    assert bands["Dev Malhotra"]["junior"] is True and bands["Riya Sharma"]["junior"] is False
    await owner_sql("UPDATE health_profiles SET pause_sensing = true WHERE student_id = (SELECT id FROM users WHERE erp_ref = 'S7B04')")
    assert {b["student"]: b for b in await demo_bands()}["Meera Joshi"]["pause_sensing"] is True
