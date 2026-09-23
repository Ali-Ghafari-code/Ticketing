"""Generic tenant-aware repository.

Every query for tenant-owned data goes through ``scoped()`` which always adds
``company_id = :tenant`` — this is the single choke point that guarantees one
company can never read another company's rows.
"""
from typing import Any, Generic, TypeVar

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound
from app.database.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class TenantRepository(Generic[ModelT]):
    model: type[ModelT]
    not_found_message = "مورد درخواستی یافت نشد."

    def __init__(self, db: Session, company_id: str) -> None:
        self.db = db
        self.company_id = company_id

    def scoped(self) -> Select:
        stmt = select(self.model).where(self.model.company_id == self.company_id)  # type: ignore[attr-defined]
        if hasattr(self.model, "deleted_at"):
            stmt = stmt.where(self.model.deleted_at.is_(None))  # type: ignore[attr-defined]
        return stmt

    def get(self, obj_id: str | None) -> ModelT | None:
        if not obj_id:
            return None
        return self.db.scalar(self.scoped().where(self.model.id == obj_id))  # type: ignore[attr-defined]

    def get_or_404(self, obj_id: str | None, message: str | None = None) -> ModelT:
        obj = self.get(obj_id)
        if obj is None:
            raise NotFound(message or self.not_found_message)
        return obj

    def list(self, *order_by: Any) -> list[ModelT]:
        stmt = self.scoped()
        if order_by:
            stmt = stmt.order_by(*order_by)
        return list(self.db.scalars(stmt).unique())

    def add(self, obj: ModelT) -> ModelT:
        if getattr(obj, "company_id", None) is None:
            obj.company_id = self.company_id  # type: ignore[attr-defined]
        self.db.add(obj)
        self.db.flush()
        return obj

    def delete(self, obj: ModelT) -> None:
        if hasattr(obj, "soft_delete"):
            obj.soft_delete()  # type: ignore[attr-defined]
        else:
            self.db.delete(obj)
        self.db.flush()
