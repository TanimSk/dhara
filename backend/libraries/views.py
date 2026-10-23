from django.db import transaction
from django.db.models import Count, Sum
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from libraries.models import Library

# serializers
from libraries.serializers import LibrarySecretSerializer, LibrarySerializer

from organizations.audit import audit
from organizations.permissions import IsOrgManager, IsOrgManagerDashboard, IsOrgMember
from organizations.throttling import ApiKeyRateThrottle
from videos.services import delete_video_everywhere


def libraries_for(org):
    return org.libraries.annotate(
        video_count=Count("videos", distinct=True),
        storage_bytes=Sum("videos__storage_bytes", default=0),
    ).select_related("organization")


def get_library(request, pk):
    try:
        return libraries_for(request.organization).get(pk=pk)
    except Library.DoesNotExist:
        raise NotFound("Library not found.")


class LibraryListCreate(APIView):
    throttle_classes = [ApiKeyRateThrottle]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsOrgMember()]
        return [IsOrgManager()]

    def get(self, request, *args, **kwargs):
        libraries = libraries_for(request.organization)
        return Response({"success": True, "results": LibrarySerializer(libraries, many=True).data})

    def post(self, request, *args, **kwargs):
        serializer = LibrarySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        library = serializer.save(organization=request.organization)
        audit(request, "library.created", library.name)
        return Response({"success": True, "library": LibrarySerializer(get_library(request, library.pk)).data}, status=status.HTTP_201_CREATED)


class LibraryDetail(APIView):
    throttle_classes = [ApiKeyRateThrottle]

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsOrgMember()]
        return [IsOrgManager()]

    def get(self, request, pk, *args, **kwargs):
        return Response({"success": True, "library": LibrarySerializer(get_library(request, pk)).data})

    def patch(self, request, pk, *args, **kwargs):
        library = get_library(request, pk)
        serializer = LibrarySerializer(library, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(request, "library.updated", library.name, fields=list(request.data.keys()))
        return Response({"success": True, "library": LibrarySerializer(get_library(request, pk)).data})

    def delete(self, request, pk, *args, **kwargs):
        library = get_library(request, pk)
        for video in library.videos.all():
            delete_video_everywhere(video)
        name = library.name
        with transaction.atomic():
            library.delete()
            audit(request, "library.deleted", name)
        return Response({"success": True})


class LibrarySecurityKey(APIView):
    """Show the security key (dashboard only) or rotate it."""

    permission_classes = [IsOrgManagerDashboard]

    def get(self, request, pk, *args, **kwargs):
        return Response({"success": True, **LibrarySecretSerializer(get_library(request, pk)).data})

    def post(self, request, pk, *args, **kwargs):
        library = get_library(request, pk)
        library.rotate_key()
        library.save(update_fields=["security_key"])
        audit(request, "library.key_rotated", library.name)
        return Response({"success": True, **LibrarySecretSerializer(library).data})
