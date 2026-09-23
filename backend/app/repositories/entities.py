"""Concrete repositories for tenant-owned entities."""
from sqlalchemy import Select, select

from app.models import (
    Department,
    Faq,
    FaqCategory,
    Holiday,
    KnowledgeBaseArticle,
    KnowledgeBaseCategory,
    SlaRule,
    Ticket,
    TicketAttachment,
    TicketCategory,
    TicketMessage,
    TicketPriority,
    TicketStatus,
    TicketTag,
    User,
    UserType,
)
from app.repositories.base import TenantRepository


class DepartmentRepository(TenantRepository[Department]):
    model = Department
    not_found_message = "دپارتمان یافت نشد."


class CategoryRepository(TenantRepository[TicketCategory]):
    model = TicketCategory
    not_found_message = "دسته‌بندی یافت نشد."


class StatusRepository(TenantRepository[TicketStatus]):
    model = TicketStatus
    not_found_message = "وضعیت یافت نشد."

    def by_code(self, code: str) -> TicketStatus | None:
        return self.db.scalar(self.scoped().where(TicketStatus.code == code))

    def default(self) -> TicketStatus:
        status = self.db.scalar(
            self.scoped().where(TicketStatus.is_default.is_(True), TicketStatus.is_active.is_(True))
        )
        return status or self.db.scalars(self.scoped().order_by(TicketStatus.sort_order)).first()  # type: ignore

    def first_in_state(self, state: str) -> TicketStatus | None:
        return self.db.scalars(
            self.scoped()
            .where(TicketStatus.state == state, TicketStatus.is_active.is_(True))
            .order_by(TicketStatus.sort_order)
        ).first()


class PriorityRepository(TenantRepository[TicketPriority]):
    model = TicketPriority
    not_found_message = "اولویت یافت نشد."

    def default(self) -> TicketPriority:
        prio = self.db.scalar(
            self.scoped().where(TicketPriority.is_default.is_(True), TicketPriority.is_active.is_(True))
        )
        return prio or self.db.scalars(self.scoped().order_by(TicketPriority.level)).first()  # type: ignore


class TagRepository(TenantRepository[TicketTag]):
    model = TicketTag
    not_found_message = "برچسب یافت نشد."

    def many(self, ids: list[str]) -> list[TicketTag]:
        if not ids:
            return []
        return list(self.db.scalars(self.scoped().where(TicketTag.id.in_(ids))))


class SlaRuleRepository(TenantRepository[SlaRule]):
    model = SlaRule
    not_found_message = "قانون SLA یافت نشد."


class HolidayRepository(TenantRepository[Holiday]):
    model = Holiday
    not_found_message = "تعطیلی یافت نشد."


class TicketRepository(TenantRepository[Ticket]):
    model = Ticket
    not_found_message = "تیکت یافت نشد."


class MessageRepository(TenantRepository[TicketMessage]):
    model = TicketMessage
    not_found_message = "پیام یافت نشد."

    def scoped(self) -> Select:
        # messages keep deleted rows visible as "deleted" placeholders; do not filter deleted_at
        return select(TicketMessage).where(TicketMessage.company_id == self.company_id)


class AttachmentRepository(TenantRepository[TicketAttachment]):
    model = TicketAttachment
    not_found_message = "فایل پیوست یافت نشد."


class KbCategoryRepository(TenantRepository[KnowledgeBaseCategory]):
    model = KnowledgeBaseCategory
    not_found_message = "دسته‌بندی مقاله یافت نشد."


class KbArticleRepository(TenantRepository[KnowledgeBaseArticle]):
    model = KnowledgeBaseArticle
    not_found_message = "مقاله یافت نشد."


class FaqRepository(TenantRepository[Faq]):
    model = Faq
    not_found_message = "سوال متداول یافت نشد."


class FaqCategoryRepository(TenantRepository[FaqCategory]):
    model = FaqCategory
    not_found_message = "دسته‌بندی سوالات یافت نشد."


class UserRepository(TenantRepository[User]):
    model = User
    not_found_message = "کاربر یافت نشد."

    def staff(self) -> Select:
        return self.scoped().where(User.user_type == UserType.STAFF)

    def customers(self) -> Select:
        return self.scoped().where(User.user_type == UserType.CUSTOMER)

    def get_staff(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        return self.db.scalar(self.staff().where(User.id == user_id))

    def get_customer(self, user_id: str | None) -> User | None:
        if not user_id:
            return None
        return self.db.scalar(self.customers().where(User.id == user_id))
