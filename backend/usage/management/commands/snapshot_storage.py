from django.core.management.base import BaseCommand

from usage.services import snapshot_storage


class Command(BaseCommand):
    help = "Write today's storage_bytes for every ready video into UsageDaily (run nightly)."

    def handle(self, *args, **options):
        count = snapshot_storage()
        self.stdout.write(self.style.SUCCESS(f"Snapshotted {count} videos"))
