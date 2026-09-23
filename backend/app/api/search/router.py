from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import RequestMeta, Tenant, get_company_tenant, get_request_meta
from app.database.session import get_db
from app.schemas.misc import SearchResponse
from app.services.search import global_search
from app.services.tickets import load_context

router = APIRouter(tags=["جستجو"])


@router.get("/search", response_model=SearchResponse, summary="جستجوی سراسری (پشتیبانی از متن فارسی)")
def search(q: str = Query(..., min_length=2, max_length=100), tenant: Tenant = Depends(get_company_tenant),
           db: Session = Depends(get_db), meta: RequestMeta = Depends(get_request_meta)):
    return global_search(load_context(db, tenant, meta), q)
