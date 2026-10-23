import pytest

from organizations.models import ApiKey, Invitation, Membership, Organization
from tests.conftest import client_for, make_user


@pytest.mark.django_db
def test_signup_flow_owner_invites_uploader_who_cannot_reach_owner_endpoints(settings):
    user = make_user("founder@example.com")
    client = client_for(user)
    created = client.post("/api/v1/organizations", {"name": "Retina"}, format="json")
    assert created.status_code == 201
    org = Organization.objects.get(name="Retina")
    assert org.status == Organization.STATUS_PENDING
    assert Membership.objects.get(user=user, organization=org).role == "owner"

    owner = client_for(user, org)
    invited = owner.post("/api/v1/invitations", {"email": "Teacher@Example.com", "role": "uploader"}, format="json")
    assert invited.status_code == 201
    invite = Invitation.objects.get(email="teacher@example.com")

    teacher = make_user("teacher@example.com")
    accept = client_for(teacher).post(f"/api/v1/invitations/token/{invite.token}")
    assert accept.status_code == 200

    t = client_for(teacher, org)
    for method, url in [
        ("get", "/api/v1/members"),
        ("post", "/api/v1/invitations"),
        ("get", "/api/v1/api-keys"),
        ("get", "/api/v1/billing/current"),
        ("patch", "/api/v1/organizations/current"),
        ("post", "/api/v1/libraries"),
    ]:
        response = getattr(t, method)(url, {}, format="json")
        assert response.status_code == 403, (method, url, response.status_code)
    assert t.get("/api/v1/libraries").status_code == 200


@pytest.mark.django_db
def test_invitation_requires_matching_email(org, owner):
    invite = Invitation.objects.create(organization=org, email="right@example.com", role="admin")
    wrong = make_user("wrong@example.com")
    assert client_for(wrong).post(f"/api/v1/invitations/token/{invite.token}").status_code == 403
    assert not Membership.objects.filter(user=wrong).exists()


@pytest.mark.django_db
def test_non_member_cannot_use_org_header(org, outsider):
    response = client_for(outsider, org).get("/api/v1/libraries")
    assert response.status_code == 404


@pytest.mark.django_db
def test_last_owner_cannot_be_removed_or_demoted(org, owner):
    membership = Membership.objects.get(user=owner)
    c = client_for(owner, org)
    assert c.delete(f"/api/v1/members/{membership.id}").status_code == 400
    assert c.patch(f"/api/v1/members/{membership.id}", {"role": "admin"}, format="json").status_code == 400


@pytest.mark.django_db
def test_member_limit_enforced(org, owner, settings):
    settings.TRIAL_MAX_MEMBERS = 2
    c = client_for(owner, org)
    assert c.post("/api/v1/invitations", {"email": "a@x.com", "role": "admin"}, format="json").status_code == 201
    assert c.post("/api/v1/invitations", {"email": "b@x.com", "role": "admin"}, format="json").status_code == 400


@pytest.mark.django_db
def test_api_key_is_shown_once_scoped_and_revocable(org, owner, library, other_library):
    c = client_for(owner, org)
    created = c.post("/api/v1/api-keys", {"name": "LMS"}, format="json")
    raw = created.data["key"]
    assert raw.startswith("dh_")
    assert ApiKey.objects.get().key_hash != raw
    assert "key" not in c.get("/api/v1/api-keys").data["results"][0]

    from rest_framework.test import APIClient

    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {raw}")
    libs = api.get("/api/v1/libraries")
    assert libs.status_code == 200
    assert [l["id"] for l in libs.data["results"]] == [library.id]
    assert api.get(f"/api/v1/libraries/{other_library.id}").status_code == 404
    # API keys can't manage team, keys or billing.
    assert api.get("/api/v1/members").status_code == 403
    assert api.post("/api/v1/api-keys", {"name": "x"}, format="json").status_code == 403
    assert api.get("/api/v1/billing/current").status_code == 403

    c.delete(f"/api/v1/api-keys/{created.data['api_key']['id']}")
    assert api.get("/api/v1/libraries").status_code == 401


@pytest.mark.django_db
def test_bad_api_key_is_rejected(db):
    from rest_framework.test import APIClient

    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION="Bearer dh_deadbeef_nope")
    assert api.get("/api/v1/libraries").status_code == 401
