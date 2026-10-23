from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from utils import edge
from videos.models import Video


@receiver(post_save, sender=Video)
def push_video_config(sender, instance, **kwargs):
    transaction.on_commit(lambda: edge.sync_video(instance))
