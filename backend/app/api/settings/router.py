"""Company support settings, message templates, integrations, system settings, audit logs and Excel import."""
import io
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_request_meta, pagination, require_permissions, require_platform
from app.config.settings import settings
from app.core.exceptions import ValidationFailed
from app.database.session import get_db
from app.models import AuditLog, Company, SystemSetting, User
from app.schemas.common import Message, mobile_validator
from app.schemas.company import CompanySettingsUpdate
from app.schemas.misc import AuditLogOut
from app.services import importer
from app.services.audit import AuditAction, audit
from app.services.company import DEFAULT_COMPANY_SETTINGS
from app.services.email import email_service
from app.services.email.service import EMAIL_TEMPLATES
from app.services.exporter import export_response
from app.services.sms import sms_service
from app.services.sms.templates import SMS_TEMPLATES
from app.utils.pagination import make_page
from app.utils.persian import escape_like

router = APIRouter(tags=["تنظیمات"])


def _company(db: Session, tenant: Tenant) -> Company:
    return db.get(Company, tenant.company_id)


# ============================================================================ support settings

@router.get("/settings/support")
def get_support_settings(tenant: Tenant = Depends(require_permissions("settings.view")), db: Session = Depends(get_db)):
    company = _company(db, tenant)
    merged = {**DEFAULT_COMPANY_SETTINGS, **(company.settings or {})}
    return {k: v for k, v in merged.items() if not k.startswith("_")}


@router.put("/settings/support")
def update_support_settings(data: CompanySettingsUpdate,
                            tenant: Tenant = Depends(require_permissions("settings.update")),
                            db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    company = _company(db, tenant)
    values = data.model_dump(exclude_unset=True)
    for key in ("sms_templates", "email_templates"):
        if key in values and not tenant.has("notifications.manage"):
            values.pop(key)
    if "sms_templates" in values:
        values["sms_templates"] = {k: v[:600] for k, v in (values["sms_templates"] or {}).items()
                                   if k in SMS_TEMPLATES and v}
    if "email_templates" in values:
        values["email_templates"] = {k: {f: str(v.get(f, ""))[:2000] for f in ("subject", "body") if v.get(f)}
                                     for k, v in (values["email_templates"] or {}).items() if k in EMAIL_TEMPLATES}
    before = dict(company.settings or {})
    company.settings = {**DEFAULT_COMPANY_SETTINGS, **before, **values}
    audit(db, AuditAction.SETTINGS_UPDATED, user=tenant.user, company_id=company.id, entity_type="company",
          entity_id=company.id, description="ویرایش تنظیمات پشتیبانی",
          changes={k: {"old": before.get(k), "new": v} for k, v in values.items()
                   if before.get(k) != v and not k.endswith("_templates")}, ip=meta.ip)
    db.commit()
    return get_support_settings(tenant, db)


@router.get("/settings/templates", summary="قالب‌های پیامک و ایمیل")
def templates(tenant: Tenant = Depends(require_permissions("settings.view")), db: Session = Depends(get_db)):
    company = _company(db, tenant)
    sms_over = (company.settings or {}).get("sms_templates") or {}
    email_over = (company.settings or {}).get("email_templates") or {}
    return {
        "sms": [{"key": k, "label": v["label"], "default": v["text"], "value": sms_over.get(k), "lookup": v["lookup"]}
                for k, v in SMS_TEMPLATES.items()],
        "email": [{"key": k, "label": v["label"], "default_subject": v["subject"],
                   "subject": (email_over.get(k) or {}).get("subject"), "body": (email_over.get(k) or {}).get("body")}
                  for k, v in EMAIL_TEMPLATES.items()],
        "placeholders": ["{company}", "{ticket_code}", "{subject}", "{status}", "{priority}", "{link}",
                         "{recipient_name}", "{code}"],
    }


@router.get("/settings/integrations", summary="وضعیت اتصال پیامک و ایمیل (بدون افشای کلیدها)")
def integrations(tenant: Tenant = Depends(require_permissions("settings.view"))):
    return {
        "sms": {"provider": settings.SMS_PROVIDER, "configured": bool(settings.KAVENEGAR_API_KEY),
                "sender": settings.KAVENEGAR_SENDER, "use_verify_lookup": settings.KAVENEGAR_USE_VERIFY_LOOKUP},
        "email": {"provider": settings.EMAIL_PROVIDER, "configured": bool(settings.SMTP_HOST),
                  "host": settings.SMTP_HOST, "port": settings.SMTP_PORT, "from": settings.EMAIL_FROM,
                  "tls": settings.SMTP_USE_TLS},
        "uploads": {"max_size_mb": settings.MAX_UPLOAD_SIZE_MB, "max_files": settings.MAX_FILES_PER_MESSAGE},
        "security": {"access_token_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
                     "refresh_token_days": settings.REFRESH_TOKEN_EXPIRE_DAYS,
                     "max_login_attempts": settings.MAX_LOGIN_ATTEMPTS,
                     "lockout_minutes": settings.LOGIN_LOCKOUT_MINUTES,
                     "password_min_length": settings.PASSWORD_MIN_LENGTH},
    }


class SmsTest(BaseModel):
    mobile: str
    template: str = "verification_code"


class EmailTest(BaseModel):
    email: EmailStr


@router.post("/settings/sms/test", response_model=Message)
def test_sms(data: SmsTest, tenant: Tenant = Depends(require_permissions("settings.update")),
             db: Session = Depends(get_db)):
    mobile = mobile_validator(data.mobile)
    if data.template not in SMS_TEMPLATES:
        raise ValidationFailed("قالب انتخاب شده معتبر نیست.")
    company = _company(db, tenant)
    result = sms_service.send_template(mobile, data.template, {
        "company": company.name, "code": "12345", "ticket_code": f"{company.ticket_prefix}-1001",
        "subject": "پیام آزمایشی", "minutes": 5, "link": settings.FRONTEND_URL},
        (company.settings or {}).get("sms_templates"))
    if result is None or not result.success:
        raise ValidationFailed(f"ارسال پیامک ناموفق بود: {result.error if result else 'نامشخص'}")
    return Message(message=f"پیامک آزمایشی از طریق «{result.provider}» ارسال شد.")


@router.post("/settings/email/test", response_model=Message)
def test_email(data: EmailTest, tenant: Tenant = Depends(require_permissions("settings.update")),
               db: Session = Depends(get_db)):
    company = _company(db, tenant)
    ok = email_service.send(data.email, "ticket_created", {
        "company": company.name, "primary_color": company.primary_color, "ticket_code": f"{company.ticket_prefix}-1001",
        "subject": "ایمیل آزمایشی", "subject_line": "ایمیل آزمایشی", "recipient_name": tenant.user.full_name,
        "link": settings.FRONTEND_URL}, (company.settings or {}).get("email_templates"))
    if not ok:
        raise ValidationFailed("ارسال ایمیل ناموفق بود. تنظیمات SMTP را بررسی کنید.")
    return Message(message="ایمیل آزمایشی ارسال شد.")


# ============================================================================ system settings (platform)

SYSTEM_DEFAULTS = {
    "platform_name": settings.APP_NAME,
    "support_email": "support@example.com",
    "allow_company_signup": False,
    "default_plan_code": "starter",
    "maintenance_mode": False,
    "maintenance_message": "سامانه در حال به‌روزرسانی است.",
    "default_locale": "fa-IR",
}


@router.get("/system/settings")
def get_system_settings(tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    stored = {s.key: s.value for s in db.scalars(select(SystemSetting))}
    return {**SYSTEM_DEFAULTS, **stored}


@router.put("/system/settings")
def update_system_settings(values: dict = Body(...), tenant: Tenant = Depends(require_platform()),
                           db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    for key, value in values.items():
        if key not in SYSTEM_DEFAULTS:
            raise ValidationFailed(f"کلید تنظیمات «{key}» نامعتبر است.")
        if not isinstance(value, type(SYSTEM_DEFAULTS[key])):
            raise ValidationFailed(f"نوع مقدار «{key}» نامعتبر است.")
        row = db.get(SystemSetting, key) or SystemSetting(key=key)
        row.value = value
        db.add(row)
    audit(db, AuditAction.SETTINGS_UPDATED, user=tenant.user, company_id=None, entity_type="system",
          description="ویرایش تنظیمات سامانه", changes=values, ip=meta.ip)
    db.commit()
    return get_system_settings(tenant, db)


# ============================================================================ audit logs

def _audit_query(tenant: Tenant, q, user_id, action, entity_type, date_from, date_to, all_companies: bool):
    stmt = select(AuditLog)
    if not (tenant.is_super_admin and all_companies):
        stmt = stmt.where(AuditLog.company_id == tenant.require_company())
    if q:
        like = f"%{escape_like(q)}%"
        stmt = stmt.where(or_(AuditLog.description.like(like), AuditLog.ip_address.like(like),
                              AuditLog.user_id.in_(select(User.id).where(User.full_name.like(like)))))
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{escape_like(action)}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    return stmt.order_by(AuditLog.created_at.desc())


def _audit_tenant(tenant: Tenant = Depends(require_platform())) -> Tenant:
    return tenant


def audit_access(tenant: Tenant = Depends(require_permissions("audit.view"))) -> Tenant:
    return tenant


@router.get("/audit-logs")
def list_audit_logs(q: str | None = None, user_id: str | None = None, action: str | None = None,
                    entity_type: str | None = None, date_from: date | None = None, date_to: date | None = None,
                    pg=Depends(pagination), tenant: Tenant = Depends(audit_access), db: Session = Depends(get_db)):
    stmt = _audit_query(tenant, q, user_id, action, entity_type, date_from, date_to, False)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.limit(pg[1]).offset((pg[0] - 1) * pg[1])).unique().all()
    return make_page([AuditLogOut.model_validate(i) for i in items], total, *pg)


@router.get("/system/audit-logs", summary="گزارش فعالیت کل سامانه (مدیر کل)")
def platform_audit_logs(q: str | None = None, action: str | None = None, date_from: date | None = None,
                        date_to: date | None = None, pg=Depends(pagination),
                        tenant: Tenant = Depends(_audit_tenant), db: Session = Depends(get_db)):
    stmt = _audit_query(tenant, q, None, action, None, date_from, date_to, True)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.limit(pg[1]).offset((pg[0] - 1) * pg[1])).unique().all()
    return make_page([AuditLogOut.model_validate(i) for i in items], total, *pg)


@router.get("/audit-logs/export")
def export_audit_logs(fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"), q: str | None = None,
                      action: str | None = None, date_from: date | None = None, date_to: date | None = None,
                      tenant: Tenant = Depends(audit_access), db: Session = Depends(get_db)):
    items = db.scalars(_audit_query(tenant, q, None, action, None, date_from, date_to, False).limit(20000)).unique().all()
    rows = [{"created_at": i.created_at, "user": i.user.full_name if i.user else "سیستم", "action": i.action,
             "entity": f"{i.entity_type or ''} {i.entity_id or ''}".strip(), "ip": i.ip_address,
             "description": i.description} for i in items]
    cols = [("created_at", "تاریخ"), ("user", "کاربر"), ("action", "عملیات"), ("entity", "موجودیت"), ("ip", "IP"),
            ("description", "توضیحات")]
    return export_response(fmt, "audit-logs", "گزارش فعالیت‌ها", cols, rows)


# ============================================================================ Excel import

@router.get("/import/{kind}/template", summary="دانلود قالب اکسل")
def import_template(kind: str, tenant: Tenant = Depends(require_permissions("import.manage"))):
    content = importer.template_xlsx(kind)
    return StreamingResponse(io.BytesIO(content),
                             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{kind}-template.xlsx"'})


@router.post("/import/{kind}/preview", summary="پیش‌نمایش و اعتبارسنجی فایل اکسل")
def import_preview(kind: str, file: UploadFile = File(...),
                   tenant: Tenant = Depends(require_permissions("import.manage")), db: Session = Depends(get_db)):
    return importer.preview(db, _company(db, tenant), kind, file)


class ImportCommit(BaseModel):
    rows: list[dict] = Field(max_length=importer.MAX_ROWS)


@router.post("/import/{kind}/commit", summary="ثبت نهایی ردیف‌های معتبر")
def import_commit(kind: str, data: ImportCommit, tenant: Tenant = Depends(require_permissions("import.manage")),
                  db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    result = importer.commit(db, _company(db, tenant), kind, data.rows)
    audit(db, AuditAction.DATA_IMPORTED, user=tenant.user, company_id=tenant.company_id, entity_type=kind,
          description=f"ورود {result['created']} ردیف ({importer.TEMPLATES[kind]['title']}) از اکسل", ip=meta.ip)
    db.commit()
    return result
