"""Kavenegar (kavenegar.com) SMS provider.

Docs: https://kavenegar.com/rest.html
- Free-text:     GET https://api.kavenegar.com/v1/{API_KEY}/sms/send.json?receptor=&sender=&message=
- Verify lookup: GET https://api.kavenegar.com/v1/{API_KEY}/verify/lookup.json?receptor=&template=&token=&token2=&token3=
"""
import logging

import httpx

from app.services.sms.base import SmsProvider, SmsResult

logger = logging.getLogger("app.sms.kavenegar")

_BASE_URL = "https://api.kavenegar.com/v1"


class KavenegarProvider(SmsProvider):
    name = "kavenegar"

    def __init__(self, api_key: str, sender: str | None, timeout: int = 10) -> None:
        if not api_key:
            raise ValueError("KAVENEGAR_API_KEY is not configured")
        self._api_key = api_key
        self._sender = sender
        self._timeout = timeout

    def _call(self, path: str, params: dict) -> SmsResult:
        url = f"{_BASE_URL}/{self._api_key}/{path}"
        try:
            response = httpx.post(url, data=params, timeout=self._timeout)
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Kavenegar request failed: %s", exc.__class__.__name__)
            return SmsResult(False, self.name, error=str(exc.__class__.__name__))
        status = (payload.get("return") or {}).get("status")
        if status != 200:
            message = (payload.get("return") or {}).get("message")
            logger.warning("Kavenegar returned status %s: %s", status, message)
            return SmsResult(False, self.name, error=f"{status}: {message}")
        entries = payload.get("entries") or []
        message_id = str(entries[0].get("messageid")) if entries else None
        return SmsResult(True, self.name, message_id=message_id)

    def send(self, receptor: str, message: str) -> SmsResult:
        params = {"receptor": receptor, "message": message}
        if self._sender:
            params["sender"] = self._sender
        return self._call("sms/send.json", params)

    def send_template(self, receptor: str, template: str, tokens: list[str]) -> SmsResult:
        params = {"receptor": receptor, "template": template}
        # Kavenegar tokens cannot contain spaces for token/token2/token3; token10+ may.
        keys = ["token", "token2", "token3", "token10", "token20"]
        for key, value in zip(keys, tokens, strict=False):
            params[key] = value if key in ("token10", "token20") else str(value).replace(" ", "‌")
        return self._call("verify/lookup.json", params)
