import re

from rest_framework import serializers

# models
from libraries.models import Library

DOMAIN_RE = re.compile(r"^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+(:\d+)?$")


class LibrarySerializer(serializers.ModelSerializer):
    video_count = serializers.IntegerField(read_only=True, default=0)
    storage_bytes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Library
        fields = [
            "id",
            "name",
            "token_auth_enabled",
            "allowed_domains",
            "allow_direct_access",
            "default_privacy",
            "video_count",
            "storage_bytes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_allowed_domains(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Must be a list of domains.")
        cleaned = []
        for raw in value:
            host = str(raw).strip().lower()
            host = re.sub(r"^https?://", "", host).rstrip("/")
            if not host:
                continue
            if not DOMAIN_RE.match(host):
                raise serializers.ValidationError(f"'{raw}' isn't a valid domain.")
            if host not in cleaned:
                cleaned.append(host)
        if len(cleaned) > 50:
            raise serializers.ValidationError("At most 50 domains.")
        return cleaned


class LibrarySecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = Library
        fields = ["id", "security_key"]
