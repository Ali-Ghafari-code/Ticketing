from datetime import date

from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator

from app.schemas.common import ORMModel, UTCDateTime, hex_color, public_file_url


class PlanOut(ORMModel):
    id: str
    name: str
    code: str
    description: str | None
    price_monthly: int
    max_agents: int | None
    max_customers: int | None
    max_tickets_per_month: int | None
    max_storage_mb: int | None
    features: list
    is_active: bool
    sort_order: int
    companies_count: int = 0


class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z0-9_-]+$")
    description: str | None = Field(default=None, max_length=2000)
    price_monthly: int = Field(default=0, ge=0)
    max_agents: int | None = Field(default=None, ge=1)
    max_customers: int | None = Field(default=None, ge=1)
    max_tickets_per_month: int | None = Field(default=None, ge=1)
    max_storage_mb: int | None = Field(default=None, ge=1)
    features: list[str] = []
    is_active: bool = True
    sort_order: int = 0


class WorkingDay(BaseModel):
    enabled: bool
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class LogoMixin(BaseModel):
    logo_path: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def logo_url(self) -> str | None:
        return public_file_url(self.logo_path)


class CompanyOut(LogoMixin, ORMModel):
    id: str
    name: str
    slug: str
    description: str | None
    phone: str | None
    email: str | None
    address: str | None
    website: str | None
    primary_color: str
    secondary_color: str
    timezone: str
    working_hours: dict
    settings: dict
    ticket_prefix: str
    plan_id: str | None
    plan: PlanOut | None = None
    subscription_status: str
    subscription_ends_at: UTCDateTime | None
    is_active: bool
    created_at: UTCDateTime
    stats: dict | None = None

    @classmethod
    def build(cls, company, stats: dict | None = None) -> "CompanyOut":
        out = cls.model_validate(company)
        out.stats = stats
        return out


class PublicCompanyOut(LogoMixin, ORMModel):
    id: str
    name: str
    slug: str
    description: str | None
    primary_color: str
    secondary_color: str
    phone: str | None
    email: str | None
    website: str | None
    allow_registration: bool = True


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=1000)
    website: str | None = Field(default=None, max_length=255)
    primary_color: str | None = None
    secondary_color: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    ticket_prefix: str | None = Field(default=None, min_length=1, max_length=10, pattern=r"^[A-Za-z0-9]+$")
    working_hours: dict[str, WorkingDay] | None = None

    _colors = field_validator("primary_color", "secondary_color")(lambda cls, v: hex_color(v))

    @field_validator("working_hours")
    @classmethod
    def _wh(cls, value):
        if value is None:
            return value
        allowed = {"saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"}
        if set(value) - allowed:
            raise ValueError("نام روز نامعتبر است.")
        for day in value.values():
            if day.enabled and day.end <= day.start:
                raise ValueError("ساعت پایان باید بعد از ساعت شروع باشد.")
        return value


class CompanyCreate(CompanyUpdate):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    plan_id: str | None = None
    admin_full_name: str = Field(min_length=2, max_length=150)
    admin_email: EmailStr | None = None
    admin_mobile: str | None = None
    admin_password: str = Field(min_length=8, max_length=128)


class CompanyAdminUpdate(CompanyUpdate):
    plan_id: str | None = None
    subscription_status: str | None = Field(default=None, pattern="^(trial|active|expired|suspended)$")
    subscription_ends_at: UTCDateTime | None = None
    is_active: bool | None = None


class CompanySettingsUpdate(BaseModel):
    """Free-form support settings stored in companies.settings (validated per key)."""

    allow_registration: bool | None = None
    allow_customer_close: bool | None = None
    allow_customer_reopen: bool | None = None
    reopen_window_days: int | None = Field(default=None, ge=0, le=365)
    auto_close_resolved_days: int | None = Field(default=None, ge=0, le=365)
    require_category: bool | None = None
    customer_can_select_priority: bool | None = None
    customer_can_select_department: bool | None = None
    default_assignment_strategy: str | None = Field(default=None, pattern="^(manual|round_robin|least_loaded)$")
    auto_assign_enabled: bool | None = None
    agent_can_view_department_tickets: bool | None = None
    message_edit_window_minutes: int | None = Field(default=None, ge=0, le=1440)
    rating_enabled: bool | None = None
    kb_enabled: bool | None = None
    kb_suggest_before_ticket: bool | None = None
    notify_email_enabled: bool | None = None
    notify_sms_enabled: bool | None = None
    sms_templates: dict[str, str] | None = None
    email_templates: dict[str, dict[str, str]] | None = None
    session_timeout_days: int | None = Field(default=None, ge=1, le=90)
    require_mobile_verification: bool | None = None
    require_email_verification: bool | None = None


class HolidayIn(BaseModel):
    date: date
    title: str = Field(min_length=1, max_length=200)


class HolidayOut(ORMModel):
    id: str
    date: date
    title: str
