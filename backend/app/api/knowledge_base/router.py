"""Knowledge base (categories, articles, feedback) and FAQ management."""
from fastapi import APIRouter, Depends
from sqlalchemy import String, cast, func, or_, select, update
from sqlalchemy.orm import Session

from app.api.deps import Tenant, get_company_tenant, pagination, require_permissions
from app.core.exceptions import NotFound
from app.database.base import utcnow
from app.database.session import get_db
from app.models import (
    ArticleStatus,
    Faq,
    FaqCategory,
    KnowledgeBaseArticle,
    KnowledgeBaseCategory,
    KnowledgeBaseFeedback,
)
from app.repositories import FaqCategoryRepository, FaqRepository, KbArticleRepository, KbCategoryRepository
from app.schemas.common import Message
from app.schemas.misc import (
    FaqCategoryIn,
    FaqCategoryOut,
    FaqIn,
    FaqOut,
    KbArticleIn,
    KbArticleListItem,
    KbArticleOut,
    KbCategoryIn,
    KbCategoryOut,
    KbFeedbackIn,
    ReorderIn,
)
from app.utils.html import sanitize_html
from app.utils.pagination import make_page
from app.utils.persian import escape_like, normalize_text, slugify

router = APIRouter(tags=["پایگاه دانش و سوالات متداول"])


def _can_manage(tenant: Tenant, perm: str) -> bool:
    return tenant.user.is_staff and tenant.has(perm)


def _unique_slug(db: Session, model, company_id: str, base: str, exclude_id: str | None = None) -> str:
    slug, n = base, 2
    while True:
        stmt = select(model.id).where(model.company_id == company_id, model.slug == slug)
        if exclude_id:
            stmt = stmt.where(model.id != exclude_id)
        if not db.scalar(stmt):
            return slug
        slug, n = f"{base}-{n}", n + 1


# ============================================================================ KB categories

@router.get("/kb/categories", response_model=list[KbCategoryOut])
def kb_categories(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    manage = _can_manage(tenant, "kb.manage")
    stmt = KbCategoryRepository(db, tenant.company_id).scoped()
    if not manage:
        stmt = stmt.where(KnowledgeBaseCategory.is_active.is_(True))
    count_stmt = select(KnowledgeBaseArticle.category_id, func.count()).where(
        KnowledgeBaseArticle.company_id == tenant.company_id, KnowledgeBaseArticle.deleted_at.is_(None))
    if not manage:
        count_stmt = count_stmt.where(KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED)
    counts = dict(db.execute(count_stmt.group_by(KnowledgeBaseArticle.category_id)).all())
    out = []
    for c in db.scalars(stmt.order_by(KnowledgeBaseCategory.sort_order, KnowledgeBaseCategory.name)).all():
        item = KbCategoryOut.model_validate(c)
        item.articles_count = counts.get(c.id, 0)
        out.append(item)
    return out


@router.post("/kb/categories", response_model=KbCategoryOut, status_code=201)
def create_kb_category(data: KbCategoryIn, tenant: Tenant = Depends(require_permissions("kb.manage")),
                       db: Session = Depends(get_db)):
    slug = _unique_slug(db, KnowledgeBaseCategory, tenant.company_id, slugify(data.name))
    category = KbCategoryRepository(db, tenant.company_id).add(
        KnowledgeBaseCategory(company_id=tenant.company_id, slug=slug, **data.model_dump()))
    db.commit()
    return category


@router.put("/kb/categories/{category_id}", response_model=KbCategoryOut)
def update_kb_category(category_id: str, data: KbCategoryIn, tenant: Tenant = Depends(require_permissions("kb.manage")),
                       db: Session = Depends(get_db)):
    category = KbCategoryRepository(db, tenant.company_id).get_or_404(category_id)
    for key, value in data.model_dump().items():
        setattr(category, key, value)
    db.commit()
    return category


@router.delete("/kb/categories/{category_id}", response_model=Message)
def delete_kb_category(category_id: str, tenant: Tenant = Depends(require_permissions("kb.manage")),
                       db: Session = Depends(get_db)):
    repo = KbCategoryRepository(db, tenant.company_id)
    category = repo.get_or_404(category_id)
    db.execute(update(KnowledgeBaseArticle).where(KnowledgeBaseArticle.category_id == category.id)
               .values(category_id=None))
    repo.delete(category)
    db.commit()
    return Message(message="دسته‌بندی حذف شد.")


# ============================================================================ KB articles

@router.get("/kb/articles")
def list_articles(q: str | None = None, category_id: str | None = None, tag: str | None = None,
                  status: str | None = None, sort: str = "popular", pg=Depends(pagination),
                  tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    stmt = KbArticleRepository(db, tenant.company_id).scoped()
    if not _can_manage(tenant, "kb.manage"):
        stmt = stmt.where(KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED)
    elif status:
        stmt = stmt.where(KnowledgeBaseArticle.status == status)
    if q:
        like = f"%{escape_like(normalize_text(q) or q)}%"
        stmt = stmt.where(or_(KnowledgeBaseArticle.title.like(like), KnowledgeBaseArticle.summary.like(like),
                              KnowledgeBaseArticle.content.like(like)))
    if category_id:
        stmt = stmt.where(KnowledgeBaseArticle.category_id == category_id)
    if tag:
        # tags are a JSON array serialised without ASCII escaping, so '"tag"' matches an exact element
        stmt = stmt.where(cast(KnowledgeBaseArticle.tags, String).like(f'%"{escape_like(tag.strip())}"%'))
    order = {
        "popular": (KnowledgeBaseArticle.is_featured.desc(), KnowledgeBaseArticle.views.desc()),
        "recent": (KnowledgeBaseArticle.updated_at.desc(),),
        "helpful": (KnowledgeBaseArticle.helpful_count.desc(),),
        "title": (KnowledgeBaseArticle.title.asc(),),
    }.get(sort, (KnowledgeBaseArticle.views.desc(),))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(*order).limit(pg[1]).offset((pg[0] - 1) * pg[1])).unique().all()
    return make_page([KbArticleListItem.model_validate(a) for a in items], total, *pg)


@router.get("/kb/suggest", response_model=list[KbArticleListItem], summary="پیشنهاد مقاله پیش از ثبت تیکت")
def suggest_articles(q: str, tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    words = [w for w in (normalize_text(q) or "").split() if len(w) >= 3][:6]
    if not words:
        return []
    conditions = []
    for w in words:
        like = f"%{escape_like(w)}%"
        conditions += [KnowledgeBaseArticle.title.like(like), KnowledgeBaseArticle.summary.like(like)]
    stmt = KbArticleRepository(db, tenant.company_id).scoped().where(
        KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED, or_(*conditions))
    return db.scalars(stmt.order_by(KnowledgeBaseArticle.views.desc()).limit(5)).unique().all()


def _get_article(db: Session, tenant: Tenant, key: str) -> KnowledgeBaseArticle:
    stmt = KbArticleRepository(db, tenant.company_id).scoped().where(
        or_(KnowledgeBaseArticle.id == key, KnowledgeBaseArticle.slug == key))
    if not _can_manage(tenant, "kb.manage"):
        stmt = stmt.where(KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED)
    article = db.scalar(stmt)
    if article is None:
        raise NotFound("مقاله یافت نشد.")
    return article


@router.get("/kb/articles/{key}", response_model=KbArticleOut)
def get_article(key: str, track: bool = True, tenant: Tenant = Depends(get_company_tenant),
                db: Session = Depends(get_db)):
    article = _get_article(db, tenant, key)
    if track and article.status == ArticleStatus.PUBLISHED:
        db.execute(update(KnowledgeBaseArticle).where(KnowledgeBaseArticle.id == article.id)
                   .values(views=KnowledgeBaseArticle.views + 1))
        db.commit()
        db.refresh(article)
    related_stmt = KbArticleRepository(db, tenant.company_id).scoped().where(
        KnowledgeBaseArticle.id != article.id, KnowledgeBaseArticle.status == ArticleStatus.PUBLISHED)
    if article.category_id:
        related_stmt = related_stmt.where(KnowledgeBaseArticle.category_id == article.category_id)
    related = list(db.scalars(related_stmt.order_by(KnowledgeBaseArticle.views.desc()).limit(12)).unique())
    tags = set(article.tags or [])
    related.sort(key=lambda a: -len(tags & set(a.tags or [])))
    out = KbArticleOut.model_validate(article)
    out.related = [KbArticleListItem.model_validate(a) for a in related[:5]]
    feedback = db.scalar(select(KnowledgeBaseFeedback).where(KnowledgeBaseFeedback.article_id == article.id,
                                                             KnowledgeBaseFeedback.user_id == tenant.user.id))
    out.my_feedback = feedback.helpful if feedback else None
    return out


def _apply_article(db: Session, tenant: Tenant, article: KnowledgeBaseArticle, data: KbArticleIn) -> None:
    if data.category_id:
        KbCategoryRepository(db, tenant.company_id).get_or_404(data.category_id)
    base_slug = slugify(data.slug or data.title)
    article.slug = _unique_slug(db, KnowledgeBaseArticle, tenant.company_id, base_slug, article.id)
    article.title = data.title.strip()
    article.summary = data.summary
    article.content = sanitize_html(data.content)
    article.category_id = data.category_id
    article.tags = data.tags
    article.is_featured = data.is_featured
    if data.status == ArticleStatus.PUBLISHED and article.status != ArticleStatus.PUBLISHED:
        article.published_at = utcnow()
    article.status = data.status


@router.post("/kb/articles", response_model=KbArticleOut, status_code=201)
def create_article(data: KbArticleIn, tenant: Tenant = Depends(require_permissions("kb.manage")),
                   db: Session = Depends(get_db)):
    article = KnowledgeBaseArticle(company_id=tenant.company_id, author_id=tenant.user.id)
    _apply_article(db, tenant, article, data)
    db.add(article)
    db.commit()
    db.refresh(article)
    return KbArticleOut.model_validate(article)


@router.put("/kb/articles/{article_id}", response_model=KbArticleOut)
def update_article(article_id: str, data: KbArticleIn, tenant: Tenant = Depends(require_permissions("kb.manage")),
                   db: Session = Depends(get_db)):
    article = KbArticleRepository(db, tenant.company_id).get_or_404(article_id)
    _apply_article(db, tenant, article, data)
    db.commit()
    db.refresh(article)
    return KbArticleOut.model_validate(article)


@router.delete("/kb/articles/{article_id}", response_model=Message)
def delete_article(article_id: str, tenant: Tenant = Depends(require_permissions("kb.manage")),
                   db: Session = Depends(get_db)):
    repo = KbArticleRepository(db, tenant.company_id)
    article = repo.get_or_404(article_id)
    article.slug = f"{article.slug}-deleted-{article.id[:8]}"[:280]
    repo.delete(article)
    db.commit()
    return Message(message="مقاله حذف شد.")


@router.post("/kb/articles/{key}/feedback", response_model=Message, summary="مفید بود / مفید نبود")
def article_feedback(key: str, data: KbFeedbackIn, tenant: Tenant = Depends(get_company_tenant),
                     db: Session = Depends(get_db)):
    article = _get_article(db, tenant, key)
    existing = db.scalar(select(KnowledgeBaseFeedback).where(KnowledgeBaseFeedback.article_id == article.id,
                                                             KnowledgeBaseFeedback.user_id == tenant.user.id))
    if existing:
        if existing.helpful == data.helpful:
            return Message(message="نظر شما قبلاً ثبت شده است.")
        if existing.helpful:
            article.helpful_count = max(0, article.helpful_count - 1)
        else:
            article.not_helpful_count = max(0, article.not_helpful_count - 1)
        existing.helpful = data.helpful
    else:
        db.add(KnowledgeBaseFeedback(article_id=article.id, user_id=tenant.user.id, helpful=data.helpful))
    if data.helpful:
        article.helpful_count += 1
    else:
        article.not_helpful_count += 1
    db.commit()
    return Message(message="از بازخورد شما سپاسگزاریم.")


# ============================================================================ FAQ

@router.get("/faq/categories", response_model=list[FaqCategoryOut])
def faq_categories(tenant: Tenant = Depends(get_company_tenant), db: Session = Depends(get_db)):
    return FaqCategoryRepository(db, tenant.company_id).list(FaqCategory.sort_order, FaqCategory.name)


@router.post("/faq/categories", response_model=FaqCategoryOut, status_code=201)
def create_faq_category(data: FaqCategoryIn, tenant: Tenant = Depends(require_permissions("faq.manage")),
                        db: Session = Depends(get_db)):
    category = FaqCategoryRepository(db, tenant.company_id).add(FaqCategory(company_id=tenant.company_id,
                                                                            **data.model_dump()))
    db.commit()
    return category


@router.put("/faq/categories/{category_id}", response_model=FaqCategoryOut)
def update_faq_category(category_id: str, data: FaqCategoryIn, tenant: Tenant = Depends(require_permissions("faq.manage")),
                        db: Session = Depends(get_db)):
    category = FaqCategoryRepository(db, tenant.company_id).get_or_404(category_id)
    for key, value in data.model_dump().items():
        setattr(category, key, value)
    db.commit()
    return category


@router.delete("/faq/categories/{category_id}", response_model=Message)
def delete_faq_category(category_id: str, tenant: Tenant = Depends(require_permissions("faq.manage")),
                        db: Session = Depends(get_db)):
    repo = FaqCategoryRepository(db, tenant.company_id)
    category = repo.get_or_404(category_id)
    db.execute(update(Faq).where(Faq.category_id == category.id).values(category_id=None))
    repo.delete(category)
    db.commit()
    return Message(message="دسته‌بندی حذف شد.")


@router.get("/faq", response_model=list[FaqOut])
def list_faqs(q: str | None = None, category_id: str | None = None, tenant: Tenant = Depends(get_company_tenant),
              db: Session = Depends(get_db)):
    stmt = FaqRepository(db, tenant.company_id).scoped()
    if not _can_manage(tenant, "faq.manage"):
        stmt = stmt.where(Faq.is_published.is_(True))
    if q:
        like = f"%{escape_like(normalize_text(q) or q)}%"
        stmt = stmt.where(or_(Faq.question.like(like), Faq.answer.like(like)))
    if category_id:
        stmt = stmt.where(Faq.category_id == category_id)
    return db.scalars(stmt.order_by(Faq.sort_order, Faq.created_at)).unique().all()


@router.post("/faq", response_model=FaqOut, status_code=201)
def create_faq(data: FaqIn, tenant: Tenant = Depends(require_permissions("faq.manage")), db: Session = Depends(get_db)):
    repo = FaqRepository(db, tenant.company_id)
    if data.category_id:
        FaqCategoryRepository(db, tenant.company_id).get_or_404(data.category_id)
    order = data.sort_order if data.sort_order is not None else (
        db.scalar(select(func.max(Faq.sort_order)).where(Faq.company_id == tenant.company_id)) or 0) + 1
    faq = repo.add(Faq(company_id=tenant.company_id, category_id=data.category_id, question=data.question.strip(),
                       answer=sanitize_html(data.answer), sort_order=order, is_published=data.is_published))
    db.commit()
    db.refresh(faq)
    return faq


@router.put("/faq/{faq_id}", response_model=FaqOut)
def update_faq(faq_id: str, data: FaqIn, tenant: Tenant = Depends(require_permissions("faq.manage")),
               db: Session = Depends(get_db)):
    faq = FaqRepository(db, tenant.company_id).get_or_404(faq_id)
    if data.category_id:
        FaqCategoryRepository(db, tenant.company_id).get_or_404(data.category_id)
    faq.category_id = data.category_id
    faq.question = data.question.strip()
    faq.answer = sanitize_html(data.answer)
    faq.is_published = data.is_published
    if data.sort_order is not None:
        faq.sort_order = data.sort_order
    db.commit()
    db.refresh(faq)
    return faq


@router.put("/faq-order", response_model=Message, summary="تغییر ترتیب سوالات")
def reorder_faqs(data: ReorderIn, tenant: Tenant = Depends(require_permissions("faq.manage")),
                 db: Session = Depends(get_db)):
    repo = FaqRepository(db, tenant.company_id)
    for index, faq_id in enumerate(data.ids):
        repo.get_or_404(faq_id).sort_order = index
    db.commit()
    return Message(message="ترتیب ذخیره شد.")


@router.delete("/faq/{faq_id}", response_model=Message)
def delete_faq(faq_id: str, tenant: Tenant = Depends(require_permissions("faq.manage")), db: Session = Depends(get_db)):
    repo = FaqRepository(db, tenant.company_id)
    repo.delete(repo.get_or_404(faq_id))
    db.commit()
    return Message(message="سوال حذف شد.")

