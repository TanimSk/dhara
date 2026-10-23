from django.contrib import admin
from django.apps import apps

# Register every model of this app with a default admin.
for model in apps.get_app_config(__name__.split(".")[0]).get_models():
    admin.site.register(model)
