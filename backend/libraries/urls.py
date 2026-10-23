from django.urls import path

from libraries.views import LibraryDetail, LibraryListCreate, LibrarySecurityKey

urlpatterns = [
    path("libraries", LibraryListCreate.as_view()),
    path("libraries/<int:pk>", LibraryDetail.as_view()),
    path("libraries/<int:pk>/security-key", LibrarySecurityKey.as_view()),
    path("libraries/<int:pk>/rotate-key", LibrarySecurityKey.as_view(http_method_names=["post"])),
]
