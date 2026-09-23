"""Default SMS templates. Companies can override the text in Settings → SMS.

Placeholders use ``{name}`` syntax. When KAVENEGAR_USE_VERIFY_LOOKUP is on, the
``lookup`` entry names the template defined in the Kavenegar panel and the
``tokens`` are sent as token/token2/token3.
"""

SMS_TEMPLATES: dict[str, dict] = {
    "ticket_created": {
        "label": "ثبت تیکت",
        "text": "{company}\nتیکت شما با شماره {ticket_code} ثبت شد و به‌زودی بررسی می‌شود.\n{link}",
        "lookup": "ticket-created",
        "tokens": ["ticket_code"],
    },
    "ticket_assigned": {
        "label": "ارجاع تیکت به کارشناس",
        "text": "{company}\nتیکت {ticket_code} با موضوع «{subject}» به شما ارجاع شد.",
        "lookup": "ticket-assigned",
        "tokens": ["ticket_code"],
    },
    "ticket_reply": {
        "label": "پاسخ جدید",
        "text": "{company}\nپاسخ جدیدی برای تیکت {ticket_code} ثبت شد.\n{link}",
        "lookup": "ticket-reply",
        "tokens": ["ticket_code"],
    },
    "ticket_resolved": {
        "label": "حل شدن تیکت",
        "text": "{company}\nتیکت {ticket_code} حل شد. لطفاً میزان رضایت خود را ثبت کنید.\n{link}",
        "lookup": "ticket-resolved",
        "tokens": ["ticket_code"],
    },
    "ticket_closed": {
        "label": "بسته شدن تیکت",
        "text": "{company}\nتیکت {ticket_code} بسته شد. از همراهی شما سپاسگزاریم.",
        "lookup": "ticket-closed",
        "tokens": ["ticket_code"],
    },
    "password_reset": {
        "label": "بازیابی رمز عبور",
        "text": "کد بازیابی رمز عبور شما: {code}\nاین کد تا {minutes} دقیقه معتبر است.",
        "lookup": "password-reset",
        "tokens": ["code"],
    },
    "verification_code": {
        "label": "کد تایید",
        "text": "کد تایید شما: {code}\n{company}",
        "lookup": "verify",
        "tokens": ["code"],
    },
    "sla_warning": {
        "label": "هشدار SLA",
        "text": "هشدار: مهلت SLA تیکت {ticket_code} رو به اتمام است.",
        "lookup": "sla-warning",
        "tokens": ["ticket_code"],
    },
    "sla_breached": {
        "label": "نقض SLA",
        "text": "مهلت SLA تیکت {ticket_code} به پایان رسید.",
        "lookup": "sla-breached",
        "tokens": ["ticket_code"],
    },
}


class _SafeDict(dict):
    def __missing__(self, key):
        return ""


def render_sms(template_key: str, context: dict, overrides: dict | None = None) -> str:
    text = (overrides or {}).get(template_key) or SMS_TEMPLATES[template_key]["text"]
    return text.format_map(_SafeDict(context)).strip()
