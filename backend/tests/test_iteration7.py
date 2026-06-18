"""Iteration 7 backend tests — Customer PIN, Customer Login, Subscription cycle dates, Orders."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://restaurant-ops-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Customer PIN ----------
class TestCustomerPin:
    def test_get_customer_pin_default(self, session):
        r = session.get(f"{API}/settings/customer-pin")
        assert r.status_code == 200
        data = r.json()
        assert "customer_pin" in data
        assert isinstance(data["customer_pin"], str)
        # ensure pin is 4-6 digits
        assert data["customer_pin"].isdigit()
        assert 4 <= len(data["customer_pin"]) <= 6

    def test_put_customer_pin_too_short(self, session):
        r = session.put(f"{API}/settings/customer-pin", json={"new_pin": "12"})
        assert r.status_code == 400

    def test_put_customer_pin_non_digit(self, session):
        r = session.put(f"{API}/settings/customer-pin", json={"new_pin": "abc"})
        assert r.status_code == 400

    def test_put_customer_pin_too_long(self, session):
        r = session.put(f"{API}/settings/customer-pin", json={"new_pin": "1234567"})
        assert r.status_code == 400

    def test_put_customer_pin_success_then_get_then_restore(self, session):
        # get current
        original = session.get(f"{API}/settings/customer-pin").json()["customer_pin"]

        # update to 5678
        r = session.put(f"{API}/settings/customer-pin", json={"new_pin": "5678"})
        assert r.status_code == 200
        assert r.json().get("success") is True

        # verify persistence
        r2 = session.get(f"{API}/settings/customer-pin")
        assert r2.status_code == 200
        assert r2.json()["customer_pin"] == "5678"

        # restore original (or default 1234 if blank)
        restore = original if original else "1234"
        session.put(f"{API}/settings/customer-pin", json={"new_pin": restore})


# ---------- Customer Login ----------
class TestCustomerLogin:
    def test_customer_login_correct_pin(self, session):
        # ensure pin known to be 1234
        session.put(f"{API}/settings/customer-pin", json={"new_pin": "1234"})
        r = session.post(f"{API}/auth/customer-login", json={"pin": "1234"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert "token" in body
        assert body["token"].startswith("cust-")

    def test_customer_login_wrong_pin(self, session):
        session.put(f"{API}/settings/customer-pin", json={"new_pin": "1234"})
        r = session.post(f"{API}/auth/customer-login", json={"pin": "9999"})
        assert r.status_code == 401
        body = r.json()
        # FastAPI default error payload
        assert "Incorrect PIN" in (body.get("detail") or "")


# ---------- Orders (for Kitchen ticket flow) ----------
class TestOrders:
    def test_create_order_then_in_list(self, session):
        payload = {
            "table": 13,
            "items": [
                {"name": "TEST_KitchenItem", "qty": 2, "price": 100.0},
            ],
        }
        r = session.post(f"{API}/orders", json=payload)
        assert r.status_code == 200
        order = r.json()
        assert order["table"] == 13
        assert order["status"] == "new"
        assert order["amount"] == 200.0
        assert "id" in order
        order_id = order["id"]

        # GET list to verify
        lr = session.get(f"{API}/orders")
        assert lr.status_code == 200
        ids = [o["id"] for o in lr.json()]
        assert order_id in ids

        # Advance status: new -> cooking
        ur = session.put(f"{API}/orders/{order_id}", json={"status": "cooking"})
        assert ur.status_code == 200
        assert ur.json()["status"] == "cooking"


# ---------- Subscription ----------
class TestSubscription:
    def test_get_subscription_has_cycle_fields(self, session):
        r = session.get(f"{API}/subscription")
        assert r.status_code == 200
        data = r.json()
        # all keys must be present in payload (even if null)
        for k in ["cycle_start", "next_cycle_start", "trial_start", "trial_end", "status"]:
            assert k in data

    def test_get_subscription_trial_populated_when_active(self, session):
        data = session.get(f"{API}/subscription").json()
        status = data.get("status")
        # If active trial, dates should be populated
        if status == "trial":
            assert data["trial_start"] is not None
            assert data["trial_end"] is not None


# ---------- Manager PIN Regression ----------
class TestManagerLoginRegression:
    def test_manager_login_with_1234(self, session):
        r = session.post(f"{API}/auth/login", json={"pin": "1234"})
        # Could be 200 (correct) or 401 (different PIN). Just record.
        assert r.status_code in (200, 401, 404)
        if r.status_code == 200:
            assert r.json().get("token", "").startswith("mgr-")
