from rest_framework.exceptions import NotAuthenticated, NotFound, PermissionDenied
from rest_framework.permissions import BasePermission

from organizations.models import ApiKey, Membership, Organization

ROLE_API_KEY = "api_key"
ALL_ROLES = (Membership.ROLE_OWNER, Membership.ROLE_ADMIN, Membership.ROLE_UPLOADER)
MANAGER_ROLES = (Membership.ROLE_OWNER, Membership.ROLE_ADMIN)


def resolve_organization(request):
    """Attach request.organization and request.org_role, once per request.

    API keys carry their organization. Dashboard users pick one with the
    `X-Organization` header and must be a member of it.
    """
    if hasattr(request, "organization"):
        return request.organization, request.org_role

    user = request.user
    if not user or not user.is_authenticated:
        raise NotAuthenticated()

    if isinstance(request.auth, ApiKey):
        org, role = request.auth.organization, ROLE_API_KEY
    else:
        org_id = request.headers.get("X-Organization")
        if not org_id or not org_id.isdigit():
            raise PermissionDenied("Choose an organization (X-Organization header).")
        membership = (
            Membership.objects.select_related("organization", "organization__plan")
            .filter(user=user, organization_id=int(org_id))
            .first()
        )
        if membership is None:
            raise NotFound("Organization not found.")
        org, role = membership.organization, membership.role

    request.organization = org
    request.org_role = role
    return org, role


class OrgPermission(BasePermission):
    """Base: allowed roles + whether API keys may call the endpoint."""

    roles = ALL_ROLES
    allow_api_key = True

    def has_permission(self, request, view):
        _org, role = resolve_organization(request)
        if role == ROLE_API_KEY:
            if not self.allow_api_key:
                raise PermissionDenied("API keys can't use this endpoint.")
            return True
        if role not in self.roles:
            raise PermissionDenied("Your role doesn't allow this.")
        return True


class IsOrgMember(OrgPermission):
    """Any member, or an API key."""


class IsOrgManager(OrgPermission):
    """Owner or admin, or an API key."""

    roles = MANAGER_ROLES


class IsOrgManagerDashboard(OrgPermission):
    """Owner or admin, dashboard only (API keys, team, security key)."""

    roles = MANAGER_ROLES
    allow_api_key = False


class IsOrgOwner(OrgPermission):
    """Owner only, dashboard only (billing, members)."""

    roles = (Membership.ROLE_OWNER,)
    allow_api_key = False


class IsOrgMemberDashboard(OrgPermission):
    allow_api_key = False


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff and not isinstance(request.auth, ApiKey))


def org_is_writable(org):
    if org.status == Organization.STATUS_SUSPENDED:
        raise PermissionDenied("This organization is suspended. Contact support.")
