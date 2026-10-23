from datetime import date

from django.core.management.base import BaseCommand

from billing.services import generate_invoice, previous_month
from organizations.models import Organization


class Command(BaseCommand):
    help = "Create draft invoices for a month (default: last month). Run on the 1st."

    def add_arguments(self, parser):
        parser.add_argument("--period", help="YYYY-MM (default: previous month)")

    def handle(self, *args, **options):
        period = date.fromisoformat(options["period"] + "-01") if options["period"] else previous_month()
        made = 0
        for org in Organization.objects.select_related("plan"):
            if generate_invoice(org, period):
                made += 1
        self.stdout.write(self.style.SUCCESS(f"{made} invoices for {period:%B %Y}"))
