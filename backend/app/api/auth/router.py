"""Authentication endpoints. The refresh token lives only in an httpOnly cookie scoped to /api/auth."""
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, get_current_user, get_request_meta
from app.config.settings import settings
from app.core.exceptions import AuthenticationError, PermissionDenied
from app.core.rate_limit import rate_limit
from app.core.security import decode_access_token
from app.database.base import utcnow
from app.database.session import get_db
from app.models import Company, User, UserSession
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    SessionOut,
    TokenResponse,
    VerificationConfirm,
    VerificationRequest,
)
from app.schemas.common import Message
from app.schemas.user import CompanyBranding, MeOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["احراز هویت"])
auth_limit = rate_limit(settings.RATE_LIMIT_AUTH, scope="auth")
CSRF_HEADER = "x-requested-with"


def _set_refresh_cookie(response: Response, token: str, days: int) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, token, max_age=days * 86400, httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE, samesite=settings.REFRESH_COOKIE_SAMESITE,
        domain=settings.REFRESH_COOKIE_DOMAIN, path=f"{settings.API_PREFIX}/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=f"{settings.API_PREFIX}/auth",
                           domain=settings.REFRESH_COOKIE_DOMAIN)


def _require_csrf_header(request: Request) -> None:
    # Cookie-authenticated endpoints require a custom header. Browsers cannot send it cross-site
    # without a CORS preflight, which our CORS policy only allows for trusted origins.
    if request.headers.get(CSRF_HEADER, "").lower() != "xmlhttprequest":
        raise PermissionDenied("درخواست نامعتبر است.", code="csrf_failed")


def _session_id(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        try:
            return decode_access_token(auth[7:]).get("sid")
        except Exception:  # noqa: BLE001
            return None
    return None


def build_me(db: Session, user: User) -> MeOut:
    from app.schemas.user import UserOut

    company = db.get(Company, user.company_id) if user.company_id else None
    return MeOut(
        **UserOut.model_validate(user).model_dump(),
        avatar_path=user.avatar_path,
        permissions=sorted(user.permission_codes),
        preferences=user.preferences or {},
        company=CompanyBranding.model_validate(company) if company else None,
    )


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_limit)], summary="ورود")
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db),
          meta: RequestMeta = Depends(get_request_meta)):
    tokens = auth_service.login(db, data.identifier, data.password, meta, data.remember_me)
    _set_refresh_cookie(response, tokens.refresh_token, tokens.refresh_expires_days)
    return TokenResponse(access_token=tokens.access_token, expires_in=tokens.expires_in)


@router.post("/register", response_model=TokenResponse, status_code=201, dependencies=[Depends(auth_limit)],
             summary="ثبت‌نام مشتری")
def register(data: RegisterRequest, response: Response, db: Session = Depends(get_db),
             meta: RequestMeta = Depends(get_request_meta)):
    tokens = auth_service.register(db, data, meta)
    _set_refresh_cookie(response, tokens.refresh_token, tokens.refresh_expires_days)
    return TokenResponse(access_token=tokens.access_token, expires_in=tokens.expires_in)


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(_require_csrf_header)],
             summary="تمدید توکن دسترسی (چرخش توکن نشست)")
def refresh(request: Request, response: Response, db: Session = Depends(get_db),
            meta: RequestMeta = Depends(get_request_meta)):
    try:
        tokens = auth_service.refresh(db, request.cookies.get(settings.REFRESH_COOKIE_NAME), meta)
    except AuthenticationError:
        _clear_refresh_cookie(response)
        raise
    _set_refresh_cookie(response, tokens.refresh_token, tokens.refresh_expires_days)
    return TokenResponse(access_token=tokens.access_token, expires_in=tokens.expires_in)


@router.post("/logout", response_model=Message, summary="خروج")
def logout(request: Request, response: Response, everywhere: bool = False, user: User = Depends(get_current_user),
           db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    auth_service.logout(db, user, _session_id(request), meta, everywhere=everywhere)
    _clear_refresh_cookie(response)
    return Message(message="با موفقیت خارج شدید.")


@router.get("/me", response_model=MeOut, summary="اطلاعات کاربر جاری")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_me(db, user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse, dependencies=[Depends(auth_limit)])
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db),
                    meta: RequestMeta = Depends(get_request_meta)):
    auth_service.forgot_password(db, data.identifier, meta)
    is_mobile = "@" not in data.identifier
    return ForgotPasswordResponse(
        message="در صورت وجود حساب کاربری، " + ("کد بازیابی به شماره موبایل شما ارسال شد." if is_mobile
                                              else "لینک بازیابی رمز عبور به ایمیل شما ارسال شد."),
        channel="sms" if is_mobile else "email",
    )


@router.post("/reset-password", response_model=Message, dependencies=[Depends(auth_limit)])
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db),
                   meta: RequestMeta = Depends(get_request_meta)):
    auth_service.reset_password(db, token=data.token, identifier=data.identifier, code=data.code,
                                new_password=data.new_password, meta=meta)
    return Message(message="رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.")


@router.post("/change-password", response_model=Message, dependencies=[Depends(auth_limit)])
def change_password(data: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    auth_service.change_password(db, user, data.current_password, data.new_password, _session_id(request), meta)
    return Message(message="رمز عبور شما با موفقیت تغییر کرد.")


@router.post("/verify/send", response_model=Message, dependencies=[Depends(auth_limit)],
             summary="ارسال کد تایید ایمیل/موبایل")
def send_verification(data: VerificationRequest, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    auth_service.send_verification(db, user, data.channel)
    return Message(message="کد تایید ارسال شد.")


@router.post("/verify/confirm", response_model=Message, dependencies=[Depends(auth_limit)])
def confirm_verification(data: VerificationConfirm, user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    auth_service.confirm_verification(db, user, data.channel, data.code)
    return Message(message="تایید با موفقیت انجام شد.")


@router.get("/sessions", response_model=list[SessionOut], summary="نشست‌های فعال")
def sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current = db.get(UserSession, _session_id(request)) if _session_id(request) else None
    rows = db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None),
                                                UserSession.expires_at > utcnow())
                      .order_by(UserSession.last_used_at.desc())).all()
    return [SessionOut(id=s.id, user_agent=s.user_agent, ip_address=s.ip_address, created_at=s.created_at,
                       last_used_at=s.last_used_at, expires_at=s.expires_at,
                       current=bool(current and s.family_id == current.family_id)) for s in rows]


@router.delete("/sessions/{session_id}", response_model=Message)
def revoke_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.get(UserSession, session_id)
    if session is None or session.user_id != user.id:
        raise AuthenticationError("نشست یافت نشد.")
    session.revoked_at = utcnow()
    db.commit()
    return Message(message="نشست باطل شد.")
