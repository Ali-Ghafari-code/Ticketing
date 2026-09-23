"""Dashboards and reports with Excel/CSV/PDF export."""
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_company_tenant, get_request_meta, require_permissions
from app.core.exceptions import PermissionDenied, ValidationFailed
from app.database.session import get_db
from app.services import reports
from app.services.audit import AuditAction, audit
from app.services.exporter import TICKET_COLUMNS, export_response, ticket_rows
from app.services.tickets import TicketContext, load_context

router = APIRouter(tags=["داشبورد و گزارش‌ها"])

REPORT_TYPES = {
    "by_date": "تیکت‌ها بر اساس تاریخ",
    "by_department": "تیکت‌ها بر اساس دپارتمان",
    "by_agent": "تیکت‌ها بر اساس کارشناس",
    "by_category": "تیکت‌ها بر اساس دسته‌بندی",
    "by_priority": "تیکت‌ها بر اساس اولویت",
    "by_status": "تیکت‌ها بر اساس وضعیت",
    "sla": "عملکرد SLA",
    "satisfaction": "رضایت مشتریان",
    "closed": "تیکت‌های بسته شده",
    "reopened": "تیکت‌های بازگشایی شده",
}


def _filters(date_from: date | None = None, date_to: date | None = None, department_id: str | None = None,
             agent_id: str | None = None, category_id: str | None = None, status_id: str | None = None,
             priority_id: str | None = None) -> reports.ReportFilters:
    if date_from and date_to and date_from > date_to:
        raise ValidationFailed("تاریخ شروع باید قبل از تاریخ پایان باشد.")
    return reports.ReportFilters(date_from, date_to, department_id, agent_id, category_id, status_id, priority_id)


def _ctx(tenant: Tenant, db: Session) -> TicketContext:
    return load_context(db, tenant)


@router.get("/dashboard", summary="داشبورد متناسب با نقش کاربر")
def dashboard(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    ctx = _ctx(tenant, db)
    if tenant.user.is_customer:
        from app.services.tickets import customer_stats

        return {"type": "customer", "stats": customer_stats(ctx)}
    data = {"type": "agent", "agent": reports.agent_dashboard(ctx)}
    if tenant.has("reports.view"):
        data["type"] = "admin"
        data["admin"] = reports.admin_dashboard(ctx)
    return data


_BREAKDOWN = {
    "by_department": ("دپارتمان", reports.by_department),
    "by_agent": ("کارشناس", reports.by_agent),
    "by_category": ("دسته‌بندی", reports.by_category),
    "by_priority": ("اولویت", reports.by_priority),
    "by_status": ("وضعیت", reports.by_status),
}

BREAKDOWN_COLUMNS = [
    ("name", "عنوان"), ("count", "تعداد کل"), ("open", "باز"), ("resolved", "حل/بسته شده"),
    ("avg_first_response_minutes", "میانگین اولین پاسخ (دقیقه)"),
    ("avg_resolution_minutes", "میانگین زمان حل (دقیقه)"), ("sla_compliance", "رعایت SLA (٪)"),
]


@router.get("/reports/summary")
def report_summary(f: reports.ReportFilters = Depends(_filters),
                   tenant: Tenant = Depends(require_permissions("reports.view")), db: Session = Depends(get_db)):
    return reports.summary(_ctx(tenant, db), f)


@router.get("/reports/tickets", summary="گزارش جامع تیکت‌ها")
def report_tickets(f: reports.ReportFilters = Depends(_filters),
                   tenant: Tenant = Depends(require_permissions("reports.view")), db: Session = Depends(get_db)):
    ctx = _ctx(tenant, db)
    return {
        "summary": reports.summary(ctx, f),
        "by_date": reports.by_date(ctx, f),
        "by_department": reports.by_department(ctx, f),
        "by_agent": reports.by_agent(ctx, f),
        "by_category": reports.by_category(ctx, f),
        "by_priority": reports.by_priority(ctx, f),
        "by_status": reports.by_status(ctx, f),
        "response_trend": reports.response_trend(ctx),
    }


@router.get("/reports/sla")
def report_sla(f: reports.ReportFilters = Depends(_filters),
               tenant: Tenant = Depends(require_permissions("reports.view")), db: Session = Depends(get_db)):
    return reports.sla_performance(_ctx(tenant, db), f)


@router.get("/reports/satisfaction")
def report_satisfaction(f: reports.ReportFilters = Depends(_filters),
                        tenant: Tenant = Depends(require_permissions("reports.view", "ratings.view", any_of=True)),
                        db: Session = Depends(get_db)):
    return reports.satisfaction(_ctx(tenant, db), f)


@router.get("/reports/reopened")
def report_reopened(f: reports.ReportFilters = Depends(_filters),
                    tenant: Tenant = Depends(require_permissions("reports.view")), db: Session = Depends(get_db)):
    from app.schemas.ticket import TicketListItem

    return [TicketListItem.model_validate(t) for t in reports.reopened_tickets(_ctx(tenant, db), f)]


@router.get("/reports/export", summary="خروجی گزارش (Excel/CSV/PDF)")
def export_report(report: str = Query(..., description=", ".join(REPORT_TYPES)),
                  fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"),
                  f: reports.ReportFilters = Depends(_filters),
                  tenant: Tenant = Depends(require_permissions("reports.export")), db: Session = Depends(get_db),
                  meta: RequestMeta = Depends(get_request_meta)):
    if report not in REPORT_TYPES:
        raise ValidationFailed("نوع گزارش نامعتبر است.")
    ctx = _ctx(tenant, db)
    title = REPORT_TYPES[report]
    subtitle = None
    if f.date_from or f.date_to:
        from app.utils.jalali import format_jalali

        subtitle = f"بازه: {format_jalali(f.date_from, with_time=False) if f.date_from else '—'} تا " \
                   f"{format_jalali(f.date_to, with_time=False) if f.date_to else '—'}"
    audit(db, AuditAction.DATA_EXPORTED, user=tenant.user, company_id=tenant.company_id,
          description=f"خروجی گزارش {title} ({fmt})", ip=meta.ip)
    db.commit()

    if report in _BREAKDOWN:
        _, fn = _BREAKDOWN[report]
        columns = list(BREAKDOWN_COLUMNS)
        if report == "by_agent":
            columns.append(("rating_avg", "میانگین امتیاز"))
        return export_response(fmt, report, title, columns, fn(ctx, f), subtitle)
    if report == "by_date":
        cols = [("date", "تاریخ"), ("created", "ایجاد شده"), ("resolved", "حل شده")]
        from datetime import date as _d

        from app.utils.jalali import format_jalali

        rows = [{**r, "date": format_jalali(_d.fromisoformat(r["date"]), with_time=False)}
                for r in reports.by_date(ctx, f)]
        return export_response(fmt, report, title, cols, rows, subtitle)
    if report == "sla":
        return export_response(fmt, report, title, BREAKDOWN_COLUMNS, reports.by_priority(ctx, f), subtitle)
    if report == "satisfaction":
        data = reports.satisfaction(ctx, f)
        cols = [("created_at", "تاریخ"), ("customer", "مشتری"), ("agent", "کارشناس"), ("rating", "امتیاز"),
                ("feedback", "بازخورد")]
        agent_cols = [("name", "کارشناس"), ("average", "میانگین امتیاز"), ("count", "تعداد")]
        return export_response(fmt, report, title, cols, data["feedback"], subtitle,
                               sheets={"امتیاز کارشناسان": (agent_cols, data["by_agent"])})
    tickets = reports.closed_tickets(ctx, f) if report == "closed" else reports.reopened_tickets(ctx, f)
    return export_response(fmt, report, title, TICKET_COLUMNS, ticket_rows(tickets), subtitle)


__all__ = ["router", "PermissionDenied"]
