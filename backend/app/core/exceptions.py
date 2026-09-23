"""Domain exceptions and the uniform API error envelope.

Every error response looks like::

    {"error": {"code": "not_found", "message": "<Persian message>", "details": [...]}, "request_id": "..."}
"""
import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"
    message = "درخواست نامعتبر است."

    def __init__(self, message: str | None = None, *, code: str | None = None, details: Any = None):
        self.message = message or self.message
        self.code = code or self.code
        self.details = details
        super().__init__(self.message)


class ValidationFailed(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_error"
    message = "اطلاعات ارسالی معتبر نیست."


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "authentication_failed"
    message = "لطفاً دوباره وارد حساب کاربری خود شوید."


class PermissionDenied(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    message = "شما مجوز انجام این عملیات را ندارید."


class NotFound(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message = "مورد درخواستی یافت نشد."


class Conflict(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message = "این مورد قبلاً ثبت شده است."


class RateLimited(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    message = "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید."


class FileUploadError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "file_upload_error"
    message = "بارگذاری فایل با خطا مواجه شد."


class PlanLimitExceeded(AppError):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    code = "plan_limit_exceeded"
    message = "سقف مجاز پلن اشتراک شما تکمیل شده است."


_FIELD_MESSAGES = {
    "missing": "این فیلد الزامی است.",
    "string_too_short": "مقدار وارد شده خیلی کوتاه است.",
    "string_too_long": "مقدار وارد شده خیلی طولانی است.",
    "value_error": "مقدار وارد شده معتبر نیست.",
    "int_parsing": "لطفاً یک عدد معتبر وارد کنید.",
    "enum": "مقدار انتخاب شده مجاز نیست.",
    "literal_error": "مقدار انتخاب شده مجاز نیست.",
    "greater_than_equal": "مقدار وارد شده کمتر از حد مجاز است.",
    "less_than_equal": "مقدار وارد شده بیشتر از حد مجاز است.",
}


def _envelope(request: Request, code: str, message: str, details: Any = None) -> dict:
    return {
        "error": {"code": code, "message": message, "details": details},
        "request_id": getattr(request.state, "request_id", None),
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_envelope(request, exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError):
        details = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
            msg = err.get("msg", "")
            if err.get("type") == "value_error" and msg.startswith("Value error, "):
                msg = msg.removeprefix("Value error, ")
            else:
                msg = _FIELD_MESSAGES.get(err.get("type", ""), msg)
            details.append({"field": ".".join(loc), "message": msg})
        return JSONResponse(
            status_code=422, content=_envelope(request, "validation_error", ValidationFailed.message, details)
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException):
        messages = {
            401: AuthenticationError.message,
            403: PermissionDenied.message,
            404: NotFound.message,
            405: "این متد برای این مسیر مجاز نیست.",
            413: "حجم درخواست بیش از حد مجاز است.",
        }
        message = exc.detail if isinstance(exc.detail, str) and exc.status_code not in messages else None
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(request, f"http_{exc.status_code}", message or messages.get(exc.status_code, "خطا")),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_handler(request: Request, exc: IntegrityError):
        logger.warning("Integrity error: %s", exc.orig)
        return JSONResponse(status_code=409, content=_envelope(request, "conflict", "اطلاعات تکراری یا نامعتبر است."))

    @app.exception_handler(SQLAlchemyError)
    async def db_handler(request: Request, exc: SQLAlchemyError):
        logger.exception("Database error")
        return JSONResponse(
            status_code=500, content=_envelope(request, "database_error", "خطا در ارتباط با پایگاه داده.")
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error")
        return JSONResponse(
            status_code=500,
            content=_envelope(request, "server_error", "خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید."),
        )
