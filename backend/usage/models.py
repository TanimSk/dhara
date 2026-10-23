from django.db import models


class UsageDaily(models.Model):
    """One row per video per day (UTC). Bandwidth from the edge, storage from nightly snapshots."""

    organization = models.ForeignKey("organizations.Organization", on_delete=models.CASCADE, related_name="usage")
    library = models.ForeignKey("libraries.Library", null=True, on_delete=models.SET_NULL, related_name="+")
    video = models.ForeignKey("videos.Video", null=True, on_delete=models.SET_NULL, related_name="usage")
    date = models.DateField()
    bytes_delivered = models.BigIntegerField(default=0)
    requests = models.BigIntegerField(default=0)
    cache_hits = models.BigIntegerField(default=0)
    storage_bytes = models.BigIntegerField(default=0)

    class Meta:
        db_table = "usage_daily"
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "library", "video", "date"],
                name="unique_usage_row",
                nulls_distinct=False,
            )
        ]
        indexes = [models.Index(fields=["organization", "date"])]
