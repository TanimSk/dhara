import json
import os
import time

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from videos.models import Video

MAX_AGE_SECONDS = 24 * 3600


class Command(BaseCommand):
    help = "Delete abandoned partial uploads (older than 24 h) and fail their videos. Run hourly."

    def handle(self, *args, **options):
        upload_dir = settings.UPLOAD_DIR
        removed = 0
        now = time.time()
        if os.path.isdir(upload_dir):
            for name in os.listdir(upload_dir):
                if not name.endswith(".info"):
                    continue
                info_path = os.path.join(upload_dir, name)
                data_path = info_path[: -len(".info")]
                if now - os.path.getmtime(info_path) < MAX_AGE_SECONDS:
                    continue
                try:
                    with open(info_path) as f:
                        video_id = (json.load(f).get("MetaData") or {}).get("video_id")
                except (OSError, ValueError):
                    video_id = None
                video = Video.objects.filter(pk=video_id).first() if video_id else None
                # Keep sources the encoder still needs.
                if video and video.status in (Video.STATUS_QUEUED, Video.STATUS_ENCODING, Video.STATUS_FAILED):
                    continue
                for path in (data_path, info_path):
                    if os.path.exists(path):
                        os.remove(path)
                removed += 1

        stale = Video.objects.filter(
            status=Video.STATUS_UPLOADING, created_at__lt=timezone.now() - timezone.timedelta(seconds=MAX_AGE_SECONDS)
        )
        failed = stale.update(status=Video.STATUS_FAILED, error="The upload didn't finish. Upload the file again.")
        self.stdout.write(self.style.SUCCESS(f"Removed {removed} partial uploads, failed {failed} stale videos"))
