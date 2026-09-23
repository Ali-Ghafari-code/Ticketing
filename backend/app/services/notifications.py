"""Notification dispatching.

In-app notifications are written inside the current transaction. Email and SMS
are queued with ``run_after_commit`` so external calls never block the request
and never fire for rolled-back work. Channel choice honours both the company
toggles and each user's personal notification settings.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.core.tasks import run_after_commit
from app.models import (
    Company,
    Department,
    Notification,
    NotificationEvent,
    NotificationSetting,
    Ticket,
    User,
)
from app.services.company import company_setting
from app.services.email import email_service
from app.services.sms import sms_service
from app.services.sms.templates import SMS_TEMPLATES
from app.utils.html import html_to_text

# Defaults when a user never customised their settings: (in_app, email, sms)
_STAFF_DEFAULTS = {
    NotificationEvent.TICKET_CREATED: (True, False, False),
    NotificationEvent.TICKET_REPLY: (True, True, False),
    NotificationEvent.TICKET_ASSIGNED: (True, True, True),
    NotificationEvent.TICKET_STATUS_CHANGED: (True, False, False),
    NotificationEvent.TICKET_ESCALATED: (True, True, True),
    NotificationEvent.SLA_WARNING: (True, True, False),
    NotificationEvent.SLA_BREACHED: (True, True, True),
    NotificationEvent.TICKET_RESOLVED: (True, False, False),
    NotificationEvent.TICKET_CLOSED: (True, False, False),
    NotificationEvent.MENTION: (True, True, False),
}
_CUSTOMER_DEFAULTS = {
    NotificationEvent.TICKET_CREATED: (True, True, True),
    NotificationEvent.TICKET_REPLY: (True, True, True),
    NotificationEvent.TICKET_STATUS_CHANGED: (True, False, False),
    NotificationEvent.TICKET_RESOLVED: (True, True, True),
    NotificationEvent.TICKET_CLOSED: (True, True, False),
}
CUSTOMER_EVENTS = tuple(_CUSTOMER_DEFAULTS.keys())
STAFF_EVENTS = tuple(_STAFF_DEFAULTS.keys())


def default_channels(user: User, event: str) -> tuple[bool, bool, bool]:
    table = _CUSTOMER_DEFAULTS if user.is_customer else _STAFF_DEFAULTS
    return table.get(event, (True, False, False))


def user_settings(db: Session, user: User) -> list[dict]:
    stored = {s.event: s for s in db.scalars(select(NotificationSetting).where(NotificationSetting.user_id == user.id))}
    events = CUSTOMER_EVENTS if user.is_customer else STAFF_EVENTS
    items = []
    for event in events:
        in_app, email, sms = default_channels(user, event)
        if event in stored:
            s = stored[event]
            in_app, email, sms = s.in_app, s.email, s.sms
        items.append({"event": event, "label": NotificationEvent.LABELS[event], "in_app": in_app, "email": email,
                      "sms": sms})
    return items


@dataclass
class Payload:
    event: str
    title: str
    body: str | None
    link_staff: str | None
    link_customer: str | None
    email_template: str | None
    sms_template: str | None
    context: dict


def dispatch(db: Session, company: Company | None, recipients: list[User], payload: Payload,
             exclude_user_id: str | None = None) -> None:
    seen: set[str] = set()
    targets = [u for u in recipients if u and u.is_active and u.deleted_at is None and u.id != exclude_user_id
               and not (u.id in seen or seen.add(u.id))]
    if not targets:
        return
    stored = {
        (s.user_id, s.event): s
        for s in db.scalars(select(NotificationSetting).where(
            NotificationSetting.user_id.in_([u.id for u in targets]), NotificationSetting.event == payload.event))
    }
    email_on = company_setting(company, "notify_email_enabled") if company else True
    sms_on = company_setting(company, "notify_sms_enabled") if company else True
    sms_overrides = company_setting(company, "sms_templates") if company else {}
    email_overrides = company_setting(company, "email_templates") if company else {}

    for user in targets:
        pref = stored.get((user.id, payload.event))
        in_app, email, sms = (pref.in_app, pref.email, pref.sms) if pref else default_channels(user, payload.event)
        link = payload.link_customer if user.is_customer else payload.link_staff
        if in_app:
            db.add(Notification(company_id=company.id if company else None, user_id=user.id, event=payload.event,
                                title=payload.title, body=payload.body, link=link,
                                data={k: v for k, v in payload.context.items() if k in ("ticket_id", "ticket_code")}))
        ctx = {**payload.context, "recipient_name": user.full_name,
               "link": f"{settings.FRONTEND_URL}{link}" if link else None}
        if email and email_on and user.email and payload.email_template:
            run_after_commit(db, email_service.send, user.email, payload.email_template, ctx, email_overrides)
        if sms and sms_on and user.mobile and payload.sms_template in SMS_TEMPLATES:
            run_after_commit(db, sms_service.send_template, user.mobile, payload.sms_template, ctx, sms_overrides)


class TicketNotifier:
    """Knows who should hear about what happens to a ticket."""

    def __init__(self, db: Session, ticket: Ticket, actor: User | None = None) -> None:
        self.db = db
        self.ticket = ticket
        self.actor = actor
        self.company = db.get(Company, ticket.company_id)

    # ----------------------------------------------------------- recipients
    def _department_staff(self) -> list[User]:
        if not self.ticket.department_id:
            return []
        dept = self.db.get(Department, self.ticket.department_id)
        if not dept:
            return []
        people = list(dept.members)
        if dept.manager:
            people.append(dept.manager)
        return people

    def _managers(self) -> list[User]:
        from app.services.tickets import users_with_permission

        return users_with_permission(self.db, self.ticket.company_id, "tickets.view_all")

    def _support_team(self) -> list[User]:
        if self.ticket.assigned_agent:
            return [self.ticket.assigned_agent]
        return self._department_staff() or self._managers()

    def _context(self, **extra) -> dict:
        t = self.ticket
        return {
            "company": self.company.name if self.company else settings.APP_NAME,
            "primary_color": self.company.primary_color if self.company else None,
            "ticket_id": t.id,
            "ticket_code": t.code,
            "subject": t.subject,
            "subject_line": t.subject,
            "status": t.status.name if t.status else "",
            "priority": t.priority.name if t.priority else "",
            **extra,
        }

    def _payload(self, event: str, title: str, body: str | None = None, email: str | None = None,
                 sms: str | None = None, **extra) -> Payload:
        return Payload(event, title, body, f"/tickets/{self.ticket.id}", f"/portal/tickets/{self.ticket.id}",
                       email, sms, self._context(**extra))

    def _send(self, recipients: list[User], payload: Payload) -> None:
        dispatch(self.db, self.company, recipients, payload, exclude_user_id=self.actor.id if self.actor else None)

    # ----------------------------------------------------------- events
    def created(self) -> None:
        t = self.ticket
        self._send([t.customer], self._payload(
            NotificationEvent.TICKET_CREATED, f"تیکت {t.code} ثبت شد", t.subject, "ticket_created", "ticket_created"))
        self._send(self._support_team(), self._payload(
            NotificationEvent.TICKET_CREATED, f"تیکت جدید: {t.subject}", f"{t.customer.full_name} — {t.code}",
            "ticket_created", None))

    def replied(self, message_body: str, *, internal: bool, by_customer: bool, mentions: list[User]) -> None:
        t = self.ticket
        excerpt = html_to_text(message_body)[:300]
        if mentions:
            self._send(mentions, self._payload(
                NotificationEvent.MENTION, f"{self.actor.full_name if self.actor else ''} در تیکت {t.code} به شما اشاره کرد",
                excerpt, "mention", None, excerpt=excerpt))
        if internal:
            return
        if by_customer:
            self._send(self._support_team(), self._payload(
                NotificationEvent.TICKET_REPLY, f"پاسخ جدید مشتری در {t.code}", excerpt, "ticket_reply", None,
                excerpt=excerpt))
        else:
            self._send([t.customer], self._payload(
                NotificationEvent.TICKET_REPLY, f"پاسخ جدید برای تیکت {t.code}", excerpt, "ticket_reply",
                "ticket_reply", excerpt=excerpt))

    def assigned(self, agent: User) -> None:
        t = self.ticket
        self._send([agent], self._payload(
            NotificationEvent.TICKET_ASSIGNED, f"تیکت {t.code} به شما ارجاع شد", t.subject, "ticket_assigned",
            "ticket_assigned"))

    def status_changed(self, old_name: str, new_status) -> None:
        t = self.ticket
        if new_status.state == "resolved":
            event, email, sms, title = NotificationEvent.TICKET_RESOLVED, "ticket_resolved", "ticket_resolved", \
                f"تیکت {t.code} حل شد"
        elif new_status.state == "closed":
            event, email, sms, title = NotificationEvent.TICKET_CLOSED, "ticket_closed", "ticket_closed", \
                f"تیکت {t.code} بسته شد"
        else:
            event, email, sms, title = NotificationEvent.TICKET_STATUS_CHANGED, "ticket_status_changed", None, \
                f"وضعیت تیکت {t.code}: {new_status.name}"
        body = f"{old_name} ← {new_status.name}"
        self._send([t.customer], self._payload(event, title, body, email, sms))
        staff = [t.assigned_agent] if t.assigned_agent else []
        self._send(staff, self._payload(event, title, body, None, None))

    def escalated(self, reason: str) -> None:
        t = self.ticket
        recipients = [u for u in [t.assigned_agent] if u] + self._department_staff() + self._managers()
        self._send(recipients, self._payload(
            NotificationEvent.TICKET_ESCALATED, f"تیکت {t.code} به سطح {t.escalation_level} ارجاع شد", reason,
            "ticket_escalated", None, reason=reason))

    def sla_warning(self) -> None:
        t = self.ticket
        recipients = [t.assigned_agent] if t.assigned_agent else self._department_staff() or self._managers()
        self._send(recipients, self._payload(
            NotificationEvent.SLA_WARNING, f"هشدار SLA: {t.code}", "مهلت پاسخگویی رو به اتمام است.", "sla_warning",
            "sla_warning"))

    def sla_breached(self) -> None:
        t = self.ticket
        dept = self.db.get(Department, t.department_id) if t.department_id else None
        recipients = [u for u in [t.assigned_agent, dept.manager if dept else None] if u] or self._managers()
        self._send(recipients, self._payload(
            NotificationEvent.SLA_BREACHED, f"نقض SLA: {t.code}", "مهلت SLA این تیکت به پایان رسیده است.",
            "sla_breached", "sla_breached"))
