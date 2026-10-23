from rest_framework.throttling import SimpleRateThrottle

from organizations.models import ApiKey


class ApiKeyRateThrottle(SimpleRateThrottle):
    """120 requests / minute per API key. Dashboard (JWT) traffic isn't throttled here."""

    scope = "api_key"

    def get_cache_key(self, request, view):
        if isinstance(request.auth, ApiKey):
            return self.cache_format % {"scope": self.scope, "ident": request.auth.prefix}
        return None
