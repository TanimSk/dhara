import calendar
from datetime import date, timedelta

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone

from usage.models import UsageDaily
from videos.models import Video


def today_utc():
    return timezone.now().astimezone(timezone.timezone.utc).date()


def month_bounds(day):
    start = day.replace(day=1)
    end = start.replace(day=calendar.monthrange(start.year, start.month)[1])
    return start, end


def _row(org_id, lib_id, video_id, day):
    row, _ = UsageDaily.objects.select_for_update().get_or_create(
        organization_id=org_id, library_id=lib_id, video_id=video_id, date=day
    )
    return row


def _existing_ids(org_id, lib_id, video_id):
    """Drop references to libraries/videos deleted since the traffic happened."""
    from libraries.models import Library

    if lib_id and not Library.objects.filter(pk=lib_id, organization_id=org_id).exists():
        lib_id, video_id = None, None
    if video_id and not Video.objects.filter(pk=video_id, library_id=lib_id).exists():
        video_id = None
    return lib_id, video_id


@transaction.atomic
def add_delivery(org_id, lib_id, video_id, day, bytes_delivered, requests, cache_hits):
    """Add traffic to a day (development ingest from the local Worker)."""
    lib_id, video_id = _existing_ids(org_id, lib_id, video_id)
    row = _row(org_id, lib_id, video_id, day)
    UsageDaily.objects.filter(pk=row.pk).update(
        bytes_delivered=F("bytes_delivered") + bytes_delivered,
        requests=F("requests") + requests,
        cache_hits=F("cache_hits") + cache_hits,
    )


@transaction.atomic
def set_delivery(org_id, lib_id, video_id, day, bytes_delivered, requests, cache_hits):
    """Overwrite a day's traffic with the authoritative total (Analytics Engine pull)."""
    lib_id, video_id = _existing_ids(org_id, lib_id, video_id)
    row = _row(org_id, lib_id, video_id, day)
    row.bytes_delivered, row.requests, row.cache_hits = bytes_delivered, requests, cache_hits
    row.save(update_fields=["bytes_delivered", "requests", "cache_hits"])


@transaction.atomic
def snapshot_storage(day=None):
    """Write each ready video's storage_bytes into that day's row."""
    day = day or today_utc()
    count = 0
    for video in Video.objects.filter(status=Video.STATUS_READY).select_related("library"):
        row = _row(video.library.organization_id, video.library_id, video.id, day)
        row.storage_bytes = video.storage_bytes
        row.save(update_fields=["storage_bytes"])
        count += 1
    return count


def current_storage_bytes(org):
    return Video.objects.filter(library__organization=org).aggregate(s=Sum("storage_bytes"))["s"] or 0


def period_usage(org, start, end, live_today=True):
    """Bandwidth total and average stored bytes (GB-month basis) between two dates, inclusive."""
    rows = UsageDaily.objects.filter(organization=org, date__gte=start, date__lte=end)
    traffic = rows.aggregate(b=Sum("bytes_delivered"), r=Sum("requests"), h=Sum("cache_hits"))
    per_day = dict(rows.values("date").annotate(s=Sum("storage_bytes")).values_list("date", "s"))

    today = today_utc()
    last = min(end, today)
    if live_today and start <= today <= end:
        per_day[today] = current_storage_bytes(org)
    days = (last - start).days + 1 if last >= start else 0
    total = sum(per_day.get(start + timedelta(days=i), 0) for i in range(days))
    days_in_period = (end - start).days + 1
    # GB-month: average over the whole period. Days not yet reached count as the latest value
    # for estimates of the current month.
    latest = per_day.get(last, 0) if days else 0
    projected_total = total + latest * (days_in_period - days)
    return {
        "bytes_delivered": traffic["b"] or 0,
        "requests": traffic["r"] or 0,
        "cache_hits": traffic["h"] or 0,
        "storage_avg_bytes": int(projected_total / days_in_period) if days_in_period else 0,
        "storage_now_bytes": per_day.get(last, 0) if days else 0,
    }
