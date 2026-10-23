from rest_framework import serializers

# models
from billing.models import Invoice, Plan, PlatformCost


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            "id",
            "name",
            "price_paisa",
            "storage_gb",
            "bandwidth_gb",
            "max_members",
            "overage_storage_paisa_per_gb",
            "overage_bandwidth_paisa_per_tb",
            "active",
            "sort_order",
        ]


class InvoiceSerializer(serializers.ModelSerializer):
    number = serializers.CharField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "number",
            "organization",
            "organization_name",
            "period",
            "plan_snapshot",
            "storage_gb_avg",
            "bandwidth_tb",
            "base_paisa",
            "overage_paisa",
            "adjustment_paisa",
            "total_paisa",
            "status",
            "paid_at",
            "note",
            "created_at",
        ]
        read_only_fields = [f for f in fields if f not in ("adjustment_paisa", "status", "note")]


class PlatformCostSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformCost
        fields = ["id", "month", "item", "description", "usd", "bdt_paisa", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_month(self, value):
        return value.replace(day=1)
