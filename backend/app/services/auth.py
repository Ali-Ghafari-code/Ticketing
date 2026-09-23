"""Authentication: login with throttling, refresh-token rotation, registration, password reset, verification."""
import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta
from app.config.settings import settings
from app.core.exceptions import AuthenticationError, Conflict, NotFound, PermissionDenied, ValidationFailed
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    generate_numeric_code,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.core.tasks import run_after_commit
from app.database.base import utcnow
from app.models import Company, PasswordReset, User, UserSession, UserType, VerificationCode
from app.schemas.auth import RegisterRequest
from app.services.audit import AuditAction, audit
from app.services.company import company_setting, ensure_customer_capacity
from app.services.email import email_service
from app.services.rbac import get_system_role
from app.services.sms import sms_service

logger = logging.getLogger("app.auth")

# Refresh tokens used again within this window (e.g. two browser tabs refreshing at once)
# are treated as a benign race instead of a stolen-token replay.
REUSE_GRACE_SECONDS = 30


@dataclass
class IssuedTokens:
    user: User
    session: UserSession
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires_days: int


def find_user_by_identifier(db: Session, identifier: str) -> User | None:
    return db.scalar(
        select(User).where(
            or_(User.email == identifier.lower(), User.mobile == identifier),
            User.deleted_at.is_(None),
        )
    )


def _session_days(db: Session, user: User, remember: bool) -> int:
    if not remember:
        return 1
    if user.company_id:
        company = db.get(Company, user.company_id)
        if company:
            return int(company_setting(company, "session_timeout_days") or settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return settings.REFRESH_TOKEN_EXPIRE_DAYS


def issue_tokens(db: Session, user: User, meta: RequestMeta, *, family_id: str | None = None,
                 remember: bool = True, days: int | None = None) -> IssuedTokens:
    days = days or _session_days(db, user, remember)
    raw_refresh = generate_refresh_token()
    session = UserSession(
        user_id=user.id,
        family_id=family_id or str(uuid.uuid4()),
        token_hash=hash_token(raw_refresh),
        user_agent=meta.user_agent,
        ip_address=meta.ip,
        expires_at=utcnow() + timedelta(days=days),
        last_used_at=utcnow(),
    )
    db.add(session)
    db.flush()
    access, expires_in = create_access_token(
        user.id, company_id=user.company_id, user_type=user.user_type, session_id=session.id
    )
    return IssuedTokens(user, session, access, expires_in, raw_refresh, days)


def login(db: Session, identifier: str, password: str, meta: RequestMeta, remember: bool = True) -> IssuedTokens:
    user = find_user_by_identifier(db, identifier)
    now = utcnow()
    if user is None:
        verify_password(password, DUMMY_PASSWORD_HASH)
        audit(db, AuditAction.LOGIN_FAILED, description=f"ورود ناموفق برای {identifier}", ip=meta.ip,
              user_agent=meta.user_agent)
        db.commit()
        raise AuthenticationError("ایمیل/موبایل یا رمز عبور اشتباه است.", code="invalid_credentials")

    if user.locked_until and user.locked_until > now:
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise AuthenticationError(
            f"به دلیل تلاش‌های ناموفق متعدد، حساب شما موقتاً قفل شده است. {minutes} دقیقه دیگر تلاش کنید.",
            code="account_locked",
        )

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            user.failed_login_attempts = 0
        audit(db, AuditAction.LOGIN_FAILED, user=user, entity_type="user", entity_id=user.id,
              description="رمز عبور اشتباه", ip=meta.ip, user_agent=meta.user_agent)
        db.commit()
        raise AuthenticationError("ایمیل/موبایل یا رمز عبور اشتباه است.", code="invalid_credentials")

    if not user.is_active:
        raise AuthenticationError("حساب کاربری شما غیرفعال شده است.", code="account_disabled")
    if user.company_id:
        company = db.get(Company, user.company_id)
        if company is None or not company.is_active or company.deleted_at is not None:
            raise AuthenticationError("حساب سازمان شما غیرفعال است.", code="company_disabled")

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    user.last_login_ip = meta.ip
    tokens = issue_tokens(db, user, meta, remember=remember)
    audit(db, AuditAction.LOGIN, user=user, entity_type="user", entity_id=user.id, description="ورود به سامانه",
          ip=meta.ip, user_agent=meta.user_agent)
    db.commit()
    return tokens


def refresh(db: Session, raw_token: str | None, meta: RequestMeta) -> IssuedTokens:
    if not raw_token:
        raise AuthenticationError("نشست یافت نشد.", code="no_refresh_token")
    session = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(raw_token)).with_for_update())
    if session is None:
        raise AuthenticationError("نشست نامعتبر است.", code="invalid_refresh_token")
    now = utcnow()
    user = db.get(User, session.user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        raise AuthenticationError("حساب کاربری غیرفعال است.", code="account_disabled")

    if session.revoked_at is not None:
        within_grace = session.replaced_by_id and (now - session.revoked_at).total_seconds() < REUSE_GRACE_SECONDS
        if not within_grace:
            # Replay of a rotated token: assume theft and kill the whole login family.
            db.execute(update(UserSession).where(UserSession.family_id == session.family_id,
                                                 UserSession.revoked_at.is_(None)).values(revoked_at=now))
            audit(db, AuditAction.TOKEN_REUSE, user=user, entity_type="session", entity_id=session.id,
                  description="استفاده مجدد از توکن نشست؛ همه نشست‌های این ورود باطل شد.", ip=meta.ip,
                  user_agent=meta.user_agent)
            db.commit()
            raise AuthenticationError("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.", code="refresh_reused")
    if session.expires_at <= now:
        raise AuthenticationError("نشست شما منقضی شده است. لطفاً دوباره وارد شوید.", code="refresh_expired")

    remaining_days = max(1, (session.expires_at - now).days or 1)
    tokens = issue_tokens(db, user, meta, family_id=session.family_id, days=remaining_days)
    if session.revoked_at is None:
        session.revoked_at = now
        session.replaced_by_id = tokens.session.id
    session.last_used_at = now
    db.commit()
    return tokens


def logout(db: Session, user: User, session_id: str | None, meta: RequestMeta, *, everywhere: bool = False) -> None:
    now = utcnow()
    stmt = update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if not everywhere and session_id:
        session = db.get(UserSession, session_id)
        family = session.family_id if session else None
        stmt = stmt.where(UserSession.family_id == family)
    db.execute(stmt.values(revoked_at=now))
    audit(db, AuditAction.LOGOUT, user=user, entity_type="user", entity_id=user.id,
          description="خروج از همه دستگاه‌ها" if everywhere else "خروج از سامانه", ip=meta.ip,
          user_agent=meta.user_agent)
    db.commit()


def revoke_all_sessions(db: Session, user_id: str, except_family: str | None = None) -> None:
    stmt = update(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_family:
        stmt = stmt.where(UserSession.family_id != except_family)
    db.execute(stmt.values(revoked_at=utcnow()))


def ensure_unique_contact(db: Session, email: str | None, mobile: str | None, exclude_user_id: str | None = None):
    if email:
        stmt = select(User.id).where(User.email == email)
        if exclude_user_id:
            stmt = stmt.where(User.id != exclude_user_id)
        if db.scalar(stmt):
            raise Conflict("این ایمیل قبلاً ثبت شده است.", code="email_taken",
                           details=[{"field": "email", "message": "این ایمیل قبلاً ثبت شده است."}])
    if mobile:
        stmt = select(User.id).where(User.mobile == mobile)
        if exclude_user_id:
            stmt = stmt.where(User.id != exclude_user_id)
        if db.scalar(stmt):
            raise Conflict("این شماره موبایل قبلاً ثبت شده است.", code="mobile_taken",
                           details=[{"field": "mobile", "message": "این شماره موبایل قبلاً ثبت شده است."}])


def register(db: Session, data: RegisterRequest, meta: RequestMeta) -> IssuedTokens:
    company = db.scalar(select(Company).where(Company.slug == data.company_slug.lower(),
                                              Company.deleted_at.is_(None), Company.is_active.is_(True)))
    if company is None:
        raise NotFound("سازمان مورد نظر یافت نشد.")
    if not company_setting(company, "allow_registration"):
        raise PermissionDenied("ثبت‌نام در این سازمان غیرفعال است.")
    ensure_customer_capacity(db, company)
    ensure_unique_contact(db, data.email, data.mobile)

    user = User(
        company_id=company.id,
        user_type=UserType.CUSTOMER,
        full_name=data.full_name.strip(),
        email=data.email,
        mobile=data.mobile,
        organization=data.organization,
        password_hash=hash_password(data.password),
        password_changed_at=utcnow(),
        last_login_at=utcnow(),
        last_login_ip=meta.ip,
    )
    user.roles = [get_system_role(db, "customer")]
    db.add(user)
    db.flush()
    tokens = issue_tokens(db, user, meta)
    audit(db, AuditAction.REGISTER, user=user, entity_type="user", entity_id=user.id,
          description="ثبت‌نام مشتری جدید", ip=meta.ip, user_agent=meta.user_agent)
    run_after_commit(db, email_service.send, user.email, "welcome",
                     {"company": company.name, "recipient_name": user.full_name,
                      "primary_color": company.primary_color, "link": f"{settings.FRONTEND_URL}/portal",
                      "link_label": "ورود به پنل"})
    db.commit()
    return tokens


def forgot_password(db: Session, identifier: str, meta: RequestMeta) -> str | None:
    """Starts a reset. Always behaves the same whether or not the account exists (no enumeration)."""
    user = find_user_by_identifier(db, identifier)
    if user is None or not user.is_active:
        return None
    company = db.get(Company, user.company_id) if user.company_id else None
    company_name = company.name if company else settings.APP_NAME
    expires = utcnow() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)
    # invalidate earlier pending resets
    db.execute(update(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
               .values(used_at=utcnow()))

    channel = "sms" if identifier == user.mobile else "email"
    if channel == "sms":
        code = generate_numeric_code(6)
        db.add(PasswordReset(user_id=user.id, token_hash=hash_token(f"{user.id}:{code}"), channel="sms",
                             ip_address=meta.ip, expires_at=expires))
        run_after_commit(db, sms_service.send_template, user.mobile, "password_reset",
                         {"code": code, "minutes": settings.PASSWORD_RESET_EXPIRE_MINUTES, "company": company_name})
    else:
        token = generate_refresh_token()
        db.add(PasswordReset(user_id=user.id, token_hash=hash_token(token), channel="email", ip_address=meta.ip,
                             expires_at=expires))
        run_after_commit(db, email_service.send, user.email, "password_reset", {
            "company": company_name, "recipient_name": user.full_name,
            "primary_color": company.primary_color if company else None,
            "minutes": settings.PASSWORD_RESET_EXPIRE_MINUTES,
            "link": f"{settings.FRONTEND_URL}/reset-password?token={token}", "link_label": "تعیین رمز عبور جدید",
        })
    db.commit()
    return channel


def reset_password(db: Session, *, token: str | None, identifier: str | None, code: str | None,
                   new_password: str, meta: RequestMeta) -> None:
    now = utcnow()
    invalid = ValidationFailed("لینک یا کد بازیابی نامعتبر یا منقضی شده است.", code="invalid_reset_token")
    if token:
        reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == hash_token(token)))
    else:
        user = find_user_by_identifier(db, identifier or "")
        if user is None:
            raise invalid
        reset = db.scalars(select(PasswordReset).where(
            PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None), PasswordReset.channel == "sms")
            .order_by(PasswordReset.created_at.desc())).first()
        if reset is not None and reset.token_hash != hash_token(f"{user.id}:{code}"):
            reset.attempts += 1
            if reset.attempts >= 5:
                reset.used_at = now
            db.commit()
            raise invalid
    if reset is None or reset.used_at is not None or reset.expires_at <= now:
        raise invalid
    user = db.get(User, reset.user_id)
    if user is None or user.deleted_at is not None:
        raise invalid
    user.password_hash = hash_password(new_password)
    user.password_changed_at = now
    user.failed_login_attempts = 0
    user.locked_until = None
    if reset.channel == "sms" and not user.mobile_verified_at:
        user.mobile_verified_at = now
    if reset.channel == "email" and not user.email_verified_at:
        user.email_verified_at = now
    reset.used_at = now
    revoke_all_sessions(db, user.id)
    audit(db, AuditAction.PASSWORD_RESET, user=user, entity_type="user", entity_id=user.id,
          description="بازیابی رمز عبور", ip=meta.ip, user_agent=meta.user_agent)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str, session_id: str | None,
                    meta: RequestMeta) -> None:
    if not verify_password(current, user.password_hash):
        raise ValidationFailed("رمز عبور فعلی اشتباه است.", code="wrong_password",
                               details=[{"field": "current_password", "message": "رمز عبور فعلی اشتباه است."}])
    if verify_password(new, user.password_hash):
        raise ValidationFailed("رمز عبور جدید باید با رمز فعلی متفاوت باشد.")
    user.password_hash = hash_password(new)
    user.password_changed_at = utcnow()
    session = db.get(UserSession, session_id) if session_id else None
    revoke_all_sessions(db, user.id, except_family=session.family_id if session else None)
    audit(db, AuditAction.PASSWORD_CHANGED, user=user, entity_type="user", entity_id=user.id,
          description="تغییر رمز عبور", ip=meta.ip, user_agent=meta.user_agent)
    db.commit()


# ---------------------------------------------------------------- verification

def send_verification(db: Session, user: User, channel: str) -> None:
    target = user.mobile if channel == "sms" else user.email
    if not target:
        raise ValidationFailed("اطلاعات تماس برای ارسال کد ثبت نشده است.")
    if (channel == "sms" and user.mobile_verified_at) or (channel == "email" and user.email_verified_at):
        raise ValidationFailed("این اطلاعات تماس قبلاً تایید شده است.")
    recent = db.scalars(select(VerificationCode).where(
        VerificationCode.target == target, VerificationCode.purpose == "verify")
        .order_by(VerificationCode.created_at.desc())).first()
    if recent and (utcnow() - recent.created_at).total_seconds() < 60:
        raise ValidationFailed("لطفاً یک دقیقه صبر کنید و دوباره درخواست کد دهید.", code="too_soon")
    code = generate_numeric_code(6 if channel == "email" else 5)
    db.add(VerificationCode(user_id=user.id, target=target, channel=channel, purpose="verify",
                            code_hash=hash_token(f"{target}:{code}"),
                            expires_at=utcnow() + timedelta(minutes=settings.VERIFICATION_CODE_EXPIRE_MINUTES)))
    company = db.get(Company, user.company_id) if user.company_id else None
    ctx = {"code": code, "company": company.name if company else settings.APP_NAME,
           "minutes": settings.VERIFICATION_CODE_EXPIRE_MINUTES, "recipient_name": user.full_name}
    if channel == "sms":
        run_after_commit(db, sms_service.send_template, target, "verification_code", ctx)
    else:
        run_after_commit(db, email_service.send, target, "verification_code", ctx)
    db.commit()


def confirm_verification(db: Session, user: User, channel: str, code: str) -> None:
    target = user.mobile if channel == "sms" else user.email
    record = db.scalars(select(VerificationCode).where(
        VerificationCode.target == target, VerificationCode.purpose == "verify", VerificationCode.used_at.is_(None))
        .order_by(VerificationCode.created_at.desc())).first()
    if record is None or record.expires_at <= utcnow() or record.attempts >= 5:
        raise ValidationFailed("کد تایید منقضی شده است. لطفاً کد جدید دریافت کنید.", code="code_expired")
    if record.code_hash != hash_token(f"{target}:{code}"):
        record.attempts += 1
        db.commit()
        raise ValidationFailed("کد وارد شده صحیح نیست.", code="invalid_code")
    record.used_at = utcnow()
    if channel == "sms":
        user.mobile_verified_at = utcnow()
    else:
        user.email_verified_at = utcnow()
    db.commit()
