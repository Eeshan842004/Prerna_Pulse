"""The system clock, with an offset for demos.

In demo mode a presenter can move time forward (for example to 3:30 pm) so judges can watch
a reply deadline pass without waiting. Every deadline and timer reads time from here."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_offset = timedelta(0)


def now() -> datetime:
    return datetime.now(timezone.utc) + _offset


def offset_seconds() -> float:
    return _offset.total_seconds()


def set_offset(seconds: float) -> None:
    global _offset
    _offset = timedelta(seconds=seconds)
