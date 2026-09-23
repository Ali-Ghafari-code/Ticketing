"""Serves non-sensitive public files (avatars, logos). Ticket attachments are served via /attachments/{id}."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.core.exceptions import NotFound
from app.utils.files import resolve_path

router = APIRouter(tags=["فایل‌ها"])


@router.get("/files/public/{path:path}", include_in_schema=False)
def public_file(path: str):
    if not (path.startswith("avatars/") or path.startswith("logos/")):
        raise NotFound()
    file = resolve_path(f"public/{path}")
    if not file.exists() or not file.is_file():
        raise NotFound()
    return FileResponse(file, headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})
