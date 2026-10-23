"""dhara URL configuration. Every API lives under /api/v1/."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView

urlpatterns = [
    path("admin/", admin.site.urls),
    # ---------- API ------------
    path("api/v1/", include("administrator.urls")),
    path("api/v1/", include("organizations.urls")),
    path("api/v1/", include("libraries.urls")),
    path("api/v1/", include("videos.urls")),
    path("api/v1/", include("usage.urls")),
    path("api/v1/", include("billing.urls")),
    # ---------- Docs ------------
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularRedocView.as_view(url_name="schema"), name="docs"),
]
