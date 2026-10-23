from django.urls import path

from administrator.admin_views import (
    AdminCostDetail,
    AdminCosts,
    AdminCustomerDetail,
    AdminCustomers,
    AdminEncoderJobRetry,
    AdminEncoderJobs,
    AdminInvoiceDetail,
    AdminInvoices,
    AdminOverview,
    AdminPlanDetail,
    AdminPlans,
    AdminProfit,
)
from administrator.auth_views import AuthConfig, DevLogin, GoogleLogin, Logout, Me, RefreshAccess

urlpatterns = [
    # ---------- Auth ------------
    path("auth/config", AuthConfig.as_view()),
    path("auth/google", GoogleLogin.as_view()),
    path("auth/dev-login", DevLogin.as_view()),
    path("auth/refresh", RefreshAccess.as_view()),
    path("auth/logout", Logout.as_view()),
    path("auth/me", Me.as_view()),
    # ---------- Super-admin ------------
    path("admin-api/overview", AdminOverview.as_view()),
    path("admin-api/customers", AdminCustomers.as_view()),
    path("admin-api/customers/<int:pk>", AdminCustomerDetail.as_view()),
    path("admin-api/plans", AdminPlans.as_view()),
    path("admin-api/plans/<int:pk>", AdminPlanDetail.as_view()),
    path("admin-api/invoices", AdminInvoices.as_view()),
    path("admin-api/invoices/<int:pk>", AdminInvoiceDetail.as_view()),
    path("admin-api/costs", AdminCosts.as_view()),
    path("admin-api/costs/<int:pk>", AdminCostDetail.as_view()),
    path("admin-api/profit", AdminProfit.as_view()),
    path("admin-api/encoder/jobs", AdminEncoderJobs.as_view()),
    path("admin-api/encoder/jobs/<int:pk>/retry", AdminEncoderJobRetry.as_view()),
]
