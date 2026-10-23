from django.conf import settings
from rest_framework import serializers

# models
from organizations.models import ApiKey, AuditLog, Invitation, Membership, Organization


class PlanBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class OrganizationSerializer(serializers.ModelSerializer):
    plan = PlanBriefSerializer(read_only=True)
    quotas = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "status", "plan", "trial_ends_at", "billing_email", "quotas", "created_at"]
        read_only_fields = ["id", "slug", "status", "plan", "trial_ends_at", "quotas", "created_at"]

    def get_quotas(self, obj):
        return obj.quotas()


class MyMembershipSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "role", "organization"]


class MemberSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    name = serializers.CharField(source="user.name", read_only=True)
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "email", "name", "avatar_url", "role", "created_at"]
        read_only_fields = ["id", "email", "name", "avatar_url", "created_at"]


class InvitationSerializer(serializers.ModelSerializer):
    invited_by = serializers.EmailField(source="invited_by.email", read_only=True, default=None)

    class Meta:
        model = Invitation
        fields = ["id", "email", "role", "invited_by", "expires_at", "created_at"]
        read_only_fields = ["id", "invited_by", "expires_at", "created_at"]

    def validate_email(self, value):
        return value.lower()


class ApiKeySerializer(serializers.ModelSerializer):
    created_by = serializers.EmailField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = ApiKey
        fields = ["id", "name", "prefix", "created_by", "created_at", "last_used_at", "revoked_at"]
        read_only_fields = ["id", "prefix", "created_by", "created_at", "last_used_at", "revoked_at"]


class AuditLogSerializer(serializers.ModelSerializer):
    user = serializers.EmailField(source="user.email", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "action", "target", "metadata", "created_at"]
