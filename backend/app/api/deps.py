"""Shared FastAPI dependencies: DB session, current user, tenant context and permission guards."""
from dataclasses import dataclass, field

import jwt
from fastapi import Depends, Header, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import AuthenticationError, NotFound, PermissionDenied, ValidationFailed
from app.core.security import decode_access_token
from app.database.base import utcnow
from app.database.session import get_db
from app.models import Company, User, UserSession
from app.utils.request import client_ip, user_agent

bearer = HTTPBearer(auto_error=False)


@dataclass
class RequestMeta:
    ip: str
    user_agent: str


def get_request_meta(request: Request) -> RequestMeta:
    return RequestMeta(ip=client_ip(request), user_agent=user_agent(request))


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError("برای دسترسی باید وارد حساب کاربری شوید.")
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("نشست شما منقضی شده است.", code="token_expired") from exc
    except jwt.PyJWTError as exc:
        raise AuthenticationError("توکن دسترسی نامعتبر است.", code="invalid_token") from exc

    user = db.get(User, payload["sub"])
    if user is None or user.deleted_at is not None:
        raise AuthenticationError("حساب کاربری یافت نشد.")
    if not user.is_active:
        raise AuthenticationError("حساب کاربری شما غیرفعال شده است.", code="account_disabled")

    session_id = payload.get("sid")
    if session_id:
        session = db.get(UserSession, session_id)
        if session is None or session.user_id != user.id or session.revoked_at is not None:
            raise AuthenticationError("نشست شما پایان یافته است.", code="session_revoked")

    if user.company_id:
        company = db.get(Company, user.company_id)
        if company is None or company.deleted_at is not None or not company.is_active:
            raise AuthenticationError("حساب سازمان شما غیرفعال است.", code="company_disabled")

    request.state.user_id = user.id
    return user


@dataclass
class Tenant:
    """Resolved tenant for the request.

    Regular users are always pinned to their own company. A super admin may act
    on any company by sending the ``X-Company-Id`` header; without it
    ``company_id`` is None and only platform endpoints make sense.
    """

    user: User
    company_id: str | None
    permissions: set[str] = field(default_factory=set)

    @property
    def is_super_admin(self) -> bool:
        return self.user.is_super_admin

    def has(self, *codes: str) -> bool:
        return self.is_super_admin or all(c in self.permissions for c in codes)

    def has_any(self, *codes: str) -> bool:
        return self.is_super_admin or any(c in self.permissions for c in codes)

    def require_company(self) -> str:
        if not self.company_id:
            raise ValidationFailed("لطفاً ابتدا سازمان مورد نظر را انتخاب کنید.", code="company_required")
        return self.company_id


def get_tenant(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    x_company_id: str | None = Header(default=None, alias="X-Company-Id"),
) -> Tenant:
    if user.is_super_admin:
        company_id = None
        if x_company_id:
            company = db.scalar(select(Company).where(Company.id == x_company_id, Company.deleted_at.is_(None)))
            if company is None:
                raise NotFound("سازمان انتخاب شده یافت نشد.")
            company_id = company.id
        return Tenant(user=user, company_id=company_id, permissions=user.permission_codes)
    return Tenant(user=user, company_id=user.company_id, permissions=user.permission_codes)


def get_company_tenant(tenant: Tenant = Depends(get_tenant)) -> Tenant:
    tenant.require_company()
    return tenant


def require_permissions(*codes: str, any_of: bool = False):
    """Dependency factory: ensures the user has the given permission codes within a company context."""

    def dependency(tenant: Tenant = Depends(get_company_tenant)) -> Tenant:
        allowed = tenant.has_any(*codes) if any_of else tenant.has(*codes)
        if not allowed:
            raise PermissionDenied()
        return tenant

    return dependency


def require_platform(*codes: str):
    """Super-admin-only endpoints (companies, plans, system settings)."""

    def dependency(tenant: Tenant = Depends(get_tenant)) -> Tenant:
        if not tenant.is_super_admin and not all(c in tenant.permissions for c in codes):
            raise PermissionDenied()
        if not tenant.is_super_admin:
            raise PermissionDenied()
        return tenant

    return dependency


def require_staff(tenant: Tenant = Depends(get_company_tenant)) -> Tenant:
    if not tenant.user.is_staff:
        raise PermissionDenied()
    return tenant


def pagination(
    page: int = Query(1, ge=1, le=100000),
    page_size: int = Query(20, ge=1, le=100),
) -> tuple[int, int]:
    return page, page_size


def touch(obj) -> None:
    if hasattr(obj, "updated_at"):
        obj.updated_at = utcnow()
