"""Companies (tenants), plans, public branding and the current company's profile."""
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_request_meta, pagination, require_permissions, require_platform
from app.core.exceptions import Conflict, NotFound, ValidationFailed
from app.core.security import hash_password
from app.database.base import utcnow
from app.database.session import get_db
from app.models import Company, Plan, Ticket, User, UserType
from app.schemas.common import Message, mobile_validator
from app.schemas.company import (
    CompanyAdminUpdate,
    CompanyCreate,
    CompanyOut,
    CompanyUpdate,
    PlanIn,
    PlanOut,
    PublicCompanyOut,
)
from app.services.audit import AuditAction, audit
from app.services.auth import ensure_unique_contact
from app.services.company import bootstrap_company, company_setting
from app.services.rbac import get_system_role
from app.services.reports import platform_stats
from app.utils.files import IMAGE_EXTENSIONS, delete_file, validate_and_store
from app.utils.pagination import make_page
from app.utils.persian import escape_like

router = APIRouter(tags=["سازمان‌ها و اشتراک"])


def _company_stats(db: Session, company_id: str) -> dict:
    users = dict(db.execute(select(User.user_type, func.count()).where(User.company_id == company_id,
                                                                       User.deleted_at.is_(None))
                            .group_by(User.user_type)).all())
    tickets = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.company_id == company_id,
                                                                       Ticket.deleted_at.is_(None))) or 0
    return {"staff": users.get(UserType.STAFF, 0), "customers": users.get(UserType.CUSTOMER, 0), "tickets": tickets}


# ============================================================================ public

@router.get("/public/companies/{slug}", response_model=PublicCompanyOut, tags=["عمومی"])
def public_company(slug: str, db: Session = Depends(get_db)):
    company = db.scalar(select(Company).where(Company.slug == slug.lower(), Company.deleted_at.is_(None),
                                              Company.is_active.is_(True)))
    if company is None:
        raise NotFound("سازمان یافت نشد.")
    out = PublicCompanyOut.model_validate(company)
    out.allow_registration = bool(company_setting(company, "allow_registration"))
    return out


# ============================================================================ current company

@router.get("/company", response_model=CompanyOut, summary="اطلاعات سازمان جاری")
def current_company(tenant: Tenant = Depends(require_permissions("settings.view")), db: Session = Depends(get_db)):
    company = db.get(Company, tenant.company_id)
    return CompanyOut.build(company, _company_stats(db, company.id))


@router.put("/company", response_model=CompanyOut)
def update_current_company(data: CompanyUpdate, tenant: Tenant = Depends(require_permissions("settings.update")),
                           db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    company = db.get(Company, tenant.company_id)
    values = data.model_dump(exclude_unset=True, mode="json")
    before = {k: getattr(company, k) for k in values}
    for key, value in values.items():
        setattr(company, key, value)
    audit(db, AuditAction.COMPANY_UPDATED, user=tenant.user, company_id=company.id, entity_type="company",
          entity_id=company.id, description="ویرایش اطلاعات سازمان",
          changes={k: {"old": before[k], "new": v} for k, v in values.items() if before[k] != v and k != "working_hours"},
          ip=meta.ip)
    db.commit()
    return CompanyOut.build(company)


@router.post("/company/logo", response_model=CompanyOut)
def upload_logo(file: UploadFile = File(...), tenant: Tenant = Depends(require_permissions("settings.update")),
                db: Session = Depends(get_db)):
    company = db.get(Company, tenant.company_id)
    stored = validate_and_store(file, "public/logos", allowed=IMAGE_EXTENSIONS)
    delete_file(f"public/{company.logo_path}" if company.logo_path else None)
    company.logo_path = stored.relative_path.removeprefix("public/")
    db.commit()
    return CompanyOut.build(company)


# ============================================================================ platform: companies

@router.get("/companies", summary="فهرست سازمان‌ها (مدیر کل)")
def list_companies(q: str | None = None, pg=Depends(pagination), tenant: Tenant = Depends(require_platform()),
                   db: Session = Depends(get_db)):
    stmt = select(Company).where(Company.deleted_at.is_(None))
    if q:
        like = f"%{escape_like(q)}%"
        stmt = stmt.where(or_(Company.name.like(like), Company.slug.like(like), Company.email.like(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Company.created_at.desc()).limit(pg[1]).offset((pg[0] - 1) * pg[1])).unique()
    return make_page([CompanyOut.build(c, _company_stats(db, c.id)) for c in items], total, *pg)


@router.get("/companies/options", summary="فهرست کوتاه سازمان‌ها برای انتخاب")
def company_options(tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    rows = db.execute(select(Company.id, Company.name, Company.slug).where(Company.deleted_at.is_(None))
                      .order_by(Company.name)).all()
    return [{"id": r[0], "name": r[1], "slug": r[2]} for r in rows]


@router.post("/companies", response_model=CompanyOut, status_code=201)
def create_company(data: CompanyCreate, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db),
                   meta: RequestMeta = Depends(get_request_meta)):
    if db.scalar(select(Company.id).where(Company.slug == data.slug)):
        raise Conflict("این شناسه سازمان قبلاً استفاده شده است.")
    admin_mobile = mobile_validator(data.admin_mobile)
    admin_email = data.admin_email.lower() if data.admin_email else None
    if not admin_email and not admin_mobile:
        raise ValidationFailed("ایمیل یا موبایل مدیر سازمان الزامی است.")
    ensure_unique_contact(db, admin_email, admin_mobile)
    if data.plan_id and db.get(Plan, data.plan_id) is None:
        raise ValidationFailed("پلن انتخاب شده معتبر نیست.")
    values = data.model_dump(exclude_unset=True, mode="json",
                             exclude={"admin_full_name", "admin_email", "admin_mobile", "admin_password"})
    company = Company(**values)
    db.add(company)
    db.flush()
    bootstrap_company(db, company)
    admin = User(company_id=company.id, user_type=UserType.STAFF, full_name=data.admin_full_name, email=admin_email,
                 mobile=admin_mobile, password_hash=hash_password(data.admin_password), password_changed_at=utcnow(),
                 job_title="مدیر سازمان")
    admin.roles = [get_system_role(db, "company_admin")]
    db.add(admin)
    audit(db, AuditAction.COMPANY_CREATED, user=tenant.user, company_id=company.id, entity_type="company",
          entity_id=company.id, description=f"ایجاد سازمان {company.name}", ip=meta.ip)
    db.commit()
    return CompanyOut.build(company, _company_stats(db, company.id))


@router.get("/companies/{company_id}", response_model=CompanyOut)
def get_company(company_id: str, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    company = db.scalar(select(Company).where(Company.id == company_id, Company.deleted_at.is_(None)))
    if company is None:
        raise NotFound("سازمان یافت نشد.")
    return CompanyOut.build(company, _company_stats(db, company.id))


@router.put("/companies/{company_id}", response_model=CompanyOut)
def update_company(company_id: str, data: CompanyAdminUpdate, tenant: Tenant = Depends(require_platform()),
                   db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    company = db.scalar(select(Company).where(Company.id == company_id, Company.deleted_at.is_(None)))
    if company is None:
        raise NotFound("سازمان یافت نشد.")
    values = data.model_dump(exclude_unset=True)
    if "working_hours" in values and values["working_hours"] is not None:
        values["working_hours"] = data.model_dump(mode="json")["working_hours"]
    if values.get("plan_id") and db.get(Plan, values["plan_id"]) is None:
        raise ValidationFailed("پلن انتخاب شده معتبر نیست.")
    if values.get("subscription_ends_at"):
        values["subscription_ends_at"] = values["subscription_ends_at"].replace(tzinfo=None)
    for key, value in values.items():
        setattr(company, key, value)
    audit(db, AuditAction.COMPANY_UPDATED, user=tenant.user, company_id=company.id, entity_type="company",
          entity_id=company.id, description=f"ویرایش سازمان {company.name}", ip=meta.ip)
    db.commit()
    return CompanyOut.build(company, _company_stats(db, company.id))


@router.delete("/companies/{company_id}", response_model=Message)
def delete_company(company_id: str, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db),
                   meta: RequestMeta = Depends(get_request_meta)):
    company = db.scalar(select(Company).where(Company.id == company_id, Company.deleted_at.is_(None)))
    if company is None:
        raise NotFound("سازمان یافت نشد.")
    company.soft_delete()
    company.is_active = False
    audit(db, AuditAction.COMPANY_DELETED, user=tenant.user, company_id=company.id, entity_type="company",
          entity_id=company.id, description=f"حذف سازمان {company.name}", ip=meta.ip)
    db.commit()
    return Message(message="سازمان حذف شد.")


@router.get("/platform/stats", summary="آمار کل سامانه")
def system_stats(tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    return platform_stats(db)


# ============================================================================ plans

@router.get("/plans", response_model=list[PlanOut])
def list_plans(tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Company.plan_id, func.count()).where(Company.deleted_at.is_(None))
                             .group_by(Company.plan_id)).all())
    plans = db.scalars(select(Plan).order_by(Plan.sort_order, Plan.price_monthly)).all()
    out = []
    for plan in plans:
        item = PlanOut.model_validate(plan)
        item.companies_count = counts.get(plan.id, 0)
        out.append(item)
    return out


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(data: PlanIn, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    if db.scalar(select(Plan.id).where(Plan.code == data.code)):
        raise Conflict("پلنی با این کد وجود دارد.")
    plan = Plan(**data.model_dump())
    db.add(plan)
    db.commit()
    return plan


@router.put("/plans/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: str, data: PlanIn, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise NotFound("پلن یافت نشد.")
    if db.scalar(select(Plan.id).where(Plan.code == data.code, Plan.id != plan_id)):
        raise Conflict("پلنی با این کد وجود دارد.")
    for key, value in data.model_dump().items():
        setattr(plan, key, value)
    db.commit()
    return plan


@router.delete("/plans/{plan_id}", response_model=Message)
def delete_plan(plan_id: str, tenant: Tenant = Depends(require_platform()), db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise NotFound("پلن یافت نشد.")
    if db.scalar(select(func.count()).select_from(Company).where(Company.plan_id == plan_id,
                                                                 Company.deleted_at.is_(None))):
        raise ValidationFailed("این پلن به سازمان‌هایی تخصیص داده شده است.")
    db.delete(plan)
    db.commit()
    return Message(message="پلن حذف شد.")
