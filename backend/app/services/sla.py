"""SLA engine: rule matching, due-date calculation with business hours, pause/resume and status evaluation."""
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.base import utcnow
from app.models import Company, Holiday, SlaRule, SlaStatus, StatusState, Ticket
from app.utils.business_hours import BusinessCalendar

logger = logging.getLogger("app.sla")


def calendar_for(db: Session, company: Company) -> BusinessCalendar:
    today = utcnow().date()
    holidays = set(db.scalars(select(Holiday.date).where(
        Holiday.company_id == company.id, Holiday.date >= today - timedelta(days=400))))
    return BusinessCalendar(company.working_hours or {}, holidays, company.timezone or "Asia/Tehran")


def find_rule(db: Session, company_id: str, priority_id: str | None, department_id: str | None) -> SlaRule | None:
    rules = db.scalars(select(SlaRule).where(SlaRule.company_id == company_id, SlaRule.is_active.is_(True))).all()
    best, best_score = None, -1
    for rule in rules:
        if rule.priority_id and rule.priority_id != priority_id:
            continue
        if rule.department_id and rule.department_id != department_id:
            continue
        score = (2 if rule.priority_id else 0) + (1 if rule.department_id else 0)
        if score > best_score:
            best, best_score = rule, score
    return best


def _add(calendar: BusinessCalendar, rule: SlaRule, start: datetime, minutes: int) -> datetime:
    if rule.business_hours_only:
        return calendar.add_minutes(start, minutes)
    return start + timedelta(minutes=minutes)


def apply_sla(db: Session, company: Company, ticket: Ticket, calendar: BusinessCalendar | None = None) -> None:
    """(Re)compute SLA deadlines from the ticket creation time. Used on create and on priority/department change."""
    rule = find_rule(db, company.id, ticket.priority_id, ticket.department_id)
    ticket.sla_rule_id = rule.id if rule else None
    if rule is None:
        ticket.first_response_due_at = None
        ticket.resolution_due_at = None
        ticket.sla_status = SlaStatus.NONE
        return
    calendar = calendar or calendar_for(db, company)
    start = ticket.created_at or utcnow()
    ticket.first_response_due_at = _add(calendar, rule, start, rule.first_response_minutes)
    ticket.resolution_due_at = _add(calendar, rule, start, rule.resolution_minutes)
    ticket.sla_warning_notified = False
    ticket.sla_breach_notified = False
    evaluate(ticket, rule)


def evaluate(ticket: Ticket, rule: SlaRule | None = None, now: datetime | None = None) -> str:
    """Compute and store the ticket's SLA status. Returns the new status."""
    now = now or utcnow()
    state = ticket.status.state if ticket.status else StatusState.OPEN
    if not ticket.resolution_due_at:
        ticket.sla_status = SlaStatus.NONE
        return ticket.sla_status
    if state in (StatusState.RESOLVED, StatusState.CLOSED):
        ticket.sla_status = SlaStatus.BREACHED if (ticket.resolution_breached or ticket.first_response_breached) \
            else SlaStatus.MET
        return ticket.sla_status
    if ticket.sla_paused_at:
        ticket.sla_status = SlaStatus.PAUSED
        return ticket.sla_status

    if not ticket.first_responded_at and ticket.first_response_due_at and now > ticket.first_response_due_at:
        ticket.first_response_breached = True
    if now > ticket.resolution_due_at:
        ticket.resolution_breached = True
    if ticket.first_response_breached or ticket.resolution_breached:
        ticket.sla_status = SlaStatus.BREACHED
        return ticket.sla_status

    warning_percent = (rule.warning_percent if rule else 75) / 100
    target = ticket.first_response_due_at if not ticket.first_responded_at else ticket.resolution_due_at
    start = ticket.created_at or now
    total = (target - start).total_seconds() if target else 0
    elapsed = (now - start).total_seconds()
    ticket.sla_status = SlaStatus.WARNING if total > 0 and elapsed / total >= warning_percent else SlaStatus.HEALTHY
    return ticket.sla_status


def on_status_change(db: Session, company: Company, ticket: Ticket, old_status, new_status) -> None:
    now = utcnow()
    rule = db.get(SlaRule, ticket.sla_rule_id) if ticket.sla_rule_id else None
    # pause / resume
    if new_status.pauses_sla and not ticket.sla_paused_at and ticket.resolution_due_at:
        ticket.sla_paused_at = now
    elif not new_status.pauses_sla and ticket.sla_paused_at:
        calendar = calendar_for(db, company)
        if rule and rule.business_hours_only:
            paused = calendar.minutes_between(ticket.sla_paused_at, now)
            if ticket.resolution_due_at:
                ticket.resolution_due_at = calendar.add_minutes(ticket.resolution_due_at, paused)
            if ticket.first_response_due_at and not ticket.first_responded_at:
                ticket.first_response_due_at = calendar.add_minutes(ticket.first_response_due_at, paused)
        else:
            delta = now - ticket.sla_paused_at
            if ticket.resolution_due_at:
                ticket.resolution_due_at += delta
            if ticket.first_response_due_at and not ticket.first_responded_at:
                ticket.first_response_due_at += delta
        ticket.sla_paused_at = None
    evaluate(ticket, rule, now)


def record_first_response(ticket: Ticket, now: datetime | None = None) -> None:
    now = now or utcnow()
    if ticket.first_responded_at:
        return
    ticket.first_responded_at = now
    if ticket.first_response_due_at and now > ticket.first_response_due_at:
        ticket.first_response_breached = True


def remaining_seconds(ticket: Ticket, now: datetime | None = None) -> int | None:
    now = now or utcnow()
    target = ticket.first_response_due_at if not ticket.first_responded_at else ticket.resolution_due_at
    return int((target - now).total_seconds()) if target else None


def scan_and_notify(db: Session, batch_size: int = 500) -> tuple[int, int]:
    """Periodic job: re-evaluate active tickets and send warning/breach notifications once."""
    from app.services.notifications import TicketNotifier

    warnings = breaches = 0
    rules: dict[str, SlaRule | None] = {}
    last_id = ""
    while True:
        tickets = db.scalars(
            select(Ticket).where(Ticket.deleted_at.is_(None),
                                 Ticket.sla_status.in_([SlaStatus.HEALTHY, SlaStatus.WARNING, SlaStatus.BREACHED]),
                                 Ticket.id > last_id)
            .order_by(Ticket.id).limit(batch_size)
        ).unique().all()
        if not tickets:
            break
        for ticket in tickets:
            last_id = ticket.id
            if ticket.sla_rule_id not in rules:
                rules[ticket.sla_rule_id] = db.get(SlaRule, ticket.sla_rule_id) if ticket.sla_rule_id else None
            status = evaluate(ticket, rules[ticket.sla_rule_id])
            if status == SlaStatus.WARNING and not ticket.sla_warning_notified:
                ticket.sla_warning_notified = True
                TicketNotifier(db, ticket).sla_warning()
                warnings += 1
            elif status == SlaStatus.BREACHED and not ticket.sla_breach_notified:
                ticket.sla_breach_notified = True
                ticket.sla_warning_notified = True
                TicketNotifier(db, ticket).sla_breached()
                breaches += 1
        db.commit()
    return warnings, breaches
