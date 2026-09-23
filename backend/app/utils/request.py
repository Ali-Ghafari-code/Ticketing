from fastapi import Request

from app.config.settings import settings


def client_ip(request: Request) -> str:
    if settings.TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    return request.client.host if request.client else "0.0.0.0"


def user_agent(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:500]
