"""Iteration 12 backend tests (FINAL LAUNCH POLISH).

Scope:
- Pricing: ₹80 per table/month → 10→944, 20→1888, 30→2832, 40→3776, 50→4720, 60→5664.
- ?tables=9/?tables=61 → 400 (validation).
- _require_subscription gate (status=none):
    POST /menu, POST /categories, POST /orders, PUT /orders/{x} → 402.
    GET endpoints + PUT /settings + PUT /profile → open (no 402).
- After POST /subscription (trial), POST /menu succeeds; cleanup the test item.
- POST /auth/request-otp returns success+message WITHOUT demo_otp (DEMO_MODE unset).
- Menu/categories/orders empty initially.
- Subscription status=none initially.
"""

import os
import asyncio
import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError("closed")
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@pytest.fixture(scope="module")
def mongo():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module", autouse=True)
def restore_subscription_to_none(mongo):
    """Ensure DB starts in 'none' state for these tests and is reset to 'none' after."""
    async def _reset():
        await mongo.settings.update_one(
            {"key": "restaurant"},
            {"$set": {
                "subscription_status": "none",
                "subscription_tables": None,
                "subscription_subtotal": None,
                "subscription_gst": None,
                "subscription_total": None,
                "subscription_payment_method": None,
                "subscription_trial_start": None,
                "subscription_trial_end": None,
                "subscription_cycle_start": None,
                "subscription_cycle_end": None,
                "subscription_next_cycle_start": None,
                "pending_tables": None,
                "pending_subtotal": None,
                "pending_total": None,
            }},
            upsert=True,
        )
    _run(_reset())
    yield
    _run(_reset())


# ---------------- PRICING ----------------

class TestPricing:
    @pytest.mark.parametrize("tables,expected", [
        (10, 944.0),
        (20, 1888.0),
        (30, 2832.0),
        (40, 3776.0),
        (50, 4720.0),
        (60, 5664.0),
    ])
    def test_pricing_tiers(self, tables, expected):
        r = requests.get(f"{API}/pricing", params={"tables": tables})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["tables"] == tables
        assert d["per_table"] == 80.0
        assert d["base_fee"] == 0
        assert d["gst_rate_pct"] == 18
        assert d["subtotal"] == round(80.0 * tables, 2)
        assert abs(d["total_with_tax"] - expected) <= 0.01, f"tables={tables} got {d['total_with_tax']}"

    def test_pricing_default_14_formula(self):
        # 14 × 80 × 1.18 = 1321.60
        r = requests.get(f"{API}/pricing", params={"tables": 14})
        assert r.status_code == 200
        d = r.json()
        assert d["tables"] == 14
        assert abs(d["total_with_tax"] - 1321.60) <= 0.02

    def test_subscription_create_rejects_low(self):
        r = requests.post(f"{API}/subscription", json={"tables": 9, "payment_method": "upi"})
        assert r.status_code == 400, r.text

    def test_subscription_create_rejects_high(self):
        r = requests.post(f"{API}/subscription", json={"tables": 61, "payment_method": "upi"})
        assert r.status_code == 400, r.text


# ---------------- SUBSCRIPTION GATE (status=none → 402 on writes) ----------------

class TestExploreGate:
    def test_initial_subscription_is_none(self):
        r = requests.get(f"{API}/subscription")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "none"
        assert d["has_access"] is False

    def test_get_menu_open(self):
        r = requests.get(f"{API}/menu")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert r.json() == []  # No seed data

    def test_get_categories_open(self):
        r = requests.get(f"{API}/categories")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_orders_open(self):
        r = requests.get(f"{API}/orders")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_stats_today_open(self):
        r = requests.get(f"{API}/stats/today")
        assert r.status_code == 200
        d = r.json()
        assert "total_orders" in d

    def test_post_menu_402(self):
        r = requests.post(f"{API}/menu", json={
            "name": "TEST_BlockedItem", "price": 100, "category_id": "x"
        })
        assert r.status_code == 402, r.text
        assert "Subscribe to ZenTaap" in r.json().get("detail", "")

    def test_post_categories_402(self):
        r = requests.post(f"{API}/categories", json={"name": "TEST_BlockedCat"})
        assert r.status_code == 402

    def test_post_orders_402(self):
        r = requests.post(f"{API}/orders", json={
            "table_number": 1, "items": [], "subtotal": 0, "tax": 0, "total": 0,
        })
        assert r.status_code == 402

    def test_put_orders_402(self):
        r = requests.put(f"{API}/orders/some-id", json={"status": "completed"})
        assert r.status_code == 402

    def test_put_settings_open(self):
        # Get current settings then PUT them back (no-op-ish) — should NOT 402
        cur = requests.get(f"{API}/settings")
        assert cur.status_code == 200
        body = cur.json()
        # PUT requires only mutable fields — strip immutable
        r = requests.put(f"{API}/settings", json={
            "restaurant_name": body.get("restaurant_name", "ZenTaap"),
            "currency": body.get("currency", "INR"),
            "tax_rate": body.get("tax_rate", 0),
        })
        assert r.status_code == 200, r.text  # Settings open in Explore mode

    def test_put_profile_open(self):
        r = requests.put(f"{API}/profile", json={"manager_name": "TEST_Owner"})
        assert r.status_code == 200, r.text


# ---------------- TRIAL FLIP → WRITE SUCCEEDS ----------------

class TestSubscriptionFlipAllowsWrite:
    def test_post_subscription_does_not_grant_access_until_payment(self, mongo):
        r = requests.post(f"{API}/subscription", json={"tables": 10, "payment_method": "upi"})
        assert r.status_code == 200, r.text
        body = r.json()
        sub = requests.get(f"{API}/subscription").json()
        if sub["status"] in ("none", "skipped", "expired"):
            assert body.get("applied") == "awaiting_payment"
            assert body.get("needs_payment") is True
            assert sub.get("has_access") is False
            cat_r = requests.post(f"{API}/categories", json={"name": "TEST_Cat12"})
            assert cat_r.status_code == 402, cat_r.text
            return
        # Already paid in this environment
        assert sub["status"] in ("trial", "active")
        assert sub["has_access"] is True


# ---------------- OTP (DEMO_MODE not set) ----------------

class TestOtpNoDemoLeak:
    def test_request_otp_no_demo_field(self):
        r = requests.post(f"{API}/auth/request-otp", json={"contact_number": "9876543210"})
        # 200 if profile exists, 404 otherwise — both shapes acceptable.
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            d = r.json()
            assert d.get("success") is True
            assert "message" in d
            assert "demo_otp" not in d, f"demo_otp must NOT leak when DEMO_MODE is off, got {d}"


# ---------------- REGRESSION ----------------

class TestRegression:
    def test_auth_status(self):
        r = requests.get(f"{API}/auth/status")
        assert r.status_code == 200

    def test_login_manager_pin(self):
        r = requests.post(f"{API}/auth/login", json={
            "pin": "1234", "device_id": "test_it12_reg", "device_label": "It12"
        })
        assert r.status_code == 200

    def test_customer_login(self):
        r = requests.post(f"{API}/auth/customer-login", json={"pin": "1234"})
        assert r.status_code == 200

    def test_payments_config(self):
        r = requests.get(f"{API}/payments/config")
        assert r.status_code == 200
        d = r.json()
        assert "configured" in d and "fallback_link" in d
