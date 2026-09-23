"""Secure upload handling: size limit, extension allow-list, magic-byte sniffing, random file names."""
import os
import secrets
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from fastapi import UploadFile

from app.config.settings import settings
from app.core.exceptions import FileUploadError

# extension -> (mime type, list of accepted magic prefixes; None = text-like, no signature)
ALLOWED_TYPES: dict[str, tuple[str, list[bytes] | None]] = {
    "jpg": ("image/jpeg", [b"\xff\xd8\xff"]),
    "jpeg": ("image/jpeg", [b"\xff\xd8\xff"]),
    "png": ("image/png", [b"\x89PNG\r\n\x1a\n"]),
    "gif": ("image/gif", [b"GIF87a", b"GIF89a"]),
    "webp": ("image/webp", [b"RIFF"]),
    "pdf": ("application/pdf", [b"%PDF-"]),
    "doc": ("application/msword", [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"]),
    "xls": ("application/vnd.ms-excel", [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"]),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", [b"PK\x03\x04"]),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [b"PK\x03\x04"]),
    "zip": ("application/zip", [b"PK\x03\x04", b"PK\x05\x06"]),
    "txt": ("text/plain", None),
}
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
PREVIEWABLE_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"}


@dataclass
class StoredFile:
    original_name: str
    relative_path: str
    mime_type: str
    size: int


def _safe_display_name(name: str) -> str:
    name = os.path.basename(name or "file").replace("\x00", "")
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '<>:"/\\|?*')
    return name[:200] or "file"


def _extension(name: str) -> str:
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def validate_and_store(upload: UploadFile, subdir: str, allowed: set[str] | None = None) -> StoredFile:
    original = _safe_display_name(upload.filename or "file")
    ext = _extension(original)
    allowed = allowed or set(ALLOWED_TYPES)
    if ext not in allowed or ext not in ALLOWED_TYPES:
        raise FileUploadError(
            f"نوع فایل «{original}» مجاز نیست. فرمت‌های مجاز: {', '.join(sorted(allowed))}",
            code="file_type_not_allowed",
        )
    mime, signatures = ALLOWED_TYPES[ext]

    data = upload.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise FileUploadError(
            f"حجم فایل «{original}» بیش از {settings.MAX_UPLOAD_SIZE_MB} مگابایت است.", code="file_too_large"
        )
    if not data:
        raise FileUploadError(f"فایل «{original}» خالی است.", code="file_empty")
    if signatures is not None and not any(data.startswith(sig) for sig in signatures):
        raise FileUploadError(f"محتوای فایل «{original}» با پسوند آن مطابقت ندارد.", code="file_signature_mismatch")
    if ext == "webp" and data[8:12] != b"WEBP":
        raise FileUploadError(f"محتوای فایل «{original}» معتبر نیست.", code="file_signature_mismatch")

    now = datetime.utcnow()
    relative_dir = Path(subdir) / f"{now:%Y}" / f"{now:%m}"
    absolute_dir = Path(settings.UPLOAD_DIR) / relative_dir
    absolute_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{secrets.token_hex(16)}.{ext}"
    (absolute_dir / stored_name).write_bytes(data)
    return StoredFile(original, str(relative_dir / stored_name), mime, len(data))


def resolve_path(relative_path: str) -> Path:
    base = Path(settings.UPLOAD_DIR).resolve()
    path = (base / relative_path).resolve()
    if base not in path.parents:
        raise FileUploadError("مسیر فایل نامعتبر است.")
    return path


def delete_file(relative_path: str | None) -> None:
    if not relative_path:
        return
    try:
        resolve_path(relative_path).unlink(missing_ok=True)
    except (OSError, FileUploadError):
        pass
