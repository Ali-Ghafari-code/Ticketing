"""Custom roles and the permission catalogue."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_request_meta, require_permissions
from app.core.exceptions import Conflict, NotFound, PermissionDenied, ValidationFailed
from app.database.session import get_db
from app.models import Permission, Role, user_roles
from app.schemas.common import Message
from app.schemas.user import PermissionOut, RoleCreate, RoleOut, RoleUpdate
from app.services.audit import AuditAction, audit
from app.services.rbac import assignable_roles_query

router = APIRouter(tags=["نقش‌ها و مجوزها"])


def _role_out(db: Session, role: Role) -> RoleOut:
    out = RoleOut.model_validate(role)
    out.users_count = db.scalar(select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role.id)) or 0
    return out


def _permissions(db: Session, codes: list[str], tenant: Tenant) -> list[Permission]:
    perms = list(db.scalars(select(Permission).where(Permission.code.in_(codes))))
    if len(perms) != len(set(codes)):
        raise ValidationFailed("برخی از مجوزهای انتخاب شده معتبر نیستند.")
    if not tenant.is_super_admin and any(p.is_platform for p in perms):
        raise PermissionDenied("مجوزهای سطح سامانه قابل تخصیص نیستند.")
    return perms


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(tenant: Tenant = Depends(require_permissions("roles.manage")), db: Session = Depends(get_db)):
    stmt = select(Permission).order_by(Permission.group, Permission.id)
    if not tenant.is_super_admin:
        stmt = stmt.where(Permission.is_platform.is_(False))
    return db.scalars(stmt).all()


@router.get("/roles", response_model=list[RoleOut])
def list_roles(audience: str | None = None,
               tenant: Tenant = Depends(require_permissions("users.view", "roles.manage", "customers.view", any_of=True)),
               db: Session = Depends(get_db)):
    stmt = assignable_roles_query(tenant.company_id)
    if audience:
        stmt = stmt.where(Role.audience == audience)
    roles = db.scalars(stmt.order_by(Role.is_system.desc(), Role.created_at)).all()
    return [_role_out(db, r) for r in roles]


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(data: RoleCreate, tenant: Tenant = Depends(require_permissions("roles.manage")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    exists = db.scalar(select(Role.id).where(
        Role.name == data.name, (Role.company_id == tenant.company_id) | Role.company_id.is_(None)))
    if exists:
        raise Conflict("نقشی با این شناسه وجود دارد.")
    role = Role(company_id=tenant.company_id, name=data.name, display_name=data.display_name,
                description=data.description, audience=data.audience, is_system=False)
    role.permissions = _permissions(db, data.permission_codes, tenant)
    db.add(role)
    db.flush()
    audit(db, AuditAction.ROLE_CREATED, user=tenant.user, company_id=tenant.company_id, entity_type="role",
          entity_id=role.id, description=f"ایجاد نقش {role.display_name}",
          changes={"permissions": data.permission_codes}, ip=meta.ip)
    db.commit()
    return _role_out(db, role)


def _get_editable(db: Session, tenant: Tenant, role_id: str) -> Role:
    role = db.scalar(assignable_roles_query(tenant.company_id).where(Role.id == role_id))
    if role is None:
        raise NotFound("نقش یافت نشد.")
    if role.company_id is None and not tenant.is_super_admin:
        raise PermissionDenied("نقش‌های پیش‌فرض سامانه فقط توسط مدیر کل قابل ویرایش هستند.")
    return role


@router.put("/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: str, data: RoleUpdate, tenant: Tenant = Depends(require_permissions("roles.manage")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    role = _get_editable(db, tenant, role_id)
    if data.display_name is not None:
        role.display_name = data.display_name
    if data.description is not None:
        role.description = data.description
    if data.permission_codes is not None:
        before = sorted(p.code for p in role.permissions)
        role.permissions = _permissions(db, data.permission_codes, tenant)
        audit(db, AuditAction.PERMISSIONS_CHANGED, user=tenant.user, company_id=tenant.company_id,
              entity_type="role", entity_id=role.id, description=f"تغییر مجوزهای نقش {role.display_name}",
              changes={"old": before, "new": sorted(data.permission_codes)}, ip=meta.ip)
    db.commit()
    return _role_out(db, role)


@router.delete("/roles/{role_id}", response_model=Message)
def delete_role(role_id: str, tenant: Tenant = Depends(require_permissions("roles.manage")),
                db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    role = _get_editable(db, tenant, role_id)
    if role.is_system:
        raise ValidationFailed("نقش‌های سیستمی قابل حذف نیستند.")
    if db.scalar(select(func.count()).select_from(user_roles).where(user_roles.c.role_id == role.id)):
        raise ValidationFailed("این نقش به کاربرانی تخصیص داده شده است. ابتدا نقش آن‌ها را تغییر دهید.")
    audit(db, AuditAction.ROLE_DELETED, user=tenant.user, company_id=tenant.company_id, entity_type="role",
          entity_id=role.id, description=f"حذف نقش {role.display_name}", ip=meta.ip)
    db.delete(role)
    db.commit()
    return Message(message="نقش حذف شد.")
