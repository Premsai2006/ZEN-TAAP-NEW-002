import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() in ("1", "true", "yes")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_PAYMENT_LINK = os.environ.get("RAZORPAY_PAYMENT_LINK", "")

MGR_COOKIE = "mgr_token"
MAX_DEVICES = 4
DEFAULT_PIN = "123456"

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
# PIN length: 4–10 digits (frontend encourages 6+ for new accounts).
PIN_MIN_NEW = 4
PIN_MAX = 10
PIN_MIN_LEGACY = 4
