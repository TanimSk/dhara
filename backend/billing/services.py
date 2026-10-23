import math
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.db import transaction

from billing.models import Invoice
from usage.services import month_bounds, period_usage
from utils.shared import GB, TB


def charges(plan_snapshot, storage_avg_bytes, bandwidth_bytes):
    """Base price + overage for one month of usage on a plan."""
    if not plan_snapshot:
        return {"base_paisa": 0, "overage_paisa": 0, "storage_overage_gb": 0, "bandwidth_overage_tb": 0}
    storage_gb = storage_avg_bytes / GB
    bandwidth_tb = bandwidth_bytes / TB
    storage_over = max(0.0, storage_gb - plan_snapshot["storage_gb"])
    bandwidth_over = max(0.0, bandwidth_tb - plan_snapshot["bandwidth_gb"] / 1024)
    overage = math.ceil(
        storage_over * plan_snapshot["overage_storage_paisa_per_gb"]
        + bandwidth_over * plan_snapshot["overage_bandwidth_paisa_per_tb"]
    )
    return {
        "base_paisa": plan_snapshot["price_paisa"],
        "overage_paisa": overage,
        "storage_overage_gb": round(storage_over, 3),
        "bandwidth_overage_tb": round(bandwidth_over, 4),
    }


def platform_cost_paisa(storage_avg_bytes, requests):
    """What this customer costs us on Cloudflare for a month (variable costs only)."""
    usd = (storage_avg_bytes / GB) * settings.COST_R2_STORAGE_USD_PER_GB_MONTH + (
        requests / 1_000_000
    ) * settings.COST_PER_MILLION_REQUESTS_USD
    return round(usd * settings.USD_TO_BDT * 100)


def billable_plan(org):
    # Trials and pending organizations aren't billed.
    if org.status not in (org.STATUS_ACTIVE, org.STATUS_SUSPENDED) or org.plan is None:
        return None
    return org.plan.snapshot()


def estimate_for_month(org, period_start):
    start, end = month_bounds(period_start)
    usage = period_usage(org, start, end)
    plan = billable_plan(org)
    c = charges(plan, usage["storage_avg_bytes"], usage["bytes_delivered"])
    return {
        "period": start,
        "plan": plan,
        "storage_avg_bytes": usage["storage_avg_bytes"],
        "bandwidth_bytes": usage["bytes_delivered"],
        "requests": usage["requests"],
        **c,
        "total_paisa": c["base_paisa"] + c["overage_paisa"],
        "cost_paisa": platform_cost_paisa(usage["storage_avg_bytes"], usage["requests"]),
    }


@transaction.atomic
def generate_invoice(org, period_start):
    """Create or refresh the draft invoice for a month. Sent/paid invoices are left alone."""
    start, end = month_bounds(period_start)
    plan = billable_plan(org)
    if plan is None:
        return None
    invoice = Invoice.objects.select_for_update().filter(organization=org, period=start).first()
    if invoice and invoice.status != Invoice.STATUS_DRAFT:
        return invoice
    usage = period_usage(org, start, end, live_today=False)
    c = charges(plan, usage["storage_avg_bytes"], usage["bytes_delivered"])
    invoice = invoice or Invoice(organization=org, period=start)
    invoice.plan_snapshot = plan
    invoice.storage_gb_avg = Decimal(usage["storage_avg_bytes"] / GB).quantize(Decimal("0.001"))
    invoice.bandwidth_tb = Decimal(usage["bytes_delivered"] / TB).quantize(Decimal("0.0001"))
    invoice.base_paisa = c["base_paisa"]
    invoice.overage_paisa = c["overage_paisa"]
    invoice.recompute_total()
    invoice.save()
    return invoice


def previous_month(today=None):
    today = today or date.today()
    first = today.replace(day=1)
    return (first.replace(year=first.year - 1, month=12) if first.month == 1 else first.replace(month=first.month - 1))
