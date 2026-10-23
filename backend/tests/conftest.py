import pytest
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from administrator.models import User
from billing.models import Plan
from libraries.models import Library
from organizations.models import Membership, Organization


@pytest.fixture(autouse=True)
def edge_calls(monkeypatch):
    """Record edge Worker calls instead of making HTTP requests."""
    calls = []

    class FakeResponse:
        status_code = 200
        text = ""

        def json(self):
            return {"deleted": 0}

    def fake_request(method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        return FakeResponse()

    monkeypatch.setattr("utils.edge._request", fake_request)
    return calls


@pytest.fixture(autouse=True)
def internal_secret(settings):
    settings.INTERNAL_SECRET = "test-internal"
    settings.AUTO_APPROVE_TRIALS = False
    return "test-internal"


def make_user(email, **extra):
    return User.objects.create(username=email, email=email, **extra)


def client_for(user, org=None):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    if org is not None:
        client.defaults["HTTP_X_ORGANIZATION"] = str(org.id)
    return client


@pytest.fixture
def plan(db):
    return Plan.objects.create(name="Growth", price_paisa=500_000, storage_gb=300, bandwidth_gb=15 * 1024, max_members=10)


@pytest.fixture
def org(db):
    o = Organization(name="Udvash Coaching")
    o.start_trial()
    o.save()
    return o


@pytest.fixture
def other_org(db):
    o = Organization(name="Other Center")
    o.start_trial()
    o.save()
    return o


@pytest.fixture
def owner(org):
    user = make_user("owner@example.com")
    Membership.objects.create(user=user, organization=org, role=Membership.ROLE_OWNER)
    return user


@pytest.fixture
def uploader(org):
    user = make_user("uploader@example.com")
    Membership.objects.create(user=user, organization=org, role=Membership.ROLE_UPLOADER)
    return user


@pytest.fixture
def outsider(other_org):
    user = make_user("outsider@example.com")
    Membership.objects.create(user=user, organization=other_org, role=Membership.ROLE_OWNER)
    return user


@pytest.fixture
def library(org):
    return Library.objects.create(organization=org, name="HSC Physics")


@pytest.fixture
def other_library(other_org):
    return Library.objects.create(organization=other_org, name="Theirs")
