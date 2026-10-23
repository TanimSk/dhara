from rest_framework import serializers
from rest_framework.views import exception_handler

# models
from administrator.models import User


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        if isinstance(response.data, dict):
            # Extract error messages from dict
            plain_errors = []
            for field, messages in response.data.items():
                if field == "detail":
                    plain_errors.append(str(messages))
                elif isinstance(messages, list):
                    for message in messages:
                        plain_errors.append(f"({field}) {message}")
                else:
                    plain_errors.append(f"({field}) {messages}")
            message = "\n".join(plain_errors)
        elif isinstance(response.data, list):
            # If it's a list, join messages
            message = "\n".join(str(msg) for msg in response.data)
        else:
            # Fallback for any other format (e.g., string)
            message = str(response.data)

        response.data = {"success": False, "message": message}

    return response


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "avatar_url", "is_staff"]
        read_only_fields = fields


class GoogleLoginSerializer(serializers.Serializer):
    # The ID token ("credential") returned by Google Identity Services.
    credential = serializers.CharField()


class DevLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(required=False, allow_blank=True)
