from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

# models
from billing.models import Invoice, Plan

# serializers
from billing.serializers import InvoiceSerializer, PlanSerializer
from organizations.serializers import OrganizationSerializer

from billing.services import estimate_for_month
from organizations.permissions import IsOrgOwner
from usage.services import today_utc


class BillingCurrent(APIView):
    permission_classes = [IsOrgOwner]

    def get(self, request, *args, **kwargs):
        org = request.organization
        return Response(
            {
                "success": True,
                "organization": OrganizationSerializer(org).data,
                "estimate": estimate_for_month(org, today_utc()),
                "plans": PlanSerializer(Plan.objects.filter(active=True), many=True).data,
            }
        )


class InvoiceList(APIView):
    permission_classes = [IsOrgOwner]

    def get(self, request, *args, **kwargs):
        invoices = request.organization.invoices.exclude(status=Invoice.STATUS_DRAFT)
        return Response({"success": True, "results": InvoiceSerializer(invoices, many=True).data})


class InvoiceDetail(APIView):
    permission_classes = [IsOrgOwner]

    def get(self, request, pk, *args, **kwargs):
        invoice = request.organization.invoices.exclude(status=Invoice.STATUS_DRAFT).filter(pk=pk).first()
        if invoice is None:
            raise NotFound("Invoice not found.")
        return Response({"success": True, "invoice": InvoiceSerializer(invoice).data})


class PublicPlans(APIView):
    permission_classes = []
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        return Response({"success": True, "results": PlanSerializer(Plan.objects.filter(active=True), many=True).data})
