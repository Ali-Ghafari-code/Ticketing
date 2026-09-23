"""Tickets, conversation, attachments, history and ratings."""
from datetime import date

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_company_tenant, get_request_meta, pagination, require_permissions
from app.config.settings import settings
from app.core.exceptions import NotFound, ValidationFailed
from app.database.session import get_db
from app.models import Ticket, TicketCategory, TicketPriority, TicketStatus
from app.repositories import (
    CategoryRepository,
    DepartmentRepository,
    PriorityRepository,
    StatusRepository,
    TagRepository,
)
from app.schemas.common import Message
from app.schemas.ticket import (
    ActivityOut,
    AttachmentOut,
    EscalateRequest,
    MessageOut,
    MessageUpdate,
    RatingCreate,
    RatingOut,
    TicketBulkUpdate,
    TicketCreate,
    TicketCreatedOut,
    TicketDetail,
    TicketListItem,
    TicketStats,
    TicketUpdate,
)
from app.services import tickets as svc
from app.services.audit import AuditAction, audit
from app.services.company import company_setting
from app.services.exporter import TICKET_COLUMNS, export_response, ticket_rows
from app.utils.files import ALLOWED_TYPES, resolve_path
from app.utils.pagination import make_page

router = APIRouter(tags=["تیکت‌ها"])


def ctx_dep(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db),
            meta: RequestMeta = Depends(get_request_meta)) -> svc.TicketContext:
    return svc.load_context(db, tenant, meta)


def _filters(
    q: str | None = None, status_id: list[str] = Query(default=[]), state: str | None = None,
    priority_id: list[str] = Query(default=[]), category_id: str | None = None, department_id: str | None = None,
    agent: str | None = None, customer_id: str | None = None, tag_id: list[str] = Query(default=[]),
    sla_status: list[str] = Query(default=[]), date_from: date | None = None, date_to: date | None = None,
    escalated: bool | None = None, overdue: bool | None = None,
    sort: str = Query("updated_at", pattern="^(created_at|updated_at|number|subject|last_response_at|resolution_due_at|due_date|priority|status)$"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
) -> svc.TicketFilters:
    return svc.TicketFilters(q=q, status_ids=status_id, state=state, priority_ids=priority_id, category_id=category_id,
                             department_id=department_id, agent=agent, customer_id=customer_id, tag_ids=tag_id,
                             sla_status=sla_status, date_from=date_from, date_to=date_to, escalated=escalated,
                             overdue=overdue, sort=sort, direction=direction)


def _detail(ctx: svc.TicketContext, ticket: Ticket) -> TicketDetail:
    out = TicketDetail.model_validate(ticket)
    out.attachments = [AttachmentOut.model_validate(a) for a in svc.ticket_attachments(ctx, ticket)]
    out.rating = RatingOut.model_validate(ticket.rating) if ticket.rating else None
    out.can = svc.permissions_for(ctx, ticket)
    return out


# ============================================================================ meta

@router.get("/tickets/meta", summary="اطلاعات پایه فرم و فیلترهای تیکت")
def ticket_meta(ctx: svc.TicketContext = Depends(ctx_dep)):
    from app.api.categories.router import build_tree
    from app.schemas.config import DepartmentOut, PriorityOut, StatusOut, TagOut

    db, company, is_customer = ctx.db, ctx.company, ctx.user.is_customer
    categories = list(db.scalars(CategoryRepository(db, company.id).scoped()
                                 .where(TicketCategory.is_active.is_(True))
                                 .order_by(TicketCategory.sort_order, TicketCategory.name)).unique())
    departments = DepartmentRepository(db, company.id).list()
    departments = [d for d in departments if d.is_active]
    priorities = db.scalars(PriorityRepository(db, company.id).scoped().where(TicketPriority.is_active.is_(True))
                            .order_by(TicketPriority.level)).all()
    statuses = db.scalars(StatusRepository(db, company.id).scoped().order_by(TicketStatus.sort_order)).all()
    result = {
        "categories": build_tree(categories),
        "departments": [{"id": d.id, "name": d.name, "description": d.description} for d in departments],
        "priorities": [PriorityOut.model_validate(p) for p in priorities],
        "statuses": [StatusOut.model_validate(s) for s in statuses if s.is_active or not is_customer],
        "settings": {
            "customer_can_select_priority": company_setting(company, "customer_can_select_priority"),
            "customer_can_select_department": company_setting(company, "customer_can_select_department"),
            "require_category": company_setting(company, "require_category"),
            "kb_suggest_before_ticket": company_setting(company, "kb_suggest_before_ticket"),
            "rating_enabled": company_setting(company, "rating_enabled"),
            "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
            "max_files": settings.MAX_FILES_PER_MESSAGE,
            "allowed_extensions": sorted(ALLOWED_TYPES),
        },
    }
    if not is_customer:
        from app.schemas.common import UserBrief

        result["tags"] = [TagOut.model_validate(t) for t in TagRepository(db, company.id).list()]
        result["agents"] = [UserBrief.model_validate(a) for a in svc.agents_for_company(db, company.id)]
        result["departments"] = [DepartmentOut.model_validate(d).model_dump(include={"id", "name", "description"})
                                 for d in departments]
    return result


# ============================================================================ list / stats / export

@router.get("/tickets", summary="فهرست تیکت‌ها با جستجو، فیلتر و مرتب‌سازی")
def list_tickets(filters: svc.TicketFilters = Depends(_filters), pg=Depends(pagination),
                 ctx: svc.TicketContext = Depends(ctx_dep)):
    if not ctx.tenant.has_any("tickets.view", "tickets.view_all", "tickets.view_own"):
        from app.core.exceptions import PermissionDenied

        raise PermissionDenied()
    from app.utils.pagination import paginate

    items, total = paginate(ctx.db, svc.build_ticket_query(ctx, filters), *pg, unique=True)
    unread = svc.unread_map(ctx.db, ctx.user, items)
    out = []
    for t in items:
        item = TicketListItem.model_validate(t)
        item.unread = unread.get(t.id, False)
        out.append(item)
    return make_page(out, total, *pg)


@router.get("/tickets/stats", response_model=TicketStats)
def ticket_stats(ctx: svc.TicketContext = Depends(ctx_dep)):
    return svc.customer_stats(ctx)


@router.get("/tickets/export", summary="خروجی تیکت‌ها (Excel/CSV/PDF)")
def export_tickets(fmt: str = Query("xlsx", pattern="^(xlsx|csv|pdf)$"),
                   filters: svc.TicketFilters = Depends(_filters),
                   tenant: Tenant = Depends(require_permissions("tickets.export")),
                   ctx: svc.TicketContext = Depends(ctx_dep)):
    tickets = ctx.db.scalars(svc.build_ticket_query(ctx, filters).limit(20000)).unique().all()
    audit(ctx.db, AuditAction.DATA_EXPORTED, user=ctx.user, company_id=ctx.company_id,
          description=f"خروجی {len(tickets)} تیکت ({fmt})")
    ctx.db.commit()
    return export_response(fmt, "tickets", "گزارش تیکت‌ها", TICKET_COLUMNS, ticket_rows(tickets))


# ============================================================================ create

@router.post("/tickets", response_model=TicketCreatedOut, status_code=201,
             summary="ایجاد تیکت (multipart: فیلد payload به صورت JSON + فایل‌ها)")
def create_ticket(payload: str = Form(..., description="JSON مطابق TicketCreate"),
                  files: list[UploadFile] = File(default=[]), ctx: svc.TicketContext = Depends(ctx_dep)):
    try:
        data = TicketCreate.model_validate_json(payload)
    except ValidationError as exc:
        details = [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"].removeprefix("Value error, ")}
                   for e in exc.errors()]
        raise ValidationFailed(details=details) from exc
    ticket = svc.create_ticket(ctx, data, files)
    ctx.db.commit()
    return TicketCreatedOut(id=ticket.id, code=ticket.code, number=ticket.number,
                            message=f"تیکت شما با شماره {ticket.code} با موفقیت ثبت شد.")


@router.post("/tickets/bulk", response_model=Message, summary="به‌روزرسانی گروهی تیکت‌ها")
def bulk_update(data: TicketBulkUpdate, ctx: svc.TicketContext = Depends(ctx_dep)):
    count = svc.bulk_update(ctx, data)
    ctx.db.commit()
    return Message(message=f"{count} تیکت به‌روزرسانی شد.")


# ============================================================================ single ticket

@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    return _detail(ctx, ticket)


@router.put("/tickets/{ticket_id}", response_model=TicketDetail)
@router.patch("/tickets/{ticket_id}", response_model=TicketDetail, include_in_schema=False)
def update_ticket(ticket_id: str, data: TicketUpdate, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    svc.update_ticket(ctx, ticket, data)
    ctx.db.commit()
    ctx.db.refresh(ticket)
    return _detail(ctx, ticket)


@router.delete("/tickets/{ticket_id}", response_model=Message)
def delete_ticket(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    svc.delete_ticket(ctx, ticket)
    ctx.db.commit()
    return Message(message="تیکت حذف شد.")


@router.post("/tickets/{ticket_id}/escalate", response_model=TicketDetail)
def escalate(ticket_id: str, data: EscalateRequest, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    svc.escalate(ctx, ticket, data)
    ctx.db.commit()
    return _detail(ctx, ticket)


@router.post("/tickets/{ticket_id}/close", response_model=TicketDetail, summary="بستن تیکت توسط مشتری")
def close_ticket(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    if ctx.user.is_customer:
        svc.customer_close(ctx, ticket)
    else:
        closed = StatusRepository(ctx.db, ctx.company_id).first_in_state("closed")
        svc.change_status(ctx, ticket, closed)
    ctx.db.commit()
    return _detail(ctx, ticket)


@router.post("/tickets/{ticket_id}/reopen", response_model=TicketDetail)
def reopen_ticket(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    svc.reopen(ctx, ticket)
    ctx.db.commit()
    return _detail(ctx, ticket)


@router.post("/tickets/{ticket_id}/read", response_model=Message)
def mark_ticket_read(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    svc.mark_read(ctx.db, ticket, ctx.user)
    ctx.db.commit()
    return Message(message="ok")


# ============================================================================ messages

@router.get("/tickets/{ticket_id}/messages", response_model=list[MessageOut])
def list_messages(ticket_id: str, q: str | None = None, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    return svc.list_messages(ctx, ticket, q)


@router.post("/tickets/{ticket_id}/messages", response_model=MessageOut, status_code=201,
             summary="ارسال پاسخ یا یادداشت داخلی (multipart)")
def add_message(ticket_id: str, body: str = Form(""), is_internal: bool = Form(False),
                files: list[UploadFile] = File(default=[]), ctx: svc.TicketContext = Depends(ctx_dep)):
    if len(body) > 100_000:
        raise ValidationFailed("متن پیام بیش از حد طولانی است.")
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    message = svc.add_message(ctx, ticket, body, is_internal, files)
    ctx.db.commit()
    return next(m for m in svc.list_messages(ctx, ticket) if m["id"] == message.id)


@router.put("/tickets/{ticket_id}/messages/{message_id}", response_model=MessageOut)
def edit_message(ticket_id: str, message_id: str, data: MessageUpdate, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    message = svc.get_message(ctx, ticket, message_id)
    svc.edit_message(ctx, ticket, message, data.body)
    ctx.db.commit()
    return next(m for m in svc.list_messages(ctx, ticket) if m["id"] == message.id)


@router.delete("/tickets/{ticket_id}/messages/{message_id}", response_model=Message)
def delete_message(ticket_id: str, message_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    message = svc.get_message(ctx, ticket, message_id)
    svc.delete_message(ctx, ticket, message)
    ctx.db.commit()
    return Message(message="پیام حذف شد.")


# ============================================================================ attachments

@router.get("/tickets/{ticket_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    return svc.ticket_attachments(ctx, ticket)


@router.post("/tickets/{ticket_id}/attachments", response_model=list[AttachmentOut], status_code=201)
def upload_attachments(ticket_id: str, files: list[UploadFile] = File(...), is_internal: bool = Form(False),
                       ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    attachments = svc.add_ticket_attachments(ctx, ticket, files, is_internal)
    ctx.db.commit()
    return attachments


@router.get("/attachments/{attachment_id}", summary="دانلود/پیش‌نمایش امن فایل پیوست")
def download_attachment(attachment_id: str, inline: bool = False, ctx: svc.TicketContext = Depends(ctx_dep)):
    attachment = svc.get_attachment(ctx, attachment_id)
    path = resolve_path(attachment.stored_path)
    if not path.exists():
        raise NotFound("فایل روی سرور یافت نشد.")
    previewable = attachment.mime_type.startswith("image/") or attachment.mime_type == "application/pdf"
    return FileResponse(
        path, media_type=attachment.mime_type, filename=attachment.original_name,
        content_disposition_type="inline" if inline and previewable else "attachment",
        headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
                 "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"},
    )


# ============================================================================ history / rating

@router.get("/tickets/{ticket_id}/activities", response_model=list[ActivityOut], summary="تاریخچه تغییرات تیکت")
def activities(ticket_id: str, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id)
    return svc.list_activities(ctx, ticket)


@router.post("/tickets/{ticket_id}/rating", response_model=RatingOut, status_code=201,
             summary="ثبت رضایت مشتری")
def rate(ticket_id: str, data: RatingCreate, ctx: svc.TicketContext = Depends(ctx_dep)):
    ticket = svc.get_visible_ticket(ctx, ticket_id, for_update=True)
    rating = svc.rate_ticket(ctx, ticket, data.rating, data.feedback)
    ctx.db.commit()
    return rating
