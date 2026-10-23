import secrets

from django.db import models


def new_security_key():
    return secrets.token_urlsafe(32)


class Library(models.Model):
    PRIVACY_PUBLIC = "public"
    PRIVACY_PRIVATE = "private"
    PRIVACY_CHOICES = [(PRIVACY_PUBLIC, "Public"), (PRIVACY_PRIVATE, "Private")]

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="libraries")
    name = models.CharField(max_length=120)
    security_key = models.CharField(max_length=64, default=new_security_key)
    token_auth_enabled = models.BooleanField(default=False)
    # Exact hosts ("school.com") or wildcards ("*.school.com"). Empty = embed anywhere.
    allowed_domains = models.JSONField(default=list, blank=True)
    allow_direct_access = models.BooleanField(default=True)
    default_privacy = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default=PRIVACY_PUBLIC)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "library"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def rotate_key(self):
        self.security_key = new_security_key()
