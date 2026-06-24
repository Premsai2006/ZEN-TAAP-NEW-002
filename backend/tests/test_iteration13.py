"""Iteration 13 — Production hardening tests.
Covers: manager Bearer auth, kitchen PIN flow, subscription gating, payments config,
pricing, DEMO_MODE behavior, customer-open POST /orders.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://restaurant-ops-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MANAGER_PIN = "1234"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mgr_token(http):
    """Log in as manager and return Bearer token. Skip suite if PIN auth broken."""
    r = http.post(f"{API}/auth/login", json={
        "pin": MANAGER_PIN,
        "device_id": f"test_it13_{uuid.uuid4().hex[:8]}",
        "device_label": "pytest-iter13",
    })
    if r.status_code != 200:
        pytest.skip(f"Manager login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(mgr_token):
    return {"Authorization": f"Bearer {mgr_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def reset_subscription(http, mgr_token):
    """Ensure subscription_status='none' BEFORE the suite, restore AFTER."""
    # Set status to none for gating tests by direct mongo not available; we rely on
    # current preview state. We just record/restore via PUT /settings is not possible
    # since subscription_status is not in SettingsUpdate. So we test as-is, but
    # toggle subscription via POST /subscription when needed.
    yield


# ---------- 1. Manager Bearer auth on /profile ----------
class TestManagerAuth:
    def test_profile_put_no_token_returns_401(self, http):
        r = http.put(f"{API}/profile", json={"manager_name": "X"})
        assert r.status_code == 401
        assert "Missing manager token" in r.json().get("detail", "")

    def test_profile_put_invalid_token_returns_401(self, http):
        r = http.put(f"{API}/profile",
                     headers={"Authorization": "Bearer mgr-INVALID-xyz", "Content-Type": "application/json"},
                     json={"manager_name": "X"})
        assert r.status_code == 401
        assert "Session expired" in r.json().get("detail", "")

    def test_profile_put_valid_token_succeeds(self, http, auth_headers):
        # Read current
        cur = http.get(f"{API}/profile").json()
        original_name = cur.get("manager_name", "Manager")
        r = http.put(f"{API}/profile", headers=auth_headers,
                     json={"manager_name": original_name})
        assert r.status_code == 200, r.text
        assert r.json()["manager_name"] == original_name

    def test_settings_put_requires_token(self, http, auth_headers):
        # Without token — currently /settings PUT has no _require_manager in code I read,
        # but spec says it should. Verify spec behavior.
        r_no = http.put(f"{API}/settings", json={"restaurant_name": "X"})
        # If endpoint protected -> 401; if open -> 200. Spec says protected.
        # Test both and report.
        if r_no.status_code == 401:
            # Then with token must succeed
            cur = http.get(f"{API}/settings").json()
            r_ok = http.put(f"{API}/settings", headers=auth_headers,
                            json={"restaurant_name": cur.get("restaurant_name", "ZenTaap")})
            assert r_ok.status_code == 200
        else:
            # Endpoint is OPEN — flag this as a finding (settings should be manager-only per spec)
            pytest.fail(f"PUT /settings is OPEN (status {r_no.status_code}); spec requires manager token")

    def test_stats_today_requires_token(self, http, auth_headers):
        r_no = http.get(f"{API}/stats/today")
        assert r_no.status_code == 401, f"stats/today should require token, got {r_no.status_code}"
        r_ok = http.get(f"{API}/stats/today", headers=auth_headers)
        assert r_ok.status_code == 200
        assert "total_orders" in r_ok.json()

    def test_stats_revenue_requires_token(self, http, auth_headers):
        r = http.get(f"{API}/stats/revenue?period=week")
        assert r.status_code == 401
        r2 = http.get(f"{API}/stats/revenue?period=week", headers=auth_headers)
        assert r2.status_code == 200

    def test_sessions_requires_token(self, http, auth_headers):
        r = http.get(f"{API}/auth/sessions")
        assert r.status_code == 401
        r2 = http.get(f"{API}/auth/sessions", headers=auth_headers)
        assert r2.status_code == 200
        assert "sessions" in r2.json()

    def test_orders_get_is_open(self, http):
        r = http.get(f"{API}/orders")
        assert r.status_code == 200, "GET /orders must be open (kitchen + customer)"


# ---------- 2. Subscription gating on menu/category writes ----------
class TestMenuWriteGating:
    def test_post_menu_without_token_401(self, http):
        r = http.post(f"{API}/menu", json={"name": "X", "price": 10})
        assert r.status_code == 401, f"POST /menu without token must be 401, got {r.status_code}"

    def test_post_category_without_token_401(self, http):
        r = http.post(f"{API}/categories", json={"name": "TEST_NoAuth"})
        assert r.status_code == 401

    def test_post_menu_with_token_status_402_or_200(self, http, auth_headers):
        """With token: should be 200 if subscription active, 402 if not."""
        r = http.post(f"{API}/menu", headers=auth_headers,
                      json={"name": f"TEST_iter13_{uuid.uuid4().hex[:6]}", "price": 99})
        assert r.status_code in (200, 402), f"Got {r.status_code} {r.text}"
        if r.status_code == 200:
            # Clean up
            item_id = r.json()["id"]
            http.delete(f"{API}/menu/{item_id}", headers=auth_headers)


# ---------- 3. POST /orders gating (open w.r.t. manager token; only sub gate) ----------
class TestOrdersOpenForCustomer:
    def test_post_orders_no_manager_token(self, http):
        """POST /orders must NOT require manager token.
        It should be 200 (if sub active) or 402 (if not). Never 401."""
        r = http.post(f"{API}/orders", json={
            "table": 99, "items": [{"name": "TEST_Item", "qty": 1, "price": 10}]
        })
        assert r.status_code in (200, 402), f"POST /orders should not require manager token, got {r.status_code}"


# ---------- 4. Kitchen PIN flow ----------
class TestKitchenPin:
    def test_kitchen_pin_put_requires_manager(self, http):
        r = http.put(f"{API}/settings/kitchen-pin", json={"new_pin": "5678"})
        assert r.status_code == 401

    def test_kitchen_login_when_not_set_returns_404(self, http, auth_headers):
        # First clear it
        http.put(f"{API}/settings/kitchen-pin", headers=auth_headers, json={"new_pin": ""})
        # Empty -> validator rejects. So manually set via direct API expectation:
        # The validator requires 4-6 digits, so we cannot set to "". We test 404
        # only if it's currently unset. Use GET to check.
        cur = http.get(f"{API}/settings/kitchen-pin", headers=auth_headers).json()
        if cur.get("kitchen_pin"):
            pytest.skip(f"Kitchen PIN already set ({cur['kitchen_pin']}); cannot test 404 path")
        r = http.post(f"{API}/auth/kitchen-login", json={"pin": "0000"})
        assert r.status_code == 404
        assert "not set" in r.json().get("detail", "").lower()

    def test_kitchen_pin_set_and_login(self, http, auth_headers):
        # Set kitchen pin to 5678
        r = http.put(f"{API}/settings/kitchen-pin", headers=auth_headers, json={"new_pin": "5678"})
        assert r.status_code == 200

        # Verify via GET
        g = http.get(f"{API}/settings/kitchen-pin", headers=auth_headers)
        assert g.status_code == 200
        assert g.json()["kitchen_pin"] == "5678"

        # Login with correct PIN
        ok = http.post(f"{API}/auth/kitchen-login", json={"pin": "5678"})
        assert ok.status_code == 200
        assert "token" in ok.json()
        assert ok.json()["token"].startswith("kitchen-")

        # Wrong PIN -> 401
        bad = http.post(f"{API}/auth/kitchen-login", json={"pin": "9999"})
        assert bad.status_code == 401


# ---------- 5. Payments config — no hardcoded link ----------
class TestPaymentsConfig:
    def test_payments_config_no_hardcoded_link(self, http):
        r = http.get(f"{API}/payments/config")
        assert r.status_code == 200
        data = r.json()
        assert data["configured"] is False
        assert data["key_id"] == ""
        # When env var empty, fallback_link must be empty (no hardcoded razorpay.me)
        assert data["fallback_link"] == "", f"fallback_link should be empty, got {data['fallback_link']!r}"


# ---------- 6. Pricing ----------
class TestPricing:
    def test_pricing_20_tables(self, http):
        r = http.get(f"{API}/pricing?tables=20")
        assert r.status_code == 200
        data = r.json()
        assert data["total_with_tax"] == 1888.0, f"Expected 1888.0, got {data['total_with_tax']}"
        assert data["per_table"] == 80.0
        assert data["gst_rate_pct"] == 18


# ---------- 7. DEMO_MODE OTP behavior ----------
class TestDemoModeOTP:
    def test_request_otp_includes_demo_in_demo_mode(self, http):
        """Current preview env has DEMO_MODE=true — demo_otp should be present."""
        r = http.post(f"{API}/auth/request-otp", json={"contact_number": "9876543210"})
        # If the profile contact_number doesn't match, we'd get 401. Try registered number.
        if r.status_code == 401:
            # Get the registered phone
            p = http.get(f"{API}/profile").json()
            phone = p.get("contact_number") or ""
            if not phone:
                pytest.skip("No manager phone on record")
            r = http.post(f"{API}/auth/request-otp", json={"contact_number": phone})
        if r.status_code == 404:
            pytest.skip("No manager registered yet")
        assert r.status_code == 200, r.text
        body = r.json()
        # In DEMO_MODE=true, demo_otp must be present
        demo_mode = os.environ.get("DEMO_MODE", "true").lower() in ("1", "true", "yes")
        if demo_mode:
            assert "demo_otp" in body, "DEMO_MODE=true should expose demo_otp"
        else:
            assert "demo_otp" not in body
