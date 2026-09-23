"""Departments and their members."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKey, utcnow

department_users = Table(
    "department_users",
    Base.metadata,
    Column("department_id", ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
    Column("created_at", DateTime, default=utcnow, nullable=False),
)


class AssignmentStrategy:
    MANUAL = "manual"
    ROUND_ROBIN = "round_robin"
    LEAST_LOADED = "least_loaded"
    ALL = (MANUAL, ROUND_ROBIN, LEAST_LOADED)


class Department(UUIDPrimaryKey, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "departments"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255))
    manager_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assignment_strategy: Mapped[str] = mapped_column(String(20), default=AssignmentStrategy.ROUND_ROBIN, nullable=False)
    last_assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    manager = relationship("User", foreign_keys=[manager_id], lazy="joined")
    members = relationship("User", secondary=department_users, back_populates="departments", lazy="selectin")
