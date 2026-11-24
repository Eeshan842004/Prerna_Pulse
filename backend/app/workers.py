"""Background workers: the reply-clock worker, the outbox sender and the event broker.

Timers live in PostgreSQL next to the case. Workers claim due rows with
SELECT ... FOR UPDATE SKIP LOCKED, so any number of API replicas can run them and no timer is
handled twice. Alerts are delivered from the outbox table: a crash can repeat an alert but
never lose one."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta

import psycopg

from . import casework, clock, insights
from .config import settings
from .db import db

log = logging.getLogger("prerana.workers")


async def run_timers_once() -> int:
    now = clock.now()
    async with db.tx(system=True) as tx:
        due = await tx.all("SELECT * FROM timers WHERE NOT done AND due_at <= %s ORDER BY due_at "
                           "FOR UPDATE SKIP LOCKED LIMIT 50", now)
        for t in due:
            await tx.run("UPDATE timers SET done = true WHERE id = %s", t["id"])
            case = await casework.lock_case(tx, t["case_id"])
            if case is None or case["status"] in ("resolved", "cancelled", "responded") or t["level"] != case["level"]:
                continue
            if t["kind"] == "escalate":
                await casework.escalate(tx, case, t["due_at"])
            elif t["kind"] == "remind":
                await casework.remind(tx, case, t["detail"].get("pct", 50), t["due_at"])
            elif t["kind"] == "sos_repeat" and case["acknowledged_at"] is None:
                await casework.sos_repeat(tx, case, t["due_at"])
        # Band silent: after the school day, a band with no contact all day tells the class teacher.
        for sch in await tx.all("SELECT id FROM schools"):
            await insights.check_silent(tx, sch["id"], now)
    return len(due)


class Channels:
    """Delivery adapters. The prototype stores every alert as an in-app notification and logs
    SMS and call tasks instead of sending them; FCM and an SMS gateway plug in here."""

    async def deliver(self, tx, row: dict) -> None:
        if row["channel"] in ("sms", "call_task"):
            log.info("[mock %s] to %s: %s - %s", row["channel"], row["to_user"], row["title"], row["body"])
        await tx.run("INSERT INTO notifications (school_id, user_id, channel, kind, vars, title, body, case_id, created_at) "
                     "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)", row["school_id"], row["to_user"], row["channel"], row["kind"],
                     json.dumps(row["vars"]), row["title"], row["body"], row["case_id"], clock.now())


channels = Channels()


async def run_outbox_once() -> int:
    now = clock.now()
    async with db.tx(system=True) as tx:
        rows = await tx.all("SELECT * FROM outbox WHERE sent_at IS NULL AND next_attempt_at <= %s ORDER BY id "
                            "FOR UPDATE SKIP LOCKED LIMIT 100", now)
        touched: dict[str, set] = {}
        for r in rows:
            try:
                await channels.deliver(tx, r)
                await tx.run("UPDATE outbox SET sent_at = %s, attempts = attempts + 1 WHERE id = %s", now, r["id"])
                touched.setdefault(str(r["school_id"]), set()).add(str(r["to_user"]) if r["to_user"] else "panel")
            except Exception:  # pragma: no cover - retried with back-off
                log.exception("delivery failed")
                await tx.run("UPDATE outbox SET attempts = attempts + 1, next_attempt_at = %s WHERE id = %s",
                             now + timedelta(seconds=min(300, 5 * 2 ** r["attempts"])), r["id"])
        for school_id, users in touched.items():
            await tx.notify({"school": school_id, "type": "notification", "users": sorted(users)})
    return len(rows)


async def _loop(fn, every: float) -> None:
    while True:
        try:
            await fn()
        except Exception:  # keep the worker alive
            log.exception("worker error in %s", fn.__name__)
        await asyncio.sleep(every)


class Broker:
    """Fans PostgreSQL NOTIFY events out to connected browsers (server-sent events)."""

    def __init__(self) -> None:
        self.subscribers: dict[asyncio.Queue, dict] = {}

    def subscribe(self, user: dict) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self.subscribers[q] = user
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.pop(q, None)

    def dispatch(self, payload: dict) -> None:
        if payload.get("type") == "clock":
            clock.set_offset(float(payload["offset"]))
        for q, u in list(self.subscribers.items()):
            if payload.get("type") != "clock" and payload.get("school") != str(u["school_id"]):
                continue
            users = set(payload.get("users") or [])
            staff = u["role"] != "student"
            wanted = (payload.get("type") in ("clock", "gateway", "band", "pulse", "band_message", "parent", "sos_location") and staff) \
                or str(u["id"]) in users or ("panel" in users and u["role"] in ("principal", "admin", "counsellor")) \
                or (payload.get("type") == "case" and u["role"] in ("principal", "counsellor")) \
                or payload.get("type") == "clock"
            if wanted:
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    pass

    async def listen(self) -> None:
        while True:
            try:
                async with await psycopg.AsyncConnection.connect(settings.app_dsn, autocommit=True) as conn:
                    await conn.execute("LISTEN pp_events")
                    async for n in conn.notifies():
                        try:
                            self.dispatch(json.loads(n.payload))
                        except Exception:
                            log.exception("bad event")
            except Exception:
                log.exception("listener lost, reconnecting")
                await asyncio.sleep(2)


broker = Broker()


def start_background() -> list[asyncio.Task]:
    tasks = [asyncio.create_task(broker.listen())]
    if settings.run_workers:
        tasks.append(asyncio.create_task(_loop(run_timers_once, settings.timer_poll_seconds)))
        tasks.append(asyncio.create_task(_loop(run_outbox_once, settings.outbox_poll_seconds)))
    return tasks
