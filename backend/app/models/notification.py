"""In-app notifications and per-user delivery preferences."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, UUIDPrimaryKey, utcnow


class NotificationEvent:
    TICKET_CREATED = "ticket_created"
    TICKET_REPLY = "ticket_reply"
    TICKET_ASSIGNED = "ticket_assigned"
    TICKET_STATUS_CHANGED = "ticket_status_changed"
    TICKET_ESCALATED = "ticket_escalated"
    SLA_WARNING = "sla_warning"
    SLA_BREACHED = "sla_breached"
    TICKET_RESOLVED = "ticket_resolved"
    TICKET_CLOSED = "ticket_closed"
    MENTION = "mention"

    LABELS = {
        TICKET_CREATED: "تیکت جدید",
        TICKET_REPLY: "پاسخ جدید",
        TICKET_ASSIGNED: "ارجاع تیکت",
        TICKET_STATUS_CHANGED: "تغییر وضعیت تیکت",
        TICKET_ESCALATED: "ارجاع به سطح بالاتر",
        SLA_WARNING: "هشدار SLA",
        SLA_BREACHED: "نقض SLA",
        TICKET_RESOLVED: "حل شدن تیکت",
        TICKET_CLOSED: "بسته شدن تیکت",
        MENTION: "اشاره به شما",
    }
    ALL = tuple(LABELS.keys())


class Notification(UUIDPrimaryKey, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at", "created_at"),)

    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(500))
    data: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class NotificationSetting(UUIDPrimaryKey, Base):
    __tablename__ = "notification_settings"
    __table_args__ = (UniqueConstraint("user_id", "event"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    in_app: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sms: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
