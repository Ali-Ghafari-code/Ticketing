"""Sliding-window rate limiter with an in-memory backend and an optional Redis backend.

Use ``rate_limit("10/minute", scope="auth")`` as a FastAPI dependency.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from app.config.settings import settings
from app.core.exceptions import RateLimited
from app.utils.request import client_ip

_PERIODS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


def parse_rate(rate: str) -> tuple[int, int]:
    count, _, period = rate.partition("/")
    return int(count), _PERIODS[period.strip()]


class MemoryBackend:
    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: int) -> bool:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - window:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            if len(self._hits) > 50_000:  # crude memory guard
                self._hits.clear()
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class RedisBackend:  # pragma: no cover - requires redis
    def __init__(self, url: str) -> None:
        import redis

        self._redis = redis.Redis.from_url(url)

    def hit(self, key: str, limit: int, window: int) -> bool:
        bucket = int(time.time() // window)
        redis_key = f"rl:{key}:{bucket}"
        pipe = self._redis.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window)
        count, _ = pipe.execute()
        return int(count) <= limit

    def reset(self) -> None:
        pass


backend = RedisBackend(settings.REDIS_URL) if settings.REDIS_URL else MemoryBackend()


def rate_limit(rate: str, scope: str = "default"):
    limit, window = parse_rate(rate)

    def dependency(request: Request) -> None:
        if settings.ENVIRONMENT == "test":
            return
        key = f"{scope}:{client_ip(request)}"
        if not backend.hit(key, limit, window):
            raise RateLimited()

    return dependency
