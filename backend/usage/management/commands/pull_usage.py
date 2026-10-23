from datetime import datetime

import requests
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from usage.services import set_delivery

QUERY = """
SELECT
  blob1 AS org, blob2 AS lib, blob3 AS vid,
  toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
  SUM(_sample_interval * double1) AS bytes,
  SUM(_sample_interval * double2) AS requests,
  SUM(_sample_interval * double3) AS hits
FROM {dataset}
WHERE timestamp >= NOW() - INTERVAL '{days}' DAY
GROUP BY org, lib, vid, day
FORMAT JSON
"""


class Command(BaseCommand):
    help = "Pull bandwidth totals from Cloudflare Analytics Engine into UsageDaily (run hourly)."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=2, help="How many days back to re-total")

    def handle(self, *args, **options):
        if not (settings.CF_ACCOUNT_ID and settings.CF_API_TOKEN):
            raise CommandError("CF_ACCOUNT_ID and CF_API_TOKEN must be set")
        response = requests.post(
            f"https://api.cloudflare.com/client/v4/accounts/{settings.CF_ACCOUNT_ID}/analytics_engine/sql",
            headers={"Authorization": f"Bearer {settings.CF_API_TOKEN}"},
            data=QUERY.format(dataset=settings.CF_USAGE_DATASET, days=int(options["days"])),
            timeout=60,
        )
        if response.status_code != 200:
            raise CommandError(f"Analytics Engine query failed: {response.status_code} {response.text[:300]}")

        rows = response.json().get("data", [])
        for r in rows:
            try:
                set_delivery(
                    org_id=int(r["org"]),
                    lib_id=int(r["lib"]) if r.get("lib") else None,
                    video_id=r.get("vid") or None,
                    day=datetime.fromisoformat(r["day"].replace(" ", "T")).date(),
                    bytes_delivered=int(float(r["bytes"])),
                    requests=int(float(r["requests"])),
                    cache_hits=int(float(r["hits"])),
                )
            except (KeyError, ValueError, TypeError):
                self.stderr.write(f"Skipping malformed row: {r}")
        self.stdout.write(self.style.SUCCESS(f"Upserted {len(rows)} usage rows"))
