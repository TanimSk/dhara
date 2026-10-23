from rest_framework import serializers

# models
from videos.models import EncodeJob, Video

from videos.services import video_urls


class VideoSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    urls = serializers.SerializerMethodField()
    library_name = serializers.CharField(source="library.name", read_only=True)

    class Meta:
        model = Video
        fields = [
            "id",
            "library",
            "library_name",
            "title",
            "privacy",
            "status",
            "progress",
            "duration_s",
            "source_bytes",
            "storage_bytes",
            "width",
            "height",
            "renditions",
            "error",
            "original_filename",
            "urls",
            "created_at",
            "ready_at",
        ]
        read_only_fields = [f for f in fields if f not in ("title", "privacy")]

    def get_progress(self, obj):
        if obj.status == Video.STATUS_READY:
            return 100
        if obj.status != Video.STATUS_ENCODING:
            return 0
        progress = getattr(obj, "job_progress", None)
        if progress is None:
            job = obj.jobs.filter(status=EncodeJob.STATUS_RUNNING).first()
            progress = job.progress if job else 0
        return progress

    def get_urls(self, obj):
        return video_urls(obj)


class VideoCreateSerializer(serializers.ModelSerializer):
    filename = serializers.CharField(required=False, allow_blank=True, write_only=True, max_length=255)

    class Meta:
        model = Video
        fields = ["title", "privacy", "filename"]
        extra_kwargs = {"privacy": {"required": False}}


class SignedUrlSerializer(serializers.Serializer):
    expires_in = serializers.IntegerField(min_value=60, max_value=7 * 24 * 3600, default=4 * 3600)


class BulkDeleteSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)


class EncodeJobSerializer(serializers.ModelSerializer):
    video_title = serializers.CharField(source="video.title", read_only=True)
    organization = serializers.CharField(source="video.library.organization.name", read_only=True)

    class Meta:
        model = EncodeJob
        fields = [
            "id",
            "video",
            "video_title",
            "organization",
            "status",
            "progress",
            "attempts",
            "locked_by",
            "heartbeat_at",
            "started_at",
            "finished_at",
            "log_tail",
            "created_at",
        ]
