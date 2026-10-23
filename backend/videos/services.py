import base64
import hashlib
import hmac
import logging
import os
import time

from django.conf import settings
from django.db import connection, transaction

from utils import edge
from videos.models import EncodeJob, Video

logger = logging.getLogger("dhara")


def sign_token(security_key, library_id, video_id, expires):
    """token = base64url(HMAC-SHA256(key, "{library_id}/{video_id}/{expires}")), no padding."""
    msg = f"{library_id}/{video_id}/{expires}".encode()
    digest = hmac.new(security_key.encode(), msg, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def video_urls(video, token=None, expires=None):
    base = settings.EDGE_PUBLIC_URL
    lib, vid = video.library_id, video.id
    urls = {
        "embed": f"{base}/embed/{lib}/{vid}",
        "hls": f"{base}/{lib}/{vid}/playlist.m3u8",
        "thumbnail": f"{base}/{lib}/{vid}/thumbnail.jpg?v={video.thumbnail_version}" if video.thumbnail_key else None,
    }
    if token:
        urls["embed"] += f"?token={token}&expires={expires}"
        urls["hls"] = f"{base}/t/{token}/{expires}/{lib}/{vid}/playlist.m3u8"
    return urls


def signed_urls(video, ttl_seconds):
    expires = int(time.time()) + int(ttl_seconds)
    token = sign_token(video.library.security_key, video.library_id, video.id, expires)
    return {"expires": expires, "token": token, **video_urls(video, token, expires)}


def queue_encode(video):
    """Create an EncodeJob and wake encoderd (LISTEN encode_jobs)."""
    job = EncodeJob.objects.create(video=video)
    video.status = Video.STATUS_QUEUED
    video.error = ""
    video.save(update_fields=["status", "error", "updated_at"])

    def notify():
        with connection.cursor() as cursor:
            cursor.execute("NOTIFY encode_jobs")

    transaction.on_commit(notify)
    return job


def remove_source(video):
    if video.source_path and os.path.isfile(video.source_path):
        try:
            os.remove(video.source_path)
            info = video.source_path + ".info"
            if os.path.isfile(info):
                os.remove(info)
        except OSError:
            logger.exception("Couldn't remove source %s", video.source_path)


def delete_video_everywhere(video):
    """Stop playback (KV), delete encoded files (R2) and the source, then the row."""
    edge.safe(edge.kv_delete, f"vid:{video.id}")
    if video.status in (Video.STATUS_READY, Video.STATUS_FAILED, Video.STATUS_ENCODING):
        edge.safe(edge.r2_delete_prefix, video.r2_prefix)
    remove_source(video)
    video.delete()
