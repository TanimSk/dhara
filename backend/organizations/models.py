import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class Organization(models.Model):
    STATUS_PENDING = "pending"
    STATUS_TRIAL = "trial"
    STATUS_ACTIVE = "active"
    STATUS_SUSPENDED = "suspended"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending approval"),
        (STATUS_TRIAL, "Trial"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_SUSPENDED, "Suspended"),
    ]

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    plan = models.ForeignKey("billing.Plan", null=True, blank=True, on_delete=models.SET_NULL, related_name="organizations")
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    billing_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:120] or "org"
            slug = base
            while Organization.objects.filter(slug=slug).exists():
                slug = f"{base}-{secrets.token_hex(3)}"
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def can_upload(self):
        return self.status in (self.STATUS_TRIAL, self.STATUS_ACTIVE)

    def start_trial(self):
        self.status = self.STATUS_TRIAL
        self.trial_ends_at = timezone.now() + timedelta(days=settings.TRIAL_DAYS)

    def quotas(self):
        """Storage / bandwidth / member limits from the plan, or the trial caps."""
        if self.plan and self.status != self.STATUS_TRIAL:
            return {
                "storage_gb": self.plan.storage_gb,
                "bandwidth_gb": self.plan.bandwidth_gb,
                "max_members": self.plan.max_members,
            }
        return {
            "storage_gb": settings.TRIAL_STORAGE_GB,
            "bandwidth_gb": settings.TRIAL_BANDWIDTH_GB,
            "max_members": settings.TRIAL_MAX_MEMBERS,
        }


class Membership(models.Model):
    ROLE_OWNER = "owner"
    ROLE_ADMIN = "admin"
    ROLE_UPLOADER = "uploader"
    ROLE_CHOICES = [(ROLE_OWNER, "Owner"), (ROLE_ADMIN, "Admin"), (ROLE_UPLOADER, "Uploader")]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "organization"], name="unique_membership")]

    def __str__(self):
        return f"{self.user} @ {self.organization} ({self.role})"


class InvitationQuerySet(models.QuerySet):
    def pending(self):
        return self.filter(accepted_at__isnull=True, expires_at__gt=timezone.now())


def invitation_token():
    return secrets.token_urlsafe(32)


def invitation_expiry():
    return timezone.now() + timedelta(days=7)


class Invitation(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(max_length=16, choices=Membership.ROLE_CHOICES)
    token = models.CharField(max_length=64, unique=True, default=invitation_token)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    expires_at = models.DateTimeField(default=invitation_expiry)
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = InvitationQuerySet.as_manager()

    def __str__(self):
        return f"{self.email} → {self.organization}"


class ApiKey(models.Model):
    """A server-to-server key. The full key is shown once; only its hash is stored."""

    PREFIX = "dh_"

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="api_keys")
    name = models.CharField(max_length=80)
    prefix = models.CharField(max_length=16, unique=True)
    key_hash = models.CharField(max_length=64)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.prefix})"

    @staticmethod
    def hash_secret(raw_key):
        return hashlib.sha256(raw_key.encode()).hexdigest()

    @classmethod
    def generate(cls, organization, name, created_by=None):
        """Create a key and return (instance, raw_key). The raw key is never stored."""
        prefix = secrets.token_hex(4)
        raw_key = f"{cls.PREFIX}{prefix}_{secrets.token_urlsafe(32)}"
        key = cls.objects.create(
            organization=organization,
            name=name,
            prefix=prefix,
            key_hash=cls.hash_secret(raw_key),
            created_by=created_by,
        )
        return key, raw_key


class AuditLog(models.Model):
    organization = models.ForeignKey(Organization, null=True, on_delete=models.CASCADE, related_name="audit_logs")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=64)
    target = models.CharField(max_length=200, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["organization", "-created_at"])]
