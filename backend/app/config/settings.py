"""Application settings loaded from environment variables.

Every secret (JWT keys, Kavenegar API key, SMTP credentials) is read from the
environment only; nothing sensitive is ever sent to the frontend.
"""
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- General ---
    APP_NAME: str = "سامانه پشتیبانی و تیکتینگ"
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False
    API_PREFIX: str = "/api"
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    TRUSTED_PROXIES: bool = False

    # --- Database ---
    DATABASE_URL: str = "mysql+pymysql://ticketing:ticketing@localhost:3306/ticketing?charset=utf8mb4"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_ECHO: bool = False

    # --- JWT ---
    JWT_SECRET_KEY: str = "change-me-access-secret-please-use-64-random-chars"
    JWT_REFRESH_SECRET: str = "change-me-refresh-secret-please-use-64-random-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14
    REFRESH_COOKIE_NAME: str = "tk_refresh"
    REFRESH_COOKIE_SECURE: bool = False
    REFRESH_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    REFRESH_COOKIE_DOMAIN: str | None = None

    # --- Security ---
    PASSWORD_MIN_LENGTH: int = 8
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    RATE_LIMIT_DEFAULT: str = "300/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    REDIS_URL: str | None = None
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30
    VERIFICATION_CODE_EXPIRE_MINUTES: int = 5

    # --- Files ---
    UPLOAD_DIR: Path = BASE_DIR / "storage" / "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    MAX_FILES_PER_MESSAGE: int = 5

    # --- SMS (Kavenegar) ---
    SMS_PROVIDER: Literal["kavenegar", "console", "disabled"] = "console"
    KAVENEGAR_API_KEY: str | None = None
    KAVENEGAR_SENDER: str | None = None
    KAVENEGAR_USE_VERIFY_LOOKUP: bool = False
    KAVENEGAR_TIMEOUT_SECONDS: int = 10

    # --- Email ---
    EMAIL_PROVIDER: Literal["smtp", "console", "disabled"] = "console"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    EMAIL_FROM: str = "support@example.com"
    EMAIL_FROM_NAME: str = "پشتیبانی"

    # --- Background jobs ---
    ENABLE_SCHEDULER: bool = True
    SLA_CHECK_INTERVAL_SECONDS: int = 60

    # --- Reports ---
    PDF_FONT_PATH: Path = BASE_DIR / "app" / "assets" / "fonts" / "Vazirmatn-Regular.ttf"
    PDF_FONT_BOLD_PATH: Path = BASE_DIR / "app" / "assets" / "fonts" / "Vazirmatn-Bold.ttf"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, value):
        if isinstance(value, str) and not value.startswith("["):
            return [v.strip() for v in value.split(",") if v.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
