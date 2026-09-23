"""Departments with managers, members and assignment strategy."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_company_tenant, get_request_meta, require_permissions
from app.core.exceptions import Conflict, ValidationFailed
from app.database.session import get_db
from app.models import Department, StatusState, Ticket, TicketStatus, User
from app.repositories import DepartmentRepository, UserRepository
from app.schemas.common import Message
from app.schemas.config import DepartmentIn, DepartmentOut
from app.services.audit import AuditAction, audit

router = APIRouter(prefix="/departments", tags=["دپارتمان‌ها"])


def _open_counts(db: Session, company_id: str) -> dict[str, int]:
    return dict(db.execute(
        select(Ticket.department_id, func.count()).join(TicketStatus, TicketStatus.id == Ticket.status_id)
        .where(Ticket.company_id == company_id, Ticket.deleted_at.is_(None),
               TicketStatus.state.in_([StatusState.OPEN, StatusState.PENDING]))
        .group_by(Ticket.department_id)).all())


def _out(dept: Department, counts: dict) -> DepartmentOut:
    out = DepartmentOut.model_validate(dept)
    out.open_tickets = counts.get(dept.id, 0)
    return out


def _apply(db: Session, tenant: Tenant, dept: Department, data: DepartmentIn) -> None:
    users = UserRepository(db, tenant.company_id)
    duplicate = db.scalar(DepartmentRepository(db, tenant.company_id).scoped()
                          .where(Department.name == data.name.strip(), Department.id != (dept.id or "")))
    if duplicate:
        raise Conflict("دپارتمانی با این نام وجود دارد.")
    manager = users.get_staff(data.manager_id) if data.manager_id else None
    if data.manager_id and manager is None:
        raise ValidationFailed("مدیر انتخاب شده معتبر نیست.")
    members = []
    for member_id in dict.fromkeys(data.member_ids):
        member = users.get_staff(member_id)
        if member is None:
            raise ValidationFailed("یکی از اعضای انتخاب شده معتبر نیست.")
        members.append(member)
    if manager and manager not in members:
        members.append(manager)
    dept.name = data.name.strip()
    dept.description = data.description
    dept.email = data.email
    dept.manager_id = manager.id if manager else None
    dept.assignment_strategy = data.assignment_strategy
    dept.is_active = data.is_active
    dept.sort_order = data.sort_order
    dept.members = members


@router.get("", response_model=list[DepartmentOut])
def list_departments(active_only: bool = False, tenant: Tenant = Depends(get_company_tenant),
                     db: Session = Depends(get_db)):
    stmt = DepartmentRepository(db, tenant.company_id).scoped()
    if active_only or tenant.user.is_customer:
        stmt = stmt.where(Department.is_active.is_(True))
    depts = db.scalars(stmt.order_by(Department.sort_order, Department.name)).unique().all()
    counts = {} if tenant.user.is_customer else _open_counts(db, tenant.company_id)
    result = [_out(d, counts) for d in depts]
    if tenant.user.is_customer:
        for r in result:
            r.members, r.manager, r.email = [], None, None
    return result


@router.post("", response_model=DepartmentOut, status_code=201)
def create_department(data: DepartmentIn, tenant: Tenant = Depends(require_permissions("departments.manage")),
                      db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    dept = Department(company_id=tenant.company_id)
    _apply(db, tenant, dept, data)
    db.add(dept)
    db.flush()
    audit(db, AuditAction.CONFIG_CHANGED, user=tenant.user, company_id=tenant.company_id, entity_type="department",
          entity_id=dept.id, description=f"ایجاد دپارتمان {dept.name}", ip=meta.ip)
    db.commit()
    return _out(dept, {})


@router.put("/{department_id}", response_model=DepartmentOut)
def update_department(department_id: str, data: DepartmentIn,
                      tenant: Tenant = Depends(require_permissions("departments.manage")),
                      db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    dept = DepartmentRepository(db, tenant.company_id).get_or_404(department_id)
    _apply(db, tenant, dept, data)
    audit(db, AuditAction.CONFIG_CHANGED, user=tenant.user, company_id=tenant.company_id, entity_type="department",
          entity_id=dept.id, description=f"ویرایش دپارتمان {dept.name}", ip=meta.ip)
    db.commit()
    return _out(dept, _open_counts(db, tenant.company_id))


@router.delete("/{department_id}", response_model=Message)
def delete_department(department_id: str, tenant: Tenant = Depends(require_permissions("departments.manage")),
                      db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    repo = DepartmentRepository(db, tenant.company_id)
    dept = repo.get_or_404(department_id)
    if _open_counts(db, tenant.company_id).get(dept.id):
        raise ValidationFailed("این دپارتمان تیکت باز دارد. ابتدا تیکت‌ها را به دپارتمان دیگری منتقل کنید.")
    dept.members = []
    repo.delete(dept)
    audit(db, AuditAction.CONFIG_CHANGED, user=tenant.user, company_id=tenant.company_id, entity_type="department",
          entity_id=dept.id, description=f"حذف دپارتمان {dept.name}", ip=meta.ip)
    db.commit()
    return Message(message="دپارتمان حذف شد.")


__all__ = ["router", "User"]
