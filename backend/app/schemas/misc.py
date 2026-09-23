"""Schemas for notifications, knowledge base, FAQ, audit logs and search."""
from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel, UserBrief, UTCDateTime


class NotificationOut(ORMModel):
    id: str
    event: str
    title: str
    body: str | None
    link: str | None
    data: dict
    read_at: UTCDateTime | None
    created_at: UTCDateTime


class NotificationSettingItem(BaseModel):
    event: str
    label: str | None = None
    in_app: bool = True
    email: bool = True
    sms: bool = False


class NotificationSettingsUpdate(BaseModel):
    items: list[NotificationSettingItem]


class KbCategoryOut(ORMModel):
    id: str
    name: str
    slug: str
    description: str | None
    icon: str | None
    sort_order: int
    is_active: bool
    articles_count: int = 0


class KbCategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    icon: str | None = Field(default=None, max_length=50)
    sort_order: int = 0
    is_active: bool = True


class KbArticleListItem(ORMModel):
    id: str
    title: str
    slug: str
    summary: str | None
    tags: list[str]
    status: str
    is_featured: bool
    views: int
    helpful_count: int
    not_helpful_count: int
    category: KbCategoryOut | None
    author: UserBrief | None
    published_at: UTCDateTime | None
    updated_at: UTCDateTime


class KbArticleOut(KbArticleListItem):
    content: str
    category_id: str | None
    related: list[KbArticleListItem] = []
    my_feedback: bool | None = None


class KbArticleIn(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    summary: str | None = Field(default=None, max_length=500)
    content: str = Field(min_length=1, max_length=500_000)
    category_id: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=20)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    is_featured: bool = False
    slug: str | None = Field(default=None, max_length=280)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v):
        return list(dict.fromkeys(t.strip()[:40] for t in v if t.strip()))


class KbFeedbackIn(BaseModel):
    helpful: bool


class FaqCategoryOut(ORMModel):
    id: str
    name: str
    sort_order: int


class FaqCategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    sort_order: int = 0


class FaqOut(ORMModel):
    id: str
    category_id: str | None
    category: FaqCategoryOut | None
    question: str
    answer: str
    sort_order: int
    is_published: bool


class FaqIn(BaseModel):
    category_id: str | None = None
    question: str = Field(min_length=3, max_length=500)
    answer: str = Field(min_length=1, max_length=50_000)
    sort_order: int | None = None
    is_published: bool = True


class ReorderIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)


class AuditLogOut(ORMModel):
    id: str
    company_id: str | None
    user: UserBrief | None
    action: str
    entity_type: str | None
    entity_id: str | None
    description: str | None
    changes: dict | None
    ip_address: str | None
    user_agent: str | None
    created_at: UTCDateTime


class SearchHit(BaseModel):
    type: str
    id: str
    title: str
    subtitle: str | None = None
    link: str
    meta: dict = {}


class SearchResponse(BaseModel):
    query: str
    tickets: list[SearchHit] = []
    customers: list[SearchHit] = []
    agents: list[SearchHit] = []
    articles: list[SearchHit] = []
    messages: list[SearchHit] = []
