from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    # Customers sign in with Google only; username mirrors the email.
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True)
    google_sub = models.CharField(max_length=64, unique=True, null=True, blank=True)

    def __str__(self):
        return self.email
