"""Knowledge base and FAQ."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, LongText, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKey, utcnow


class KnowledgeBaseCategory(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "knowledge_base_categories"
    __table_args__ = (UniqueConstraint("company_id", "slug"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ArticleStatus:
    DRAFT = "draft"
    PUBLISHED = "published"


class KnowledgeBaseArticle(UUIDPrimaryKey, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "knowledge_base_articles"
    __table_args__ = (
        UniqueConstraint("company_id", "slug"),
        Index("ix_kb_articles_company_status", "company_id", "status", "views"),
    )

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("knowledge_base_categories.id", ondelete="SET NULL"), index=True
    )
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(280), nullable=False)
    summary: Mapped[str | None] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(LongText, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=ArticleStatus.DRAFT, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    helpful_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    not_helpful_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime)

    category = relationship("KnowledgeBaseCategory", lazy="joined")
    author = relationship("User", lazy="joined")


class KnowledgeBaseFeedback(UUIDPrimaryKey, Base):
    __tablename__ = "knowledge_base_feedback"
    __table_args__ = (UniqueConstraint("article_id", "user_id"),)

    article_id: Mapped[str] = mapped_column(ForeignKey("knowledge_base_articles.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class FaqCategory(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "faq_categories"

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class Faq(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "faqs"
    __table_args__ = (Index("ix_faqs_company_order", "company_id", "category_id", "sort_order"),)

    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("faq_categories.id", ondelete="SET NULL"))
    question: Mapped[str] = mapped_column(String(500), nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category = relationship("FaqCategory", lazy="joined")
