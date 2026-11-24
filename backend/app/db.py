"""Database access. Every transaction runs inside a tenant (school) or system context,
which PostgreSQL row-level security enforces."""
from __future__ import annotations

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import settings

if sys.platform == "win32":  # psycopg's async mode needs the selector event loop on Windows
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


class Tx:
    def __init__(self, conn):
        self.conn = conn

    async def all(self, sql: str, *args: Any) -> list[dict]:
        cur = await self.conn.execute(sql, list(args))
        return await cur.fetchall()

    async def one(self, sql: str, *args: Any) -> dict | None:
        cur = await self.conn.execute(sql, list(args))
        return await cur.fetchone()

    async def val(self, sql: str, *args: Any) -> Any:
        row = await self.one(sql, *args)
        return None if row is None else next(iter(row.values()))

    async def run(self, sql: str, *args: Any) -> int:
        cur = await self.conn.execute(sql, list(args))
        return cur.rowcount

    async def notify(self, payload: dict) -> None:
        """Delivered to every API replica when the transaction commits."""
        await self.conn.execute("SELECT pg_notify('pp_events', %s)", [json.dumps(payload, default=str)])


class Database:
    def __init__(self) -> None:
        self.pool: AsyncConnectionPool | None = None

    async def open(self, dsn: str | None = None) -> None:
        self.pool = AsyncConnectionPool(dsn or settings.app_dsn, min_size=1, max_size=10, open=False,
                                        kwargs={"row_factory": dict_row})
        await self.pool.open(wait=True)

    async def close(self) -> None:
        if self.pool:
            await self.pool.close()

    @asynccontextmanager
    async def tx(self, school_id: Any = None, system: bool = False) -> AsyncIterator[Tx]:
        assert self.pool is not None, "database not opened"
        async with self.pool.connection() as conn:
            async with conn.transaction():
                if system:
                    await conn.execute("SELECT set_config('app.role', 'system', true)")
                if school_id is not None:
                    await conn.execute("SELECT set_config('app.school_id', %s, true)", [str(school_id)])
                yield Tx(conn)


db = Database()
