"""Permission catalogue sync and system-role helpers."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound
from app.core.permissions import DEFAULT_ROLES, PERMISSIONS
from app.models import Permission, Role


def sync_permissions(db: Session) -> dict[str, Permission]:
    existing = {p.code: p for p in db.scalars(select(Permission))}
    for code, name, group, platform in PERMISSIONS:
        perm = existing.get(code)
        if perm is None:
            perm = Permission(code=code, name=name, group=group, is_platform=platform)
            db.add(perm)
            existing[code] = perm
        else:
            perm.name, perm.group, perm.is_platform = name, group, platform
    db.flush()
    return existing


def ensure_system_roles(db: Session, *, reset_permissions: bool = False) -> dict[str, Role]:
    perms = sync_permissions(db)
    roles = {r.name: r for r in db.scalars(select(Role).where(Role.company_id.is_(None)))}
    for name, (display, audience, description, codes) in DEFAULT_ROLES.items():
        role = roles.get(name)
        if role is None:
            role = Role(name=name, display_name=display, description=description, audience=audience, is_system=True)
            role.permissions = [perms[c] for c in codes]
            db.add(role)
            roles[name] = role
        elif reset_permissions:
            role.permissions = [perms[c] for c in codes]
    db.flush()
    return roles


def get_system_role(db: Session, name: str) -> Role:
    role = db.scalar(select(Role).where(Role.company_id.is_(None), Role.name == name))
    if role is None:
        raise NotFound(f"نقش سیستمی «{name}» یافت نشد. لطفاً دستور seed را اجرا کنید.")
    return role


def assignable_roles_query(company_id: str):
    """System roles (except super_admin) plus the company's own custom roles."""
    return select(Role).where(
        ((Role.company_id.is_(None)) & (Role.name != "super_admin")) | (Role.company_id == company_id)
    )
