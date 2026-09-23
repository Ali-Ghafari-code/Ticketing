"""Profile, staff users, customers and agents."""
import secrets

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.auth.router import build_me
from app.api.deps import RequestMeta, Tenant, get_current_user, get_request_meta, pagination, require_permissions
from app.config.settings import settings
from app.core.exceptions import NotFound, PermissionDenied, ValidationFailed
from app.core.security import hash_password
from app.core.tasks import run_after_commit
from app.database.base import utcnow
from app.database.session import get_db
from app.models import AuditLog, Company, Role, Ticket, TicketStatus, User, UserType
from app.repositories import DepartmentRepository, UserRepository
from app.schemas.common import Message, UserBrief
from app.schemas.misc import AuditLogOut
from app.schemas.user import (
    AdminPasswordReset,
    MeOut,
    PreferencesUpdate,
    ProfileUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services.audit import AuditAction, audit
from app.services.auth import ensure_unique_contact, revoke_all_sessions
from app.services.company import ensure_agent_capacity, ensure_customer_capacity
from app.services.email import email_service
from app.services.exporter import USER_COLUMNS, export_response, user_rows
from app.services.rbac import assignable_roles_query, get_system_role
from app.services.tickets import agents_for_company
from app.utils.files import IMAGE_EXTENSIONS, delete_file, validate_and_store
from app.utils.pagination import make_page
from app.utils.persian import escape_like, normalize_text

router = APIRouter(tags=["کاربران و مشتریان"])


# ============================================================================ profile

@router.patch("/users/me", response_model=MeOut, summary="ویرایش پروفایل")
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    values = data.model_dump(exclude_unset=True)
    if "email" in values and values["email"] != user.email:
        ensure_unique_contact(db, values["email"], None, user.id)
        user.email_verified_at = None
    if "mobile" in values and values["mobile"] != user.mobile:
        ensure_unique_contact(db, None, values["mobile"], user.id)
        user.mobile_verified_at = None
    if not (values.get("email", user.email) or values.get("mobile", user.mobile)):
        raise ValidationFailed("وارد کردن ایمیل یا شماره موبایل الزامی است.")
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    return build_me(db, user)


@router.put("/users/me/preferences", response_model=MeOut)
def update_preferences(data: PreferencesUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.preferences = {**(user.preferences or {}), **data.model_dump(exclude_none=True)}
    db.commit()
    return build_me(db, user)


@router.post("/users/me/avatar", response_model=MeOut)
def upload_avatar(file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stored = validate_and_store(file, "public/avatars", allowed=IMAGE_EXTENSIONS)
    delete_file(f"public/{user.avatar_path}" if user.avatar_path else None)
    user.avatar_path = stored.relative_path.removeprefix("public/")
    db.commit()
    return build_me(db, user)


@router.delete("/users/me/avatar", response_model=MeOut)
def delete_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    delete_file(f"public/{user.avatar_path}" if user.avatar_path else None)
    user.avatar_path = None
    db.commit()
    return build_me(db, user)


# ============================================================================ shared helpers

def _list_users(db: Session, tenant: Tenant, user_type: str, q: str | None, is_active: bool | None,
                role_id: str | None, department_id: str | None, page: int, page_size: int, sort: str):
    repo = UserRepository(db, tenant.company_id)  # type: ignore[arg-type]
    stmt = repo.staff() if user_type == UserType.STAFF else repo.customers()
    if q:
        like = f"%{escape_like(normalize_text(q) or q)}%"
        stmt = stmt.where(or_(User.full_name.like(like), User.email.like(like), User.mobile.like(like),
                              User.organization.like(like)))
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    if role_id:
        stmt = stmt.where(User.roles.any(Role.id == role_id))
    if department_id:
        from app.models import Department

        stmt = stmt.where(User.departments.any(Department.id == department_id))
    order = {"name": User.full_name.asc(), "created": User.created_at.desc(),
             "last_login": User.last_login_at.desc()}.get(sort, User.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = list(db.scalars(stmt.order_by(order).limit(page_size).offset((page - 1) * page_size)).unique())
    return items, total


def _resolve_roles(db: Session, company_id: str, role_ids: list[str], audience: str, actor: Tenant) -> list[Role]:
    if not role_ids:
        return []
    roles = list(db.scalars(assignable_roles_query(company_id).where(Role.id.in_(role_ids))))
    if len(roles) != len(set(role_ids)):
        raise ValidationFailed("نقش انتخاب شده معتبر نیست.")
    for role in roles:
        if role.audience != audience:
            raise ValidationFailed("این نقش برای این نوع کاربر قابل استفاده نیست.")
        if role.name == "company_admin" and not actor.has("roles.manage"):
            raise PermissionDenied("فقط مدیر سازمان می‌تواند نقش مدیر سازمان را تخصیص دهد.")
    return roles


def _user_stats(db: Session, company_id: str, user: User) -> dict:
    field = Ticket.customer_id if user.is_customer else Ticket.assigned_agent_id
    rows = db.execute(select(TicketStatus.state, func.count()).join(Ticket, Ticket.status_id == TicketStatus.id)
                      .where(Ticket.company_id == company_id, Ticket.deleted_at.is_(None), field == user.id)
                      .group_by(TicketStatus.state)).all()
    stats = {"total": 0, "open": 0, "pending": 0, "resolved": 0, "closed": 0}
    for state, count in rows:
        stats[state] = count
        stats["total"] += count
    return stats


def _create_user(db: Session, tenant: Tenant, data: UserCreate, user_type: str, meta: RequestMeta) -> User:
    company = db.get(Company, tenant.company_id)
    if user_type == UserType.STAFF:
        ensure_agent_capacity(db, company)
    else:
        ensure_customer_capacity(db, company)
    ensure_unique_contact(db, data.email, data.mobile)
    audience = "staff" if user_type == UserType.STAFF else "customer"
    roles = _resolve_roles(db, company.id, data.role_ids, audience, tenant)
    if not roles:
        roles = [get_system_role(db, "support_agent" if user_type == UserType.STAFF else "customer")]
    temp_password = None
    password = data.password
    if not password:
        temp_password = secrets.token_urlsafe(9)
        password = temp_password
    user = User(company_id=company.id, user_type=user_type, full_name=data.full_name.strip(), email=data.email,
                mobile=data.mobile, job_title=data.job_title, organization=data.organization, notes=data.notes,
                is_active=data.is_active, password_hash=hash_password(password), password_changed_at=utcnow())
    user.roles = roles
    if user_type == UserType.STAFF and data.department_ids:
        depts = [DepartmentRepository(db, company.id).get_or_404(d) for d in data.department_ids]
        user.departments = depts
    db.add(user)
    db.flush()
    action = AuditAction.USER_CREATED if user_type == UserType.STAFF else AuditAction.CUSTOMER_CREATED
    audit(db, action, user=tenant.user, company_id=company.id, entity_type="user", entity_id=user.id,
          description=f"ایجاد {'کاربر' if user_type == UserType.STAFF else 'مشتری'} {user.full_name}",
          ip=meta.ip, user_agent=meta.user_agent)
    if user.email:
        run_after_commit(db, email_service.send, user.email, "welcome", {
            "company": company.name, "recipient_name": user.full_name, "primary_color": company.primary_color,
            "temp_password": temp_password,
            "link": f"{settings.FRONTEND_URL}/login", "link_label": "ورود به سامانه"})
    db.commit()
    return user


def _update_user(db: Session, tenant: Tenant, user: User, data: UserUpdate, meta: RequestMeta) -> User:
    values = data.model_dump(exclude_unset=True)
    before = {k: getattr(user, k) for k in ("full_name", "email", "mobile", "is_active", "job_title", "organization")}
    if "email" in values and values["email"] != user.email:
        ensure_unique_contact(db, values["email"], None, user.id)
    if "mobile" in values and values["mobile"] != user.mobile:
        ensure_unique_contact(db, None, values["mobile"], user.id)
    if user.id == tenant.user.id and values.get("is_active") is False:
        raise ValidationFailed("امکان غیرفعال کردن حساب خودتان وجود ندارد.")
    role_ids = values.pop("role_ids", None)
    dept_ids = values.pop("department_ids", None)
    for key, value in values.items():
        setattr(user, key, value)
    changes = {k: {"old": before[k], "new": getattr(user, k)} for k in before if before[k] != getattr(user, k)}
    if role_ids is not None:
        if not tenant.has("roles.manage") and not tenant.has("users.update"):
            raise PermissionDenied()
        roles = _resolve_roles(db, tenant.company_id, role_ids, "staff" if user.is_staff else "customer", tenant)
        if roles and {r.id for r in roles} != {r.id for r in user.roles}:
            if user.id == tenant.user.id:
                raise ValidationFailed("امکان تغییر نقش خودتان وجود ندارد.")
            changes["roles"] = {"old": [r.name for r in user.roles], "new": [r.name for r in roles]}
            user.roles = roles
            audit(db, AuditAction.PERMISSIONS_CHANGED, user=tenant.user, company_id=tenant.company_id,
                  entity_type="user", entity_id=user.id, description=f"تغییر نقش {user.full_name}",
                  changes=changes["roles"], ip=meta.ip)
    if dept_ids is not None and user.is_staff:
        user.departments = [DepartmentRepository(db, tenant.company_id).get_or_404(d) for d in dept_ids]
    if values.get("is_active") is False:
        revoke_all_sessions(db, user.id)
    action = AuditAction.USER_UPDATED if user.is_staff else AuditAction.CUSTOMER_UPDATED
    audit(db, action, user=tenant.user, company_id=tenant.company_id, entity_type="user", entity_id=user.id,
          description=f"ویرایش {user.full_name}", changes=changes or None, ip=meta.ip, user_agent=meta.user_agent)
    db.commit()
    return user


def _delete_user(db: Session, tenant: Tenant, user: User, meta: RequestMeta) -> None:
    if user.id == tenant.user.id:
        raise ValidationFailed("امکان حذف حساب خودتان وجود ندارد.")
    # Soft delete keeps ticket history intact; contact details are released so they can be reused.
    user.soft_delete()
    user.is_active = False
    user.email = f"deleted+{user.id}@deleted.invalid" if user.email else None
    user.mobile = None
    revoke_all_sessions(db, user.id)
    if user.is_staff:
        db.execute(Ticket.__table__.update().where(Ticket.assigned_agent_id == user.id).values(assigned_agent_id=None))
    action = AuditAction.USER_DELETED if user.is_staff else AuditAction.CUSTOMER_DELETED
    audit(db, action, user=tenant.user, company_id=tenant.company_id, entity_type="user", entity_id=user.id,
          description=f"حذف {user.full_name}", ip=meta.ip, user_agent=meta.user_agent)
    db.commit()


def _reset_password(db: Session, tenant: Tenant, user: User, data: AdminPasswordReset, meta: RequestMeta) -> dict:
    password = data.new_password or secrets.token_urlsafe(9)
    user.password_hash = hash_password(password)
    user.password_changed_at = utcnow()
    user.locked_until = None
    user.failed_login_attempts = 0
    revoke_all_sessions(db, user.id)
    audit(db, AuditAction.USER_PASSWORD_RESET, user=tenant.user, company_id=tenant.company_id, entity_type="user",
          entity_id=user.id, description=f"بازنشانی رمز عبور {user.full_name}", ip=meta.ip)
    company = db.get(Company, tenant.company_id)
    if data.notify and user.email:
        run_after_commit(db, email_service.send, user.email, "welcome", {
            "company": company.name, "recipient_name": user.full_name, "temp_password": password,
            "link": f"{settings.FRONTEND_URL}/login", "link_label": "ورود به سامانه"})
    db.commit()
    return {"message": "رمز عبور بازنشانی شد.", "temporary_password": None if data.new_password else password}


# ============================================================================ staff users

@router.get("/users", summary="فهرست کاربران سازمان")
def list_users(q: str | None = None, is_active: bool | None = None, role_id: str | None = None,
               department_id: str | None = None, sort: str = "created", pg=Depends(pagination),
               tenant: Tenant = Depends(require_permissions("users.view")), db: Session = Depends(get_db)):
    items, total = _list_users(db, tenant, UserType.STAFF, q, is_active, role_id, department_id, *pg, sort)
    return make_page([UserOut.model_validate(u) for u in items], total, *pg)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, tenant: Tenant = Depends(require_permissions("users.create")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    return UserOut.model_validate(_create_user(db, tenant, data, UserType.STAFF, meta))


@router.get("/users/export")
def export_users(fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"),
                 tenant: Tenant = Depends(require_permissions("users.view", "reports.export")),
                 db: Session = Depends(get_db)):
    users = db.scalars(UserRepository(db, tenant.company_id).staff().order_by(User.full_name)).unique().all()
    audit(db, AuditAction.DATA_EXPORTED, user=tenant.user, company_id=tenant.company_id, description="خروجی کاربران")
    db.commit()
    return export_response(fmt, "agents", "فهرست کارشناسان و کاربران", USER_COLUMNS, user_rows(users))


@router.get("/users/{user_id}")
def get_user(user_id: str, tenant: Tenant = Depends(require_permissions("users.view")), db: Session = Depends(get_db)):
    user = UserRepository(db, tenant.company_id).get_staff(user_id)
    if user is None:
        raise NotFound("کاربر یافت نشد.")
    return {"user": UserOut.model_validate(user), "stats": _user_stats(db, tenant.company_id, user)}


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, data: UserUpdate, tenant: Tenant = Depends(require_permissions("users.update")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_staff(user_id)
    if user is None:
        raise NotFound("کاربر یافت نشد.")
    if any(r.name == "company_admin" for r in user.roles) and not tenant.has("roles.manage"):
        raise PermissionDenied("ویرایش مدیر سازمان فقط توسط مدیر سازمان امکان‌پذیر است.")
    return UserOut.model_validate(_update_user(db, tenant, user, data, meta))


@router.delete("/users/{user_id}", response_model=Message)
def delete_user(user_id: str, tenant: Tenant = Depends(require_permissions("users.delete")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_staff(user_id)
    if user is None:
        raise NotFound("کاربر یافت نشد.")
    _delete_user(db, tenant, user, meta)
    return Message(message="کاربر حذف شد.")


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: str, data: AdminPasswordReset,
                        tenant: Tenant = Depends(require_permissions("users.update")),
                        db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_staff(user_id)
    if user is None:
        raise NotFound("کاربر یافت نشد.")
    return _reset_password(db, tenant, user, data, meta)


@router.get("/users/{user_id}/activity", summary="فعالیت‌های کاربر")
def user_activity(user_id: str, pg=Depends(pagination),
                  tenant: Tenant = Depends(require_permissions("users.view")), db: Session = Depends(get_db)):
    if UserRepository(db, tenant.company_id).get(user_id) is None:
        raise NotFound("کاربر یافت نشد.")
    stmt = select(AuditLog).where(AuditLog.company_id == tenant.company_id, AuditLog.user_id == user_id) \
        .order_by(AuditLog.created_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.limit(pg[1]).offset((pg[0] - 1) * pg[1])).unique().all()
    return make_page([AuditLogOut.model_validate(i) for i in items], total, *pg)


# ============================================================================ agents (lightweight list)

@router.get("/agents", response_model=list[UserBrief], summary="کارشناسان قابل ارجاع")
def list_agents(department_id: str | None = None,
                tenant: Tenant = Depends(require_permissions("tickets.view", "tickets.view_all", any_of=True)),
                db: Session = Depends(get_db)):
    agents = agents_for_company(db, tenant.company_id)
    if department_id:
        agents = [a for a in agents if any(d.id == department_id for d in a.departments)]
    return agents


@router.get("/mentionable", response_model=list[UserBrief], summary="کاربران قابل اشاره (@)")
def mentionable(q: str = "", tenant: Tenant = Depends(require_permissions("tickets.internal_notes")),
                db: Session = Depends(get_db)):
    stmt = UserRepository(db, tenant.company_id).staff().where(User.is_active.is_(True))
    if q:
        stmt = stmt.where(User.full_name.like(f"%{escape_like(normalize_text(q) or q)}%"))
    return db.scalars(stmt.order_by(User.full_name).limit(10)).unique().all()


# ============================================================================ customers

@router.get("/customers", summary="فهرست مشتریان")
def list_customers(q: str | None = None, is_active: bool | None = None, sort: str = "created", pg=Depends(pagination),
                   tenant: Tenant = Depends(require_permissions("customers.view")), db: Session = Depends(get_db)):
    items, total = _list_users(db, tenant, UserType.CUSTOMER, q, is_active, None, None, *pg, sort)
    counts = dict(db.execute(select(Ticket.customer_id, func.count()).where(
        Ticket.company_id == tenant.company_id, Ticket.deleted_at.is_(None),
        Ticket.customer_id.in_([u.id for u in items])).group_by(Ticket.customer_id)).all()) if items else {}
    return make_page([{**UserOut.model_validate(u).model_dump(mode="json"), "tickets_count": counts.get(u.id, 0)}
                      for u in items], total, *pg)


@router.post("/customers", response_model=UserOut, status_code=201)
def create_customer(data: UserCreate, tenant: Tenant = Depends(require_permissions("customers.create")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    data.role_ids = data.role_ids or []
    return UserOut.model_validate(_create_user(db, tenant, data, UserType.CUSTOMER, meta))


@router.get("/customers/export")
def export_customers(fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"),
                     tenant: Tenant = Depends(require_permissions("customers.view", "reports.export")),
                     db: Session = Depends(get_db)):
    users = db.scalars(UserRepository(db, tenant.company_id).customers().order_by(User.full_name)).unique().all()
    audit(db, AuditAction.DATA_EXPORTED, user=tenant.user, company_id=tenant.company_id, description="خروجی مشتریان")
    db.commit()
    return export_response(fmt, "customers", "فهرست مشتریان", USER_COLUMNS, user_rows(users))


@router.get("/customers/{user_id}")
def get_customer(user_id: str, tenant: Tenant = Depends(require_permissions("customers.view")),
                 db: Session = Depends(get_db)):
    user = UserRepository(db, tenant.company_id).get_customer(user_id)
    if user is None:
        raise NotFound("مشتری یافت نشد.")
    return {"user": UserOut.model_validate(user), "stats": _user_stats(db, tenant.company_id, user)}


@router.put("/customers/{user_id}", response_model=UserOut)
def update_customer(user_id: str, data: UserUpdate, tenant: Tenant = Depends(require_permissions("customers.update")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_customer(user_id)
    if user is None:
        raise NotFound("مشتری یافت نشد.")
    data.department_ids = None
    return UserOut.model_validate(_update_user(db, tenant, user, data, meta))


@router.delete("/customers/{user_id}", response_model=Message)
def delete_customer(user_id: str, tenant: Tenant = Depends(require_permissions("customers.delete")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_customer(user_id)
    if user is None:
        raise NotFound("مشتری یافت نشد.")
    _delete_user(db, tenant, user, meta)
    return Message(message="مشتری حذف شد.")


@router.post("/customers/{user_id}/reset-password")
def reset_customer_password(user_id: str, data: AdminPasswordReset,
                            tenant: Tenant = Depends(require_permissions("customers.update")),
                            db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    user = UserRepository(db, tenant.company_id).get_customer(user_id)
    if user is None:
        raise NotFound("مشتری یافت نشد.")
    return _reset_password(db, tenant, user, data, meta)
