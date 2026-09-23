"""Request-ID, secure HTTP headers and a global per-IP rate limit."""
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config.settings import settings
from app.core.rate_limit import backend, parse_rate
from app.utils.request import client_ip

logger = logging.getLogger("app.request")

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = request_id[:64]
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request.state.request_id
        if elapsed > 1000:
            logger.warning("Slow request %s %s took %.0fms", request.method, request.url.path, elapsed)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if not request.url.path.startswith(_DOCS_PATHS):
            headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if settings.is_production:
            headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
        return response


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self.limit, self.window = parse_rate(settings.RATE_LIMIT_DEFAULT)

    async def dispatch(self, request: Request, call_next) -> Response:
        if settings.ENVIRONMENT != "test" and request.method != "OPTIONS":
            if not backend.hit(f"global:{client_ip(request)}", self.limit, self.window):
                return JSONResponse(status_code=429, content={"error": {
                    "code": "rate_limited", "message": "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.",
                    "details": None}, "request_id": getattr(request.state, "request_id", None)})
        return await call_next(request)
