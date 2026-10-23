import hmac

from django.utils import timezone
from rest_framework import authentication, exceptions

from organizations.models import ApiKey


class ApiKeyAuthentication(authentication.BaseAuthentication):
    """`Authorization: Bearer dh_<prefix>_<secret>`. Anything else falls through to JWT."""

    keyword = "Bearer"

    def authenticate(self, request):
        header = authentication.get_authorization_header(request).decode("latin-1")
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword or not parts[1].startswith(ApiKey.PREFIX):
            return None
        return authenticate_api_key(parts[1])

    def authenticate_header(self, request):
        return self.keyword


def authenticate_api_key(raw_key):
    try:
        prefix = raw_key[len(ApiKey.PREFIX):].split("_", 1)[0]
    except IndexError:
        raise exceptions.AuthenticationFailed("Invalid API key.")
    key = ApiKey.objects.select_related("organization").filter(prefix=prefix, revoked_at__isnull=True).first()
    if key is None or not hmac.compare_digest(key.key_hash, ApiKey.hash_secret(raw_key)):
        raise exceptions.AuthenticationFailed("Invalid API key.")

    now = timezone.now()
    if key.last_used_at is None or (now - key.last_used_at).total_seconds() > 60:
        ApiKey.objects.filter(pk=key.pk).update(last_used_at=now)
    # API keys act on behalf of the organization, not a person.
    return (ApiKeyUser(key), key)


class ApiKeyUser:
    """Stand-in user for API key requests."""

    is_authenticated = True
    is_active = True
    is_staff = False
    is_superuser = False
    is_anonymous = False
    pk = None
    id = None

    def __init__(self, api_key):
        self.api_key = api_key

    def __str__(self):
        return f"api-key:{self.api_key.prefix}"
