import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
# Dev defaults from .env.dev; local .env overrides when present
load_dotenv(ROOT_DIR / ".env.dev")
load_dotenv(ROOT_DIR / ".env", override=True)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() in ("1", "true", "yes")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PAYMENT_LINK = os.environ.get("RAZORPAY_PAYMENT_LINK", "")

# OTP SMS via 2Factor.in — set TWOFACTOR_API_KEY in .env
TWOFACTOR_API_KEY = (os.environ.get("TWOFACTOR_API_KEY") or "").strip()
TWOFACTOR_OTP_TEMPLATE = (os.environ.get("TWOFACTOR_OTP_TEMPLATE") or "").strip()
TWOFACTOR_COUNTRY_CODE = (os.environ.get("TWOFACTOR_COUNTRY_CODE") or "91").strip() or "91"

# OTP email via Gmail SMTP (Google App Password) — fallback if SMS is not configured
# SMTP_USER=you@gmail.com
# SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # 16-char App Password
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or "587")
SMTP_USER = os.environ.get("SMTP_USER", "") or os.environ.get("SMTP_EMAIL", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "") or os.environ.get("SMTP_APP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "") or (f"ZenTaap <{SMTP_USER}>" if SMTP_USER else "")
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

MGR_COOKIE = "mgr_token"
ADM_COOKIE = "adm_token"
MAX_DEVICES = 4
DEFAULT_PIN = "123456"

# Platform admin panel (/admin). Leave blank to disable login.
ADMIN_USERNAME = (os.environ.get("ADMIN_USERNAME") or "").strip()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

# Pricing
BASE_FEE = 0
PER_TABLE = 80.0
GST_RATE = 0.18
MIN_TABLES = 10
MAX_TABLES = 60
TRIAL_DAYS = 4

# Auth lockout
MAX_PIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
# PIN length: new PINs 6–10; legacy logins still accept 4–10.
PIN_MIN_NEW = 6
PIN_MAX = 10
PIN_MIN_LEGACY = 4
