from django.core.management.base import BaseCommand

from billing.models import Plan

PLANS = [
    # name, price ৳, storage GB, bandwidth TB, members
    ("Starter", 2_500, 100, 5, 3),
    ("Growth", 5_000, 300, 15, 10),
    ("Pro", 9_000, 800, 40, 25),
]


class Command(BaseCommand):
    help = "Create the Starter / Growth / Pro plans from docs/PLAN.md if they don't exist."

    def handle(self, *args, **options):
        for order, (name, price, storage, bandwidth_tb, members) in enumerate(PLANS):
            plan, created = Plan.objects.get_or_create(
                name=name,
                defaults={
                    "price_paisa": price * 100,
                    "storage_gb": storage,
                    "bandwidth_gb": bandwidth_tb * 1024,
                    "max_members": members,
                    "overage_storage_paisa_per_gb": 6 * 100,
                    "overage_bandwidth_paisa_per_tb": 250 * 100,
                    "sort_order": order,
                },
            )
            self.stdout.write(f"{'Created' if created else 'Exists '} {plan.name}")
