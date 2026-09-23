"""Audit logging helper used across services."""
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


class AuditAction:
    LOGIN = "auth.login"
    LOGIN_FAILED = "auth.login_failed"
    LOGOUT = "auth.logout"
    REGISTER = "auth.register"
    PASSWORD_CHANGED = "auth.password_changed"
    PASSWORD_RESET = "auth.password_reset"
    TOKEN_REUSE = "auth.token_reuse_detected"
    TICKET_CREATED = "ticket.created"
    TICKET_UPDATED = "ticket.updated"
    TICKET_STATUS = "ticket.status_changed"
    TICKET_PRIORITY = "ticket.priority_changed"
    TICKET_ASSIGNED = "ticket.assigned"
    TICKET_ESCALATED = "ticket.escalated"
    TICKET_DELETED = "ticket.deleted"
    MESSAGE_EDITED = "message.edited"
    MESSAGE_DELETED = "message.deleted"
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    USER_PASSWORD_RESET = "user.password_reset"
    CUSTOMER_CREATED = "customer.created"
    CUSTOMER_UPDATED = "customer.updated"
    CUSTOMER_DELETED = "customer.deleted"
    ROLE_CREATED = "role.created"
    ROLE_UPDATED = "role.updated"
    ROLE_DELETED = "role.deleted"
    PERMISSIONS_CHANGED = "role.permissions_changed"
    SETTINGS_UPDATED = "settings.updated"
    COMPANY_CREATED = "company.created"
    COMPANY_UPDATED = "company.updated"
    COMPANY_DELETED = "company.deleted"
    CONFIG_CHANGED = "config.changed"
    DATA_IMPORTED = "data.imported"
    DATA_EXPORTED = "data.exported"


def audit(
    db: Session,
    action: str,
    *,
    user: User | None = None,
    company_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    description: str | None = None,
    changes: dict[str, Any] | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    log = AuditLog(
        company_id=company_id if company_id is not None else (user.company_id if user else None),
        user_id=user.id if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        changes=changes,
        ip_address=ip,
        user_agent=(user_agent or "")[:500] or None,
    )
    db.add(log)
    return log


def diff(before: dict, after: dict) -> dict:
    return {k: {"old": before.get(k), "new": v} for k, v in after.items() if before.get(k) != v}
