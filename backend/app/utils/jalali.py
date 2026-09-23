"""Gregorian <-> Jalali (Solar Hijri) conversion for exports and emails."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

_TEHRAN = ZoneInfo("Asia/Tehran")
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
JALALI_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]


def gregorian_to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + (365 * gy) + ((gy2 + 3) // 4) - ((gy2 + 99) // 100) + ((gy2 + 399) // 400) + gd + g_d_m[gm - 1]
    jy = -1595 + (33 * (days // 12053))
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + (days // 31), 1 + (days % 31)
    else:
        jm, jd = 7 + ((days - 186) // 30), 1 + ((days - 186) % 30)
    return jy, jm, jd


def to_persian_digits(value) -> str:
    return str(value).translate(_FA_DIGITS)


def format_jalali(value: datetime | date | None, *, with_time: bool = True, persian_digits: bool = False) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        local = value.replace(tzinfo=ZoneInfo("UTC")).astimezone(_TEHRAN) if value.tzinfo is None else value
        jy, jm, jd = gregorian_to_jalali(local.year, local.month, local.day)
        text = f"{jy:04d}/{jm:02d}/{jd:02d}"
        if with_time:
            text += f" {local.hour:02d}:{local.minute:02d}"
    else:
        jy, jm, jd = gregorian_to_jalali(value.year, value.month, value.day)
        text = f"{jy:04d}/{jm:02d}/{jd:02d}"
    return to_persian_digits(text) if persian_digits else text
