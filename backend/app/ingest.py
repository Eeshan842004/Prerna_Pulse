"""Gateway ingest: verify a band message, keep one copy, act on it, then sign a receipt.

The receipt is built only after the event row is committed, so one buzz on the band always
means the school's database has the message. Gateways also report the signal strength (RSSI) at
which they heard the band; during an SOS the strongest recent gateway is the child's location."""
from __future__ import annotations

import time
from datetime import timedelta

from . import casework, clock, insights, model
from .config import settings
from .db import db
from .protocol import (R_DUPLICATE, R_OK, R_REPLY_WAITING, T_BATTERY, T_CANCEL, T_EXERCISE, T_FEELING, T_PAUSE, T_SEEN,
                       T_SKIPPED, T_SOS, T_STATUS, T_SUGGESTION, T_TALK, TYPE_NAMES, build_receipt, epoch_of,
                       open_packet, parse_header, rotating_id, unpack_feeling)
from .security import hash_token

# Rotating IDs for each school, per epoch: {(school_id, epoch): {rid: [(band_id, key)]}}
_rid_cache: dict[tuple, tuple[float, dict]] = {}


def invalidate_rid_cache() -> None:
    _rid_cache.clear()


async def _rid_table(tx, school_id, epoch: int) -> dict:
    hit = _rid_cache.get((str(school_id), epoch))
    if hit and time.monotonic() - hit[0] < 60:
        return hit[1]
    table: dict[bytes, list] = {}
    for b in await tx.all("SELECT id, key FROM bands WHERE school_id = %s AND NOT revoked", school_id):
        table.setdefault(rotating_id(bytes(b["key"]), epoch), []).append((b["id"], bytes(b["key"])))
    _rid_cache[(str(school_id), epoch)] = (time.monotonic(), table)
    return table


async def authenticate_gateway(gateway_id: str, token: str) -> dict | None:
    async with db.tx(system=True) as tx:
        gw = await tx.one("SELECT * FROM gateways WHERE id = %s", gateway_id)
        if not gw or gw["token_hash"] != hash_token(token):
            return None
        await tx.run("UPDATE gateways SET last_heartbeat = %s WHERE id = %s", clock.now(), gateway_id)
        return gw


async def heartbeat(gw: dict, version: str | None) -> None:
    async with db.tx(gw["school_id"]) as tx:
        await tx.run("UPDATE gateways SET last_heartbeat = %s, version = COALESCE(%s, version) WHERE id = %s",
                     clock.now(), version, gw["id"])
        await tx.notify({"school": str(gw["school_id"]), "type": "gateway"})


async def ingest_one(gw: dict, packet: bytes, rssi: int | None = None) -> dict:
    try:
        header = parse_header(packet)
    except ValueError as e:
        return {"status": "rejected", "reason": str(e)}
    now = clock.now()
    server_epoch = epoch_of(now.timestamp())

    async with db.tx(gw["school_id"]) as tx:
        match = None
        for ep in (server_epoch, server_epoch - 1, server_epoch + 1):
            for band_id, key in (await _rid_table(tx, gw["school_id"], ep)).get(header.rid, []):
                opened = open_packet(key, packet, ep)
                if opened:
                    match = (band_id, key, ep, opened)
                    break
            if match:
                break
        if not match:
            return {"status": "rejected", "reason": "unknown band or failed authentication"}
        band_id, key, used_epoch, (msg_type, arg) = match

        band = await tx.one("SELECT * FROM bands WHERE id = %s FOR UPDATE", band_id)  # serialises gateways
        if band["revoked"]:
            return {"status": "rejected", "reason": "band revoked"}
        if rssi is not None:  # every gateway that hears the band counts, even if it is the second to forward it
            await casework.note_sighting(tx, band, gw["id"], int(rssi), now)
        seen = await tx.one("SELECT receipt, gateways FROM band_events WHERE band_id = %s AND counter = %s",
                            band_id, header.counter)
        if seen:
            if gw["id"] not in seen["gateways"]:
                await tx.run("UPDATE band_events SET gateways = array_append(gateways, %s) WHERE band_id = %s AND counter = %s",
                             gw["id"], band_id, header.counter)
            return {"status": "duplicate", "receipt": bytes(seen["receipt"]).hex(), "type": TYPE_NAMES.get(msg_type),
                    "band_id": band_id, "counter": header.counter}
        if header.counter <= band["last_counter"] - settings.replay_window:
            return {"status": "rejected", "reason": "replayed or too old"}

        await _apply(tx, band, msg_type, arg, now)
        waiting = await tx.val("SELECT 1 FROM band_messages WHERE band_id = %s AND delivered_at IS NULL LIMIT 1", band_id)
        receipt = build_receipt(key, header.rid, header.counter, R_REPLY_WAITING if waiting else R_OK, server_epoch)
        await tx.run("INSERT INTO band_events (school_id, band_id, counter, type, arg, received_at, gateways, receipt) "
                     "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)", gw["school_id"], band_id, header.counter, msg_type, arg, now,
                     [gw["id"]], receipt)
        await tx.run("UPDATE bands SET last_counter = GREATEST(last_counter, %s), last_seen = %s WHERE id = %s",
                     header.counter, now, band_id)
        await tx.notify({"school": str(gw["school_id"]), "type": "band", "band_id": band_id})
    # The transaction has committed: only now does the receipt leave the server.
    return {"status": "ok", "receipt": receipt.hex(), "type": TYPE_NAMES.get(msg_type), "arg": arg,
            "band_id": band_id, "counter": header.counter, "epoch_used": used_epoch}


async def _apply(tx, band: dict, msg_type: int, arg: int, now) -> None:
    if msg_type == T_BATTERY:
        await tx.run("UPDATE bands SET battery = %s WHERE id = %s", arg, band["id"])
        return
    if not band["student_id"]:
        return
    student = await casework.user(tx, band["student_id"])
    sid = band["school_id"]
    if msg_type == T_FEELING:
        await insights.record_feeling(tx, student, unpack_feeling(arg), now)
    elif msg_type == T_SUGGESTION:
        await insights.learn_from(tx, student, (arg >> 3) & 15, bool(arg & 1), (arg >> 1) & 3, now)
    elif msg_type == T_SKIPPED:
        await insights.record_skip(tx, student, now)
    elif msg_type == T_TALK:
        await casework.create_talk(tx, sid, student["id"], "counsellor" if arg == 1 else "adult", now)
    elif msg_type == T_SOS:
        await casework.create_sos(tx, sid, student["id"], arg == 1, now)
    elif msg_type == T_CANCEL:
        await casework.cancel_sos(tx, student["id"], now)
    elif msg_type == T_PAUSE:
        await tx.run("UPDATE bands SET pt_until = %s WHERE id = %s", now + timedelta(minutes=arg) if arg else None, band["id"])
        await tx.notify({"school": str(sid), "type": "band", "band_id": band["id"]})
    elif msg_type == T_SEEN:
        m = await tx.one("SELECT * FROM band_messages WHERE band_id = %s AND seen_at IS NULL AND (id %% 256) = %s ORDER BY id DESC LIMIT 1",
                         band["id"], arg)
        if m:
            await tx.run("UPDATE band_messages SET seen_at = %s WHERE id = %s", now, m["id"])
            if m["case_id"]:
                case = await tx.one("SELECT * FROM cases WHERE id = %s", m["case_id"])
                await casework.add_event(tx, case, "child_saw_message", now, student["id"])
                await casework.broadcast(tx, case, [])
    elif msg_type == T_EXERCISE:
        await tx.run("INSERT INTO exercises (school_id, student_id, result, at) VALUES (%s,%s,%s,%s)", sid, student["id"],
                     "talk" if arg == 2 else "better" if arg == 1 else "none", now)
    # T_STATUS needs no action: its receipt carries "a message is waiting", and it doubles as the SOS beacon.


async def band_inbox(band_id: int) -> dict:
    """What a band fetches (through a gateway) after a receipt with status 'message waiting'."""
    now = clock.now()
    async with db.tx(system=True) as tx:
        band = await tx.one("SELECT * FROM bands WHERE id = %s", band_id)
        if not band:
            return {}
        msgs = await tx.all("UPDATE band_messages SET delivered_at = %s WHERE band_id = %s AND delivered_at IS NULL RETURNING *", now, band_id)
        sos = await tx.val("SELECT 1 FROM cases WHERE student_id = %s AND kind IN ('sos','medical_sos') AND status IN ('open','acknowledged') LIMIT 1",
                           band["student_id"])
        hp = await tx.val("SELECT pause_sensing FROM health_profiles WHERE student_id = %s", band["student_id"])
        consent = await tx.val("SELECT sensing FROM consents WHERE student_id = %s", band["student_id"])
        school_model = await insights.school_model(tx)
        pt = band["pt_until"]
        await tx.notify({"school": str(band["school_id"]), "type": "case", "users": []})
    return {"messages": [{"id": m["id"], "kind": m["kind"], "vars": m["vars"], "text": m["text"]} for m in sorted(msgs, key=lambda x: x["id"])],
            "sos_active": bool(sos), "pt_until": pt if pt and pt > now else None, "sensing": not hp and consent is not False,
            "model": band["model"], "school": school_model}
