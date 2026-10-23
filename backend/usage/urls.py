from django.urls import path

from usage.views import UsageIngest, UsageSeries, UsageSummary, VideoUsage

urlpatterns = [
    path("usage", UsageSeries.as_view()),
    path("usage/summary", UsageSummary.as_view()),
    path("videos/<uuid:pk>/usage", VideoUsage.as_view()),
    path("internal/usage-ingest", UsageIngest.as_view()),
]
