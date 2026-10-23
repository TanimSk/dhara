from datetime import date

import pytest
from rest_framework.test import APIClient

from billing.services import charges, generate_invoice
from organizations.models import Organization
from tests.conftest import client_for
from usage.models import UsageDaily
from utils.shared import GB, TB
from videos.models import Video


def test_charges_include_overage():
    plan = {"price_paisa": 500_000, "storage_gb": 300, "bandwidth_gb": 15 * 1024,
            "overage_storage_paisa_per_gb": 600, "overage_bandwidth_paisa_per_tb": 25_000}
    within = charges(plan, 100 * GB, 10 * TB)
    assert within["base_paisa"] == 500_000 and within["overage_paisa"] == 0
    over = charges(plan, 400 * GB, 17 * TB)
    assert over["overage_paisa"] == 100 * 600 + 2 * 25_000


@pytest.mark.django_db
def test_monthly_invoice_uses_average_storage(org, library, plan):
    org.status, org.plan = Organization.STATUS_ACTIVE, plan
    org.save()
    # 400 GB stored for the whole of June, 20 TB delivered.
    for d in range(1, 31):
        UsageDaily.objects.create(organization=org, library=library, date=date(2026, 6, d), storage_bytes=400 * GB,
                                  bytes_delivered=(20 * TB) // 30 if d <= 29 else (20 * TB) - 29 * ((20 * TB) // 30))
    invoice = generate_invoice(org, date(2026, 6, 1))
    assert invoice.base_paisa == 500_000
    assert invoice.overage_paisa == 100 * 600 + 5 * 25_000
    assert invoice.total_paisa == 500_000 + 185_000
    # Re-running refreshes the draft rather than duplicating.
    assert generate_invoice(org, date(2026, 6, 1)).id == invoice.id


@pytest.mark.django_db
def test_trial_orgs_are_not_invoiced(org):
    assert generate_invoice(org, date(2026, 6, 1)) is None


@pytest.mark.django_db
def test_usage_ingest_adds_traffic(org, library):
    video = Video.objects.create(library=library, title="L", status="ready")
    client = APIClient()
    point = {"org": org.id, "lib": library.id, "vid": str(video.id), "day": "2026-10-01", "bytes": 1000, "requests": 1, "hits": 1}
    assert client.post("/api/v1/internal/usage-ingest", {"points": [point]}, format="json").status_code == 403
    for _ in range(3):
        client.post("/api/v1/internal/usage-ingest?secret=test-internal", {"points": [point]}, format="json")
    row = UsageDaily.objects.get(video=video)
    assert row.bytes_delivered == 3000 and row.requests == 3 and row.cache_hits == 3


@pytest.mark.django_db
def test_usage_endpoints_scoped(org, owner, outsider, other_org, library):
    UsageDaily.objects.create(organization=org, library=library, date=date.today(), bytes_delivered=5 * GB)
    mine = client_for(owner, org).get("/api/v1/usage/summary")
    assert mine.status_code == 200
    theirs = client_for(outsider, other_org).get("/api/v1/usage/summary")
    assert theirs.data["bandwidth_bytes"] == 0


@pytest.mark.django_db
def test_admin_api_is_staff_only(owner, org):
    assert client_for(owner).get("/api/v1/admin-api/overview").status_code == 403
    owner.is_staff = True
    owner.save()
    assert client_for(owner).get("/api/v1/admin-api/overview").status_code == 200
    r = client_for(owner).patch(f"/api/v1/admin-api/customers/{org.id}", {"status": "suspended"}, format="json")
    assert r.status_code == 200
    org.refresh_from_db()
    assert org.status == "suspended"
