"""In-process periodic jobs (SLA monitoring, auto-close). Safe to disable when running a dedicated worker."""
import asyncio
import logging

from app.config.settings import settings
from app.database.session import SessionLocal

logger = logging.getLogger("app.scheduler")


def run_sla_scan() -> None:
    from app.services.sla import scan_and_notify

    with SessionLocal() as db:
        warnings, breaches = scan_and_notify(db)
        if warnings or breaches:
            logger.info("SLA scan: %s warnings, %s breaches", warnings, breaches)


def run_auto_close() -> None:
    from app.services.tickets import auto_close_resolved

    with SessionLocal() as db:
        closed = auto_close_resolved(db)
        if closed:
            logger.info("Auto-closed %s resolved tickets", closed)


async def scheduler_loop(stop: asyncio.Event) -> None:
    tick = 0
    while not stop.is_set():
        try:
            await asyncio.to_thread(run_sla_scan)
            if tick % 60 == 0:
                await asyncio.to_thread(run_auto_close)
        except Exception:  # pragma: no cover
            logger.exception("Scheduled job failed")
        tick += 1
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.SLA_CHECK_INTERVAL_SECONDS)
        except TimeoutError:
            pass
