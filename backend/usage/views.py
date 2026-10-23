from datetime import date, timedelta

from django.conf import settings
from django.db.models import Sum
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from usage.models import UsageDaily
from videos.models import Video

from billing.services import estimate_for_month
from organizations.permissions import IsOrgManager, IsOrgMember
from organizations.throttling import ApiKeyRateThrottle
from usage.services import add_delivery, current_storage_bytes, month_bounds, period_usage, today_utc
from utils.shared import GB, is_internal_request


def parse_range(request, default_days=30):
    today = today_utc()
    try:
        end = date.fromisoformat(request.query_params["to"]) if "to" in request.query_params else today
        start = date.fromisoformat(request.query_params["from"]) if "from" in request.query_params else end - timedelta(days=default_days - 1)
    except ValueError:
        raise ValidationError("Dates must be YYYY-MM-DD.")
    if start > end or (end - start).days > 400:
        raise ValidationError("Invalid date range.")
    return start, end


class UsageSummary(APIView):
    permission_classes = [IsOrgManager]
    throttle_classes = [ApiKeyRateThrottle]

    def get(self, request, *args, **kwargs):
        org = request.organization
        start, end = month_bounds(today_utc())
        usage = period_usage(org, start, end)
        quotas = org.quotas()
        storage_now = current_storage_bytes(org)
        return Response(
            {
                "success": True,
                "period": {"from": start, "to": end},
                "storage_now_bytes": storage_now,
                "bandwidth_bytes": usage["bytes_delivered"],
                "requests": usage["requests"],
                "cache_hit_ratio": (usage["cache_hits"] / usage["requests"]) if usage["requests"] else None,
                "quotas": quotas,
                "storage_pct": storage_now / (quotas["storage_gb"] * GB) * 100 if quotas["storage_gb"] else 0,
                "bandwidth_pct": usage["bytes_delivered"] / (quotas["bandwidth_gb"] * GB) * 100 if quotas["bandwidth_gb"] else 0,
                "estimate": estimate_for_month(org, start) if request.org_role in ("owner", "api_key") else None,
            }
        )


class UsageSeries(APIView):
    """GET /usage?from=&to=&group=day|video"""

    permission_classes = [IsOrgManager]
    throttle_classes = [ApiKeyRateThrottle]

    def get(self, request, *args, **kwargs):
        org = request.organization
        start, end = parse_range(request)
        rows = UsageDaily.objects.filter(organization=org, date__gte=start, date__lte=end)
        group = request.query_params.get("group", "day")
        if group == "video":
            top = (
                rows.filter(video__isnull=False)
                .values("video_id", "video__title", "library_id")
                .annotate(bytes_delivered=Sum("bytes_delivered"), requests=Sum("requests"))
                .order_by("-bytes_delivered")[: int(request.query_params.get("limit", 10))]
            )
            results = [
                {
                    "video_id": r["video_id"],
                    "title": r["video__title"],
                    "library_id": r["library_id"],
                    "bytes_delivered": r["bytes_delivered"],
                    "requests": r["requests"],
                }
                for r in top
            ]
            return Response({"success": True, "results": results})
        if group != "day":
            raise ValidationError("group must be day or video.")

        by_day = {
            r["date"]: r
            for r in rows.values("date").annotate(
                bytes_delivered=Sum("bytes_delivered"), requests=Sum("requests"), storage_bytes=Sum("storage_bytes")
            )
        }
        today = today_utc()
        results = []
        for i in range((end - start).days + 1):
            day = start + timedelta(days=i)
            r = by_day.get(day, {})
            storage = r.get("storage_bytes") or 0
            if day == today and not storage:
                storage = current_storage_bytes(org)
            results.append(
                {
                    "date": day,
                    "bytes_delivered": r.get("bytes_delivered") or 0,
                    "requests": r.get("requests") or 0,
                    "storage_bytes": storage,
                }
            )
        return Response({"success": True, "results": results})


class VideoUsage(APIView):
    permission_classes = [IsOrgMember]

    def get(self, request, pk, *args, **kwargs):
        if not Video.objects.filter(pk=pk, library__organization=request.organization).exists():
            raise NotFound("Video not found.")
        start, end = parse_range(request)
        by_day = dict(
            UsageDaily.objects.filter(video_id=pk, date__gte=start, date__lte=end)
            .values("date")
            .annotate(b=Sum("bytes_delivered"))
            .values_list("date", "b")
        )
        results = [
            {"date": start + timedelta(days=i), "bytes_delivered": by_day.get(start + timedelta(days=i), 0)}
            for i in range((end - start).days + 1)
        ]
        return Response({"success": True, "results": results, "total_bytes": sum(by_day.values())})


class UsageIngest(APIView):
    """Development only: the local Worker posts its data points here (production uses Analytics Engine)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        if not is_internal_request(request, settings):
            return Response(status=status.HTTP_403_FORBIDDEN)
        for p in request.data.get("points", [])[:1000]:
            try:
                add_delivery(
                    org_id=int(p["org"]),
                    lib_id=int(p["lib"]) if p.get("lib") else None,
                    video_id=p.get("vid") or None,
                    day=date.fromisoformat(p["day"]),
                    bytes_delivered=int(p["bytes"]),
                    requests=int(p.get("requests", 1)),
                    cache_hits=int(p.get("hits", 0)),
                )
            except (KeyError, ValueError, TypeError):
                continue
        return Response({"success": True})
