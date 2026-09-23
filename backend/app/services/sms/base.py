"""SMS provider interface. Business logic only depends on this, never on a vendor SDK."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SmsResult:
    success: bool
    provider: str
    message_id: str | None = None
    error: str | None = None


class SmsProvider(ABC):
    name: str = "base"

    @abstractmethod
    def send(self, receptor: str, message: str) -> SmsResult:
        """Send a free-text message."""

    def send_template(self, receptor: str, template: str, tokens: list[str]) -> SmsResult:
        """Send using a provider-side template (e.g. Kavenegar Verify Lookup). Falls back to text by default."""
        return self.send(receptor, " ".join(tokens))
