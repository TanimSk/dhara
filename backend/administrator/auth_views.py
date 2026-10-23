from django.conf import settings
from django.db import transaction
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework import status

# authentication
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

# models
from administrator.models import User
from organizations.models import Invitation

# serializers
from administrator.serializers import UserSerializer, GoogleLoginSerializer, DevLoginSerializer
from organizations.serializers import MyMembershipSerializer

from administrator.google import verify_google_id_token, GoogleTokenError


def get_or_create_google_user(sub, email, name="", avatar_url=""):
    email = email.lower()
    with transaction.atomic():
        user = User.objects.select_for_update().filter(google_sub=sub).first()
        if user is None:
            # First Google sign-in for an existing email (e.g. created in admin) links the account.
            user = User.objects.select_for_update().filter(email__iexact=email).first()
        if user is None:
            user = User(username=email, email=email)
            user.set_unusable_password()
        user.google_sub = sub
        user.email = email
        user.name = name or user.name
        user.avatar_url = avatar_url or user.avatar_url
        user.save()
    return user


def session_response(user, status_code=status.HTTP_200_OK):
    """Return an access token in the body and the refresh token as an httpOnly cookie."""
    refresh = RefreshToken.for_user(user)
    response = Response(
        {
            "success": True,
            "access": str(refresh.access_token),
            "user": UserSerializer(user).data,
        },
        status=status_code,
    )
    set_refresh_cookie(response, str(refresh))
    return response


def set_refresh_cookie(response, refresh):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
        path=settings.REFRESH_COOKIE_PATH,
    )


class GoogleLogin(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request, *args, **kwargs):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            claims = verify_google_id_token(serializer.validated_data["credential"])
        except GoogleTokenError as e:
            return Response(
                {"success": False, "message": str(e)},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = get_or_create_google_user(
            sub=claims["sub"],
            email=claims["email"],
            name=claims.get("name", ""),
            avatar_url=claims.get("picture", ""),
        )
        if not user.is_active:
            return Response(
                {"success": False, "message": "This account is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return session_response(user)


class DevLogin(APIView):
    """Local development only: sign in as any email without Google."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        if not settings.DEV_LOGIN_ENABLED:
            return Response({"success": False, "message": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DevLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].lower()
        user = get_or_create_google_user(
            sub=f"dev:{email}", email=email, name=serializer.validated_data.get("name", "")
        )
        return session_response(user)


class RefreshAccess(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw:
            return Response({"success": False, "message": "Not signed in."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw)
            user = User.objects.get(id=refresh["user_id"], is_active=True)
            # Rotate: blacklist the old token and issue a new pair.
            refresh.blacklist()
            new_refresh = RefreshToken.for_user(user)
        except (TokenError, User.DoesNotExist):
            response = Response({"success": False, "message": "Session expired."}, status=status.HTTP_401_UNAUTHORIZED)
            response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
            return response

        response = Response({"success": True, "access": str(new_refresh.access_token)})
        set_refresh_cookie(response, str(new_refresh))
        return response


class Logout(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response({"success": True})
        response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH)
        return response


class Me(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        memberships = user.memberships.select_related("organization", "organization__plan").order_by("organization__name")
        pending_invites = Invitation.objects.pending().filter(email__iexact=user.email).select_related("organization")
        return Response(
            {
                "success": True,
                "user": UserSerializer(user).data,
                "memberships": MyMembershipSerializer(memberships, many=True).data,
                "pending_invitations": [
                    {"token": i.token, "organization": i.organization.name, "role": i.role}
                    for i in pending_invites
                ],
                "google_client_id": settings.GOOGLE_CLIENT_ID,
            }
        )


class AuthConfig(APIView):
    """Public config the login page needs."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        return Response(
            {
                "success": True,
                "google_client_id": settings.GOOGLE_CLIENT_ID,
                "dev_login": settings.DEV_LOGIN_ENABLED,
            }
        )
