from datetime import datetime

from pydantic import BaseModel, Field, computed_field, field_validator

from app.schemas.common import ORMModel, UserBrief, UTCDateTime
from app.utils.html import is_blank_html


class StatusBrief(ORMModel):
    id: str
    name: str
    code: str
    color: str
    state: str


class PriorityBrief(ORMModel):
    id: str
    name: str
    code: str
    color: str
    level: int


class NamedBrief(ORMModel):
    id: str
    name: str


class TagBrief(ORMModel):
    id: str
    name: str
    color: str


class TicketListItem(ORMModel):
    id: str
    number: int
    code: str
    subject: str
    channel: str
    customer: UserBrief
    assigned_agent: UserBrief | None
    department: NamedBrief | None
    category: NamedBrief | None
    priority: PriorityBrief
    status: StatusBrief
    tags: list[TagBrief]
    sla_status: str
    first_response_due_at: UTCDateTime | None
    resolution_due_at: UTCDateTime | None
    first_responded_at: UTCDateTime | None
    due_date: UTCDateTime | None
    last_response_at: UTCDateTime | None
    escalation_level: int
    created_at: UTCDateTime
    updated_at: UTCDateTime
    closed_at: UTCDateTime | None
    resolved_at: UTCDateTime | None
    unread: bool = False


class RatingOut(ORMModel):
    id: str
    rating: int
    feedback: str | None
    created_at: UTCDateTime


class TicketDetail(TicketListItem):
    description: str
    created_by: UserBrief | None = None
    last_customer_reply_at: UTCDateTime | None
    last_agent_reply_at: UTCDateTime | None
    sla_paused_at: UTCDateTime | None
    first_response_breached: bool
    resolution_breached: bool
    reopened_count: int
    escalated_at: UTCDateTime | None
    rating: RatingOut | None = None
    attachments: list["AttachmentOut"] = []
    can: dict[str, bool] = {}


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=1, max_length=100_000)
    category_id: str | None = None
    department_id: str | None = None
    priority_id: str | None = None
    customer_id: str | None = Field(default=None, description="فقط برای کارشناسان: ثبت تیکت از طرف مشتری")
    assigned_agent_id: str | None = None
    tag_ids: list[str] = []
    due_date: datetime | None = None
    channel: str = Field(default="web", pattern="^(web|email|phone|chat|api)$")

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if is_blank_html(v):
            raise ValueError("شرح تیکت نمی‌تواند خالی باشد.")
        return v

    @field_validator("subject")
    @classmethod
    def _subject(cls, v):
        return v.strip()


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    category_id: str | None = None
    department_id: str | None = None
    priority_id: str | None = None
    status_id: str | None = None
    assigned_agent_id: str | None = None
    tag_ids: list[str] | None = None
    due_date: datetime | None = None
    clear_assignee: bool = False
    clear_due_date: bool = False


class TicketBulkUpdate(BaseModel):
    ticket_ids: list[str] = Field(min_length=1, max_length=200)
    status_id: str | None = None
    priority_id: str | None = None
    assigned_agent_id: str | None = None
    clear_assignee: bool = False
    add_tag_ids: list[str] = []


class EscalateRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=2000)
    assigned_agent_id: str | None = None
    department_id: str | None = None


class AttachmentOut(ORMModel):
    id: str
    ticket_id: str
    message_id: str | None
    original_name: str
    mime_type: str
    size: int
    is_internal: bool
    created_at: UTCDateTime
    uploaded_by: UserBrief | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_image(self) -> bool:
        return self.mime_type.startswith("image/")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def previewable(self) -> bool:
        return self.mime_type.startswith("image/") or self.mime_type == "application/pdf"


class MessageOut(ORMModel):
    id: str
    ticket_id: str
    kind: str
    body: str
    is_internal: bool
    author: UserBrief | None
    attachments: list[AttachmentOut] = []
    mentions: list[UserBrief] = []
    created_at: UTCDateTime
    edited_at: UTCDateTime | None
    deleted_at: UTCDateTime | None
    is_read: bool = False
    can_edit: bool = False
    can_delete: bool = False


class MessageUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=100_000)

    @field_validator("body")
    @classmethod
    def _b(cls, v):
        if is_blank_html(v):
            raise ValueError("متن پیام نمی‌تواند خالی باشد.")
        return v


class ActivityOut(ORMModel):
    id: str
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    user: UserBrief | None
    created_at: UTCDateTime


class RatingCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: str | None = Field(default=None, max_length=2000)


class TicketCreatedOut(BaseModel):
    id: str
    code: str
    number: int
    message: str


class TicketStats(BaseModel):
    total: int
    open: int
    pending: int
    resolved: int
    closed: int


TicketDetail.model_rebuild()
