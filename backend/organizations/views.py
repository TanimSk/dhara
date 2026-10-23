from django.conf import settings
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from organizations.models import ApiKey, AuditLog, Invitation, Membership, Organization

# serializers
from organizations.serializers import (
    ApiKeySerializer,
    AuditLogSerializer,
    InvitationSerializer,
    MemberSerializer,
    MyMembershipSerializer,
    OrganizationSerializer,
)

from organizations.audit import audit
from organizations.permissions import (
    IsOrgManagerDashboard,
    IsOrgMemberDashboard,
    IsOrgOwner,
)
from utils.email_handler import send_html_mail
from utils.shared import StandardResultsSetPagination


def reject_api_keys(request):
    if isinstance(request.auth, ApiKey):
        raise PermissionDenied("API keys can't use this endpoint.")


# ---------- Organizations ----------


class OrganizationListCreate(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        reject_api_keys(request)
        memberships = request.user.memberships.select_related("organization", "organization__plan")
        return Response({"success": True, "results": MyMembershipSerializer(memberships, many=True).data})

    def post(self, request, *args, **kwargs):
        reject_api_keys(request)
        serializer = OrganizationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            org = Organization(name=serializer.validated_data["name"], billing_email=request.user.email)
            if settings.AUTO_APPROVE_TRIALS:
                org.start_trial()
            org.save()
            membership = Membership.objects.create(user=request.user, organization=org, role=Membership.ROLE_OWNER)
            AuditLog.objects.create(organization=org, user=request.user, action="organization.created", target=org.name)
        return Response(
            {"success": True, "membership": MyMembershipSerializer(membership).data},
            status=status.HTTP_201_CREATED,
        )


class CurrentOrganization(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [IsOrgMemberDashboard()]
        return [IsOrgOwner()]

    def get(self, request, *args, **kwargs):
        return Response({"success": True, "organization": OrganizationSerializer(request.organization).data, "role": request.org_role})

    def patch(self, request, *args, **kwargs):
        serializer = OrganizationSerializer(request.organization, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(request, "organization.updated", request.organization.name, fields=list(request.data.keys()))
        return Response({"success": True, "organization": serializer.data})


# ---------- Team ----------


class MemberList(APIView):
    permission_classes = [IsOrgManagerDashboard]

    def get(self, request, *args, **kwargs):
        members = request.organization.memberships.select_related("user").order_by("created_at")
        return Response({"success": True, "results": MemberSerializer(members, many=True).data})


class MemberDetail(APIView):
    permission_classes = [IsOrgOwner]

    def get_object(self, request, pk):
        try:
            return request.organization.memberships.select_related("user").get(pk=pk)
        except Membership.DoesNotExist:
            raise ValidationError("Member not found.")

    def ensure_other_owner(self, request, membership):
        if membership.role == Membership.ROLE_OWNER:
            owners = request.organization.memberships.filter(role=Membership.ROLE_OWNER).count()
            if owners <= 1:
                raise ValidationError("An organization needs at least one owner.")

    def patch(self, request, pk, *args, **kwargs):
        membership = self.get_object(request, pk)
        serializer = MemberSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data.get("role", membership.role)
        if new_role != Membership.ROLE_OWNER:
            self.ensure_other_owner(request, membership)
        old_role = membership.role
        serializer.save()
        audit(request, "member.role_changed", membership.user.email, old=old_role, new=new_role)
        return Response({"success": True, "member": serializer.data})

    def delete(self, request, pk, *args, **kwargs):
        membership = self.get_object(request, pk)
        self.ensure_other_owner(request, membership)
        email = membership.user.email
        membership.delete()
        audit(request, "member.removed", email)
        return Response({"success": True}, status=status.HTTP_200_OK)


class InvitationListCreate(APIView):
    permission_classes = [IsOrgOwner]

    def get(self, request, *args, **kwargs):
        invites = request.organization.invitations.pending().select_related("invited_by").order_by("-created_at")
        return Response({"success": True, "results": InvitationSerializer(invites, many=True).data})

    def post(self, request, *args, **kwargs):
        org = request.organization
        serializer = InvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        if org.memberships.filter(user__email__iexact=email).exists():
            raise ValidationError("This person is already a member.")
        seats_used = org.memberships.count() + org.invitations.pending().count()
        if seats_used >= org.quotas()["max_members"]:
            raise ValidationError("Your plan's team member limit is reached.")

        # Re-inviting replaces the previous pending invitation.
        org.invitations.pending().filter(email__iexact=email).delete()
        invite = serializer.save(organization=org, invited_by=request.user)
        send_invitation_email(invite, request.user)
        audit(request, "member.invited", email, role=invite.role)
        return Response({"success": True, "invitation": InvitationSerializer(invite).data}, status=status.HTTP_201_CREATED)


def send_invitation_email(invite, inviter):
    role = invite.get_role_display().lower()
    html = render_to_string(
        "emails/invitation.html",
        {
            "organization": invite.organization.name,
            "inviter": inviter.name or inviter.email,
            "role": role,
            "role_article": "an" if role[0] in "aeiou" else "a",
            "email": invite.email,
            "url": f"{settings.FRONTEND_URL}/invite/{invite.token}",
        },
    )
    send_html_mail(f"Join {invite.organization.name} on dhara", html, [invite.email], settings.DEFAULT_FROM_EMAIL)


class InvitationDelete(APIView):
    permission_classes = [IsOrgOwner]

    def delete(self, request, pk, *args, **kwargs):
        deleted, _ = request.organization.invitations.filter(pk=pk).delete()
        if not deleted:
            raise ValidationError("Invitation not found.")
        return Response({"success": True})


class InvitationLookup(APIView):
    permission_classes = [IsAuthenticated]

    def get_invite(self, request, token):
        reject_api_keys(request)
        invite = Invitation.objects.pending().select_related("organization").filter(token=token).first()
        if invite is None:
            raise ValidationError("This invitation is invalid or has expired.")
        return invite

    def get(self, request, token, *args, **kwargs):
        invite = self.get_invite(request, token)
        return Response(
            {
                "success": True,
                "organization": invite.organization.name,
                "role": invite.role,
                "email": invite.email,
                "email_matches": invite.email.lower() == request.user.email.lower(),
            }
        )

    def post(self, request, token, *args, **kwargs):
        invite = self.get_invite(request, token)
        if invite.email.lower() != request.user.email.lower():
            raise PermissionDenied(f"This invitation was sent to {invite.email}. Sign in with that Google account.")
        with transaction.atomic():
            membership, _ = Membership.objects.get_or_create(
                user=request.user, organization=invite.organization, defaults={"role": invite.role}
            )
            invite.accepted_at = timezone.now()
            invite.save(update_fields=["accepted_at"])
            AuditLog.objects.create(
                organization=invite.organization, user=request.user, action="member.joined", target=request.user.email
            )
        return Response({"success": True, "membership": MyMembershipSerializer(membership).data})


# ---------- API keys ----------


class ApiKeyListCreate(APIView):
    permission_classes = [IsOrgManagerDashboard]

    def get(self, request, *args, **kwargs):
        keys = request.organization.api_keys.filter(revoked_at__isnull=True).select_related("created_by").order_by("-created_at")
        return Response({"success": True, "results": ApiKeySerializer(keys, many=True).data})

    def post(self, request, *args, **kwargs):
        serializer = ApiKeySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        key, raw_key = ApiKey.generate(request.organization, serializer.validated_data["name"], created_by=request.user)
        audit(request, "api_key.created", key.name, prefix=key.prefix)
        # The only time the full key is ever returned.
        return Response({"success": True, "api_key": ApiKeySerializer(key).data, "key": raw_key}, status=status.HTTP_201_CREATED)


class ApiKeyRevoke(APIView):
    permission_classes = [IsOrgManagerDashboard]

    def delete(self, request, pk, *args, **kwargs):
        key = request.organization.api_keys.filter(pk=pk, revoked_at__isnull=True).first()
        if key is None:
            raise ValidationError("API key not found.")
        key.revoked_at = timezone.now()
        key.save(update_fields=["revoked_at"])
        audit(request, "api_key.revoked", key.name, prefix=key.prefix)
        return Response({"success": True})


class AuditLogList(APIView):
    permission_classes = [IsOrgManagerDashboard]

    def get(self, request, *args, **kwargs):
        logs = request.organization.audit_logs.select_related("user")
        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(logs, request, view=self)
        return paginator.get_paginated_response(AuditLogSerializer(page, many=True).data)
