"""Client for the edge Worker's internal API.

Django never talks to KV or R2 directly: it calls the Worker, which holds the
bindings. The same calls work against `wrangler dev` locally and the deployed
Worker in production, authenticated with EDGE_INTERNAL_SECRET.
"""

import logging
from urllib.parse import quote

import requests
from django.conf import settings

logger = logging.getLogger("dhara")
TIMEOUT = 5


class EdgeError(Exception):
    pass


def _request(method, path, **kwargs):
    if not settings.EDGE_INTERNAL_SECRET:
        raise EdgeError("EDGE_INTERNAL_SECRET is not configured")
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {settings.EDGE_INTERNAL_SECRET}"
    url = f"{settings.EDGE_INTERNAL_URL}/__internal/{path}"
    try:
        response = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    except requests.RequestException as e:
        raise EdgeError(f"{method} {path}: {e}") from e
    if response.status_code >= 300:
        raise EdgeError(f"{method} {path}: HTTP {response.status_code} {response.text[:200]}")
    return response


def kv_put(key, value):
    _request("PUT", f"kv/{quote(key, safe=':')}", json=value)


def kv_delete(key):
    _request("DELETE", f"kv/{quote(key, safe=':')}")


def r2_put(key, data, content_type, cache_control="public, max-age=31536000, immutable"):
    _request(
        "PUT",
        f"r2/{quote(key)}",
        data=data,
        headers={"Content-Type": content_type, "X-Cache-Control": cache_control},
    )


def r2_delete_prefix(prefix):
    """Delete every object under prefix (e.g. "12/<video uuid>/")."""
    response = _request("DELETE", f"r2-prefix/{quote(prefix)}")
    return response.json().get("deleted", 0)


# ---------- config documents the Worker reads ----------


def library_config(library):
    org = library.organization
    return {
        "org": org.id,
        "org_status": org.status,
        "domains": library.allowed_domains,
        "token": library.token_auth_enabled,
        "direct": library.allow_direct_access,
        "key": library.security_key,
    }


def video_config(video):
    return {
        "lib": video.library_id,
        "org": video.library.organization_id,
        "private": video.privacy == "private",
        "title": video.title,
        "poster": bool(video.thumbnail_key),
    }


def safe(fn, *args, **kwargs):
    """Run an edge call, logging instead of raising. Use `manage.py edge_resync` to repair drift."""
    try:
        return fn(*args, **kwargs)
    except EdgeError as e:
        logger.error("Edge sync failed: %s", e)
        return None


def sync_library(library):
    safe(kv_put, f"lib:{library.id}", library_config(library))


def sync_video(video):
    if video.status == "ready":
        safe(kv_put, f"vid:{video.id}", video_config(video))
    else:
        safe(kv_delete, f"vid:{video.id}")
