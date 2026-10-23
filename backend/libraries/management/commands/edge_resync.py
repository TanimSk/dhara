from django.core.management.base import BaseCommand

from libraries.models import Library
from utils import edge
from videos.models import Video


class Command(BaseCommand):
    help = "Push every library and ready video config to the edge (Workers KV). Safe to re-run."

    def handle(self, *args, **options):
        libs = vids = 0
        for library in Library.objects.select_related("organization"):
            edge.kv_put(f"lib:{library.id}", edge.library_config(library))
            libs += 1
        for video in Video.objects.filter(status=Video.STATUS_READY).select_related("library"):
            edge.kv_put(f"vid:{video.id}", edge.video_config(video))
            vids += 1
        self.stdout.write(self.style.SUCCESS(f"Synced {libs} libraries and {vids} videos"))
