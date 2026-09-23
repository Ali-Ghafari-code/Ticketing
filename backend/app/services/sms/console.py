import logging

from app.services.sms.base import SmsProvider, SmsResult

logger = logging.getLogger("app.sms.console")


class ConsoleSmsProvider(SmsProvider):
    """Development provider: logs messages instead of sending them."""

    name = "console"
    outbox: list[tuple[str, str]] = []

    def send(self, receptor: str, message: str) -> SmsResult:
        logger.info("[SMS -> %s] %s", receptor, message)
        self.outbox.append((receptor, message))
        del self.outbox[:-100]
        return SmsResult(True, self.name, message_id="console")


class DisabledSmsProvider(SmsProvider):
    name = "disabled"

    def send(self, receptor: str, message: str) -> SmsResult:
        return SmsResult(False, self.name, error="sms disabled")
