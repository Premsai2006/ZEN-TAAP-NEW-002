"""Iteration 9 — ZenTaap rebrand + Razorpay payment integration + autopay tests."""
import os
from datetime import datetime, date
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://restaurant-ops-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ----- /api/payments/config -----
def test_payments_config_no_keys(client):
    r = client.get(f"{API}/payments/config")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "key_id" in data
    assert "configured" in data
    assert "fallback_link" in data
    assert isinstance(data["configured"], bool)
    # Razorpay keys are NOT configured intentionally for this iteration
    assert data["configured"] is False
    assert "razorpay.me/@prem9300" in data["fallback_link"]


# ----- /api/subscription cycle_end + autopay fields -----
def test_subscription_get_returns_new_fields(client):
    # Create or refresh a subscription first
    body = {"tables": 14, "payment_method": "upi"}
    client.post(f"{API}/subscription", json=body)

    r = client.get(f"{API}/subscription")
    assert r.status_code == 200, r.text
    data = r.json()

    # Required new fields
    for f in ("cycle_end", "autopay_enabled", "razorpay_customer_id", "last_payment_id"):
        assert f in data, f"missing field {f}"
    assert isinstance(data["autopay_enabled"], bool)

    # cycle_end should be next_cycle_start - 1 day
    ncs = data.get("next_cycle_start")
    ce = data.get("cycle_end")
    if ncs and ce:
        ncs_d = date.fromisoformat(ncs[:10])
        ce_d = date.fromisoformat(ce[:10])
        assert (ncs_d - ce_d).days == 1, f"cycle_end {ce_d} should be one day before next_cycle_start {ncs_d}"


# ----- /api/payments/create-order (no keys -> fallback) -----
def test_create_order_returns_fallback_when_no_keys(client):
    r = client.post(f"{API}/payments/create-order", json={"tables": 14})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("configured") is False
    assert "razorpay.me/@prem9300" in data.get("fallback_link", "")
    assert data.get("currency") == "INR"
    assert isinstance(data.get("amount"), int) and data["amount"] > 0
    # Amount sanity: tables=14, monthly model ~ several thousand INR -> >100000 paise typically
    assert data["amount"] >= 1000


# ----- /api/payments/verify (no signature, no keys -> success) -----
def test_payments_verify_marks_active_and_enables_autopay(client):
    # Ensure a sub exists
    client.post(f"{API}/subscription", json={"tables": 14, "payment_method": "upi"})

    body = {
        "razorpay_order_id": "order_TEST_iter9",
        "razorpay_payment_id": "pay_TEST_iter9",
        "enable_autopay": True,
    }
    r = client.post(f"{API}/payments/verify", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    assert data.get("autopay_enabled") is True

    # Verify persistence
    sub = client.get(f"{API}/subscription").json()
    assert sub["status"] == "active"
    assert sub["autopay_enabled"] is True
    assert sub["last_payment_id"] == "pay_TEST_iter9"
    assert sub.get("last_payment_at") is not None


# ----- PUT /api/subscription/autopay toggle -----
def test_autopay_toggle_off_and_on(client):
    r = client.put(f"{API}/subscription/autopay", json={"enabled": False})
    assert r.status_code == 200, r.text
    assert r.json()["autopay_enabled"] is False
    sub = client.get(f"{API}/subscription").json()
    assert sub["autopay_enabled"] is False

    r = client.put(f"{API}/subscription/autopay", json={"enabled": True})
    assert r.status_code == 200
    assert r.json()["autopay_enabled"] is True
    assert client.get(f"{API}/subscription").json()["autopay_enabled"] is True


# ----- /api/payments/webhook (no signature, payment.captured) -----
def test_webhook_payment_captured_no_signature(client):
    # Reset autopay to false first to confirm webhook flips it on
    client.put(f"{API}/subscription/autopay", json={"enabled": False})

    payload = {
        "event": "payment.captured",
        "payload": {"payment": {"entity": {"id": "pay_TEST_webhook_iter9"}}},
    }
    r = client.post(f"{API}/payments/webhook", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("received") is True
    assert data.get("event") == "payment.captured"

    sub = client.get(f"{API}/subscription").json()
    assert sub["status"] == "active"
    assert sub["autopay_enabled"] is True
    assert sub["last_payment_id"] == "pay_TEST_webhook_iter9"


# ----- POST /api/orders with table=0 (walk-in) -----
def test_order_with_table_zero_succeeds(client):
    # Pick any menu item
    menu = client.get(f"{API}/menu").json()
    if not menu:
        pytest.skip("No menu items available")
    item = menu[0]
    body = {
        "table": 0,
        "items": [
            {
                "menu_item_id": item["id"],
                "name": item["name"],
                "qty": 1,
                "price": item["price"],
            }
        ],
    }
    r = client.post(f"{API}/orders", json=body)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("table") == 0 or data.get("table_number") == 0
