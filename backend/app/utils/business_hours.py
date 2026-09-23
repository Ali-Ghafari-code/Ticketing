"""Business-time arithmetic used by the SLA engine.

All datetimes stored in the DB are naive UTC. Working hours are defined in the
company's local timezone (default Asia/Tehran), so conversion happens here.
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MAX_SCAN_DAYS = 366


def _parse(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))


class BusinessCalendar:
    def __init__(self, working_hours: dict, holidays: set[date], tz_name: str = "Asia/Tehran") -> None:
        self.tz = ZoneInfo(tz_name)
        self.holidays = holidays
        self.windows: dict[int, tuple[time, time]] = {}
        for idx, name in enumerate(WEEKDAYS):
            cfg = (working_hours or {}).get(name) or {}
            if cfg.get("enabled"):
                start, end = _parse(cfg.get("start", "08:00")), _parse(cfg.get("end", "17:00"))
                if end > start:
                    self.windows[idx] = (start, end)

    @property
    def has_hours(self) -> bool:
        return bool(self.windows)

    def _to_local(self, utc_naive: datetime) -> datetime:
        return utc_naive.replace(tzinfo=timezone.utc).astimezone(self.tz)

    @staticmethod
    def _to_utc_naive(local: datetime) -> datetime:
        return local.astimezone(timezone.utc).replace(tzinfo=None)

    def _window(self, day: date) -> tuple[datetime, datetime] | None:
        if day in self.holidays or day.weekday() not in self.windows:
            return None
        start, end = self.windows[day.weekday()]
        return (
            datetime.combine(day, start, tzinfo=self.tz),
            datetime.combine(day, end, tzinfo=self.tz),
        )

    def add_minutes(self, start_utc: datetime, minutes: int) -> datetime:
        """Return the UTC moment after ``minutes`` of business time have elapsed from ``start_utc``."""
        if not self.has_hours:
            return start_utc + timedelta(minutes=minutes)
        remaining = timedelta(minutes=minutes)
        cursor = self._to_local(start_utc)
        for _ in range(MAX_SCAN_DAYS):
            window = self._window(cursor.date())
            if window:
                w_start, w_end = window
                if cursor < w_start:
                    cursor = w_start
                if cursor < w_end:
                    available = w_end - cursor
                    if remaining <= available:
                        return self._to_utc_naive(cursor + remaining)
                    remaining -= available
            cursor = datetime.combine(cursor.date() + timedelta(days=1), time(0, 0), tzinfo=self.tz)
        return self._to_utc_naive(cursor + remaining)

    def minutes_between(self, start_utc: datetime, end_utc: datetime) -> int:
        """Business minutes elapsed between two UTC moments."""
        if end_utc <= start_utc:
            return 0
        if not self.has_hours:
            return int((end_utc - start_utc).total_seconds() // 60)
        start, end = self._to_local(start_utc), self._to_local(end_utc)
        total = timedelta()
        day = start.date()
        for _ in range(MAX_SCAN_DAYS):
            if day > end.date():
                break
            window = self._window(day)
            if window:
                lo, hi = max(window[0], start), min(window[1], end)
                if hi > lo:
                    total += hi - lo
            day += timedelta(days=1)
        return int(total.total_seconds() // 60)
