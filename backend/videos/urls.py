from django.urls import path

from videos.views import (
    EncoderVideoSync,
    LibraryVideoBulkDelete,
    LibraryVideoListCreate,
    TusdHooks,
    VideoDetail,
    VideoReencode,
    VideoSignedUrl,
    VideoThumbnail,
)

urlpatterns = [
    path("libraries/<int:pk>/videos", LibraryVideoListCreate.as_view()),
    path("libraries/<int:pk>/videos/bulk-delete", LibraryVideoBulkDelete.as_view()),
    path("videos/<uuid:pk>", VideoDetail.as_view()),
    path("videos/<uuid:pk>/thumbnail", VideoThumbnail.as_view()),
    path("videos/<uuid:pk>/reencode", VideoReencode.as_view()),
    path("videos/<uuid:pk>/signed-url", VideoSignedUrl.as_view()),
    # internal
    path("internal/tusd-hooks", TusdHooks.as_view()),
    path("internal/encoder/videos/<uuid:pk>/sync", EncoderVideoSync.as_view()),
]
