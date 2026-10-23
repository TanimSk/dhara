from django.urls import path

from organizations.views import (
    ApiKeyListCreate,
    ApiKeyRevoke,
    AuditLogList,
    CurrentOrganization,
    InvitationDelete,
    InvitationListCreate,
    InvitationLookup,
    MemberDetail,
    MemberList,
    OrganizationListCreate,
)

urlpatterns = [
    path("organizations", OrganizationListCreate.as_view()),
    path("organizations/current", CurrentOrganization.as_view()),
    path("members", MemberList.as_view()),
    path("members/<int:pk>", MemberDetail.as_view()),
    path("invitations", InvitationListCreate.as_view()),
    path("invitations/<int:pk>", InvitationDelete.as_view()),
    path("invitations/token/<str:token>", InvitationLookup.as_view()),
    path("api-keys", ApiKeyListCreate.as_view()),
    path("api-keys/<int:pk>", ApiKeyRevoke.as_view()),
    path("audit-log", AuditLogList.as_view()),
]
