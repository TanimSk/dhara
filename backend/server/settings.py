"""
Django settings for dhara.

Every secret and environment-specific value comes from environment variables
(loaded from backend/.env in development). See .env.example for the full list.
"""

from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).lower() in ("1", "true", "yes", "on")


SECRET_KEY = os.getenv("SECRET_KEY", "")
DEBUG = env_bool("DEBUG", False)
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("SECRET_KEY must be set when DEBUG is off")
    SECRET_KEY = "dev-insecure-secret-key-change-me"

ALLOWED_HOSTS = [h for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]
CSRF_TRUSTED_ORIGINS = [o for o in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if o]

# CORS Settings
# The dashboard is served from the same origin as the API (Vite proxy in dev,
# nginx in production), so cross-origin access is only opened when configured.
CORS_ALLOWED_ORIGINS = [o for o in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if o]
CORS_ALLOW_CREDENTIALS = True

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # DRF
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "corsheaders",
    # Apps
    "administrator.apps.AdministratorConfig",
    "organizations.apps.OrganizationsConfig",
    "libraries.apps.LibrariesConfig",
    "videos.apps.VideosConfig",
    "usage.apps.UsageConfig",
    "billing.apps.BillingConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "server.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [
            os.path.join(BASE_DIR, "templates"),
        ],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "server.wsgi.application"


# Database

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME", "dhara"),
        "USER": os.getenv("DB_USER", ""),
        "PASSWORD": os.getenv("DB_PASSWORD", ""),
        "HOST": os.getenv("DB_HOST", ""),
        "PORT": os.getenv("DB_PORT", ""),
    },
}


# Password validation (only used by Django admin; customers sign in with Google)

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTH_USER_MODEL = "administrator.User"

########################## DRF / JWT Config ##########################

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "administrator.serializers.custom_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "organizations.authentication.ApiKeyAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {
        "api_key": "120/min",
        "auth": "30/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Refresh token lives in an httpOnly cookie scoped to the auth endpoints.
REFRESH_COOKIE_NAME = "dhara_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", not DEBUG)

SPECTACULAR_SETTINGS = {
    "TITLE": "dhara API",
    "DESCRIPTION": "Video hosting API. Authenticate with `Authorization: Bearer <api key>`.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

############################ Google Sign-In ############################

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
# Local-only shortcut to sign in without Google. Refused unless DEBUG is on too.
DEV_LOGIN_ENABLED = DEBUG and env_bool("DEV_LOGIN_ENABLED", False)

############################ Email ############################

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "dhara <noreply@localhost>")

############################ dhara platform ############################

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
# Public base URL of the edge Worker (vid.<domain> in production).
EDGE_PUBLIC_URL = os.getenv("EDGE_PUBLIC_URL", "http://localhost:8787").rstrip("/")
# Where Django reaches the Worker's internal API (KV config, R2 writes/purges).
EDGE_INTERNAL_URL = os.getenv("EDGE_INTERNAL_URL", EDGE_PUBLIC_URL).rstrip("/")
EDGE_INTERNAL_SECRET = os.getenv("EDGE_INTERNAL_SECRET", "")
# Shared secret for localhost-only callbacks (tusd hooks, encoder, dev usage ingest).
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")

# tus endpoint the browser / API clients upload to.
TUS_PUBLIC_ENDPOINT = os.getenv("TUS_PUBLIC_ENDPOINT", f"{FRONTEND_URL}/upload/")
UPLOAD_DIR = str((BASE_DIR / os.getenv("UPLOAD_DIR", "../var/uploads")).resolve())
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024**3)))
MIN_FREE_DISK_BYTES = int(os.getenv("MIN_FREE_DISK_BYTES", str(20 * 1024**3)))
MAX_UPLOADS_IN_FLIGHT_PER_ORG = 3
ALLOWED_UPLOAD_EXTENSIONS = ("mp4", "mov", "mkv", "webm")

# New organizations start as "pending" until approved from the super-admin panel.
AUTO_APPROVE_TRIALS = env_bool("AUTO_APPROVE_TRIALS", False)
TRIAL_DAYS = 14
TRIAL_STORAGE_GB = 20
TRIAL_BANDWIDTH_GB = 200
TRIAL_MAX_MEMBERS = 3

# Cost model (see docs/PLAN.md, "Usage metering and cost analytics")
USD_TO_BDT = float(os.getenv("USD_TO_BDT", "123"))
COST_R2_STORAGE_USD_PER_GB_MONTH = 0.015
COST_PER_MILLION_REQUESTS_USD = 0.30 + 0.25  # Worker request + Analytics Engine write
MONTHLY_PROFIT_TARGET_PAISA = 2_000 * 100

# Cloudflare Analytics Engine (production usage pull)
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "")
CF_API_TOKEN = os.getenv("CF_API_TOKEN", "")
CF_USAGE_DATASET = os.getenv("CF_USAGE_DATASET", "video_usage")


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)

STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "loggers": {
        "dhara": {"handlers": ["console"], "level": os.getenv("LOG_LEVEL", "INFO")},
    },
}
