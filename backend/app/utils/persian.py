"""Persian text helpers: digit/character normalisation and Iranian mobile validation."""
import re

_DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_CHAR_MAP = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "ؤ": "و"})
_MOBILE_RE = re.compile(r"^09\d{9}$")


def to_latin_digits(value: str) -> str:
    return value.translate(_DIGIT_MAP)


def normalize_text(value: str | None) -> str | None:
    """Unify Arabic/Persian variants so search and uniqueness behave consistently."""
    if value is None:
        return None
    value = value.translate(_CHAR_MAP)
    value = to_latin_digits(value)
    value = value.replace("‌", " ").replace("‏", "")
    return re.sub(r"\s+", " ", value).strip()


def normalize_mobile(value: str | None) -> str | None:
    """Return mobile in the canonical 09xxxxxxxxx form or None if empty. Raises ValueError if invalid."""
    if value is None:
        return None
    digits = re.sub(r"[\s\-()]", "", to_latin_digits(value))
    if not digits:
        return None
    if digits.startswith("+98"):
        digits = "0" + digits[3:]
    elif digits.startswith("0098"):
        digits = "0" + digits[4:]
    elif digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    elif digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    if not _MOBILE_RE.match(digits):
        raise ValueError("شماره موبایل معتبر نیست. نمونه صحیح: ۰۹۱۲۱۲۳۴۵۶۷")
    return digits


def is_mobile(value: str) -> bool:
    try:
        return normalize_mobile(value) is not None
    except ValueError:
        return False


def slugify(value: str, max_length: int = 160) -> str:
    value = normalize_text(value) or ""
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE).strip().lower()
    value = re.sub(r"[\s_-]+", "-", value)
    return value[:max_length].strip("-") or "item"


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
