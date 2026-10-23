from django.db import models

# Money is stored as integer paisa (1 taka = 100 paisa).


class Plan(models.Model):
    name = models.CharField(max_length=60)
    price_paisa = models.BigIntegerField()
    storage_gb = models.IntegerField()
    bandwidth_gb = models.IntegerField()
    max_members = models.IntegerField()
    overage_storage_paisa_per_gb = models.BigIntegerField(default=600)
    overage_bandwidth_paisa_per_tb = models.BigIntegerField(default=25_000)
    active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "price_paisa"]

    def __str__(self):
        return self.name

    def snapshot(self):
        return {
            "id": self.id,
            "name": self.name,
            "price_paisa": self.price_paisa,
            "storage_gb": self.storage_gb,
            "bandwidth_gb": self.bandwidth_gb,
            "overage_storage_paisa_per_gb": self.overage_storage_paisa_per_gb,
            "overage_bandwidth_paisa_per_tb": self.overage_bandwidth_paisa_per_tb,
        }


class Invoice(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_SENT = "sent"
    STATUS_PAID = "paid"
    STATUS_CHOICES = [(STATUS_DRAFT, "Draft"), (STATUS_SENT, "Sent"), (STATUS_PAID, "Paid")]

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="invoices")
    period = models.DateField(help_text="First day of the billed month")
    plan_snapshot = models.JSONField(default=dict)
    storage_gb_avg = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    bandwidth_tb = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    base_paisa = models.BigIntegerField(default=0)
    overage_paisa = models.BigIntegerField(default=0)
    adjustment_paisa = models.BigIntegerField(default=0)
    total_paisa = models.BigIntegerField(default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    paid_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True, help_text="e.g. bKash TrxID")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period", "organization__name"]
        constraints = [models.UniqueConstraint(fields=["organization", "period"], name="one_invoice_per_month")]

    @property
    def number(self):
        return f"DH-{self.period:%Y%m}-{self.id:04d}"

    def recompute_total(self):
        self.total_paisa = self.base_paisa + self.overage_paisa + self.adjustment_paisa


class PlatformCost(models.Model):
    ITEM_CHOICES = [
        ("droplet", "Droplet"),
        ("workers", "Cloudflare Workers"),
        ("r2_storage", "R2 storage"),
        ("r2_ops", "R2 operations"),
        ("other", "Other"),
    ]

    month = models.DateField(help_text="First day of the month")
    item = models.CharField(max_length=20, choices=ITEM_CHOICES)
    description = models.CharField(max_length=200, blank=True)
    usd = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bdt_paisa = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-month", "item"]
