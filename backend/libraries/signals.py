from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from libraries.models import Library
from organizations.models import Organization
from utils import edge


@receiver(post_save, sender=Library)
def push_library_config(sender, instance, **kwargs):
    transaction.on_commit(lambda: edge.sync_library(instance))


@receiver(post_save, sender=Organization)
def push_org_status(sender, instance, **kwargs):
    # Organization status (e.g. suspended) is part of every library's config.
    def push():
        for library in instance.libraries.select_related("organization"):
            edge.sync_library(library)

    transaction.on_commit(push)
