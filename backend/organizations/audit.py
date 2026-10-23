from organizations.models import ApiKey, AuditLog


def audit(request, action, target="", organization=None, **metadata):
    """Record a sensitive action (key rotation, deletion, member change)."""
    user = request.user if getattr(request.user, "pk", None) else None
    if isinstance(getattr(request, "auth", None), ApiKey):
        metadata.setdefault("api_key", request.auth.prefix)
    AuditLog.objects.create(
        organization=organization or getattr(request, "organization", None),
        user=user,
        action=action,
        target=str(target)[:200],
        metadata=metadata,
    )
