from fastapi import APIRouter

from app.api.auth.router import router as auth_router
from app.api.categories.router import router as categories_router
from app.api.companies.router import router as companies_router
from app.api.departments.router import router as departments_router
from app.api.files.router import router as files_router
from app.api.knowledge_base.router import router as kb_router
from app.api.notifications.router import router as notifications_router
from app.api.reports.router import router as reports_router
from app.api.search.router import router as search_router
from app.api.settings.router import router as settings_router
from app.api.tickets.router import router as tickets_router
from app.api.users.roles import router as roles_router
from app.api.users.router import router as users_router

api_router = APIRouter()
for r in (auth_router, users_router, roles_router, companies_router, tickets_router, departments_router,
          categories_router, notifications_router, reports_router, kb_router, settings_router, search_router,
          files_router):
    api_router.include_router(r)
