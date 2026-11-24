"""Tests run against a real PostgreSQL database (row-level security and SKIP LOCKED are
PostgreSQL features, so mocking the database would test nothing useful).

Set PP_TEST_OWNER_DSN / PP_TEST_APP_DSN, or use the defaults below with a local server."""
import asyncio
import os
import sys

if sys.platform == "win32":  # psycopg async needs the selector loop on Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

os.environ.setdefault("PP_OWNER_DSN", os.environ.get("PP_TEST_OWNER_DSN", "postgresql://postgres@localhost:5432/prerana_test"))
os.environ.setdefault("PP_APP_DSN", os.environ.get("PP_TEST_APP_DSN", "postgresql://pp_app:pp_app@localhost:5432/prerana_test"))
os.environ.setdefault("PP_RUN_WORKERS", "false")

import psycopg  # noqa: E402
import pytest  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app import clock, ingest, manage  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import db  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def fresh():
    """A freshly seeded school, the clock at 10:40 on a school day, and an open pool."""
    async with await psycopg.AsyncConnection.connect(settings.owner_dsn, row_factory=dict_row) as conn:
        async with conn.transaction():
            await manage.apply_schema(conn)
            info = await manage.reseed(conn)
    ingest.invalidate_rid_cache()
    await db.open()
    try:
        yield info
    finally:
        await db.close()


async def owner_sql(sql: str, *args):
    async with await psycopg.AsyncConnection.connect(settings.owner_dsn, row_factory=dict_row, autocommit=True) as conn:
        await conn.execute("SELECT set_config('app.role', 'system', false)")
        cur = await conn.execute(sql, list(args))
        return await cur.fetchall() if cur.description else None


def advance(minutes: float) -> None:
    clock.set_offset(clock.offset_seconds() + minutes * 60)
