"""Tickets, conversation messages, attachments, history and ratings."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, LongText, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKey, new_uuid, utcnow

ticket_tag_relations = Table(
    "ticket_tag_relations",
    Base.metadata,
    Column("ticket_id", ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("ticket_tags.id", ondelete="CASCADE"), primary_key=True, index=True),
)

message_mentions = Table(
    "ticket_message_mentions",
    Base.metadata,
    Column("message_id", ForeignKey("ticket_messages.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class SlaStatus:
    NONE = "none"
    HEALTHY = "healthy"
    WARNING = "warning"
    BREACHED = "breached"
    PAUSED = "paused"
    MET = "met"
    ALL = (NONE, HEALTHY, WARNING, BREACHED, PAUSED, MET)


class Ticket(UUIDPrimaryKey, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("company_id", "number"),
        Index("ix_tickets_company_status", "company_id", "status_id", "updated_at"),
        Index("ix_tickets_company_priority", "company_id", "priority_id"),
        Index("ix_tickets_company_agent", "company_id", "assigned_agent_id", "status_id"),
        Index("ix_tickets_company_customer", "company_id", "customer_id", "created_at"),
        Index("ix_tickets_company_department", "company_id", "department_id"),
        Index("ix_tickets_company_category", "company_id", "category_id"),
        Index("ix_tickets_company_created", "company_id", "created_at"),
        Index("ix_tickets_company_sla", "company_id", "sla_status"),
        Index("ix_tickets_sla_scan", "sla_status", "resolution_due_at"),
    )

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(LongText, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="web", nullable=False)

    customer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assigned_agent_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    category_id: Mapped[str | None] = mapped_column(ForeignKey("ticket_categories.id", ondelete="SET NULL"))
    priority_id: Mapped[str] = mapped_column(ForeignKey("ticket_priorities.id", ondelete="RESTRICT"), nullable=False)
    status_id: Mapped[str] = mapped_column(ForeignKey("ticket_statuses.id", ondelete="RESTRICT"), nullable=False)

    due_date: Mapped[datetime | None] = mapped_column(DateTime)
    last_response_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_customer_reply_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_agent_reply_at: Mapped[datetime | None] = mapped_column(DateTime)
    first_responded_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # SLA tracking
    sla_rule_id: Mapped[str | None] = mapped_column(ForeignKey("sla_rules.id", ondelete="SET NULL"))
    first_response_due_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime)
    sla_status: Mapped[str] = mapped_column(String(20), default=SlaStatus.NONE, nullable=False)
    sla_paused_at: Mapped[datetime | None] = mapped_column(DateTime)
    sla_warning_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sla_breach_notified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    first_response_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolution_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime)
    reopened_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    customer = relationship("User", foreign_keys=[customer_id], lazy="joined")
    assigned_agent = relationship("User", foreign_keys=[assigned_agent_id], lazy="joined")
    created_by = relationship("User", foreign_keys=[created_by_id], lazy="select")
    department = relationship("Department", lazy="joined")
    category = relationship("TicketCategory", lazy="joined")
    priority = relationship("TicketPriority", lazy="joined")
    status = relationship("TicketStatus", lazy="joined")
    tags = relationship("TicketTag", secondary=ticket_tag_relations, lazy="selectin")
    rating = relationship("CustomerRating", uselist=False, back_populates="ticket", lazy="select")


class MessageKind:
    REPLY = "reply"
    NOTE = "note"
    SYSTEM = "system"


class TicketMessage(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "ticket_messages"
    __table_args__ = (Index("ix_ticket_messages_ticket_created", "ticket_id", "created_at"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(10), default=MessageKind.REPLY, nullable=False)
    body: Mapped[str] = mapped_column(LongText, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)
    deleted_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    author = relationship("User", foreign_keys=[author_id], lazy="joined")
    attachments = relationship(
        "TicketAttachment", back_populates="message", lazy="selectin", order_by="TicketAttachment.created_at"
    )
    mentions = relationship("User", secondary=message_mentions, lazy="selectin")


class TicketAttachment(UUIDPrimaryKey, Base):
    __tablename__ = "ticket_attachments"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    message_id: Mapped[str | None] = mapped_column(ForeignKey("ticket_messages.id", ondelete="CASCADE"), index=True)
    uploaded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    message = relationship("TicketMessage", back_populates="attachments")
    uploaded_by = relationship("User", lazy="joined")


class TicketRead(Base):
    """Last time a user viewed a ticket. Drives read/unread state of messages."""

    __tablename__ = "ticket_reads"

    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    last_read_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class TicketActivity(Base):
    """Structured change history of a ticket (status, priority, assignment, ...)."""

    __tablename__ = "ticket_activities"
    __table_args__ = (Index("ix_ticket_activities_ticket_created", "ticket_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    field: Mapped[str | None] = mapped_column(String(50))
    old_value: Mapped[str | None] = mapped_column(String(255))
    new_value: Mapped[str | None] = mapped_column(String(255))
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    user = relationship("User", lazy="joined")


class CustomerRating(UUIDPrimaryKey, Base):
    __tablename__ = "customer_ratings"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="rating_range"),
        Index("ix_customer_ratings_company_created", "company_id", "created_at"),
    )

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), unique=True, nullable=False)
    customer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"), index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    ticket = relationship("Ticket", back_populates="rating")
    customer = relationship("User", foreign_keys=[customer_id], lazy="joined")
    agent = relationship("User", foreign_keys=[agent_id], lazy="joined")
