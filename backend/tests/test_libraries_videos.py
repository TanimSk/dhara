import pytest

from libraries.models import Library
from organizations.models import Organization
from tests.conftest import client_for
from videos.models import EncodeJob, Video
from videos.services import sign_token


@pytest.mark.django_db
def test_library_settings_sync_to_edge(org, owner, edge_calls, django_capture_on_commit_callbacks):
    c = client_for(owner, org)
    with django_capture_on_commit_callbacks(execute=True):
        created = c.post("/api/v1/libraries", {"name": "Math", "allowed_domains": ["https://School.com/", "*.school.com"]}, format="json")
    assert created.status_code == 201
    assert created.data["library"]["allowed_domains"] == ["school.com", "*.school.com"]
    lib_id = created.data["library"]["id"]
    assert ("PUT", f"kv/lib:{lib_id}") in [(m, p) for m, p, _ in edge_calls]
    body = [b for m, p, b in edge_calls if p == f"kv/lib:{lib_id}"][-1]
    assert body["domains"] == ["school.com", "*.school.com"] and body["key"]


@pytest.mark.django_db
def test_invalid_domain_rejected(org, owner):
    c = client_for(owner, org)
    r = c.post("/api/v1/libraries", {"name": "x", "allowed_domains": ["not a domain"]}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_rotate_key_changes_secret(org, owner, library):
    c = client_for(owner, org)
    old = library.security_key
    r = c.post(f"/api/v1/libraries/{library.id}/rotate-key")
    assert r.status_code == 200 and r.data["security_key"] != old


@pytest.mark.django_db
def test_cross_org_video_access_is_blocked(org, owner, library, outsider, other_org):
    video = Video.objects.create(library=library, title="Lecture 1")
    c = client_for(outsider, other_org)
    assert c.get(f"/api/v1/videos/{video.id}").status_code == 404
    assert c.patch(f"/api/v1/videos/{video.id}", {"title": "x"}, format="json").status_code == 404
    assert c.delete(f"/api/v1/videos/{video.id}").status_code == 404
    assert c.get(f"/api/v1/libraries/{library.id}/videos").status_code == 404
    assert c.post(f"/api/v1/libraries/{library.id}/videos", {"title": "x"}, format="json").status_code == 404
    assert c.get(f"/api/v1/videos/{video.id}/usage").status_code == 404
    assert Video.objects.filter(pk=video.id, title="Lecture 1").exists()


@pytest.mark.django_db
def test_pending_org_cannot_upload(owner, org, library):
    org.status = Organization.STATUS_PENDING
    org.save()
    r = client_for(owner, org).post(f"/api/v1/libraries/{library.id}/videos", {"title": "x"}, format="json")
    assert r.status_code == 403


@pytest.mark.django_db
def test_uploader_can_create_and_edit_but_not_delete(org, uploader, library):
    c = client_for(uploader, org)
    r = c.post(f"/api/v1/libraries/{library.id}/videos", {"title": "Chapter 1", "filename": "c1.mp4"}, format="json")
    assert r.status_code == 201
    vid = r.data["video"]["id"]
    assert r.data["upload"]["metadata"] == {"video_id": vid}
    assert c.patch(f"/api/v1/videos/{vid}", {"title": "Chapter One"}, format="json").status_code == 200
    assert c.delete(f"/api/v1/videos/{vid}").status_code == 403


def hook(client, type_, video_id, auth, size=1000, filename="class.mp4", path="/tmp/x"):
    return client.post(
        "/api/v1/internal/tusd-hooks?secret=test-internal",
        {
            "Type": type_,
            "Event": {
                "Upload": {"ID": "abc", "Size": size, "MetaData": {"video_id": str(video_id), "filename": filename}, "Storage": {"Path": path}},
                "HTTPRequest": {"Header": {"Authorization": [auth]}},
            },
        },
        format="json",
    )


@pytest.mark.django_db
def test_tusd_hooks_authorize_and_queue(org, owner, library, outsider, settings, tmp_path):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    settings.UPLOAD_DIR = str(tmp_path)
    settings.MIN_FREE_DISK_BYTES = 0
    video = Video.objects.create(library=library, title="Lecture")
    client = APIClient()
    good = f"Bearer {RefreshToken.for_user(owner).access_token}"
    bad = f"Bearer {RefreshToken.for_user(outsider).access_token}"

    assert client.post("/api/v1/internal/tusd-hooks", {"Type": "pre-create"}, format="json").status_code == 403
    assert hook(client, "pre-create", video.id, bad).data["RejectUpload"] is True
    assert hook(client, "pre-create", video.id, good, filename="notes.pdf").data["HTTPResponse"]["StatusCode"] == 415
    assert hook(client, "pre-create", video.id, good, size=settings.MAX_UPLOAD_BYTES + 1).data["HTTPResponse"]["StatusCode"] == 413
    assert "RejectUpload" not in hook(client, "pre-create", video.id, good).data

    hook(client, "post-finish", video.id, good, path=str(tmp_path / "abc"))
    video.refresh_from_db()
    assert video.status == Video.STATUS_QUEUED
    assert video.source_path == str(tmp_path / "abc")
    assert EncodeJob.objects.filter(video=video, status="queued").count() == 1


def test_token_signing_matches_plan_reference():
    # Same algorithm as the customer-side Python sample in docs/PLAN.md.
    import base64, hashlib, hmac

    key, lib, vid, exp = "secret", 12, "0b7c", 1700000000
    expected = base64.urlsafe_b64encode(hmac.new(key.encode(), f"{lib}/{vid}/{exp}".encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
    assert sign_token(key, lib, vid, exp) == expected
    assert "=" not in expected


@pytest.mark.django_db
def test_signed_url_endpoint(org, owner, library):
    video = Video.objects.create(library=library, title="L", status="ready", privacy="private")
    r = client_for(owner, org).post(f"/api/v1/videos/{video.id}/signed-url", {"expires_in": 3600}, format="json")
    assert r.status_code == 200
    assert f"/t/{r.data['token']}/{r.data['expires']}/{library.id}/{video.id}/playlist.m3u8" in r.data["hls"]


@pytest.mark.django_db
def test_ready_video_pushed_and_deleted_from_edge(org, owner, library, edge_calls, django_capture_on_commit_callbacks):
    video = Video.objects.create(library=library, title="L")
    video.status = "ready"
    with django_capture_on_commit_callbacks(execute=True):
        video.save()
    assert ("PUT", f"kv/vid:{video.id}") in [(m, p) for m, p, _ in edge_calls]
    client_for(owner, org).delete(f"/api/v1/videos/{video.id}")
    paths = [(m, p) for m, p, _ in edge_calls]
    assert ("DELETE", f"kv/vid:{video.id}") in paths
    assert any(m == "DELETE" and p.startswith("r2-prefix/") for m, p in paths)
    assert not Video.objects.filter(pk=video.id).exists()
