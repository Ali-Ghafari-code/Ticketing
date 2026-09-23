"""Password hashing, JWT access tokens and opaque refresh tokens."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config.settings import settings

_BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; pre-hash to keep long passphrases meaningful.
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode()
    return bcrypt.hashpw(digest, bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        digest = hashlib.sha256(password.encode("utf-8")).hexdigest().encode()
        return bcrypt.checkpw(digest, password_hash.encode())
    except ValueError:
        return False


# A constant hash to spend equal time when the user does not exist (prevents user enumeration by timing).
DUMMY_PASSWORD_HASH = hash_password(secrets.token_hex(8))


def create_access_token(user_id: str, *, company_id: str | None, user_type: str, session_id: str) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "cid": company_id,
        "typ": user_type,
        "sid": session_id,
        "iat": now,
        "nbf": now,
        "exp": expires,
        "type": "access",
        "jti": secrets.token_hex(8),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
        options={"require": ["exp", "sub", "type"]},
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    """Keyed hash for storing refresh/reset tokens so a DB leak does not leak usable tokens."""
    return hmac.new(settings.JWT_REFRESH_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()


def generate_numeric_code(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
