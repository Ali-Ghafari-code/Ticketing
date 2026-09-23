"""Global search across tickets, customers, agents, KB articles and messages (permission aware)."""
from sqlalchemy import or_, select

from app.models import ArticleStatus, KnowledgeBaseArticle, Ticket, TicketMessage, User, UserType
from app.services.tickets import TicketContext, visibility_filter
from app.utils.html import html_to_text
from app.utils.persian import escape_like, normalize_text, to_latin_digits


def global_search(ctx: TicketContext, query: str, limit: int = 6) -> dict:
    db, tenant = ctx.db, ctx.tenant
    q = normalize_text(query) or ""
    like = f"%{escape_like(q)}%"
    code_like = f"%{escape_like(to_latin_digits(q).upper().replace(' ', ''))}%"
    is_customer = ctx.user.is_customer
    ticket_base = "/portal/tickets" if is_customer else "/tickets"
    out: dict = {"query": query, "tickets": [], "customers": [], "agents": [], "articles": [], "messages": []}

    if tenant.has_any("tickets.view", "tickets.view_own"):
        stmt = (select(Ticket).where(Ticket.company_id == ctx.company_id, Ticket.deleted_at.is_(None),
                                     visibility_filter(tenant, ctx.company),
                                     or_(Ticket.subject.like(like), Ticket.code.like(code_like)))
                .order_by(Ticket.updated_at.desc()).limit(limit))
        for t in db.scalars(stmt).unique():
            out["tickets"].append({"type": "ticket", "id": t.id, "title": t.subject, "subtitle": t.code,
                                   "link": f"{ticket_base}/{t.id}",
                                   "meta": {"status": t.status.name, "status_color": t.status.color}})

        msg_stmt = (select(TicketMessage, Ticket).join(Ticket, Ticket.id == TicketMessage.ticket_id)
                    .where(TicketMessage.company_id == ctx.company_id, TicketMessage.deleted_at.is_(None),
                           Ticket.deleted_at.is_(None), visibility_filter(tenant, ctx.company),
                           TicketMessage.body.like(like))
                    .order_by(TicketMessage.created_at.desc()).limit(limit))
        if is_customer:
            msg_stmt = msg_stmt.where(TicketMessage.is_internal.is_(False))
        for message, ticket in db.execute(msg_stmt).unique().all():
            text = html_to_text(message.body)
            pos = text.find(q)
            snippet = text[max(0, pos - 40): pos + 80] if pos >= 0 else text[:120]
            out["messages"].append({"type": "message", "id": message.id, "title": snippet,
                                    "subtitle": f"{ticket.code} — {ticket.subject}",
                                    "link": f"{ticket_base}/{ticket.id}#m-{message.id}",
                                    "meta": {"internal": message.is_internal}})

    if not is_customer and tenant.has("customers.view"):
        for u in db.scalars(select(User).where(
                User.company_id == ctx.company_id, User.user_type == UserType.CUSTOMER, User.deleted_at.is_(None),
                or_(User.full_name.like(like), User.email.like(like), User.mobile.like(like),
                    User.organization.like(like))).limit(limit)).unique():
            out["customers"].append({"type": "customer", "id": u.id, "title": u.full_name,
                                     "subtitle": u.mobile or u.email, "link": f"/customers/{u.id}"})

    if not is_customer and tenant.has("users.view"):
        for u in db.scalars(select(User).where(
                User.company_id == ctx.company_id, User.user_type == UserType.STAFF, User.deleted_at.is_(None),
                or_(User.full_name.like(like), User.email.like(like), User.mobile.like(like))).limit(limit)).unique():
            out["agents"].append({"type": "agent", "id": u.id, "title": u.full_name,
                                  "subtitle": ", ".join(r.display_name for r in u.roles), "link": f"/users/{u.id}"})

    article_stmt = select(KnowledgeBaseArticle).where(
        KnowledgeBaseArticle.company_id == ctx.company_id, KnowledgeBaseArticle.deleted_at.is_(None),
        or_(KnowledgeBaseArticle.title.like(like), KnowledgeBaseArticle.summary.like(like),
            KnowledgeBaseArticle.content.like(like)))
    if is_customer or not tenant.has("kb.manage"):
        article_stmt = article_stmt.where(KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED)
    kb_base = "/portal/kb" if is_customer else "/kb"
    for a in db.scalars(article_stmt.order_by(KnowledgeBaseArticle.views.desc()).limit(limit)).unique():
        out["articles"].append({"type": "article", "id": a.id, "title": a.title, "subtitle": a.summary,
                                "link": f"{kb_base}/{a.slug}"})
    return out
