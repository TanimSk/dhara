"""Super-admin endpoints (/api/v1/admin-api/...). Staff only."""

import os
from datetime import date

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from billing.models import Invoice, Plan, PlatformCost
from organizations.models import AuditLog, Organization
from videos.models import EncodeJob, Video

# serializers
from billing.serializers import InvoiceSerializer, PlanSerializer, PlatformCostSerializer
from organizations.serializers import OrganizationSerializer
from videos.serializers import EncodeJobSerializer

from billing.services import estimate_for_month, generate_invoice
from organizations.permissions import IsStaff
from usage.services import month_bounds, today_utc
from utils.shared import GB, StandardResultsSetPagination
from videos.services import queue_encode


def month_param(request, name="month"):
    raw = request.query_params.get(name) or request.data.get(name) if hasattr(request, "data") else None
    if not raw:
        return today_utc().replace(day=1)
    try:
        return date.fromisoformat(f"{raw[:7]}-01")
    except ValueError:
        raise ValidationError("Month must be YYYY-MM.")


def customer_rows(month_start):
    orgs = Organization.objects.select_related("plan").annotate(
        member_count=Count("memberships", distinct=True),
    )
    storage = dict(
        Video.objects.values("library__organization").annotate(s=Sum("storage_bytes")).values_list("library__organization", "s")
    )
    video_counts = dict(
        Video.objects.values("library__organization").annotate(c=Count("id")).values_list("library__organization", "c")
    )
    rows = []
    for org in orgs:
        est = estimate_for_month(org, month_start)
        quotas = org.quotas()
        bw_pct = est["bandwidth_bytes"] / (quotas["bandwidth_gb"] * GB) * 100 if quotas["bandwidth_gb"] else 0
        st_pct = (storage.get(org.id) or 0) / (quotas["storage_gb"] * GB) * 100 if quotas["storage_gb"] else 0
        rows.append(
            {
                "organization": OrganizationSerializer(org).data,
                "members": org.member_count,
                "videos": video_counts.get(org.id, 0),
                "storage_bytes": storage.get(org.id) or 0,
                "bandwidth_bytes": est["bandwidth_bytes"],
                "revenue_paisa": est["total_paisa"],
                "cost_paisa": est["cost_paisa"],
                "margin_paisa": est["total_paisa"] - est["cost_paisa"],
                "storage_pct": round(st_pct, 1),
                "bandwidth_pct": round(bw_pct, 1),
                "quota_alert": st_pct >= 80 or bw_pct >= 80,
            }
        )
    return rows


def month_finances(month_start):
    """Revenue (invoices, or live estimates for the current month) vs. real platform costs."""
    current = today_utc().replace(day=1)
    if month_start >= current:
        revenue = sum(estimate_for_month(o, month_start)["total_paisa"] for o in Organization.objects.select_related("plan"))
        source = "estimate"
    else:
        revenue = Invoice.objects.filter(period=month_start).aggregate(s=Sum("total_paisa"))["s"] or 0
        source = "invoices"
    costs = PlatformCost.objects.filter(month=month_start).aggregate(s=Sum("bdt_paisa"))["s"] or 0
    collected = Invoice.objects.filter(period=month_start, status=Invoice.STATUS_PAID).aggregate(s=Sum("total_paisa"))["s"] or 0
    return {
        "month": month_start,
        "revenue_paisa": revenue,
        "revenue_source": source,
        "collected_paisa": collected,
        "cost_paisa": costs,
        "profit_paisa": revenue - costs,
    }


class AdminOverview(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        from django.conf import settings

        month = today_utc().replace(day=1)
        finances = month_finances(month)
        counts = Organization.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(status="active")),
            trial=Count("id", filter=Q(status="trial")),
            pending=Count("id", filter=Q(status="pending")),
            suspended=Count("id", filter=Q(status="suspended")),
        )
        jobs = EncodeJob.objects.aggregate(
            queued=Count("id", filter=Q(status="queued")),
            running=Count("id", filter=Q(status="running")),
            failed=Count("id", filter=Q(status="failed", finished_at__gte=timezone.now() - timezone.timedelta(days=7))),
        )
        return Response(
            {
                "success": True,
                "finances": finances,
                "target_paisa": settings.MONTHLY_PROFIT_TARGET_PAISA,
                "organizations": counts,
                "jobs": jobs,
                "storage_bytes": Video.objects.aggregate(s=Sum("storage_bytes"))["s"] or 0,
            }
        )


class AdminCustomers(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        rows = customer_rows(month_param(request))
        rows.sort(key=lambda r: (-r["revenue_paisa"], r["organization"]["name"].lower()))
        return Response({"success": True, "results": rows})


class AdminCustomerDetail(APIView):
    permission_classes = [IsStaff]

    def patch(self, request, pk, *args, **kwargs):
        org = Organization.objects.filter(pk=pk).first()
        if org is None:
            raise NotFound("Organization not found.")
        new_status = request.data.get("status")
        if "plan" in request.data:
            plan_id = request.data["plan"]
            org.plan = Plan.objects.filter(pk=plan_id).first() if plan_id else None
            if plan_id and org.plan is None:
                raise ValidationError("Plan not found.")
        if new_status:
            if new_status not in dict(Organization.STATUS_CHOICES):
                raise ValidationError("Invalid status.")
            if new_status == Organization.STATUS_TRIAL and org.status != Organization.STATUS_TRIAL:
                org.start_trial()
            else:
                org.status = new_status
            if new_status == Organization.STATUS_ACTIVE and org.plan is None:
                raise ValidationError("Pick a plan before activating.")
        with transaction.atomic():
            org.save()
            AuditLog.objects.create(
                organization=org,
                user=request.user,
                action="admin.organization_updated",
                target=org.name,
                metadata={k: request.data[k] for k in ("status", "plan") if k in request.data},
            )
        return Response({"success": True, "organization": OrganizationSerializer(org).data})


class AdminPlans(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        return Response({"success": True, "results": PlanSerializer(Plan.objects.all(), many=True).data})

    def post(self, request, *args, **kwargs):
        serializer = PlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"success": True, "plan": serializer.data}, status=status.HTTP_201_CREATED)


class AdminPlanDetail(APIView):
    permission_classes = [IsStaff]

    def patch(self, request, pk, *args, **kwargs):
        plan = Plan.objects.filter(pk=pk).first()
        if plan is None:
            raise NotFound("Plan not found.")
        serializer = PlanSerializer(plan, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"success": True, "plan": serializer.data})


class AdminInvoices(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        invoices = Invoice.objects.select_related("organization")
        if request.query_params.get("month"):
            invoices = invoices.filter(period=month_param(request))
        if request.query_params.get("status"):
            invoices = invoices.filter(status=request.query_params["status"])
        return Response({"success": True, "results": InvoiceSerializer(invoices, many=True).data})

    def post(self, request, *args, **kwargs):
        """Generate (or refresh) draft invoices for a month."""
        raw = request.data.get("month")
        try:
            period = date.fromisoformat(f"{raw[:7]}-01") if raw else None
        except ValueError:
            raise ValidationError("Month must be YYYY-MM.")
        if period is None:
            raise ValidationError("Month is required.")
        made = [inv for org in Organization.objects.select_related("plan") if (inv := generate_invoice(org, period))]
        return Response({"success": True, "results": InvoiceSerializer(made, many=True).data})


class AdminInvoiceDetail(APIView):
    permission_classes = [IsStaff]

    def patch(self, request, pk, *args, **kwargs):
        invoice = Invoice.objects.select_related("organization").filter(pk=pk).first()
        if invoice is None:
            raise NotFound("Invoice not found.")
        serializer = InvoiceSerializer(invoice, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        invoice = serializer.save()
        invoice.recompute_total()
        if invoice.status == Invoice.STATUS_PAID and invoice.paid_at is None:
            invoice.paid_at = timezone.now()
        elif invoice.status != Invoice.STATUS_PAID:
            invoice.paid_at = None
        invoice.save()
        return Response({"success": True, "invoice": InvoiceSerializer(invoice).data})


class AdminCosts(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        costs = PlatformCost.objects.all()
        if request.query_params.get("month"):
            costs = costs.filter(month=month_param(request))
        return Response({"success": True, "results": PlatformCostSerializer(costs, many=True).data})

    def post(self, request, *args, **kwargs):
        from django.conf import settings

        data = request.data.copy()
        if not data.get("bdt_paisa") and data.get("usd"):
            data["bdt_paisa"] = round(float(data["usd"]) * settings.USD_TO_BDT * 100)
        serializer = PlatformCostSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"success": True, "cost": serializer.data}, status=status.HTTP_201_CREATED)


class AdminCostDetail(APIView):
    permission_classes = [IsStaff]

    def delete(self, request, pk, *args, **kwargs):
        PlatformCost.objects.filter(pk=pk).delete()
        return Response({"success": True})


class AdminProfit(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        current = today_utc().replace(day=1)
        months = []
        m = current
        for _ in range(12):
            months.append(m)
            m = m.replace(year=m.year - 1, month=12) if m.month == 1 else m.replace(month=m.month - 1)
        return Response({"success": True, "results": [month_finances(m) for m in reversed(months)]})


class AdminEncoderJobs(APIView):
    permission_classes = [IsStaff]

    def get(self, request, *args, **kwargs):
        jobs = EncodeJob.objects.select_related("video__library__organization")
        if request.query_params.get("status"):
            jobs = jobs.filter(status=request.query_params["status"])
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(jobs, request, view=self)
        return paginator.get_paginated_response(EncodeJobSerializer(page, many=True).data)


class AdminEncoderJobRetry(APIView):
    permission_classes = [IsStaff]

    def post(self, request, pk, *args, **kwargs):
        job = EncodeJob.objects.select_related("video").filter(pk=pk).first()
        if job is None:
            raise NotFound("Job not found.")
        video = job.video
        if not video.source_path or not os.path.isfile(video.source_path):
            raise ValidationError("The source file is gone; the customer must re-upload.")
        if video.jobs.filter(status__in=["queued", "running"]).exists():
            raise ValidationError("This video already has a job in the queue.")
        with transaction.atomic():
            new_job = queue_encode(video)
        return Response({"success": True, "job": EncodeJobSerializer(new_job).data})
