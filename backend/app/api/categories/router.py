"""Ticket configuration: hierarchical categories, statuses, priorities, tags, SLA rules and holidays."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_company_tenant, get_request_meta, require_permissions
from app.core.exceptions import Conflict, ValidationFailed
from app.database.session import get_db
from app.models import (
    Holiday,
    SlaRule,
    Ticket,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    TicketTag,
    ticket_tag_relations,
)
from app.repositories import (
    CategoryRepository,
    DepartmentRepository,
    HolidayRepository,
    PriorityRepository,
    SlaRuleRepository,
    StatusRepository,
    TagRepository,
    UserRepository,
)
from app.schemas.common import Message
from app.schemas.company import HolidayIn, HolidayOut
from app.schemas.config import (
    CategoryIn,
    CategoryOut,
    PriorityIn,
    PriorityOut,
    PriorityUpdate,
    SlaRuleIn,
    SlaRuleOut,
    StatusIn,
    StatusOut,
    StatusUpdate,
    TagIn,
    TagOut,
)
from app.services.audit import AuditAction, audit

router = APIRouter(tags=["تنظیمات تیکت"])


def _log(db, tenant: Tenant, entity: str, entity_id: str, text: str, meta: RequestMeta) -> None:
    audit(db, AuditAction.CONFIG_CHANGED, user=tenant.user, company_id=tenant.company_id, entity_type=entity,
          entity_id=entity_id, description=text, ip=meta.ip)


# ============================================================================ categories

def build_tree(categories: list[TicketCategory], counts: dict[str, int] | None = None) -> list[CategoryOut]:
    nodes = {c.id: CategoryOut.model_validate(c) for c in categories}
    for node in nodes.values():
        node.children = []
        node.tickets_count = (counts or {}).get(node.id, 0)
    roots = []
    for c in categories:
        node = nodes[c.id]
        if c.parent_id and c.parent_id in nodes:
            nodes[c.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


@router.get("/categories", response_model=list[CategoryOut], summary="درخت دسته‌بندی‌ها")
def list_categories(flat: bool = False, active_only: bool = False, tenant: Tenant = Depends(get_company_tenant),
                    db: Session = Depends(get_db)):
    stmt = CategoryRepository(db, tenant.company_id).scoped()
    if active_only or tenant.user.is_customer:
        stmt = stmt.where(TicketCategory.is_active.is_(True))
    categories = list(db.scalars(stmt.order_by(TicketCategory.sort_order, TicketCategory.name)).unique())
    counts = dict(db.execute(select(Ticket.category_id, func.count()).where(
        Ticket.company_id == tenant.company_id, Ticket.deleted_at.is_(None)).group_by(Ticket.category_id)).all()) \
        if not tenant.user.is_customer else {}
    if flat:
        out = [CategoryOut.model_validate(c) for c in categories]
        for o in out:
            o.tickets_count = counts.get(o.id, 0)
        return out
    return build_tree(categories, counts)


def _validate_category(db: Session, tenant: Tenant, data: CategoryIn, category_id: str | None = None) -> None:
    repo = CategoryRepository(db, tenant.company_id)
    if data.parent_id:
        parent = repo.get_or_404(data.parent_id, "دسته‌بندی والد یافت نشد.")
        # prevent cycles
        cursor = parent
        while cursor is not None:
            if cursor.id == category_id:
                raise ValidationFailed("یک دسته‌بندی نمی‌تواند زیرمجموعه خودش باشد.")
            cursor = repo.get(cursor.parent_id) if cursor.parent_id else None
    if data.department_id:
        DepartmentRepository(db, tenant.company_id).get_or_404(data.department_id)
    if data.default_agent_id and UserRepository(db, tenant.company_id).get_staff(data.default_agent_id) is None:
        raise ValidationFailed("کارشناس پیش‌فرض معتبر نیست.")
    if data.default_priority_id:
        PriorityRepository(db, tenant.company_id).get_or_404(data.default_priority_id)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, tenant: Tenant = Depends(require_permissions("categories.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    _validate_category(db, tenant, data)
    category = TicketCategory(company_id=tenant.company_id, **data.model_dump())
    db.add(category)
    db.flush()
    _log(db, tenant, "category", category.id, f"ایجاد دسته‌بندی {category.name}", meta)
    db.commit()
    out = CategoryOut.model_validate(category)
    out.children = []
    return out


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: str, data: CategoryIn,
                    tenant: Tenant = Depends(require_permissions("categories.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    category = CategoryRepository(db, tenant.company_id).get_or_404(category_id)
    _validate_category(db, tenant, data, category_id)
    for key, value in data.model_dump().items():
        setattr(category, key, value)
    _log(db, tenant, "category", category.id, f"ویرایش دسته‌بندی {category.name}", meta)
    db.commit()
    out = CategoryOut.model_validate(category)
    out.children = []
    return out


@router.delete("/categories/{category_id}", response_model=Message)
def delete_category(category_id: str, tenant: Tenant = Depends(require_permissions("categories.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    repo = CategoryRepository(db, tenant.company_id)
    category = repo.get_or_404(category_id)
    children = db.scalar(select(func.count()).select_from(TicketCategory).where(
        TicketCategory.parent_id == category.id, TicketCategory.deleted_at.is_(None)))
    if children:
        raise ValidationFailed("ابتدا زیرمجموعه‌های این دسته‌بندی را حذف یا جابه‌جا کنید.")
    repo.delete(category)
    _log(db, tenant, "category", category.id, f"حذف دسته‌بندی {category.name}", meta)
    db.commit()
    return Message(message="دسته‌بندی حذف شد.")


# ============================================================================ statuses

def _single_default(db: Session, model, company_id: str, keep_id: str) -> None:
    db.execute(update(model).where(model.company_id == company_id, model.id != keep_id).values(is_default=False))


@router.get("/statuses", response_model=list[StatusOut])
def list_statuses(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    return db.scalars(StatusRepository(db, tenant.company_id).scoped().order_by(TicketStatus.sort_order)).all()


@router.post("/statuses", response_model=StatusOut, status_code=201)
def create_status(data: StatusIn, tenant: Tenant = Depends(require_permissions("statuses.manage")),
                  db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    repo = StatusRepository(db, tenant.company_id)
    if repo.by_code(data.code):
        raise Conflict("وضعیتی با این کد وجود دارد.")
    status = repo.add(TicketStatus(company_id=tenant.company_id, **data.model_dump()))
    if status.is_default:
        _single_default(db, TicketStatus, tenant.company_id, status.id)
    _log(db, tenant, "status", status.id, f"ایجاد وضعیت {status.name}", meta)
    db.commit()
    return status


@router.put("/statuses/{status_id}", response_model=StatusOut)
def update_status(status_id: str, data: StatusUpdate, tenant: Tenant = Depends(require_permissions("statuses.manage")),
                  db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    status = StatusRepository(db, tenant.company_id).get_or_404(status_id)
    values = data.model_dump(exclude_unset=True)
    if status.is_system and "state" in values and values["state"] != status.state:
        raise ValidationFailed("نوع وضعیت‌های سیستمی قابل تغییر نیست.")
    for key, value in values.items():
        setattr(status, key, value)
    if status.is_default:
        status.is_active = True
        _single_default(db, TicketStatus, tenant.company_id, status.id)
    _log(db, tenant, "status", status.id, f"ویرایش وضعیت {status.name}", meta)
    db.commit()
    return status


@router.put("/statuses-order", response_model=Message)
def reorder_statuses(ids: list[str], tenant: Tenant = Depends(require_permissions("statuses.manage")),
                     db: Session = Depends(get_db)):
    repo = StatusRepository(db, tenant.company_id)
    for index, status_id in enumerate(ids):
        repo.get_or_404(status_id).sort_order = index
    db.commit()
    return Message(message="ترتیب ذخیره شد.")


@router.delete("/statuses/{status_id}", response_model=Message)
def delete_status(status_id: str, tenant: Tenant = Depends(require_permissions("statuses.manage")),
                  db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    status = StatusRepository(db, tenant.company_id).get_or_404(status_id)
    if status.is_system or status.is_default:
        raise ValidationFailed("وضعیت‌های سیستمی یا پیش‌فرض قابل حذف نیستند؛ می‌توانید آن‌ها را غیرفعال کنید.")
    if db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status_id == status.id)):
        raise ValidationFailed("تیکت‌هایی با این وضعیت وجود دارند.")
    db.delete(status)
    _log(db, tenant, "status", status_id, f"حذف وضعیت {status.name}", meta)
    db.commit()
    return Message(message="وضعیت حذف شد.")


# ============================================================================ priorities

@router.get("/priorities", response_model=list[PriorityOut])
def list_priorities(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    stmt = PriorityRepository(db, tenant.company_id).scoped()
    if tenant.user.is_customer:
        stmt = stmt.where(TicketPriority.is_active.is_(True))
    return db.scalars(stmt.order_by(TicketPriority.level, TicketPriority.sort_order)).all()


@router.post("/priorities", response_model=PriorityOut, status_code=201)
def create_priority(data: PriorityIn, tenant: Tenant = Depends(require_permissions("priorities.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    repo = PriorityRepository(db, tenant.company_id)
    if db.scalar(repo.scoped().where(TicketPriority.code == data.code)):
        raise Conflict("اولویتی با این کد وجود دارد.")
    priority = repo.add(TicketPriority(company_id=tenant.company_id, **data.model_dump()))
    if priority.is_default:
        _single_default(db, TicketPriority, tenant.company_id, priority.id)
    _log(db, tenant, "priority", priority.id, f"ایجاد اولویت {priority.name}", meta)
    db.commit()
    return priority


@router.put("/priorities/{priority_id}", response_model=PriorityOut)
def update_priority(priority_id: str, data: PriorityUpdate,
                    tenant: Tenant = Depends(require_permissions("priorities.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    priority = PriorityRepository(db, tenant.company_id).get_or_404(priority_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(priority, key, value)
    if priority.is_default:
        priority.is_active = True
        _single_default(db, TicketPriority, tenant.company_id, priority.id)
    _log(db, tenant, "priority", priority.id, f"ویرایش اولویت {priority.name}", meta)
    db.commit()
    return priority


@router.delete("/priorities/{priority_id}", response_model=Message)
def delete_priority(priority_id: str, tenant: Tenant = Depends(require_permissions("priorities.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    priority = PriorityRepository(db, tenant.company_id).get_or_404(priority_id)
    if priority.is_system or priority.is_default:
        raise ValidationFailed("اولویت‌های سیستمی یا پیش‌فرض قابل حذف نیستند؛ می‌توانید آن‌ها را غیرفعال کنید.")
    if db.scalar(select(func.count()).select_from(Ticket).where(Ticket.priority_id == priority.id)):
        raise ValidationFailed("تیکت‌هایی با این اولویت وجود دارند.")
    db.delete(priority)
    _log(db, tenant, "priority", priority_id, f"حذف اولویت {priority.name}", meta)
    db.commit()
    return Message(message="اولویت حذف شد.")


# ============================================================================ tags

@router.get("/tags", response_model=list[TagOut])
def list_tags(tenant: Tenant = Depends(require_permissions("tickets.view", "tickets.view_all", any_of=True)),
              db: Session = Depends(get_db)):
    counts = dict(db.execute(select(ticket_tag_relations.c.tag_id, func.count())
                             .group_by(ticket_tag_relations.c.tag_id)).all())
    tags = db.scalars(TagRepository(db, tenant.company_id).scoped().order_by(TicketTag.name)).all()
    out = []
    for tag in tags:
        item = TagOut.model_validate(tag)
        item.tickets_count = counts.get(tag.id, 0)
        out.append(item)
    return out


@router.post("/tags", response_model=TagOut, status_code=201)
def create_tag(data: TagIn, tenant: Tenant = Depends(require_permissions("tags.manage")), db: Session = Depends(get_db)):
    repo = TagRepository(db, tenant.company_id)
    if db.scalar(repo.scoped().where(TicketTag.name == data.name)):
        raise Conflict("برچسبی با این نام وجود دارد.")
    tag = repo.add(TicketTag(company_id=tenant.company_id, **data.model_dump()))
    db.commit()
    return tag


@router.put("/tags/{tag_id}", response_model=TagOut)
def update_tag(tag_id: str, data: TagIn, tenant: Tenant = Depends(require_permissions("tags.manage")),
               db: Session = Depends(get_db)):
    repo = TagRepository(db, tenant.company_id)
    tag = repo.get_or_404(tag_id)
    if db.scalar(repo.scoped().where(TicketTag.name == data.name, TicketTag.id != tag_id)):
        raise Conflict("برچسبی با این نام وجود دارد.")
    for key, value in data.model_dump().items():
        setattr(tag, key, value)
    db.commit()
    return tag


@router.delete("/tags/{tag_id}", response_model=Message)
def delete_tag(tag_id: str, tenant: Tenant = Depends(require_permissions("tags.manage")), db: Session = Depends(get_db)):
    repo = TagRepository(db, tenant.company_id)
    repo.delete(repo.get_or_404(tag_id))
    db.commit()
    return Message(message="برچسب حذف شد.")


# ============================================================================ SLA rules

@router.get("/sla-rules", response_model=list[SlaRuleOut])
def list_sla_rules(tenant: Tenant = Depends(require_permissions("tickets.view", "sla.manage", any_of=True)),
                   db: Session = Depends(get_db)):
    return db.scalars(SlaRuleRepository(db, tenant.company_id).scoped().order_by(SlaRule.created_at)).unique().all()


def _validate_sla(db: Session, tenant: Tenant, data: SlaRuleIn) -> None:
    if data.priority_id:
        PriorityRepository(db, tenant.company_id).get_or_404(data.priority_id)
    if data.department_id:
        DepartmentRepository(db, tenant.company_id).get_or_404(data.department_id)


@router.post("/sla-rules", response_model=SlaRuleOut, status_code=201)
def create_sla_rule(data: SlaRuleIn, tenant: Tenant = Depends(require_permissions("sla.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    _validate_sla(db, tenant, data)
    rule = SlaRuleRepository(db, tenant.company_id).add(SlaRule(company_id=tenant.company_id, **data.model_dump()))
    _log(db, tenant, "sla_rule", rule.id, f"ایجاد قانون SLA {rule.name}", meta)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/sla-rules/{rule_id}", response_model=SlaRuleOut)
def update_sla_rule(rule_id: str, data: SlaRuleIn, tenant: Tenant = Depends(require_permissions("sla.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    rule = SlaRuleRepository(db, tenant.company_id).get_or_404(rule_id)
    _validate_sla(db, tenant, data)
    for key, value in data.model_dump().items():
        setattr(rule, key, value)
    _log(db, tenant, "sla_rule", rule.id, f"ویرایش قانون SLA {rule.name}", meta)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/sla-rules/{rule_id}", response_model=Message)
def delete_sla_rule(rule_id: str, tenant: Tenant = Depends(require_permissions("sla.manage")),
                    db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    repo = SlaRuleRepository(db, tenant.company_id)
    rule = repo.get_or_404(rule_id)
    repo.delete(rule)
    _log(db, tenant, "sla_rule", rule_id, f"حذف قانون SLA {rule.name}", meta)
    db.commit()
    return Message(message="قانون SLA حذف شد.")


# ============================================================================ holidays

@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(tenant: Tenant = Depends(require_permissions("settings.view", "sla.manage", any_of=True)),
                  db: Session = Depends(get_db)):
    return db.scalars(HolidayRepository(db, tenant.company_id).scoped().order_by(Holiday.date)).all()


@router.post("/holidays", response_model=HolidayOut, status_code=201)
def create_holiday(data: HolidayIn, tenant: Tenant = Depends(require_permissions("sla.manage")),
                   db: Session = Depends(get_db)):
    repo = HolidayRepository(db, tenant.company_id)
    if db.scalar(repo.scoped().where(Holiday.date == data.date)):
        raise Conflict("برای این تاریخ تعطیلی ثبت شده است.")
    holiday = repo.add(Holiday(company_id=tenant.company_id, date=data.date, title=data.title))
    db.commit()
    return holiday


@router.delete("/holidays/{holiday_id}", response_model=Message)
def delete_holiday(holiday_id: str, tenant: Tenant = Depends(require_permissions("sla.manage")),
                   db: Session = Depends(get_db)):
    repo = HolidayRepository(db, tenant.company_id)
    repo.delete(repo.get_or_404(holiday_id))
    db.commit()
    return Message(message="تعطیلی حذف شد.")
