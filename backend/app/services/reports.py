"""Reporting and dashboard aggregations. All queries are tenant-scoped and SQL-side aggregated."""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Float, case, cast, func, literal_column, select
from sqlalchemy.orm import Session

from app.database.base import utcnow
from app.models import (
    Company,
    CustomerRating,
    Department,
    SlaStatus,
    StatusState,
    Ticket,
    TicketCategory,
    TicketPriority,
    TicketStatus,
    User,
)
from app.services.tickets import TicketContext, category_with_children, visibility_filter


@dataclass
class ReportFilters:
    date_from: date | None = None
    date_to: date | None = None
    department_id: str | None = None
    agent_id: str | None = None
    category_id: str | None = None
    status_id: str | None = None
    priority_id: str | None = None


def _dialect(db: Session) -> str:
    return db.get_bind().dialect.name


def minutes_diff(db: Session, start, end):
    """SQL expression: minutes between two datetime columns (dialect aware)."""
    if _dialect(db) == "mysql":
        return func.timestampdiff(literal_column("MINUTE"), start, end)
    return (func.julianday(end) - func.julianday(start)) * 1440.0


def _utc_offset_minutes(company: Company) -> int:
    offset = datetime.now(ZoneInfo(company.timezone or "Asia/Tehran")).utcoffset()
    return int(offset.total_seconds() // 60) if offset else 0


def local_date(db: Session, company: Company, column):
    minutes = _utc_offset_minutes(company)
    if _dialect(db) == "mysql":
        return func.date(func.date_add(column, literal_column(f"INTERVAL {int(minutes)} MINUTE")))
    return func.date(column, f"{'+' if minutes >= 0 else '-'}{abs(minutes)} minutes")


def _local_day_start_utc(company: Company, day: date) -> datetime:
    tz = ZoneInfo(company.timezone or "Asia/Tehran")
    return datetime.combine(day, time.min, tzinfo=tz).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def _base(ctx: TicketContext, f: ReportFilters | None = None, *, scoped_to_user: bool = False):
    stmt_where = [Ticket.company_id == ctx.company_id, Ticket.deleted_at.is_(None)]
    if scoped_to_user:
        stmt_where.append(visibility_filter(ctx.tenant, ctx.company))
    if f:
        if f.date_from:
            stmt_where.append(Ticket.created_at >= _local_day_start_utc(ctx.company, f.date_from))
        if f.date_to:
            stmt_where.append(Ticket.created_at < _local_day_start_utc(ctx.company, f.date_to + timedelta(days=1)))
        if f.department_id:
            stmt_where.append(Ticket.department_id == f.department_id)
        if f.agent_id:
            stmt_where.append(Ticket.assigned_agent_id == f.agent_id)
        if f.category_id:
            stmt_where.append(Ticket.category_id.in_(category_with_children(ctx.db, ctx.company_id, f.category_id)))
        if f.status_id:
            stmt_where.append(Ticket.status_id == f.status_id)
        if f.priority_id:
            stmt_where.append(Ticket.priority_id == f.priority_id)
    return stmt_where


def _round(value, digits: int = 1):
    return round(float(value), digits) if value is not None else None


# ============================================================================ summary

def summary(ctx: TicketContext, f: ReportFilters | None = None, *, scoped_to_user: bool = False) -> dict:
    db = ctx.db
    where = _base(ctx, f, scoped_to_user=scoped_to_user)
    now = utcnow()
    local_today = datetime.now(ZoneInfo(ctx.company.timezone or "Asia/Tehran")).date()
    today_start = _local_day_start_utc(ctx.company, local_today)
    # Iranian week starts on Saturday (weekday 5)
    week_start = _local_day_start_utc(ctx.company, local_today - timedelta(days=(local_today.weekday() - 5) % 7))
    month_start = _local_day_start_utc(ctx.company, local_today.replace(day=1))

    first_resp = minutes_diff(db, Ticket.created_at, Ticket.first_responded_at)
    resolution = minutes_diff(db, Ticket.created_at, Ticket.resolved_at)
    open_states = [StatusState.OPEN, StatusState.PENDING]
    row = db.execute(
        select(
            func.count(Ticket.id),
            func.sum(case((TicketStatus.state.in_(open_states), 1), else_=0)),
            func.sum(case((TicketStatus.state == StatusState.PENDING, 1), else_=0)),
            func.sum(case((TicketStatus.state == StatusState.RESOLVED, 1), else_=0)),
            func.sum(case((TicketStatus.state == StatusState.CLOSED, 1), else_=0)),
            func.sum(case((Ticket.created_at >= today_start, 1), else_=0)),
            func.sum(case((Ticket.created_at >= week_start, 1), else_=0)),
            func.sum(case((Ticket.created_at >= month_start, 1), else_=0)),
            func.avg(case((Ticket.first_responded_at.is_not(None), cast(first_resp, Float)))),
            func.avg(case((Ticket.resolved_at.is_not(None), cast(resolution, Float)))),
            func.sum(case((Ticket.sla_status == SlaStatus.MET, 1), else_=0)),
            func.sum(case((Ticket.sla_status == SlaStatus.BREACHED, 1), else_=0)),
            func.sum(case((Ticket.reopened_count > 0, 1), else_=0)),
            func.sum(case(((Ticket.assigned_agent_id.is_(None)) & TicketStatus.state.in_(open_states), 1), else_=0)),
            func.sum(case((Ticket.escalation_level > 0, 1), else_=0)),
            func.sum(case(((Ticket.sla_status == SlaStatus.WARNING), 1), else_=0)),
            func.sum(case((TicketStatus.state.in_(open_states) & (
                (Ticket.sla_status == SlaStatus.BREACHED) | (Ticket.due_date < now)), 1), else_=0)),
        ).join(TicketStatus, TicketStatus.id == Ticket.status_id).where(*where)
    ).one()
    (total, open_, pending, resolved, closed, today, week, month, avg_first, avg_res, met, breached, reopened,
     unassigned, escalated, warning, overdue) = [v or 0 for v in row[:8]] + [row[8], row[9]] + [v or 0 for v in row[10:]]

    rating_where = [CustomerRating.company_id == ctx.company_id]
    if f and f.date_from:
        rating_where.append(CustomerRating.created_at >= _local_day_start_utc(ctx.company, f.date_from))
    if f and f.date_to:
        rating_where.append(CustomerRating.created_at < _local_day_start_utc(ctx.company, f.date_to + timedelta(days=1)))
    if f and f.agent_id:
        rating_where.append(CustomerRating.agent_id == f.agent_id)
    if f and f.department_id:
        rating_where.append(CustomerRating.department_id == f.department_id)
    avg_rating, rating_count = db.execute(select(func.avg(CustomerRating.rating), func.count(CustomerRating.id))
                                          .where(*rating_where)).one()
    finished_sla = met + breached
    return {
        "total": total, "open": open_, "pending": pending, "resolved": resolved, "closed": closed,
        "new_today": today, "this_week": week, "this_month": month,
        "avg_first_response_minutes": _round(avg_first), "avg_resolution_minutes": _round(avg_res),
        "sla_met": met, "sla_breached": breached, "sla_warning": warning,
        "sla_compliance": _round(met * 100 / finished_sla) if finished_sla else None,
        "reopened": reopened, "unassigned": unassigned, "escalated": escalated, "overdue": overdue,
        "satisfaction_avg": _round(avg_rating, 2), "satisfaction_count": rating_count or 0,
        "satisfaction_percent": _round((float(avg_rating) - 1) * 25) if avg_rating else None,
    }


# ============================================================================ breakdowns

def _group(ctx: TicketContext, f: ReportFilters | None, key_col, label_col, color_col=None, join=None,
           scoped_to_user: bool = False, outer: bool = True) -> list[dict]:
    db = ctx.db
    first_resp = minutes_diff(db, Ticket.created_at, Ticket.first_responded_at)
    resolution = minutes_diff(db, Ticket.created_at, Ticket.resolved_at)
    cols = [key_col, label_col]
    if color_col is not None:
        cols.append(color_col)
    stmt = select(
        *cols,
        func.count(Ticket.id).label("count"),
        func.sum(case((TicketStatus.state.in_([StatusState.OPEN, StatusState.PENDING]), 1), else_=0)).label("open"),
        func.sum(case((TicketStatus.state.in_([StatusState.RESOLVED, StatusState.CLOSED]), 1), else_=0)).label("done"),
        func.avg(case((Ticket.first_responded_at.is_not(None), cast(first_resp, Float)))).label("avg_first"),
        func.avg(case((Ticket.resolved_at.is_not(None), cast(resolution, Float)))).label("avg_res"),
        func.sum(case((Ticket.sla_status == SlaStatus.BREACHED, 1), else_=0)).label("breached"),
        func.sum(case((Ticket.sla_status == SlaStatus.MET, 1), else_=0)).label("met"),
    ).select_from(Ticket).join(TicketStatus, TicketStatus.id == Ticket.status_id)
    if join is not None:
        stmt = stmt.join(join[0], join[1], isouter=outer)
    stmt = stmt.where(*_base(ctx, f, scoped_to_user=scoped_to_user)).group_by(*cols).order_by(func.count(Ticket.id).desc())
    rows = []
    for r in db.execute(stmt).all():
        met, breached = r.met or 0, r.breached or 0
        rows.append({
            "id": r[0], "name": r[1] or "نامشخص", "color": r[2] if color_col is not None else None,
            "count": r.count, "open": r.open or 0, "resolved": r.done or 0,
            "avg_first_response_minutes": _round(r.avg_first), "avg_resolution_minutes": _round(r.avg_res),
            "sla_breached": breached, "sla_met": met,
            "sla_compliance": _round(met * 100 / (met + breached)) if met + breached else None,
        })
    return rows


def by_status(ctx, f=None, scoped_to_user=False):
    return _group(ctx, f, TicketStatus.id, TicketStatus.name, TicketStatus.color, scoped_to_user=scoped_to_user)


def by_priority(ctx, f=None, scoped_to_user=False):
    return _group(ctx, f, TicketPriority.id, TicketPriority.name, TicketPriority.color,
                  join=(TicketPriority, TicketPriority.id == Ticket.priority_id), scoped_to_user=scoped_to_user,
                  outer=False)


def by_category(ctx, f=None, scoped_to_user=False):
    return _group(ctx, f, TicketCategory.id, TicketCategory.name,
                  join=(TicketCategory, TicketCategory.id == Ticket.category_id), scoped_to_user=scoped_to_user)


def by_department(ctx, f=None, scoped_to_user=False):
    return _group(ctx, f, Department.id, Department.name,
                  join=(Department, Department.id == Ticket.department_id), scoped_to_user=scoped_to_user)


def by_agent(ctx: TicketContext, f=None, scoped_to_user=False):
    rows = _group(ctx, f, User.id, User.full_name, join=(User, User.id == Ticket.assigned_agent_id),
                  scoped_to_user=scoped_to_user)
    ratings = dict(
        (agent_id, (avg, count)) for agent_id, avg, count in ctx.db.execute(
            select(CustomerRating.agent_id, func.avg(CustomerRating.rating), func.count(CustomerRating.id))
            .where(CustomerRating.company_id == ctx.company_id).group_by(CustomerRating.agent_id)).all())
    for row in rows:
        if row["id"] is None:
            row["name"] = "بدون کارشناس"
        avg, count = ratings.get(row["id"], (None, 0))
        row["rating_avg"] = _round(avg, 2)
        row["rating_count"] = count
    return rows


def by_date(ctx: TicketContext, f: ReportFilters | None = None, scoped_to_user=False, days: int = 30) -> list[dict]:
    db = ctx.db
    f = f or ReportFilters()
    tz_today = datetime.now(ZoneInfo(ctx.company.timezone or "Asia/Tehran")).date()
    end = f.date_to or tz_today
    start = f.date_from or (end - timedelta(days=days - 1))
    if (end - start).days > 366:
        start = end - timedelta(days=366)
    ff = ReportFilters(**{**f.__dict__, "date_from": start, "date_to": end})
    created_day = local_date(db, ctx.company, Ticket.created_at)
    created = dict(db.execute(select(created_day, func.count(Ticket.id)).select_from(Ticket)
                              .where(*_base(ctx, ff, scoped_to_user=scoped_to_user))
                              .group_by(created_day)).all())
    resolved_day = local_date(db, ctx.company, Ticket.resolved_at)
    res_filters = ReportFilters(**{**f.__dict__, "date_from": None, "date_to": None})
    resolved = dict(db.execute(
        select(resolved_day, func.count(Ticket.id)).select_from(Ticket)
        .where(*_base(ctx, res_filters, scoped_to_user=scoped_to_user), Ticket.resolved_at.is_not(None),
               Ticket.resolved_at >= _local_day_start_utc(ctx.company, start),
               Ticket.resolved_at < _local_day_start_utc(ctx.company, end + timedelta(days=1)))
        .group_by(resolved_day)).all())
    out, day = [], start
    while day <= end:
        key = day.isoformat()
        out.append({"date": key, "created": int(created.get(key, 0) or created.get(day, 0) or 0),
                    "resolved": int(resolved.get(key, 0) or resolved.get(day, 0) or 0)})
        day += timedelta(days=1)
    return out


def sla_performance(ctx: TicketContext, f: ReportFilters | None = None) -> dict:
    rows = by_priority(ctx, f)
    s = summary(ctx, f)
    return {"compliance": s["sla_compliance"], "met": s["sla_met"], "breached": s["sla_breached"],
            "warning": s["sla_warning"], "by_priority": rows, "by_department": by_department(ctx, f)}


def satisfaction(ctx: TicketContext, f: ReportFilters | None = None) -> dict:
    db = ctx.db
    f = f or ReportFilters()
    where = [CustomerRating.company_id == ctx.company_id]
    if f.date_from:
        where.append(CustomerRating.created_at >= _local_day_start_utc(ctx.company, f.date_from))
    if f.date_to:
        where.append(CustomerRating.created_at < _local_day_start_utc(ctx.company, f.date_to + timedelta(days=1)))
    if f.agent_id:
        where.append(CustomerRating.agent_id == f.agent_id)
    if f.department_id:
        where.append(CustomerRating.department_id == f.department_id)
    avg, count = db.execute(select(func.avg(CustomerRating.rating), func.count(CustomerRating.id)).where(*where)).one()
    distribution = {i: 0 for i in range(1, 6)}
    for rating, c in db.execute(select(CustomerRating.rating, func.count()).where(*where)
                                .group_by(CustomerRating.rating)).all():
        distribution[rating] = c
    by_agent_rows = db.execute(
        select(User.id, User.full_name, func.avg(CustomerRating.rating), func.count(CustomerRating.id))
        .join(User, User.id == CustomerRating.agent_id).where(*where)
        .group_by(User.id, User.full_name).order_by(func.avg(CustomerRating.rating).desc())).all()
    by_dept_rows = db.execute(
        select(Department.id, Department.name, func.avg(CustomerRating.rating), func.count(CustomerRating.id))
        .join(Department, Department.id == CustomerRating.department_id).where(*where)
        .group_by(Department.id, Department.name)).all()
    day = local_date(db, ctx.company, CustomerRating.created_at)
    trend = db.execute(select(day, func.avg(CustomerRating.rating), func.count(CustomerRating.id)).where(*where)
                       .group_by(day).order_by(day)).all()
    recent = db.scalars(select(CustomerRating).where(*where, CustomerRating.feedback.is_not(None))
                        .order_by(CustomerRating.created_at.desc()).limit(30)).unique().all()
    return {
        "average": _round(avg, 2), "count": count or 0,
        "distribution": [{"rating": k, "count": v} for k, v in distribution.items()],
        "by_agent": [{"id": r[0], "name": r[1], "average": _round(r[2], 2), "count": r[3]} for r in by_agent_rows],
        "by_department": [{"id": r[0], "name": r[1], "average": _round(r[2], 2), "count": r[3]} for r in by_dept_rows],
        "trend": [{"date": str(r[0]), "average": _round(r[1], 2), "count": r[2]} for r in trend],
        "feedback": [{"id": r.id, "ticket_id": r.ticket_id, "rating": r.rating, "feedback": r.feedback,
                      "customer": r.customer.full_name if r.customer else None,
                      "agent": r.agent.full_name if r.agent else None,
                      "created_at": r.created_at} for r in recent],
    }


def reopened_tickets(ctx: TicketContext, f: ReportFilters | None = None, limit: int = 100) -> list[Ticket]:
    return list(ctx.db.scalars(select(Ticket).where(*_base(ctx, f), Ticket.reopened_count > 0)
                               .order_by(Ticket.updated_at.desc()).limit(limit)).unique())


def closed_tickets(ctx: TicketContext, f: ReportFilters | None = None, limit: int = 500) -> list[Ticket]:
    return list(ctx.db.scalars(
        select(Ticket).join(TicketStatus, TicketStatus.id == Ticket.status_id)
        .where(*_base(ctx, f), TicketStatus.state.in_([StatusState.CLOSED, StatusState.RESOLVED]))
        .order_by(Ticket.closed_at.desc()).limit(limit)).unique())


# ============================================================================ dashboards

def agent_dashboard(ctx: TicketContext) -> dict:
    db, user = ctx.db, ctx.user
    where = _base(ctx, scoped_to_user=True)
    now = utcnow()
    open_states = [StatusState.OPEN, StatusState.PENDING]
    row = db.execute(select(
        func.sum(case(((Ticket.assigned_agent_id == user.id) & TicketStatus.state.in_(open_states), 1), else_=0)),
        func.sum(case(((Ticket.assigned_agent_id.is_(None)) & TicketStatus.state.in_(open_states), 1), else_=0)),
        func.sum(case((TicketStatus.code == "new", 1), else_=0)),
        func.sum(case((TicketStatus.state == StatusState.PENDING, 1), else_=0)),
        func.sum(case((TicketStatus.state.in_(open_states) & ((Ticket.sla_status == SlaStatus.BREACHED) |
                                                             (Ticket.due_date < now)), 1), else_=0)),
        func.sum(case((TicketStatus.state.in_(open_states) & (Ticket.sla_status == SlaStatus.BREACHED), 1), else_=0)),
        func.sum(case((TicketStatus.code == "pending_customer", 1), else_=0)),
        func.sum(case((TicketStatus.code == "pending_support", 1), else_=0)),
        func.sum(case((TicketStatus.state.in_(open_states) & (Ticket.sla_status == SlaStatus.WARNING), 1), else_=0)),
    ).select_from(Ticket).join(TicketStatus, TicketStatus.id == Ticket.status_id).where(*where)).one()
    keys = ["assigned", "unassigned", "new", "pending", "overdue", "sla_breaches", "waiting_customer",
            "waiting_support", "sla_warnings"]
    counts = {k: int(v or 0) for k, v in zip(keys, row, strict=True)}
    s = summary(ctx, scoped_to_user=True)
    return {
        "counts": counts,
        "avg_first_response_minutes": s["avg_first_response_minutes"],
        "avg_resolution_minutes": s["avg_resolution_minutes"],
        "by_status": by_status(ctx, scoped_to_user=True),
        "by_priority": by_priority(ctx, scoped_to_user=True),
        "by_category": by_category(ctx, scoped_to_user=True)[:8],
        "over_time": by_date(ctx, scoped_to_user=True, days=14),
        "response_trend": response_trend(ctx, days=14, scoped_to_user=True),
    }


def response_trend(ctx: TicketContext, days: int = 30, scoped_to_user: bool = False) -> list[dict]:
    db = ctx.db
    tz_today = datetime.now(ZoneInfo(ctx.company.timezone or "Asia/Tehran")).date()
    start = tz_today - timedelta(days=days - 1)
    day = local_date(db, ctx.company, Ticket.created_at)
    first_resp = minutes_diff(db, Ticket.created_at, Ticket.first_responded_at)
    resolution = minutes_diff(db, Ticket.created_at, Ticket.resolved_at)
    rows = db.execute(
        select(day, func.avg(case((Ticket.first_responded_at.is_not(None), cast(first_resp, Float)))),
               func.avg(case((Ticket.resolved_at.is_not(None), cast(resolution, Float)))))
        .select_from(Ticket)
        .where(*_base(ctx, ReportFilters(date_from=start, date_to=tz_today), scoped_to_user=scoped_to_user))
        .group_by(day)).all()
    data = {str(r[0]): (r[1], r[2]) for r in rows}
    out, d = [], start
    while d <= tz_today:
        first, res = data.get(d.isoformat(), (None, None))
        out.append({"date": d.isoformat(), "avg_first_response_minutes": _round(first),
                    "avg_resolution_minutes": _round(res)})
        d += timedelta(days=1)
    return out


def admin_dashboard(ctx: TicketContext) -> dict:
    return {
        "summary": summary(ctx),
        "over_time": by_date(ctx, days=30),
        "by_status": by_status(ctx),
        "by_priority": by_priority(ctx),
        "by_category": by_category(ctx)[:10],
        "by_department": by_department(ctx),
        "top_agents": by_agent(ctx)[:8],
        "response_trend": response_trend(ctx, days=30),
        "satisfaction": {k: v for k, v in satisfaction(ctx).items() if k in ("average", "count", "distribution")},
    }


def platform_stats(db: Session) -> dict:
    from app.models import Company as C
    from app.models import UserType

    companies = db.scalar(select(func.count()).select_from(C).where(C.deleted_at.is_(None))) or 0
    active = db.scalar(select(func.count()).select_from(C).where(C.deleted_at.is_(None), C.is_active.is_(True))) or 0
    users = dict(db.execute(select(User.user_type, func.count()).where(User.deleted_at.is_(None))
                            .group_by(User.user_type)).all())
    tickets = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.deleted_at.is_(None))) or 0
    month_start = utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    tickets_month = db.scalar(select(func.count()).select_from(Ticket).where(Ticket.created_at >= month_start)) or 0
    per_company = db.execute(
        select(C.id, C.name, func.count(Ticket.id)).outerjoin(Ticket, (Ticket.company_id == C.id) &
                                                               Ticket.deleted_at.is_(None))
        .where(C.deleted_at.is_(None)).group_by(C.id, C.name).order_by(func.count(Ticket.id).desc()).limit(10)).all()
    by_plan = db.execute(select(C.subscription_status, func.count()).where(C.deleted_at.is_(None))
                         .group_by(C.subscription_status)).all()
    avg_rating = db.scalar(select(func.avg(CustomerRating.rating)))
    return {
        "companies": companies, "active_companies": active,
        "staff": users.get(UserType.STAFF, 0), "customers": users.get(UserType.CUSTOMER, 0),
        "tickets": tickets, "tickets_this_month": tickets_month, "satisfaction_avg": _round(avg_rating, 2),
        "top_companies": [{"id": r[0], "name": r[1], "tickets": r[2]} for r in per_company],
        "subscriptions": [{"status": r[0], "count": r[1]} for r in by_plan],
    }
