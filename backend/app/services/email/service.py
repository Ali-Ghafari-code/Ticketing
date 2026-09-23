"""Email delivery abstraction with SMTP and console providers plus Jinja2 templates."""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config.settings import settings

logger = logging.getLogger("app.email")

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "email"
_env = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=select_autoescape(["html"]))

EMAIL_TEMPLATES: dict[str, dict[str, str]] = {
    "ticket_created": {"label": "ثبت تیکت جدید", "subject": "تیکت {ticket_code} ثبت شد: {subject}"},
    "ticket_reply": {"label": "پاسخ جدید", "subject": "پاسخ جدید در تیکت {ticket_code}"},
    "ticket_assigned": {"label": "ارجاع تیکت", "subject": "تیکت {ticket_code} به شما ارجاع شد"},
    "ticket_status_changed": {"label": "تغییر وضعیت", "subject": "وضعیت تیکت {ticket_code} تغییر کرد"},
    "ticket_escalated": {"label": "ارجاع به سطح بالاتر", "subject": "تیکت {ticket_code} به سطح بالاتر ارجاع شد"},
    "ticket_resolved": {"label": "حل شدن تیکت", "subject": "تیکت {ticket_code} حل شد"},
    "ticket_closed": {"label": "بسته شدن تیکت", "subject": "تیکت {ticket_code} بسته شد"},
    "sla_warning": {"label": "هشدار SLA", "subject": "هشدار SLA برای تیکت {ticket_code}"},
    "sla_breached": {"label": "نقض SLA", "subject": "نقض SLA در تیکت {ticket_code}"},
    "mention": {"label": "اشاره", "subject": "در تیکت {ticket_code} به شما اشاره شد"},
    "password_reset": {"label": "بازیابی رمز عبور", "subject": "بازیابی رمز عبور"},
    "verification_code": {"label": "کد تایید", "subject": "کد تایید حساب کاربری"},
    "welcome": {"label": "خوش‌آمدگویی", "subject": "به {company} خوش آمدید"},
}


class _SafeDict(dict):
    def __missing__(self, key):
        return ""


class EmailService:
    def render(self, template_key: str, context: dict, overrides: dict | None = None) -> tuple[str, str, str]:
        spec = EMAIL_TEMPLATES[template_key]
        override = (overrides or {}).get(template_key) or {}
        subject = (override.get("subject") or spec["subject"]).format_map(_SafeDict(context))
        intro = override.get("body")
        render_ctx = {
            **context,
            "subject_line": context.get("subject_line") or context.get("subject", ""),
            "subject": subject,
            "custom_intro": intro.format_map(_SafeDict(context)) if intro else None,
        }
        html = _env.get_template(f"{template_key}.html").render(**render_ctx)
        text = context.get("plain_text") or subject
        return subject, html, text

    def send(self, to: str | None, template_key: str, context: dict, overrides: dict | None = None) -> bool:
        if not to or settings.EMAIL_PROVIDER == "disabled":
            return False
        subject, html, text = self.render(template_key, context, overrides)
        return self.send_raw(to, subject, html, text)

    def send_raw(self, to: str, subject: str, html: str, text: str) -> bool:
        if settings.EMAIL_PROVIDER == "console" or not settings.SMTP_HOST:
            logger.info("[EMAIL -> %s] %s", to, subject)
            return True
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM))
        message["To"] = to
        message.set_content(text)
        message.add_alternative(html, subtype="html")
        try:
            if settings.SMTP_USE_SSL:
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=ssl.create_default_context(),
                                      timeout=15) as smtp:
                    self._login_and_send(smtp, message)
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
                    if settings.SMTP_USE_TLS:
                        smtp.starttls(context=ssl.create_default_context())
                    self._login_and_send(smtp, message)
            return True
        except (smtplib.SMTPException, OSError) as exc:
            logger.warning("SMTP delivery to %s failed: %s", to, exc.__class__.__name__)
            return False

    @staticmethod
    def _login_and_send(smtp: smtplib.SMTP, message: EmailMessage) -> None:
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD or "")
        smtp.send_message(message)


email_service = EmailService()
