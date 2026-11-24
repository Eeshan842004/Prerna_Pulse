"""Setup commands.

    python -m app.manage init    create the schema, the pp_app role and demo data
    python -m app.manage reset   wipe all data and reseed (demo only)
"""
from __future__ import annotations

import asyncio
import os
import sys

import psycopg
from psycopg.rows import dict_row

from . import clock, seed
from .db import Tx

TABLES = ["access_log", "alerts", "mood", "feelings", "exercises", "parent_messages", "activities", "notifications", "outbox",
          "timers", "case_events", "band_messages", "cases", "sightings", "band_events", "gateways", "bands", "health_profiles",
          "consents", "trusted_adults", "timetable", "users", "classes", "schools", "app_settings"]


def owner_dsn() -> str:
    from .config import settings
    return settings.owner_dsn


async def apply_schema(conn) -> None:
    sql = open(os.path.join(os.path.dirname(__file__), "schema.sql"), encoding="utf-8").read()
    await conn.execute(sql)
    app_password = os.environ.get("PP_APP_PASSWORD", "pp_app")
    exists = await (await conn.execute("SELECT 1 FROM pg_roles WHERE rolname = 'pp_app'")).fetchone()
    if not exists:
        await conn.execute(f"CREATE ROLE pp_app LOGIN PASSWORD '{app_password}' NOSUPERUSER NOBYPASSRLS")
    await conn.execute("GRANT USAGE ON SCHEMA public TO pp_app")
    await conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pp_app")
    await conn.execute("REVOKE UPDATE, DELETE ON case_events FROM pp_app")
    await conn.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pp_app")


async def reseed(conn, demo_clock: bool = True) -> dict:
    await conn.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE")
    await conn.execute("ALTER SEQUENCE case_ref_seq RESTART WITH 101")
    if demo_clock:
        clock.set_offset(seed.demo_day_offset())
    await conn.execute("INSERT INTO app_settings (key, value) VALUES ('clock_offset', %s) "
                       "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [str(clock.offset_seconds())])
    await conn.execute("SELECT set_config('app.role', 'system', true)")
    out = await seed.seed(Tx(conn))
    await conn.execute("SELECT pg_notify('pp_events', %s)", [f'{{"type":"clock","offset":{clock.offset_seconds()}}}'])
    return out


async def main(cmd: str) -> None:
    async with await psycopg.AsyncConnection.connect(owner_dsn(), row_factory=dict_row) as conn:
        async with conn.transaction():
            if cmd == "init":
                await apply_schema(conn)
                print(await reseed(conn))
            elif cmd == "reset":
                print(await reseed(conn))
            elif cmd == "schema":
                await apply_schema(conn)
            else:
                raise SystemExit(__doc__)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else ""))
