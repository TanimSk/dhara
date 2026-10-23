import pytest
from rest_framework.test import APIClient

from administrator.models import User


@pytest.mark.django_db
def test_dev_login_is_refused_unless_enabled(settings):
    settings.DEV_LOGIN_ENABLED = False
    response = APIClient().post("/api/v1/auth/dev-login", {"email": "a@b.com"}, format="json")
    assert response.status_code == 404


@pytest.mark.django_db
def test_dev_login_issues_access_and_refresh_cookie(settings):
    settings.DEV_LOGIN_ENABLED = True
    client = APIClient()
    response = client.post("/api/v1/auth/dev-login", {"email": "New@Example.com"}, format="json")
    assert response.status_code == 200
    assert response.data["access"]
    assert settings.REFRESH_COOKIE_NAME in response.cookies
    assert User.objects.filter(email="new@example.com").exists()

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200 and refreshed.data["access"]

    # The rotated-out refresh token can't be reused.
    old = response.cookies[settings.REFRESH_COOKIE_NAME].value
    replay = APIClient()
    replay.cookies[settings.REFRESH_COOKIE_NAME] = old
    assert replay.post("/api/v1/auth/refresh").status_code == 401


@pytest.mark.django_db
def test_google_login_rejects_forged_token(settings):
    import jwt

    settings.GOOGLE_CLIENT_ID = "client-123"
    forged = jwt.encode(
        {"iss": "https://accounts.google.com", "aud": "client-123", "sub": "1", "email": "victim@example.com",
         "email_verified": True, "exp": 9999999999, "iat": 1},
        "attacker-secret",
        algorithm="HS256",
    )
    response = APIClient().post("/api/v1/auth/google", {"credential": forged}, format="json")
    assert response.status_code == 401
    assert not User.objects.filter(email="victim@example.com").exists()


@pytest.mark.django_db
def test_google_login_creates_user_from_verified_claims(settings, monkeypatch):
    settings.GOOGLE_CLIENT_ID = "client-123"
    monkeypatch.setattr(
        "administrator.auth_views.verify_google_id_token",
        lambda cred: {"sub": "g-1", "email": "Rahim@Gmail.com", "name": "Rahim", "picture": ""},
    )
    response = APIClient().post("/api/v1/auth/google", {"credential": "x"}, format="json")
    assert response.status_code == 200
    user = User.objects.get(google_sub="g-1")
    assert user.email == "rahim@gmail.com" and user.name == "Rahim"
