from django.urls import path

from billing.views import BillingCurrent, InvoiceDetail, InvoiceList, PublicPlans

urlpatterns = [
    path("billing/current", BillingCurrent.as_view()),
    path("invoices", InvoiceList.as_view()),
    path("invoices/<int:pk>", InvoiceDetail.as_view()),
    path("plans", PublicPlans.as_view()),
]
