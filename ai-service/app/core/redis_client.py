import logging
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client = None
_client_initialized = False


def get_redis():
    """Returns a shared Redis client, or None if Redis is not configured.

    Callers must fall back to in-memory state when this returns None or a
    Redis call raises.
    """
    global _client, _client_initialized

    settings = get_settings()
    if not settings.redis_url:
        return None

    if not _client_initialized:
        _client_initialized = True
        try:
            import redis
            _client = redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        except Exception as e:
            logger.warning(f"Redis client init failed: {e}")
            _client = None

    return _client
