"""Tenants (companies), subscription plans, holidays and global system settings."""
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKey, utcnow

DEFAULT_WORKING_HOURS = {
    # Iranian work week: Saturday..Wednesday full days, Thursday half day, Friday off.
    "saturday": {"enabled": True, "start": "08:00", "end": "17:00"},
    "sunday": {"enabled": True, "start": "08:00", "end": "17:00"},
    "monday": {"enabled": True, "start": "08:00", "end": "17:00"},
    "tuesday": {"enabled": True, "start": "08:00", "end": "17:00"},
    "wednesday": {"enabled": True, "start": "08:00", "end": "17:00"},
    "thursday": {"enabled": True, "start": "08:00", "end": "13:00"},
    "friday": {"enabled": False, "start": "08:00", "end": "17:00"},
}


class Plan(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "plans"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price_monthly: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_agents: Mapped[int | None] = mapped_column(Integer)
    max_customers: Mapped[int | None] = mapped_column(Integer)
    max_tickets_per_month: Mapped[int | None] = mapped_column(Integer)
    max_storage_mb: Mapped[int | None] = mapped_column(Integer)
    features: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Company(UUIDPrimaryKey, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "companies"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    logo_path: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(String(255))
    primary_color: Mapped[str] = mapped_column(String(9), default="#4F46E5", nullable=False)
    secondary_color: Mapped[str] = mapped_column(String(9), default="#0EA5E9", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Tehran", nullable=False)
    working_hours: Mapped[dict] = mapped_column(JSON, default=lambda: dict(DEFAULT_WORKING_HOURS), nullable=False)
    settings: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    ticket_prefix: Mapped[str] = mapped_column(String(10), default="TK", nullable=False)
    ticket_seq: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("plans.id", ondelete="SET NULL"))
    subscription_status: Mapped[str] = mapped_column(String(20), default="trial", nullable=False)
    subscription_ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    plan: Mapped[Plan | None] = relationship(lazy="joined")


class Holiday(UUIDPrimaryKey, Base):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("company_id", "date"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict | list | str | int | bool | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
