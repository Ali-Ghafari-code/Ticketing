"""Minimal background-task layer.

Side effects that talk to the outside world (email, SMS) must only run once the
database transaction that produced them has committed. ``run_after_commit``
queues a callable on the session; a SQLAlchemy ``after_commit`` hook hands the
queued jobs to a thread pool. The interface is intentionally tiny so it can be
swapped for Celery/RQ/Arq without touching business logic.
"""
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config.settings import settings

logger = logging.getLogger("app.tasks")
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="bg-task")
_KEY = "after_commit_jobs"


def _safe_call(fn: Callable, args: tuple, kwargs: dict) -> None:
    try:
        fn(*args, **kwargs)
    except Exception:  # pragma: no cover - logged, never raised to request
        logger.exception("Background task %s failed", getattr(fn, "__name__", fn))


def submit(fn: Callable, *args, **kwargs) -> None:
    if settings.ENVIRONMENT == "test":
        _safe_call(fn, args, kwargs)
    else:
        _executor.submit(_safe_call, fn, args, kwargs)


def run_after_commit(db: Session, fn: Callable, *args, **kwargs) -> None:
    db.info.setdefault(_KEY, []).append((fn, args, kwargs))


@event.listens_for(Session, "after_commit")
def _flush_jobs(session: Session) -> None:
    jobs = session.info.pop(_KEY, [])
    for fn, args, kwargs in jobs:
        submit(fn, *args, **kwargs)


@event.listens_for(Session, "after_rollback")
def _drop_jobs(session: Session) -> None:
    session.info.pop(_KEY, None)


def shutdown() -> None:
    _executor.shutdown(wait=False, cancel_futures=True)
