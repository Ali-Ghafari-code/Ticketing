from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, computed_field, field_validator

from app.config.settings import settings
from app.utils.persian import normalize_mobile


def _serialize_dt(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_serialize_dt, return_type=str, when_used="json")]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class IdName(ORMModel):
    id: str
    name: str


def public_file_url(relative_path: str | None) -> str | None:
    if not relative_path:
        return None
    return f"{settings.API_PREFIX}/files/public/{relative_path}"


class AvatarMixin(BaseModel):
    avatar_path: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def avatar_url(self) -> str | None:
        return public_file_url(self.avatar_path)


class UserBrief(AvatarMixin, ORMModel):
    id: str
    full_name: str
    email: str | None = None
    mobile: str | None = None
    user_type: str


def mobile_validator(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    return normalize_mobile(value)


class MobileMixin(BaseModel):
    @field_validator("mobile", mode="before", check_fields=False)
    @classmethod
    def _mobile(cls, value):
        return mobile_validator(value)


def hex_color(value: str | None) -> str | None:
    if value is None:
        return value
    import re

    if not re.fullmatch(r"#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?", value):
        raise ValueError("کد رنگ باید به صورت هگز باشد، مانند ‎#4F46E5")
    return value.upper()


class DateRange(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
