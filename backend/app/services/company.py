"""Tenant bootstrap: default statuses, priorities, SLA rules and support settings."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import PlanLimitExceeded
from app.database.base import utcnow
from app.models import Company, SlaRule, Ticket, TicketPriority, TicketStatus, User, UserType

DEFAULT_COMPANY_SETTINGS: dict = {
    "allow_registration": True,
    "allow_customer_close": True,
    "allow_customer_reopen": True,
    "reopen_window_days": 7,
    "auto_close_resolved_days": 3,
    "require_category": False,
    "customer_can_select_priority": True,
    "customer_can_select_department": True,
    "default_assignment_strategy": "round_robin",
    "auto_assign_enabled": True,
    "agent_can_view_department_tickets": True,
    "message_edit_window_minutes": 15,
    "rating_enabled": True,
    "kb_enabled": True,
    "kb_suggest_before_ticket": True,
    "notify_email_enabled": True,
    "notify_sms_enabled": True,
    "sms_templates": {},
    "email_templates": {},
    "session_timeout_days": 14,
    "require_mobile_verification": False,
    "require_email_verification": False,
}

DEFAULT_STATUSES = [
    # code, name, color, state, is_default, pauses_sla
    ("new", "جدید", "#3B82F6", "open", True, False),
    ("in_progress", "در حال بررسی", "#8B5CF6", "open", False, False),
    ("pending_customer", "در انتظار پاسخ مشتری", "#F59E0B", "pending", False, True),
    ("pending_support", "در انتظار پاسخ پشتیبانی", "#0EA5E9", "open", False, False),
    ("escalated", "ارجاع شده", "#EF4444", "open", False, False),
    ("resolved", "حل شده", "#10B981", "resolved", False, False),
    ("closed", "بسته شده", "#6B7280", "closed", False, False),
]

DEFAULT_PRIORITIES = [
    # code, name, color, level, is_default
    ("low", "کم", "#64748B", 1, False),
    ("medium", "متوسط", "#0EA5E9", 2, True),
    ("high", "زیاد", "#F59E0B", 3, False),
    ("urgent", "فوری", "#EF4444", 4, False),
]

# priority code -> (first response minutes, resolution minutes, business hours only)
DEFAULT_SLA = {
    "urgent": (15, 240, False),
    "high": (60, 480, True),
    "medium": (240, 1440, True),
    "low": (480, 2880, True),
}


def company_setting(company: Company, key: str):
    return (company.settings or {}).get(key, DEFAULT_COMPANY_SETTINGS.get(key))


def bootstrap_company(db: Session, company: Company) -> None:
    company.settings = {**DEFAULT_COMPANY_SETTINGS, **(company.settings or {})}
    if not db.scalar(select(func.count()).select_from(TicketStatus).where(TicketStatus.company_id == company.id)):
        for order, (code, name, color, state, default, pauses) in enumerate(DEFAULT_STATUSES):
            db.add(TicketStatus(company_id=company.id, code=code, name=name, color=color, state=state,
                                is_default=default, pauses_sla=pauses, is_system=True, sort_order=order))
    priorities = {}
    if not db.scalar(select(func.count()).select_from(TicketPriority).where(TicketPriority.company_id == company.id)):
        for order, (code, name, color, level, default) in enumerate(DEFAULT_PRIORITIES):
            prio = TicketPriority(company_id=company.id, code=code, name=name, color=color, level=level,
                                  is_default=default, is_system=True, sort_order=order)
            db.add(prio)
            priorities[code] = prio
        db.flush()
        for code, (frt, rt, bh) in DEFAULT_SLA.items():
            db.add(SlaRule(company_id=company.id, name=f"SLA اولویت {priorities[code].name}",
                           priority_id=priorities[code].id, first_response_minutes=frt, resolution_minutes=rt,
                           business_hours_only=bh))
    db.flush()


def ensure_agent_capacity(db: Session, company: Company) -> None:
    plan = company.plan
    if plan and plan.max_agents:
        count = db.scalar(select(func.count()).select_from(User).where(
            User.company_id == company.id, User.user_type == UserType.STAFF, User.deleted_at.is_(None)))
        if (count or 0) >= plan.max_agents:
            raise PlanLimitExceeded(f"پلن فعلی حداکثر {plan.max_agents} کاربر سازمانی را پشتیبانی می‌کند.")


def ensure_customer_capacity(db: Session, company: Company) -> None:
    plan = company.plan
    if plan and plan.max_customers:
        count = db.scalar(select(func.count()).select_from(User).where(
            User.company_id == company.id, User.user_type == UserType.CUSTOMER, User.deleted_at.is_(None)))
        if (count or 0) >= plan.max_customers:
            raise PlanLimitExceeded(f"پلن فعلی حداکثر {plan.max_customers} مشتری را پشتیبانی می‌کند.")


def ensure_ticket_capacity(db: Session, company: Company) -> None:
    plan = company.plan
    if plan and plan.max_tickets_per_month:
        now = utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        count = db.scalar(select(func.count()).select_from(Ticket).where(
            Ticket.company_id == company.id, Ticket.created_at >= month_start))
        if (count or 0) >= plan.max_tickets_per_month:
            raise PlanLimitExceeded("سقف تعداد تیکت ماهانه پلن اشتراک این سازمان تکمیل شده است.")
    if company.subscription_status in ("expired", "suspended"):
        raise PlanLimitExceeded("اشتراک این سازمان فعال نیست. لطفاً با مدیر سامانه تماس بگیرید.")
