"""School calendar: deadlines count school days and skip holidays."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


class SchoolCalendar:
    def __init__(self, school: dict):
        self.tz = ZoneInfo(school["tz"])
        self.day_end: time = school["day_end"]
        self.staff_end: time = school["staff_end"]
        self.days = set(school["school_days"])
        self.holidays = set(school["holidays"] or [])

    def is_school_day(self, d: date) -> bool:
        return d.isoweekday() in self.days and d not in self.holidays

    def next_school_day(self, d: date) -> date:
        d = d + timedelta(days=1)
        for _ in range(60):
            if self.is_school_day(d):
                return d
            d += timedelta(days=1)
        return d

    def _at(self, d: date, t: time) -> datetime:
        return datetime.combine(d, t, tzinfo=self.tz)

    def local(self, ts: datetime) -> datetime:
        return ts.astimezone(self.tz)

    def end_of_school_day(self, ts: datetime, min_left: timedelta = timedelta(hours=1)) -> datetime:
        """Today's closing time if at least an hour of school is left, else the next school day's."""
        loc = self.local(ts)
        if self.is_school_day(loc.date()) and self._at(loc.date(), self.day_end) - loc >= min_left:
            return self._at(loc.date(), self.day_end)
        return self._at(self.next_school_day(loc.date()), self.day_end)

    def next_school_day_at(self, ts: datetime, t: time) -> datetime:
        return self._at(self.next_school_day(self.local(ts).date()), t)

    def same_school_day_staff(self, ts: datetime) -> datetime:
        loc = self.local(ts)
        if self.is_school_day(loc.date()) and self._at(loc.date(), self.staff_end) - loc >= timedelta(hours=1):
            return self._at(loc.date(), self.staff_end)
        return self.next_school_day_at(ts, time(12, 0))

    def school_days_back(self, ts: datetime, n: int) -> list[date]:
        """The last n school days up to and including today."""
        out, d = [], self.local(ts).date()
        while len(out) < n:
            if self.is_school_day(d):
                out.append(d)
            d -= timedelta(days=1)
        return list(reversed(out))
