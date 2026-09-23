from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.config.settings import settings
from app.schemas.common import MobileMixin, UTCDateTime
from app.utils.persian import is_mobile, normalize_mobile, to_latin_digits


def validate_password_strength(value: str) -> str:
    if len(value) < settings.PASSWORD_MIN_LENGTH:
        raise ValueError(f"رمز عبور باید حداقل {settings.PASSWORD_MIN_LENGTH} کاراکتر باشد.")
    if not any(c.isdigit() for c in value) or not any(c.isalpha() for c in value):
        raise ValueError("رمز عبور باید شامل حروف و اعداد باشد.")
    if len(value) > 128:
        raise ValueError("رمز عبور بیش از حد طولانی است.")
    return value


def normalize_identifier(value: str) -> str:
    value = to_latin_digits(value.strip())
    if "@" in value:
        return value.lower()
    if is_mobile(value):
        return normalize_mobile(value)  # type: ignore[return-value]
    return value


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255, description="ایمیل یا شماره موبایل")
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = True

    _norm = field_validator("identifier")(lambda cls, v: normalize_identifier(v))


class RegisterRequest(MobileMixin, BaseModel):
    company_slug: str = Field(min_length=2, max_length=80)
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    mobile: str | None = None
    password: str
    organization: str | None = Field(default=None, max_length=200)

    _pwd = field_validator("password")(lambda cls, v: validate_password_strength(v))

    @model_validator(mode="after")
    def _contact(self):
        if not self.email and not self.mobile:
            raise ValueError("وارد کردن ایمیل یا شماره موبایل الزامی است.")
        if self.email:
            self.email = self.email.lower()
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=255)

    _norm = field_validator("identifier")(lambda cls, v: normalize_identifier(v))


class ForgotPasswordResponse(BaseModel):
    message: str
    channel: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str | None = Field(default=None, max_length=200, description="توکن لینک ایمیل")
    identifier: str | None = Field(default=None, max_length=255, description="شماره موبایل (برای کد پیامکی)")
    code: str | None = Field(default=None, max_length=10)
    new_password: str

    _pwd = field_validator("new_password")(lambda cls, v: validate_password_strength(v))

    @model_validator(mode="after")
    def _one_of(self):
        if not self.token and not (self.identifier and self.code):
            raise ValueError("توکن بازیابی یا کد تایید الزامی است.")
        if self.identifier:
            self.identifier = normalize_identifier(self.identifier)
        if self.code:
            self.code = to_latin_digits(self.code)
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str

    _pwd = field_validator("new_password")(lambda cls, v: validate_password_strength(v))


class VerificationRequest(BaseModel):
    channel: str = Field(pattern="^(email|sms)$")


class VerificationConfirm(BaseModel):
    channel: str = Field(pattern="^(email|sms)$")
    code: str = Field(min_length=4, max_length=10)

    _norm = field_validator("code")(lambda cls, v: to_latin_digits(v.strip()))


class SessionOut(BaseModel):
    id: str
    user_agent: str | None
    ip_address: str | None
    created_at: UTCDateTime
    last_used_at: UTCDateTime | None
    expires_at: UTCDateTime
    current: bool = False
