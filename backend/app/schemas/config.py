"""Schemas for departments, categories, statuses, priorities, tags and SLA rules."""
from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import ORMModel, UserBrief, UTCDateTime, hex_color


class DepartmentOut(ORMModel):
    id: str
    name: str
    description: str | None
    email: str | None
    manager_id: str | None
    manager: UserBrief | None = None
    assignment_strategy: str
    is_active: bool
    sort_order: int
    members: list[UserBrief] = []
    open_tickets: int = 0
    created_at: UTCDateTime


class DepartmentIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    email: str | None = Field(default=None, max_length=255)
    manager_id: str | None = None
    assignment_strategy: str = Field(default="round_robin", pattern="^(manual|round_robin|least_loaded)$")
    is_active: bool = True
    sort_order: int = 0
    member_ids: list[str] = []


class CategoryOut(ORMModel):
    id: str
    parent_id: str | None
    name: str
    description: str | None
    department_id: str | None
    default_agent_id: str | None
    default_priority_id: str | None
    is_active: bool
    sort_order: int
    children: list["CategoryOut"] = []
    tickets_count: int = 0


class CategoryIn(BaseModel):
    parent_id: str | None = None
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    department_id: str | None = None
    default_agent_id: str | None = None
    default_priority_id: str | None = None
    is_active: bool = True
    sort_order: int = 0


class StatusOut(ORMModel):
    id: str
    name: str
    code: str
    color: str
    state: str
    is_default: bool
    pauses_sla: bool
    is_system: bool
    is_active: bool
    sort_order: int


class StatusIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    color: str = "#64748B"
    state: str = Field(default="open", pattern="^(open|pending|resolved|closed)$")
    is_default: bool = False
    pauses_sla: bool = False
    is_active: bool = True
    sort_order: int = 0

    _c = field_validator("color")(lambda cls, v: hex_color(v))


class StatusUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    color: str | None = None
    state: str | None = Field(default=None, pattern="^(open|pending|resolved|closed)$")
    is_default: bool | None = None
    pauses_sla: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None

    _c = field_validator("color")(lambda cls, v: hex_color(v))


class PriorityOut(ORMModel):
    id: str
    name: str
    code: str
    color: str
    level: int
    is_default: bool
    is_system: bool
    is_active: bool
    sort_order: int


class PriorityIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    color: str = "#64748B"
    level: int = Field(default=1, ge=1, le=10)
    is_default: bool = False
    is_active: bool = True
    sort_order: int = 0

    _c = field_validator("color")(lambda cls, v: hex_color(v))


class PriorityUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    color: str | None = None
    level: int | None = Field(default=None, ge=1, le=10)
    is_default: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None

    _c = field_validator("color")(lambda cls, v: hex_color(v))


class TagOut(ORMModel):
    id: str
    name: str
    color: str
    description: str | None = None
    tickets_count: int = 0


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    color: str = "#64748B"
    description: str | None = Field(default=None, max_length=255)

    _c = field_validator("color")(lambda cls, v: hex_color(v))

    @field_validator("name")
    @classmethod
    def _n(cls, v):
        return v.strip().lower()


class SlaRuleOut(ORMModel):
    id: str
    name: str
    description: str | None
    department_id: str | None
    priority_id: str | None
    department: "DeptBrief | None" = None
    priority: "PriorityBrief | None" = None
    first_response_minutes: int
    resolution_minutes: int
    warning_percent: int
    business_hours_only: bool
    is_active: bool


class DeptBrief(ORMModel):
    id: str
    name: str


class PriorityBrief(ORMModel):
    id: str
    name: str
    color: str
    level: int


class SlaRuleIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    department_id: str | None = None
    priority_id: str | None = None
    first_response_minutes: int = Field(ge=1, le=60 * 24 * 60)
    resolution_minutes: int = Field(ge=1, le=60 * 24 * 180)
    warning_percent: int = Field(default=75, ge=10, le=99)
    business_hours_only: bool = True
    is_active: bool = True

    @model_validator(mode="after")
    def _check(self):
        if self.resolution_minutes < self.first_response_minutes:
            raise ValueError("زمان حل مشکل نمی‌تواند کمتر از زمان اولین پاسخ باشد.")
        return self


SlaRuleOut.model_rebuild()
CategoryOut.model_rebuild()
