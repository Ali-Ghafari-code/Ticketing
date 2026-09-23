"""Per-company ticket configuration: statuses, priorities, categories, tags and SLA rules."""
from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKey


class StatusState:
    """Semantic state every (possibly custom) status maps to."""

    OPEN = "open"
    PENDING = "pending"
    RESOLVED = "resolved"
    CLOSED = "closed"
    ALL = (OPEN, PENDING, RESOLVED, CLOSED)


class TicketStatus(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "ticket_statuses"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#64748B", nullable=False)
    state: Mapped[str] = mapped_column(String(20), default=StatusState.OPEN, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pauses_sla: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TicketPriority(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "ticket_priorities"
    __table_args__ = (UniqueConstraint("company_id", "code"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#64748B", nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TicketCategory(UUIDPrimaryKey, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "ticket_categories"
    __table_args__ = (Index("ix_ticket_categories_company_parent", "company_id", "parent_id"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("ticket_categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    default_agent_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    default_priority_id: Mapped[str | None] = mapped_column(ForeignKey("ticket_priorities.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    department = relationship("Department", lazy="joined")


class TicketTag(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "ticket_tags"
    __table_args__ = (UniqueConstraint("company_id", "name"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    color: Mapped[str] = mapped_column(String(9), default="#64748B", nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


class SlaRule(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "sla_rules"
    __table_args__ = (Index("ix_sla_rules_lookup", "company_id", "is_active", "priority_id", "department_id"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"))
    priority_id: Mapped[str | None] = mapped_column(ForeignKey("ticket_priorities.id", ondelete="CASCADE"))
    first_response_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    warning_percent: Mapped[int] = mapped_column(Integer, default=75, nullable=False)
    business_hours_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    department = relationship("Department", lazy="joined")
    priority = relationship("TicketPriority", lazy="joined")
