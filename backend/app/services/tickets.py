"""Ticket business logic: visibility, listing, creation, updates, conversation, attachments and ratings."""
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from fastapi import UploadFile
from sqlalchemy import and_, asc, desc, false, func, or_, select, true
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant
from app.config.settings import settings
from app.core.exceptions import NotFound, PermissionDenied, ValidationFailed
from app.database.base import utcnow
from app.models import (
    Company,
    CustomerRating,
    MessageKind,
    Permission,
    SlaStatus,
    StatusState,
    Ticket,
    TicketActivity,
    TicketAttachment,
    TicketCategory,
    TicketMessage,
    TicketPriority,
    TicketRead,
    TicketStatus,
    User,
    UserType,
    role_permissions,
    ticket_tag_relations,
    user_roles,
)
from app.repositories import (
    AttachmentRepository,
    CategoryRepository,
    DepartmentRepository,
    PriorityRepository,
    StatusRepository,
    TagRepository,
    TicketRepository,
    UserRepository,
)
from app.schemas.ticket import EscalateRequest, TicketBulkUpdate, TicketCreate, TicketUpdate
from app.services import sla as sla_service
from app.services.assignment import eligible_agents_query, pick_agent
from app.services.audit import AuditAction, audit
from app.services.company import company_setting, ensure_ticket_capacity
from app.services.notifications import TicketNotifier
from app.utils.files import validate_and_store
from app.utils.html import html_to_text, sanitize_html
from app.utils.persian import escape_like, normalize_text, to_latin_digits

_MENTION_RE = re.compile(r'data-type="mention"[^>]*data-id="([0-9a-f\-]{36})"|data-id="([0-9a-f\-]{36})"[^>]*data-type="mention"')


def users_with_permission(db: Session, company_id: str, code: str) -> list[User]:
    stmt = (
        select(User)
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(User.company_id == company_id, User.user_type == UserType.STAFF, User.is_active.is_(True),
               User.deleted_at.is_(None), Permission.code == code)
        .distinct()
    )
    return list(db.scalars(stmt).unique())


# =========================================================================== visibility

def visibility_filter(tenant: Tenant, company: Company):
    """SQL condition limiting tickets to what the current user may see (within the tenant)."""
    user = tenant.user
    if user.is_customer:
        return Ticket.customer_id == user.id
    if tenant.has("tickets.view_all"):
        return true()
    if not tenant.has("tickets.view"):
        return false()
    conditions = [Ticket.assigned_agent_id == user.id]
    dept_ids = [d.id for d in user.departments]
    if dept_ids and company_setting(company, "agent_can_view_department_tickets"):
        conditions.append(Ticket.department_id.in_(dept_ids))
    conditions.append(and_(Ticket.assigned_agent_id.is_(None), Ticket.department_id.is_(None)))
    managed = [d.id for d in user.departments if d.manager_id == user.id]
    if managed:
        conditions.append(Ticket.department_id.in_(managed))
    return or_(*conditions)


@dataclass
class TicketContext:
    db: Session
    tenant: Tenant
    company: Company
    meta: RequestMeta | None = None

    @property
    def user(self) -> User:
        return self.tenant.user

    @property
    def company_id(self) -> str:
        return self.company.id


def load_context(db: Session, tenant: Tenant, meta: RequestMeta | None = None) -> TicketContext:
    company = db.get(Company, tenant.require_company())
    if company is None:
        raise NotFound("سازمان یافت نشد.")
    return TicketContext(db, tenant, company, meta)


def get_visible_ticket(ctx: TicketContext, ticket_id: str, *, for_update: bool = False) -> Ticket:
    stmt = TicketRepository(ctx.db, ctx.company_id).scoped().where(
        or_(Ticket.id == ticket_id, Ticket.code == ticket_id), visibility_filter(ctx.tenant, ctx.company))
    if for_update:
        stmt = stmt.with_for_update(of=Ticket)
    ticket = ctx.db.scalar(stmt)
    if ticket is None:
        raise NotFound("تیکت یافت نشد یا به آن دسترسی ندارید.")
    return ticket


def permissions_for(ctx: TicketContext, ticket: Ticket) -> dict[str, bool]:
    t = ctx.tenant
    state = ticket.status.state
    is_owner = ticket.customer_id == ctx.user.id
    if ctx.user.is_customer:
        reopen_days = company_setting(ctx.company, "reopen_window_days") or 0
        closed_at = ticket.closed_at or ticket.resolved_at
        can_reopen = bool(
            company_setting(ctx.company, "allow_customer_reopen") and state in (StatusState.RESOLVED, StatusState.CLOSED)
            and (not closed_at or not reopen_days or utcnow() - closed_at <= timedelta(days=reopen_days)))
        return {
            "reply": is_owner and (state != StatusState.CLOSED or can_reopen),
            "internal_note": False, "update": False, "assign": False, "escalate": False, "delete": False,
            "close": is_owner and bool(company_setting(ctx.company, "allow_customer_close"))
            and state not in (StatusState.CLOSED,),
            "reopen": is_owner and can_reopen,
            "rate": is_owner and bool(company_setting(ctx.company, "rating_enabled"))
            and state in (StatusState.RESOLVED, StatusState.CLOSED) and ticket.rating is None,
            "upload": is_owner and state != StatusState.CLOSED,
        }
    return {
        "reply": t.has("tickets.reply"),
        "internal_note": t.has("tickets.internal_notes"),
        "update": t.has("tickets.update"),
        "assign": t.has("tickets.assign"),
        "escalate": t.has("tickets.escalate"),
        "close": t.has("tickets.close"),
        "reopen": t.has("tickets.update") and state in (StatusState.RESOLVED, StatusState.CLOSED),
        "delete": t.has("tickets.delete"),
        "rate": False,
        "upload": t.has("tickets.reply"),
    }


# =========================================================================== listing

@dataclass
class TicketFilters:
    q: str | None = None
    status_ids: list[str] = field(default_factory=list)
    state: str | None = None
    priority_ids: list[str] = field(default_factory=list)
    category_id: str | None = None
    department_id: str | None = None
    agent: str | None = None  # user id | "me" | "unassigned"
    customer_id: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    sla_status: list[str] = field(default_factory=list)
    date_from: date | None = None
    date_to: date | None = None
    escalated: bool | None = None
    overdue: bool | None = None
    sort: str = "updated_at"
    direction: str = "desc"


_SORTS = {
    "created_at": Ticket.created_at,
    "updated_at": Ticket.updated_at,
    "number": Ticket.number,
    "subject": Ticket.subject,
    "last_response_at": Ticket.last_response_at,
    "resolution_due_at": Ticket.resolution_due_at,
    "due_date": Ticket.due_date,
    "priority": TicketPriority.level,
    "status": TicketStatus.sort_order,
}


def category_with_children(db: Session, company_id: str, category_id: str) -> list[str]:
    rows = db.execute(select(TicketCategory.id, TicketCategory.parent_id).where(
        TicketCategory.company_id == company_id, TicketCategory.deleted_at.is_(None))).all()
    children: dict[str | None, list[str]] = {}
    for cid, pid in rows:
        children.setdefault(pid, []).append(cid)
    result, stack = [], [category_id]
    while stack:
        current = stack.pop()
        result.append(current)
        stack.extend(children.get(current, []))
    return result


def build_ticket_query(ctx: TicketContext, f: TicketFilters):
    stmt = (
        TicketRepository(ctx.db, ctx.company_id).scoped()
        .join(TicketStatus, TicketStatus.id == Ticket.status_id)
        .join(TicketPriority, TicketPriority.id == Ticket.priority_id)
        .where(visibility_filter(ctx.tenant, ctx.company))
    )
    if f.q:
        q = normalize_text(f.q) or ""
        digits = to_latin_digits(q).upper().replace(" ", "")
        like = f"%{escape_like(q)}%"
        customer_ids = select(User.id).where(User.company_id == ctx.company_id, or_(
            User.full_name.like(like), User.email.like(like), User.mobile.like(like)))
        conditions = [Ticket.subject.like(like), Ticket.code.like(f"%{escape_like(digits)}%"),
                      Ticket.customer_id.in_(customer_ids)]
        if digits.isdigit():
            conditions.append(Ticket.number == int(digits))
        stmt = stmt.where(or_(*conditions))
    if f.status_ids:
        stmt = stmt.where(Ticket.status_id.in_(f.status_ids))
    if f.state:
        if f.state == "active":
            stmt = stmt.where(TicketStatus.state.in_([StatusState.OPEN, StatusState.PENDING]))
        else:
            stmt = stmt.where(TicketStatus.state == f.state)
    if f.priority_ids:
        stmt = stmt.where(Ticket.priority_id.in_(f.priority_ids))
    if f.category_id:
        stmt = stmt.where(Ticket.category_id.in_(category_with_children(ctx.db, ctx.company_id, f.category_id)))
    if f.department_id:
        stmt = stmt.where(Ticket.department_id == f.department_id)
    if f.agent == "me":
        stmt = stmt.where(Ticket.assigned_agent_id == ctx.user.id)
    elif f.agent == "unassigned":
        stmt = stmt.where(Ticket.assigned_agent_id.is_(None))
    elif f.agent:
        stmt = stmt.where(Ticket.assigned_agent_id == f.agent)
    if f.customer_id:
        stmt = stmt.where(Ticket.customer_id == f.customer_id)
    if f.tag_ids:
        stmt = stmt.where(Ticket.id.in_(select(ticket_tag_relations.c.ticket_id).where(
            ticket_tag_relations.c.tag_id.in_(f.tag_ids))))
    if f.sla_status:
        stmt = stmt.where(Ticket.sla_status.in_(f.sla_status))
    if f.date_from:
        stmt = stmt.where(Ticket.created_at >= datetime.combine(f.date_from, time.min))
    if f.date_to:
        stmt = stmt.where(Ticket.created_at < datetime.combine(f.date_to + timedelta(days=1), time.min))
    if f.escalated:
        stmt = stmt.where(Ticket.escalation_level > 0)
    if f.overdue:
        now = utcnow()
        stmt = stmt.where(TicketStatus.state.in_([StatusState.OPEN, StatusState.PENDING]), or_(
            Ticket.sla_status == SlaStatus.BREACHED, and_(Ticket.due_date.is_not(None), Ticket.due_date < now)))

    column = _SORTS.get(f.sort, Ticket.updated_at)
    order = desc(column) if f.direction == "desc" else asc(column)
    return stmt.order_by(order, desc(Ticket.created_at))


def unread_map(db: Session, user: User, tickets: list[Ticket]) -> dict[str, bool]:
    if not tickets:
        return {}
    reads = dict(db.execute(select(TicketRead.ticket_id, TicketRead.last_read_at).where(
        TicketRead.user_id == user.id, TicketRead.ticket_id.in_([t.id for t in tickets]))).all())
    result = {}
    for t in tickets:
        last = t.last_response_at or t.created_at
        read = reads.get(t.id)
        result[t.id] = read is None or (last is not None and read < last)
    return result


def mark_read(db: Session, ticket: Ticket, user: User) -> None:
    record = db.get(TicketRead, (ticket.id, user.id))
    if record:
        record.last_read_at = utcnow()
    else:
        db.add(TicketRead(ticket_id=ticket.id, user_id=user.id, last_read_at=utcnow()))


# =========================================================================== helpers

def _activity(ctx: TicketContext, ticket: Ticket, action: str, field_name: str | None = None,
              old: str | None = None, new: str | None = None, internal: bool = False) -> None:
    ctx.db.add(TicketActivity(company_id=ctx.company_id, ticket_id=ticket.id, user_id=ctx.user.id, action=action,
                              field=field_name, old_value=(old or "")[:255] or None,
                              new_value=(new or "")[:255] or None, is_internal=internal))


def _audit(ctx: TicketContext, action: str, ticket: Ticket, description: str, changes: dict | None = None) -> None:
    audit(ctx.db, action, user=ctx.user, company_id=ctx.company_id, entity_type="ticket", entity_id=ticket.id,
          description=description, changes=changes, ip=ctx.meta.ip if ctx.meta else None,
          user_agent=ctx.meta.user_agent if ctx.meta else None)


def _validate_agent(ctx: TicketContext, agent_id: str) -> User:
    agent = ctx.db.scalar(eligible_agents_query(ctx.company_id).where(User.id == agent_id))
    if agent is None:
        raise ValidationFailed("کارشناس انتخاب شده معتبر نیست یا دسترسی پاسخگویی ندارد.",
                               details=[{"field": "assigned_agent_id", "message": "کارشناس نامعتبر"}])
    return agent


def _next_number(db: Session, company_id: str) -> tuple[int, str]:
    company = db.scalar(select(Company).where(Company.id == company_id).with_for_update())
    company.ticket_seq += 1
    number = company.ticket_seq
    return number, f"{company.ticket_prefix}-{number}"


def _store_attachments(ctx: TicketContext, ticket: Ticket, files: list[UploadFile] | None,
                       message: TicketMessage | None = None, internal: bool = False) -> list[TicketAttachment]:
    files = [f for f in (files or []) if f and f.filename]
    if len(files) > settings.MAX_FILES_PER_MESSAGE:
        raise ValidationFailed(f"حداکثر {settings.MAX_FILES_PER_MESSAGE} فایل در هر پیام مجاز است.")
    stored = []
    for upload in files:
        info = validate_and_store(upload, f"tickets/{ctx.company_id}")
        attachment = TicketAttachment(company_id=ctx.company_id, ticket_id=ticket.id,
                                      message_id=message.id if message else None, uploaded_by_id=ctx.user.id,
                                      original_name=info.original_name, stored_path=info.relative_path,
                                      mime_type=info.mime_type, size=info.size, is_internal=internal)
        ctx.db.add(attachment)
        stored.append(attachment)
    ctx.db.flush()
    return stored


def extract_mentions(ctx: TicketContext, body: str) -> list[User]:
    ids = {a or b for a, b in _MENTION_RE.findall(body or "")}
    if not ids:
        return []
    return list(ctx.db.scalars(select(User).where(User.id.in_(ids), User.company_id == ctx.company_id,
                                                  User.user_type == UserType.STAFF, User.deleted_at.is_(None))))


def _system_message(ctx: TicketContext, ticket: Ticket, text: str, internal: bool = True) -> None:
    ctx.db.add(TicketMessage(company_id=ctx.company_id, ticket_id=ticket.id, author_id=ctx.user.id,
                             kind=MessageKind.SYSTEM, body=sanitize_html(f"<p>{text}</p>"), is_internal=internal))


# =========================================================================== create

def create_ticket(ctx: TicketContext, data: TicketCreate, files: list[UploadFile] | None = None) -> Ticket:
    db, user = ctx.db, ctx.user
    if not ctx.tenant.has("tickets.create"):
        raise PermissionDenied()
    ensure_ticket_capacity(db, ctx.company)
    users = UserRepository(db, ctx.company_id)

    if user.is_customer:
        customer = user
    else:
        if not data.customer_id:
            raise ValidationFailed("انتخاب مشتری الزامی است.", details=[{"field": "customer_id",
                                                                      "message": "انتخاب مشتری الزامی است."}])
        customer = users.get_customer(data.customer_id)
        if customer is None:
            raise ValidationFailed("مشتری انتخاب شده معتبر نیست.")

    category = CategoryRepository(db, ctx.company_id).get(data.category_id) if data.category_id else None
    if data.category_id and (category is None or not category.is_active):
        raise ValidationFailed("دسته‌بندی انتخاب شده معتبر نیست.")
    if category is None and company_setting(ctx.company, "require_category"):
        raise ValidationFailed("انتخاب دسته‌بندی الزامی است.",
                               details=[{"field": "category_id", "message": "انتخاب دسته‌بندی الزامی است."}])

    department = None
    can_pick_department = not user.is_customer or company_setting(ctx.company, "customer_can_select_department")
    if data.department_id and can_pick_department:
        department = DepartmentRepository(db, ctx.company_id).get(data.department_id)
        if department is None or not department.is_active:
            raise ValidationFailed("دپارتمان انتخاب شده معتبر نیست.")
    if department is None and category and category.department_id:
        department = DepartmentRepository(db, ctx.company_id).get(category.department_id)  # auto-routing

    priorities = PriorityRepository(db, ctx.company_id)
    priority = None
    can_pick_priority = not user.is_customer or company_setting(ctx.company, "customer_can_select_priority")
    if data.priority_id and can_pick_priority:
        priority = priorities.get(data.priority_id)
        if priority is None:
            raise ValidationFailed("اولویت انتخاب شده معتبر نیست.")
    if priority is None and category and category.default_priority_id:
        priority = priorities.get(category.default_priority_id)
    priority = priority or priorities.default()
    status = StatusRepository(db, ctx.company_id).default()
    if priority is None or status is None:
        raise ValidationFailed("تنظیمات وضعیت/اولویت سازمان کامل نیست.")

    number, code = _next_number(db, ctx.company_id)
    now = utcnow()
    ticket = Ticket(
        company_id=ctx.company_id, number=number, code=code, subject=normalize_text(data.subject) or data.subject,
        description=sanitize_html(data.description), channel=data.channel if not user.is_customer else "web",
        customer_id=customer.id, created_by_id=user.id, department_id=department.id if department else None,
        category_id=category.id if category else None, priority_id=priority.id, status_id=status.id,
        due_date=data.due_date if not user.is_customer else None, last_response_at=now,
        last_customer_reply_at=now if user.is_customer else None, created_at=now, updated_at=now,
    )
    db.add(ticket)
    db.flush()
    db.refresh(ticket)

    if data.tag_ids and not user.is_customer:
        ticket.tags = TagRepository(db, ctx.company_id).many(data.tag_ids)

    sla_service.apply_sla(db, ctx.company, ticket)

    agent = None
    if data.assigned_agent_id and ctx.tenant.has("tickets.assign"):
        agent = _validate_agent(ctx, data.assigned_agent_id)
    else:
        ticket.category = category
        agent = pick_agent(db, ctx.company, ticket)
    if agent:
        ticket.assigned_agent_id = agent.id
        ticket.assigned_agent = agent

    _store_attachments(ctx, ticket, files)
    _activity(ctx, ticket, "created")
    if agent:
        _activity(ctx, ticket, "assigned", "assigned_agent", None, agent.full_name, internal=True)
    mark_read(db, ticket, user)
    _audit(ctx, AuditAction.TICKET_CREATED, ticket, f"ایجاد تیکت {ticket.code}: {ticket.subject}")
    db.flush()

    notifier = TicketNotifier(db, ticket, actor=user)
    notifier.created()
    if agent:
        notifier.assigned(agent)
    return ticket


# =========================================================================== update

def change_status(ctx: TicketContext, ticket: Ticket, new_status: TicketStatus, *, notify: bool = True) -> None:
    old_status = ticket.status
    if old_status.id == new_status.id:
        return
    if new_status.state == StatusState.CLOSED and not (ctx.tenant.has("tickets.close") or ctx.user.is_customer):
        raise PermissionDenied("شما مجوز بستن تیکت را ندارید.")
    now = utcnow()
    was_done = old_status.state in (StatusState.RESOLVED, StatusState.CLOSED)
    is_done = new_status.state in (StatusState.RESOLVED, StatusState.CLOSED)
    if was_done and not is_done:
        ticket.reopened_count += 1
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.sla_breach_notified = ticket.resolution_breached
    if new_status.state == StatusState.RESOLVED:
        ticket.resolved_at = now
    if new_status.state == StatusState.CLOSED:
        ticket.closed_at = now
        ticket.resolved_at = ticket.resolved_at or now
    ticket.status_id = new_status.id
    ticket.status = new_status
    sla_service.on_status_change(ctx.db, ctx.company, ticket, old_status, new_status)
    _activity(ctx, ticket, "reopened" if was_done and not is_done else "status_changed", "status",
              old_status.name, new_status.name)
    _audit(ctx, AuditAction.TICKET_STATUS, ticket, f"تغییر وضعیت {ticket.code}: {old_status.name} ← {new_status.name}",
           {"status": {"old": old_status.code, "new": new_status.code}})
    if notify:
        TicketNotifier(ctx.db, ticket, actor=ctx.user).status_changed(old_status.name, new_status)


def assign(ctx: TicketContext, ticket: Ticket, agent: User | None) -> None:
    if not ctx.tenant.has("tickets.assign"):
        raise PermissionDenied("شما مجوز ارجاع تیکت را ندارید.")
    old = ticket.assigned_agent
    if (old.id if old else None) == (agent.id if agent else None):
        return
    ticket.assigned_agent_id = agent.id if agent else None
    ticket.assigned_agent = agent
    _activity(ctx, ticket, "assigned" if agent else "unassigned", "assigned_agent",
              old.full_name if old else None, agent.full_name if agent else None, internal=True)
    _audit(ctx, AuditAction.TICKET_ASSIGNED, ticket,
           f"ارجاع {ticket.code} به {agent.full_name if agent else 'بدون کارشناس'}",
           {"assigned_agent": {"old": old.id if old else None, "new": agent.id if agent else None}})
    if agent:
        TicketNotifier(ctx.db, ticket, actor=ctx.user).assigned(agent)


def update_ticket(ctx: TicketContext, ticket: Ticket, data: TicketUpdate) -> Ticket:
    db, t = ctx.db, ctx.tenant
    if ctx.user.is_customer:
        raise PermissionDenied()
    fields = data.model_fields_set
    changes: dict = {}
    recalc_sla = False

    edit_fields = {"subject", "description", "category_id", "department_id", "priority_id", "tag_ids", "due_date",
                   "clear_due_date"}
    if fields & edit_fields and not t.has("tickets.update"):
        raise PermissionDenied("شما مجوز ویرایش تیکت را ندارید.")

    if data.subject is not None and data.subject != ticket.subject:
        changes["subject"] = {"old": ticket.subject, "new": data.subject}
        _activity(ctx, ticket, "updated", "subject", ticket.subject, data.subject)
        ticket.subject = normalize_text(data.subject) or data.subject
    if data.description is not None:
        ticket.description = sanitize_html(data.description)
        changes["description"] = {"old": "…", "new": "…"}
    if "category_id" in fields:
        category = CategoryRepository(db, ctx.company_id).get(data.category_id) if data.category_id else None
        if data.category_id and category is None:
            raise ValidationFailed("دسته‌بندی انتخاب شده معتبر نیست.")
        if (ticket.category_id or None) != (category.id if category else None):
            _activity(ctx, ticket, "updated", "category", ticket.category.name if ticket.category else None,
                      category.name if category else None)
            changes["category_id"] = {"old": ticket.category_id, "new": category.id if category else None}
            ticket.category_id = category.id if category else None
            ticket.category = category
    if "department_id" in fields:
        dept = DepartmentRepository(db, ctx.company_id).get(data.department_id) if data.department_id else None
        if data.department_id and dept is None:
            raise ValidationFailed("دپارتمان انتخاب شده معتبر نیست.")
        if ticket.department_id != (dept.id if dept else None):
            _activity(ctx, ticket, "updated", "department", ticket.department.name if ticket.department else None,
                      dept.name if dept else None)
            changes["department_id"] = {"old": ticket.department_id, "new": dept.id if dept else None}
            ticket.department_id = dept.id if dept else None
            ticket.department = dept
            recalc_sla = True
    if data.priority_id and data.priority_id != ticket.priority_id:
        priority = PriorityRepository(db, ctx.company_id).get_or_404(data.priority_id)
        _activity(ctx, ticket, "priority_changed", "priority", ticket.priority.name, priority.name)
        _audit(ctx, AuditAction.TICKET_PRIORITY, ticket,
               f"تغییر اولویت {ticket.code}: {ticket.priority.name} ← {priority.name}",
               {"priority": {"old": ticket.priority.code, "new": priority.code}})
        ticket.priority_id = priority.id
        ticket.priority = priority
        recalc_sla = True
    if data.tag_ids is not None:
        ticket.tags = TagRepository(db, ctx.company_id).many(data.tag_ids)
        changes["tags"] = {"new": [tag.name for tag in ticket.tags]}
    if data.clear_due_date:
        ticket.due_date = None
    elif data.due_date is not None:
        ticket.due_date = data.due_date.replace(tzinfo=None) if data.due_date.tzinfo is None else \
            data.due_date.astimezone(tz=None).replace(tzinfo=None)
        changes["due_date"] = {"new": ticket.due_date.isoformat()}

    if recalc_sla:
        preserve_first = ticket.first_responded_at
        sla_service.apply_sla(db, ctx.company, ticket)
        ticket.first_responded_at = preserve_first

    if data.status_id and data.status_id != ticket.status_id:
        if not t.has_any("tickets.update", "tickets.close"):
            raise PermissionDenied("شما مجوز تغییر وضعیت تیکت را ندارید.")
        new_status = StatusRepository(db, ctx.company_id).get_or_404(data.status_id)
        if new_status.state != StatusState.CLOSED and not t.has("tickets.update"):
            raise PermissionDenied()
        change_status(ctx, ticket, new_status)

    if data.clear_assignee:
        assign(ctx, ticket, None)
    elif data.assigned_agent_id and data.assigned_agent_id != ticket.assigned_agent_id:
        assign(ctx, ticket, _validate_agent(ctx, data.assigned_agent_id))

    if changes:
        _audit(ctx, AuditAction.TICKET_UPDATED, ticket, f"ویرایش تیکت {ticket.code}", changes)
    ticket.updated_at = utcnow()
    db.flush()
    return ticket


def bulk_update(ctx: TicketContext, data: TicketBulkUpdate) -> int:
    count = 0
    for ticket_id in dict.fromkeys(data.ticket_ids):
        ticket = get_visible_ticket(ctx, ticket_id, for_update=True)
        update = TicketUpdate(status_id=data.status_id, priority_id=data.priority_id,
                              assigned_agent_id=data.assigned_agent_id, clear_assignee=data.clear_assignee)
        update_ticket(ctx, ticket, update)
        if data.add_tag_ids:
            existing = {tag.id for tag in ticket.tags}
            ticket.tags = ticket.tags + [tag for tag in TagRepository(ctx.db, ctx.company_id).many(data.add_tag_ids)
                                         if tag.id not in existing]
        count += 1
    return count


def escalate(ctx: TicketContext, ticket: Ticket, data: EscalateRequest) -> Ticket:
    if not ctx.tenant.has("tickets.escalate"):
        raise PermissionDenied("شما مجوز ارجاع به سطح بالاتر را ندارید.")
    db = ctx.db
    ticket.escalation_level += 1
    ticket.escalated_at = utcnow()
    if data.department_id:
        dept = DepartmentRepository(db, ctx.company_id).get_or_404(data.department_id)
        ticket.department_id = dept.id
        ticket.department = dept
    escalated = StatusRepository(db, ctx.company_id).by_code("escalated")
    if escalated and escalated.is_active:
        change_status(ctx, ticket, escalated, notify=False)
    if data.assigned_agent_id:
        agent = _validate_agent(ctx, data.assigned_agent_id)
        old = ticket.assigned_agent
        ticket.assigned_agent_id = agent.id
        ticket.assigned_agent = agent
        _activity(ctx, ticket, "assigned", "assigned_agent", old.full_name if old else None, agent.full_name, True)
    _system_message(ctx, ticket, f"تیکت به سطح {ticket.escalation_level} ارجاع شد. دلیل: {data.reason}")
    _activity(ctx, ticket, "escalated", "escalation_level", str(ticket.escalation_level - 1),
              str(ticket.escalation_level), internal=True)
    _audit(ctx, AuditAction.TICKET_ESCALATED, ticket, f"ارجاع {ticket.code} به سطح بالاتر: {data.reason}")
    db.flush()
    TicketNotifier(db, ticket, actor=ctx.user).escalated(data.reason)
    if data.assigned_agent_id and ticket.assigned_agent:
        TicketNotifier(db, ticket, actor=ctx.user).assigned(ticket.assigned_agent)
    return ticket


def customer_close(ctx: TicketContext, ticket: Ticket) -> None:
    if not permissions_for(ctx, ticket)["close"]:
        raise PermissionDenied("امکان بستن این تیکت وجود ندارد.")
    closed = StatusRepository(ctx.db, ctx.company_id).first_in_state(StatusState.CLOSED)
    if closed is None:
        raise ValidationFailed("وضعیت «بسته شده» تعریف نشده است.")
    change_status(ctx, ticket, closed)


def reopen(ctx: TicketContext, ticket: Ticket) -> None:
    if not permissions_for(ctx, ticket)["reopen"]:
        raise PermissionDenied("امکان بازگشایی این تیکت وجود ندارد.")
    target = StatusRepository(ctx.db, ctx.company_id).by_code("pending_support") or \
        StatusRepository(ctx.db, ctx.company_id).default()
    change_status(ctx, ticket, target)


def delete_ticket(ctx: TicketContext, ticket: Ticket) -> None:
    if not ctx.tenant.has("tickets.delete"):
        raise PermissionDenied()
    ticket.soft_delete()
    _audit(ctx, AuditAction.TICKET_DELETED, ticket, f"حذف تیکت {ticket.code}")


# =========================================================================== conversation

def add_message(ctx: TicketContext, ticket: Ticket, body: str, is_internal: bool,
                files: list[UploadFile] | None) -> TicketMessage:
    db, user = ctx.db, ctx.user
    perms = permissions_for(ctx, ticket)
    if is_internal and not perms["internal_note"]:
        raise PermissionDenied("شما مجوز ثبت یادداشت داخلی را ندارید.")
    if not is_internal and not perms["reply"]:
        raise PermissionDenied("امکان ارسال پاسخ برای این تیکت وجود ندارد.")
    clean = sanitize_html(body)
    has_files = any(f and f.filename for f in (files or []))
    if not html_to_text(clean) and not has_files:
        raise ValidationFailed("متن پیام یا فایل پیوست الزامی است.")
    if not html_to_text(clean):
        clean = "<p>فایل پیوست</p>"

    now = utcnow()
    message = TicketMessage(company_id=ctx.company_id, ticket_id=ticket.id, author_id=user.id,
                            kind=MessageKind.NOTE if is_internal else MessageKind.REPLY, body=clean,
                            is_internal=is_internal, created_at=now, updated_at=now)
    db.add(message)
    db.flush()
    mentions = extract_mentions(ctx, clean) if user.is_staff else []
    message.mentions = mentions
    _store_attachments(ctx, ticket, files, message=message, internal=is_internal)

    statuses = StatusRepository(db, ctx.company_id)
    if not is_internal:
        ticket.last_response_at = now
        if user.is_customer:
            ticket.last_customer_reply_at = now
            if ticket.status.state in (StatusState.RESOLVED, StatusState.CLOSED) or \
                    ticket.status.code in ("pending_customer",):
                target = statuses.by_code("pending_support")
                if target:
                    change_status(ctx, ticket, target, notify=False)
        else:
            ticket.last_agent_reply_at = now
            sla_service.record_first_response(ticket, now)
            if ticket.assigned_agent_id is None and ctx.tenant.has("tickets.reply"):
                ticket.assigned_agent_id = user.id
                ticket.assigned_agent = user
                _activity(ctx, ticket, "assigned", "assigned_agent", None, user.full_name, internal=True)
            if ticket.status.state == StatusState.OPEN:
                target = statuses.by_code("pending_customer")
                if target:
                    change_status(ctx, ticket, target, notify=False)
            else:
                sla_service.evaluate(ticket)
    ticket.updated_at = now
    mark_read(db, ticket, user)
    db.flush()
    TicketNotifier(db, ticket, actor=user).replied(clean, internal=is_internal, by_customer=user.is_customer,
                                                   mentions=mentions)
    return message


def _message_rights(ctx: TicketContext, message: TicketMessage) -> tuple[bool, bool]:
    if message.deleted_at or message.kind == MessageKind.SYSTEM:
        return False, False
    window = company_setting(ctx.company, "message_edit_window_minutes") or 0
    own = message.author_id == ctx.user.id
    fresh = window > 0 and utcnow() - message.created_at <= timedelta(minutes=window)
    can_edit = (own and fresh) or (ctx.user.is_staff and ctx.tenant.has("messages.edit_any"))
    can_delete = (own and fresh) or (ctx.user.is_staff and ctx.tenant.has("messages.delete"))
    return can_edit, can_delete


def list_messages(ctx: TicketContext, ticket: Ticket, q: str | None = None) -> list[dict]:
    db = ctx.db
    stmt = select(TicketMessage).where(TicketMessage.ticket_id == ticket.id,
                                       TicketMessage.company_id == ctx.company_id)
    if ctx.user.is_customer:
        stmt = stmt.where(TicketMessage.is_internal.is_(False))
    if q:
        stmt = stmt.where(TicketMessage.body.like(f"%{escape_like(normalize_text(q) or q)}%"),
                          TicketMessage.deleted_at.is_(None))
    messages = list(db.scalars(stmt.order_by(TicketMessage.created_at)).unique())

    reads = db.execute(select(TicketRead.user_id, TicketRead.last_read_at, User.user_type)
                       .join(User, User.id == TicketRead.user_id).where(TicketRead.ticket_id == ticket.id)).all()
    customer_read = max((r.last_read_at for r in reads if r.user_type == UserType.CUSTOMER), default=None)
    staff_read = max((r.last_read_at for r in reads if r.user_type != UserType.CUSTOMER), default=None)

    out = []
    for m in messages:
        can_edit, can_delete = _message_rights(ctx, m)
        author_is_customer = m.author is not None and m.author.user_type == UserType.CUSTOMER
        other_read = staff_read if author_is_customer else customer_read
        is_read = m.is_internal or (other_read is not None and other_read >= m.created_at)
        attachments = [a for a in m.attachments if not (a.is_internal and ctx.user.is_customer)]
        out.append({
            "id": m.id, "ticket_id": m.ticket_id, "kind": m.kind,
            "body": "" if m.deleted_at else m.body, "is_internal": m.is_internal, "author": m.author,
            "attachments": [] if m.deleted_at else attachments, "mentions": m.mentions, "created_at": m.created_at,
            "edited_at": m.edited_at, "deleted_at": m.deleted_at, "is_read": is_read,
            "can_edit": can_edit, "can_delete": can_delete,
        })
    return out


def get_message(ctx: TicketContext, ticket: Ticket, message_id: str) -> TicketMessage:
    message = ctx.db.scalar(select(TicketMessage).where(TicketMessage.id == message_id,
                                                        TicketMessage.ticket_id == ticket.id,
                                                        TicketMessage.company_id == ctx.company_id))
    if message is None or (message.is_internal and ctx.user.is_customer):
        raise NotFound("پیام یافت نشد.")
    return message


def edit_message(ctx: TicketContext, ticket: Ticket, message: TicketMessage, body: str) -> TicketMessage:
    can_edit, _ = _message_rights(ctx, message)
    if not can_edit:
        raise PermissionDenied("امکان ویرایش این پیام وجود ندارد.")
    message.body = sanitize_html(body)
    message.edited_at = utcnow()
    if ctx.user.is_staff:
        message.mentions = extract_mentions(ctx, message.body)
    audit(ctx.db, AuditAction.MESSAGE_EDITED, user=ctx.user, company_id=ctx.company_id, entity_type="message",
          entity_id=message.id, description=f"ویرایش پیام در تیکت {ticket.code}",
          ip=ctx.meta.ip if ctx.meta else None)
    return message


def delete_message(ctx: TicketContext, ticket: Ticket, message: TicketMessage) -> None:
    _, can_delete = _message_rights(ctx, message)
    if not can_delete:
        raise PermissionDenied("شما مجوز حذف این پیام را ندارید.")
    message.deleted_at = utcnow()
    message.deleted_by_id = ctx.user.id
    audit(ctx.db, AuditAction.MESSAGE_DELETED, user=ctx.user, company_id=ctx.company_id, entity_type="message",
          entity_id=message.id, description=f"حذف پیام در تیکت {ticket.code}",
          changes={"body": html_to_text(message.body)[:500]}, ip=ctx.meta.ip if ctx.meta else None)


def add_ticket_attachments(ctx: TicketContext, ticket: Ticket, files: list[UploadFile],
                           internal: bool = False) -> list[TicketAttachment]:
    perms = permissions_for(ctx, ticket)
    if not perms["upload"] or (internal and not perms["internal_note"]):
        raise PermissionDenied("شما مجوز بارگذاری فایل برای این تیکت را ندارید.")
    if not files:
        raise ValidationFailed("هیچ فایلی انتخاب نشده است.")
    attachments = _store_attachments(ctx, ticket, files, internal=internal)
    _activity(ctx, ticket, "attachment_added", "attachments", None, ", ".join(a.original_name for a in attachments),
              internal=internal)
    ticket.updated_at = utcnow()
    return attachments


def ticket_attachments(ctx: TicketContext, ticket: Ticket) -> list[TicketAttachment]:
    stmt = (select(TicketAttachment).outerjoin(TicketMessage, TicketMessage.id == TicketAttachment.message_id)
            .where(TicketAttachment.ticket_id == ticket.id, TicketAttachment.company_id == ctx.company_id,
                   TicketMessage.deleted_at.is_(None))
            .order_by(TicketAttachment.created_at))
    if ctx.user.is_customer:
        stmt = stmt.where(TicketAttachment.is_internal.is_(False))
    return list(ctx.db.scalars(stmt).unique())


def get_attachment(ctx: TicketContext, attachment_id: str) -> TicketAttachment:
    attachment = AttachmentRepository(ctx.db, ctx.company_id).get(attachment_id)
    if attachment is None:
        raise NotFound("فایل یافت نشد.")
    get_visible_ticket(ctx, attachment.ticket_id)  # enforces ticket visibility
    if attachment.is_internal and ctx.user.is_customer:
        raise NotFound("فایل یافت نشد.")
    if attachment.message_id:
        message = ctx.db.get(TicketMessage, attachment.message_id)
        if message and message.deleted_at:
            raise NotFound("فایل یافت نشد.")
    return attachment


def list_activities(ctx: TicketContext, ticket: Ticket) -> list[TicketActivity]:
    stmt = select(TicketActivity).where(TicketActivity.ticket_id == ticket.id,
                                        TicketActivity.company_id == ctx.company_id)
    if ctx.user.is_customer:
        stmt = stmt.where(TicketActivity.is_internal.is_(False))
    return list(ctx.db.scalars(stmt.order_by(TicketActivity.created_at.desc())).unique())


def rate_ticket(ctx: TicketContext, ticket: Ticket, rating: int, feedback: str | None) -> CustomerRating:
    if not permissions_for(ctx, ticket)["rate"]:
        raise PermissionDenied("امکان ثبت امتیاز برای این تیکت وجود ندارد.")
    record = CustomerRating(company_id=ctx.company_id, ticket_id=ticket.id, customer_id=ctx.user.id,
                            agent_id=ticket.assigned_agent_id, department_id=ticket.department_id, rating=rating,
                            feedback=(feedback or "").strip() or None)
    ctx.db.add(record)
    _activity(ctx, ticket, "rated", "rating", None, str(rating))
    ctx.db.flush()
    return record


def customer_stats(ctx: TicketContext) -> dict:
    rows = ctx.db.execute(
        select(TicketStatus.state, TicketStatus.code, func.count())
        .join(Ticket, Ticket.status_id == TicketStatus.id)
        .where(Ticket.company_id == ctx.company_id, Ticket.deleted_at.is_(None),
               visibility_filter(ctx.tenant, ctx.company))
        .group_by(TicketStatus.state, TicketStatus.code)
    ).all()
    stats = {"total": 0, "open": 0, "pending": 0, "resolved": 0, "closed": 0}
    for state, _code, count in rows:
        stats["total"] += count
        stats[state] = stats.get(state, 0) + count
    return stats


def agents_for_company(db: Session, company_id: str) -> list[User]:
    return list(db.scalars(eligible_agents_query(company_id).order_by(User.full_name)).unique())


def auto_close_resolved(db: Session) -> int:
    """Close tickets that stayed resolved longer than the company's auto-close window."""
    closed_total = 0
    for company in db.scalars(select(Company).where(Company.deleted_at.is_(None), Company.is_active.is_(True))):
        days = company_setting(company, "auto_close_resolved_days") or 0
        if days <= 0:
            continue
        closed_status = db.scalars(select(TicketStatus).where(TicketStatus.company_id == company.id,
                                                              TicketStatus.state == StatusState.CLOSED)
                                   .order_by(TicketStatus.sort_order)).first()
        if closed_status is None:
            continue
        cutoff = utcnow() - timedelta(days=days)
        tickets = db.scalars(
            select(Ticket).join(TicketStatus, TicketStatus.id == Ticket.status_id)
            .where(Ticket.company_id == company.id, Ticket.deleted_at.is_(None),
                   TicketStatus.state == StatusState.RESOLVED, Ticket.resolved_at < cutoff).limit(500)
        ).unique().all()
        for ticket in tickets:
            ticket.status_id = closed_status.id
            ticket.status = closed_status
            ticket.closed_at = utcnow()
            db.add(TicketActivity(company_id=company.id, ticket_id=ticket.id, action="auto_closed", field="status",
                                  old_value="حل شده", new_value=closed_status.name))
            closed_total += 1
        db.commit()
    return closed_total

