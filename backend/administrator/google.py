import jwt
from django.conf import settings

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

_jwks_client = jwt.PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True, lifespan=3600)


class GoogleTokenError(Exception):
    pass


def verify_google_id_token(credential):
    """Verify a Google ID token's signature, audience, issuer and expiry.

    Returns the token claims. Never trust an ID token that came from the
    browser without checking its signature against Google's public keys.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleTokenError("Google sign-in is not configured.")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.GOOGLE_CLIENT_ID,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise GoogleTokenError("Invalid Google credential.") from e

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleTokenError("Invalid Google credential issuer.")
    if not claims.get("email") or not claims.get("email_verified"):
        raise GoogleTokenError("Your Google account email is not verified.")
    return claims
