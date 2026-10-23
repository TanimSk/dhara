import uuid

from django.conf import settings
from django.db import models


class Video(models.Model):
    STATUS_UPLOADING = "uploading"
    STATUS_QUEUED = "queued"
    STATUS_ENCODING = "encoding"
    STATUS_READY = "ready"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_UPLOADING, "Uploading"),
        (STATUS_QUEUED, "Queued"),
        (STATUS_ENCODING, "Encoding"),
        (STATUS_READY, "Ready"),
        (STATUS_FAILED, "Failed"),
    ]
    PRIVACY_CHOICES = [("public", "Public"), ("private", "Private")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    library = models.ForeignKey("libraries.Library", on_delete=models.CASCADE, related_name="videos")
    title = models.CharField(max_length=200)
    privacy = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default="public")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_UPLOADING)
    duration_s = models.FloatField(null=True, blank=True)
    source_bytes = models.BigIntegerField(default=0)
    storage_bytes = models.BigIntegerField(default=0)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    renditions = models.JSONField(default=list, blank=True)
    thumbnail_key = models.CharField(max_length=300, blank=True)
    thumbnail_version = models.IntegerField(default=0)
    error = models.TextField(blank=True)
    source_path = models.CharField(max_length=500, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    upload_started_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "video"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["library", "status"])]

    def __str__(self):
        return self.title

    @property
    def r2_prefix(self):
        return f"{self.library_id}/{self.id}/"


class EncodeJob(models.Model):
    """Doubles as the encode queue: encoderd claims rows with FOR UPDATE SKIP LOCKED."""

    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_QUEUED, "Queued"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
    ]

    video = models.ForeignKey(Video, on_delete=models.CASCADE, related_name="jobs")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    progress = models.SmallIntegerField(default=0)
    attempts = models.SmallIntegerField(default=0)
    locked_by = models.CharField(max_length=100, blank=True)
    heartbeat_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    log_tail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "encode_job"
        ordering = ["-id"]
        indexes = [models.Index(fields=["status", "id"])]
