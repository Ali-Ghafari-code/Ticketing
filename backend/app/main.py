"""FastAPI application entrypoint."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.config.settings import settings
from app.core import tasks
from app.core.exceptions import register_exception_handlers
from app.core.scheduler import scheduler_loop
from app.middleware.security import GlobalRateLimitMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware

logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")

_WEAK_SECRETS = {"change-me-access-secret-please-use-64-random-chars",
                 "change-me-refresh-secret-please-use-64-random-chars"}


def _check_config() -> None:
    if settings.is_production:
        if settings.JWT_SECRET_KEY in _WEAK_SECRETS or settings.JWT_REFRESH_SECRET in _WEAK_SECRETS \
                or len(settings.JWT_SECRET_KEY) < 32 or len(settings.JWT_REFRESH_SECRET) < 32:
            raise RuntimeError("JWT secrets must be set to strong random values in production.")
        if not settings.REFRESH_COOKIE_SECURE:
            logger.warning("REFRESH_COOKIE_SECURE should be true in production (HTTPS).")
    elif settings.JWT_SECRET_KEY in _WEAK_SECRETS:
        logger.warning("Using default JWT secrets — never do this in production.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    _check_config()
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stop = asyncio.Event()
    job = asyncio.create_task(scheduler_loop(stop)) if settings.ENABLE_SCHEDULER else None
    yield
    stop.set()
    if job:
        await job
    tasks.shutdown()


tags_metadata = [
    {"name": "احراز هویت", "description": "ورود، ثبت‌نام، توکن‌ها، بازیابی رمز و تایید اطلاعات تماس"},
    {"name": "تیکت‌ها", "description": "مدیریت تیکت‌ها، گفتگو، یادداشت داخلی، پیوست‌ها و رضایت مشتری"},
]

app = FastAPI(
    title="Persian Helpdesk API — API سامانه پشتیبانی",
    description="API چندسازمانی سامانه پشتیبانی و تیکتینگ فارسی. برای احراز هویت ابتدا از `/api/auth/login` "
                "توکن دریافت کرده و در هدر `Authorization: Bearer <token>` ارسال کنید. مدیر کل می‌تواند با هدر "
                "`X-Company-Id` در بستر یک سازمان عمل کند.",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(GlobalRateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Company-Id", "X-Request-ID"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
    max_age=600,
)
app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get(f"{settings.API_PREFIX}/health", tags=["سلامت سرویس"])
def health():
    from sqlalchemy import text

    from app.database.session import engine

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "version": app.version}
