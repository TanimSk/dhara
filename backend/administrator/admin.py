from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from administrator.models import User


@admin.register(User)
class DharaUserAdmin(UserAdmin):
    list_display = ("email", "name", "is_staff", "date_joined", "last_login")
    search_fields = ("email", "name")
    ordering = ("-date_joined",)
    fieldsets = UserAdmin.fieldsets + (("dhara", {"fields": ("name", "avatar_url", "google_sub")}),)
