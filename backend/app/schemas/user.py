from pydantic import BaseModel, EmailStr, Field, computed_field, field_validator, model_validator

from app.schemas.auth import validate_password_strength
from app.schemas.common import AvatarMixin, MobileMixin, ORMModel, UTCDateTime, public_file_url


class RoleBrief(ORMModel):
    id: str
    name: str
    display_name: str


class DepartmentBrief(ORMModel):
    id: str
    name: str


class UserOut(AvatarMixin, ORMModel):
    id: str
    company_id: str | None
    user_type: str
    full_name: str
    email: str | None
    mobile: str | None
    job_title: str | None
    organization: str | None
    notes: str | None = None
    is_active: bool
    email_verified_at: UTCDateTime | None
    mobile_verified_at: UTCDateTime | None
    last_login_at: UTCDateTime | None
    created_at: UTCDateTime
    roles: list[RoleBrief] = []
    departments: list[DepartmentBrief] = []


class CompanyBranding(ORMModel):
    id: str
    name: str
    slug: str
    logo_path: str | None = Field(default=None, exclude=True)
    primary_color: str
    secondary_color: str
    settings: dict = Field(default_factory=dict, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def logo_url(self) -> str | None:
        return public_file_url(self.logo_path)


class MeOut(UserOut):
    permissions: list[str]
    preferences: dict
    company: CompanyBranding | None = None


class UserCreate(MobileMixin, BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    mobile: str | None = None
    password: str | None = None
    job_title: str | None = Field(default=None, max_length=150)
    organization: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)
    role_ids: list[str] = []
    department_ids: list[str] = []
    is_active: bool = True

    @field_validator("password")
    @classmethod
    def _pwd(cls, v):
        return validate_password_strength(v) if v else v

    @model_validator(mode="after")
    def _contact(self):
        if not self.email and not self.mobile:
            raise ValueError("وارد کردن ایمیل یا شماره موبایل الزامی است.")
        if self.email:
            self.email = self.email.lower()
        return self


class UserUpdate(MobileMixin, BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None
    mobile: str | None = None
    job_title: str | None = Field(default=None, max_length=150)
    organization: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)
    role_ids: list[str] | None = None
    department_ids: list[str] | None = None
    is_active: bool | None = None

    @field_validator("email")
    @classmethod
    def _lower(cls, v):
        return v.lower() if v else v


class ProfileUpdate(MobileMixin, BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None
    mobile: str | None = None
    job_title: str | None = Field(default=None, max_length=150)
    organization: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def _lower(cls, v):
        return v.lower() if v else v


class PreferencesUpdate(BaseModel):
    theme: str | None = Field(default=None, pattern="^(light|dark|system)$")
    ticket_columns: list[str] | None = None
    ticket_page_size: int | None = Field(default=None, ge=10, le=100)
    sidebar_collapsed: bool | None = None


class AdminPasswordReset(BaseModel):
    new_password: str | None = None
    notify: bool = True

    @field_validator("new_password")
    @classmethod
    def _pwd(cls, v):
        return validate_password_strength(v) if v else v


class PermissionOut(ORMModel):
    id: int
    code: str
    name: str
    group: str
    is_platform: bool


class RoleOut(ORMModel):
    id: str
    company_id: str | None
    name: str
    display_name: str
    description: str | None
    is_system: bool
    audience: str
    permissions: list[PermissionOut] = []
    users_count: int = 0


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    display_name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    audience: str = Field(default="staff", pattern="^(staff|customer)$")
    permission_codes: list[str] = []


class RoleUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    permission_codes: list[str] | None = None
