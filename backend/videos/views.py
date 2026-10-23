import logging
import os
import shutil

from django.conf import settings
from django.db import transaction
from django.db.models import OuterRef, Subquery, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from libraries.models import Library
from organizations.models import ApiKey, Membership, Organization
from videos.models import EncodeJob, Video

# serializers
from videos.serializers import BulkDeleteSerializer, SignedUrlSerializer, VideoCreateSerializer, VideoSerializer

from organizations.audit import audit
from organizations.permissions import IsOrgManager, IsOrgMember, IsOrgMemberDashboard, org_is_writable
from organizations.throttling import ApiKeyRateThrottle
from utils import edge
from utils.shared import GB, StandardResultsSetPagination, is_internal_request
from videos.services import delete_video_everywhere, queue_encode, remove_source, signed_urls

logger = logging.getLogger("dhara")

ORDERINGS = {"newest": "-created_at", "oldest": "created_at", "title": "title", "duration": "-duration_s", "size": "-storage_bytes"}


def videos_for(org):
    running = EncodeJob.objects.filter(video=OuterRef("pk"), status=EncodeJob.STATUS_RUNNING).values("progress")[:1]
    return (
        Video.objects.filter(library__organization=org)
        .select_related("library")
        .annotate(job_progress=Subquery(running))
    )


def get_video(request, pk):
    try:
        return videos_for(request.organization).get(pk=pk)
    except (Video.DoesNotExist, ValidationError, ValueError):
        raise NotFound("Video not found.")


def ensure_can_upload(org):
    org_is_writable(org)
    if org.status == Organization.STATUS_PENDING:
        raise PermissionDenied("Your trial is awaiting approval. You'll be able to upload as soon as it's approved.")
    if org.status == Organization.STATUS_TRIAL:
        used = Video.objects.filter(library__organization=org).aggregate(s=Sum("storage_bytes"))["s"] or 0
        if used >= settings.TRIAL_STORAGE_GB * GB:
            raise PermissionDenied("Your trial storage is full. Choose a plan to keep uploading.")
    in_flight = Video.objects.filter(
        library__organization=org,
        status=Video.STATUS_UPLOADING,
        upload_started_at__gte=timezone.now() - timezone.timedelta(hours=24),
    ).count()
    if in_flight >= settings.MAX_UPLOADS_IN_FLIGHT_PER_ORG:
        raise PermissionDenied(
            f"At most {settings.MAX_UPLOADS_IN_FLIGHT_PER_ORG} uploads can run at once. Wait for one to finish."
        )


class LibraryVideoListCreate(APIView):
    permission_classes = [IsOrgMember]
    throttle_classes = [ApiKeyRateThrottle]

    def get_library(self, request, pk):
        try:
            return request.organization.libraries.get(pk=pk)
        except Library.DoesNotExist:
            raise NotFound("Library not found.")

    def get(self, request, pk, *args, **kwargs):
        library = self.get_library(request, pk)
        videos = videos_for(request.organization).filter(library=library)
        status_filter = request.query_params.get("status")
        if status_filter:
            videos = videos.filter(status__in=status_filter.split(","))
        q = request.query_params.get("q", "").strip()
        if q:
            videos = videos.filter(title__icontains=q)
        videos = videos.order_by(ORDERINGS.get(request.query_params.get("sort", "newest"), "-created_at"))

        paginator = StandardResultsSetPagination()
        page = paginator.paginate_queryset(videos, request, view=self)
        return paginator.get_paginated_response(VideoSerializer(page, many=True).data)

    def post(self, request, pk, *args, **kwargs):
        library = self.get_library(request, pk)
        ensure_can_upload(request.organization)
        serializer = VideoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        filename = serializer.validated_data.pop("filename", "")
        video = Video.objects.create(
            library=library,
            title=serializer.validated_data["title"],
            privacy=serializer.validated_data.get("privacy", library.default_privacy),
            original_filename=filename,
            created_by=request.user if getattr(request.user, "pk", None) else None,
        )
        return Response(
            {
                "success": True,
                "video": VideoSerializer(video).data,
                "upload": {
                    "protocol": "tus",
                    "endpoint": settings.TUS_PUBLIC_ENDPOINT,
                    "metadata": {"video_id": str(video.id)},
                    "max_bytes": settings.MAX_UPLOAD_BYTES,
                    "note": "Send the same Authorization header to the tus endpoint.",
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LibraryVideoBulkDelete(APIView):
    permission_classes = [IsOrgManager]

    def post(self, request, pk, *args, **kwargs):
        serializer = BulkDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        videos = videos_for(request.organization).filter(library_id=pk, id__in=serializer.validated_data["ids"])
        count = 0
        for video in videos:
            delete_video_everywhere(video)
            count += 1
        audit(request, "video.bulk_deleted", f"{count} videos", library=pk)
        return Response({"success": True, "deleted": count})


class VideoDetail(APIView):
    throttle_classes = [ApiKeyRateThrottle]

    def get_permissions(self):
        if self.request.method == "DELETE":
            return [IsOrgManager()]
        return [IsOrgMember()]

    def get(self, request, pk, *args, **kwargs):
        return Response({"success": True, "video": VideoSerializer(get_video(request, pk)).data})

    def patch(self, request, pk, *args, **kwargs):
        video = get_video(request, pk)
        serializer = VideoSerializer(video, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"success": True, "video": serializer.data})

    def delete(self, request, pk, *args, **kwargs):
        video = get_video(request, pk)
        title = video.title
        delete_video_everywhere(video)
        audit(request, "video.deleted", title, video=str(pk))
        return Response({"success": True})


class VideoThumbnail(APIView):
    permission_classes = [IsOrgMember]
    parser_classes = [MultiPartParser]
    ALLOWED = {"image/jpeg", "image/png", "image/webp"}

    def post(self, request, pk, *args, **kwargs):
        video = get_video(request, pk)
        if video.status != Video.STATUS_READY:
            raise ValidationError("You can replace the thumbnail once the video is ready.")
        image = request.FILES.get("file")
        if image is None:
            raise ValidationError("Attach an image as 'file'.")
        if image.content_type not in self.ALLOWED or image.size > 2 * 1024 * 1024:
            raise ValidationError("Use a JPEG, PNG or WebP image under 2 MB.")
        key = f"{video.r2_prefix}thumbnail.jpg"
        try:
            edge.r2_put(key, image.read(), image.content_type, cache_control="public, max-age=300")
        except edge.EdgeError:
            logger.exception("Thumbnail upload failed")
            raise ValidationError("Couldn't save the thumbnail. Try again.")
        video.thumbnail_key = key
        video.thumbnail_version += 1
        video.save(update_fields=["thumbnail_key", "thumbnail_version", "updated_at"])
        return Response({"success": True, "video": VideoSerializer(video).data})


class VideoReencode(APIView):
    permission_classes = [IsOrgMember]

    def post(self, request, pk, *args, **kwargs):
        video = get_video(request, pk)
        if video.status != Video.STATUS_FAILED and not request.user.is_staff:
            raise ValidationError("Only failed videos can be re-encoded.")
        if not video.source_path or not os.path.isfile(video.source_path):
            raise ValidationError("The original file is gone. Upload the video again.")
        with transaction.atomic():
            queue_encode(video)
        return Response({"success": True, "video": VideoSerializer(video).data})


class VideoSignedUrl(APIView):
    """Token URL generator for testing private playback from the dashboard."""

    permission_classes = [IsOrgMemberDashboard]

    def post(self, request, pk, *args, **kwargs):
        video = get_video(request, pk)
        serializer = SignedUrlSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({"success": True, **signed_urls(video, serializer.validated_data["expires_in"])})


# ---------- Internal (localhost only, shared secret) ----------


def hook_response(reject=False, status_code=200, message="", change_id=None):
    body = {}
    if reject:
        body["RejectUpload"] = True
        body["HTTPResponse"] = {
            "StatusCode": status_code,
            "Body": f'{{"success": false, "message": "{message}"}}',
            "Header": {"Content-Type": "application/json"},
        }
    if change_id:
        body["ChangeFileInfo"] = {"ID": change_id}
    return Response(body)


def authorize_upload(auth_header, video):
    """Can the holder of this Authorization header upload into this video's organization?"""
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    from organizations.authentication import authenticate_api_key

    org_id = video.library.organization_id
    token = auth_header.split(" ", 1)[1] if auth_header.startswith("Bearer ") else ""
    if not token:
        return False
    if token.startswith(ApiKey.PREFIX):
        try:
            _user, key = authenticate_api_key(token)
        except Exception:
            return False
        return key.organization_id == org_id
    try:
        jwt_auth = JWTAuthentication()
        user = jwt_auth.get_user(jwt_auth.get_validated_token(token))
    except (InvalidToken, TokenError, Exception):
        return False
    return Membership.objects.filter(user=user, organization_id=org_id).exists()


class TusdHooks(APIView):
    """tusd HTTP hooks: pre-create authorizes, post-finish queues the encode."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        if not is_internal_request(request, settings):
            return Response(status=status.HTTP_403_FORBIDDEN)
        hook_type = request.data.get("Type")
        event = request.data.get("Event", {})
        upload = event.get("Upload", {})
        if hook_type == "pre-create":
            return self.pre_create(upload, event.get("HTTPRequest", {}))
        if hook_type == "post-finish":
            return self.post_finish(upload)
        return Response({})

    def pre_create(self, upload, http_request):
        meta = upload.get("MetaData") or {}
        video_id = meta.get("video_id")
        video = Video.objects.select_related("library__organization").filter(pk=video_id).first() if _is_uuid(video_id) else None
        if video is None:
            return hook_response(True, 404, "Unknown video_id. Create the video first.")
        header = (http_request.get("Header") or {}).get("Authorization") or [""]
        if not authorize_upload(header[0], video):
            return hook_response(True, 403, "Not allowed to upload to this video.")
        if video.status != Video.STATUS_UPLOADING:
            return hook_response(True, 409, "This video already has a file.")
        org = video.library.organization
        if not org.can_upload:
            return hook_response(True, 403, "Uploads are disabled for this organization.")

        size = upload.get("Size") or 0
        if upload.get("SizeIsDeferred") or size <= 0:
            return hook_response(True, 400, "Upload length is required.")
        if size > settings.MAX_UPLOAD_BYTES:
            return hook_response(True, 413, "Files can be at most 10 GB.")
        filename = meta.get("filename") or video.original_filename or ""
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
            return hook_response(True, 415, "Upload an MP4, MOV, MKV or WebM file.")
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        if shutil.disk_usage(settings.UPLOAD_DIR).free - size < settings.MIN_FREE_DISK_BYTES:
            logger.error("Refusing upload: low disk space")
            return hook_response(True, 507, "The server is busy. Try again in a little while.")

        video.upload_started_at = timezone.now()
        video.source_bytes = size
        if filename:
            video.original_filename = filename[:255]
        video.save(update_fields=["upload_started_at", "source_bytes", "original_filename", "updated_at"])
        return hook_response()

    def post_finish(self, upload):
        meta = upload.get("MetaData") or {}
        video = Video.objects.filter(pk=meta.get("video_id")).first() if _is_uuid(meta.get("video_id")) else None
        if video is None or video.status != Video.STATUS_UPLOADING:
            return Response({})
        storage = upload.get("Storage") or {}
        video.source_path = storage.get("Path", "")
        video.source_bytes = upload.get("Size") or video.source_bytes
        with transaction.atomic():
            video.save(update_fields=["source_path", "source_bytes", "updated_at"])
            queue_encode(video)
        return Response({})


def _is_uuid(value):
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


class EncoderVideoSync(APIView):
    """encoderd calls this after it changes a video so Django pushes KV config and cleans up."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, pk, *args, **kwargs):
        if not is_internal_request(request, settings):
            return Response(status=status.HTTP_403_FORBIDDEN)
        video = Video.objects.select_related("library").filter(pk=pk).first()
        if video is None:
            return Response({"success": False}, status=status.HTTP_404_NOT_FOUND)
        if video.status == Video.STATUS_READY:
            if video.ready_at is None:
                video.ready_at = timezone.now()
                video.save(update_fields=["ready_at"])
            remove_source(video)
        edge.sync_video(video)
        return Response({"success": True})
