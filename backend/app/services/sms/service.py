"""High-level SMS service used by the rest of the application."""
import logging
from functools import cached_property

from app.config.settings import settings
from app.services.sms.base import SmsProvider, SmsResult
from app.services.sms.console import ConsoleSmsProvider, DisabledSmsProvider
from app.services.sms.templates import SMS_TEMPLATES, render_sms

logger = logging.getLogger("app.sms")


def build_provider() -> SmsProvider:
    if settings.SMS_PROVIDER == "kavenegar":
        from app.services.sms.kavenegar import KavenegarProvider

        return KavenegarProvider(
            settings.KAVENEGAR_API_KEY or "", settings.KAVENEGAR_SENDER, settings.KAVENEGAR_TIMEOUT_SECONDS
        )
    if settings.SMS_PROVIDER == "disabled":
        return DisabledSmsProvider()
    return ConsoleSmsProvider()


class SmsService:
    def __init__(self, provider: SmsProvider | None = None) -> None:
        self._provider = provider

    @cached_property
    def provider(self) -> SmsProvider:
        return self._provider or build_provider()

    def send_text(self, mobile: str, message: str) -> SmsResult:
        return self.provider.send(mobile, message)

    def send_template(
        self, mobile: str | None, template_key: str, context: dict, overrides: dict | None = None
    ) -> SmsResult | None:
        if not mobile or template_key not in SMS_TEMPLATES:
            return None
        spec = SMS_TEMPLATES[template_key]
        if settings.KAVENEGAR_USE_VERIFY_LOOKUP and self.provider.name == "kavenegar":
            tokens = [str(context.get(k, "")) for k in spec["tokens"]]
            result = self.provider.send_template(mobile, spec["lookup"], tokens)
        else:
            result = self.provider.send(mobile, render_sms(template_key, context, overrides))
        if not result.success:
            logger.warning("SMS '%s' to %s failed: %s", template_key, mobile[-4:], result.error)
        return result


sms_service = SmsService()
