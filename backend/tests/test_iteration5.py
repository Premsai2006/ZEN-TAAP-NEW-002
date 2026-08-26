"""Iteration 5 tests: Per-Table subscription, growth_7d, menu/category/order CRUD regression.

Covers all backend cases listed in iteration_4 review request.
"""
import os
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

CURRENT_PIN = "4321"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Auth ----------
class TestAuth:
    def test_login_correct_pin(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": CURRENT_PIN}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert d["token"].startswith("mgr-")

    def test_login_wrong_pin(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "9999"}, timeout=15)
        assert r.status_code == 401

    def test_signup_existing_idempotent(self, s):
        # Profile already exists — signup should fail with 400, NOT crash
        r = s.post(
            f"{API}/auth/signup",
            json={
                "manager_name": "Prem",
                "restaurant_name": "Prem Sai Cafe",
                "contact_number": "9876543210",
                "pin": "4321",
            },
            timeout=15,
        )
        assert r.status_code == 400
        assert "already" in r.json().get("detail", "").lower()


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_has_required_fields(self, s):
        r = s.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("restaurant_name", "gst_rate", "printer_type", "address", "phone"):
            assert k in d, f"missing {k} in settings response"
        assert d["printer_type"] in ("browser", "thermal", "network", "bluetooth", "usb")

    def test_put_settings_persists(self, s):
        # save original
        orig = s.get(f"{API}/settings").json()
        new_name = orig["restaurant_name"]  # don't change brand
        r = s.put(
            f"{API}/settings",
            json={"address": "Test Address 123", "gst_rate": 5.0},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["address"] == "Test Address 123"
        assert d["gst_rate"] == 5.0
        assert d["restaurant_name"] == new_name
        # restore
        s.put(
            f"{API}/settings",
            json={"address": orig.get("address", ""), "gst_rate": orig.get("gst_rate")},
        )


# ---------- Menu + Categories ----------
class TestMenuAndCategories:
    created_cat_id = None
    created_item_id = None

    def test_list_categories(self, s):
        r = s.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_rename_delete_category(self, s):
        cname = "TEST_Cat_It5"
        r = s.post(f"{API}/categories", json={"name": cname}, timeout=15)
        assert r.status_code == 200, r.text
        cat = r.json()
        TestMenuAndCategories.created_cat_id = cat["id"]
        assert cat["name"] == cname

        # rename
        r2 = s.put(f"{API}/categories/{cat['id']}", json={"name": cname + "_R"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["name"] == cname + "_R"

        # delete
        r3 = s.delete(f"{API}/categories/{cat['id']}", timeout=15)
        assert r3.status_code == 200

    def test_menu_crud(self, s):
        r = s.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        for it in r.json()[:1]:
            assert "available" in it and "category" in it

        r = s.post(
            f"{API}/menu",
            json={"name": "TEST_Item_It5", "price": 99.0, "category": "Starters", "emoji": "🧪"},
            timeout=15,
        )
        assert r.status_code == 200
        item = r.json()
        iid = item["id"]
        assert item["name"] == "TEST_Item_It5"
        assert item["available"] is True

        # update availability
        r2 = s.put(f"{API}/menu/{iid}", json={"available": False, "price": 109.0}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["available"] is False
        assert r2.json()["price"] == 109.0

        # verify via list
        r3 = s.get(f"{API}/menu", timeout=15)
        found = [x for x in r3.json() if x["id"] == iid]
        assert len(found) == 1 and found[0]["available"] is False

        # delete
        r4 = s.delete(f"{API}/menu/{iid}", timeout=15)
        assert r4.status_code == 200


# ---------- Orders ----------
class TestOrders:
    def test_list_orders(self, s):
        r = s.get(f"{API}/orders", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_order_and_update_status(self, s):
        r = s.post(
            f"{API}/orders",
            json={"table": 3, "items": [{"name": "Butter Naan", "qty": 2, "price": 60}]},
            timeout=15,
        )
        assert r.status_code == 200
        o = r.json()
        oid = o["id"]
        assert o["amount"] == 120
        assert o["status"] == "new"

        r2 = s.put(f"{API}/orders/{oid}", json={"status": "cooking"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "cooking"

        # verify via list
        lst = s.get(f"{API}/orders").json()
        assert any(x["id"] == oid and x["status"] == "cooking" for x in lst)


# ---------- Stats ----------
class TestStats:
    def test_stats_today_has_growth_7d(self, s):
        r = s.get(f"{API}/stats/today", timeout=20)
        assert r.status_code == 200
        d = r.json()
        # core stats
        for k in ("total_orders", "revenue", "completed", "pending", "top_items", "growth_7d"):
            assert k in d, f"missing {k}"
        # growth_7d structure
        g = d["growth_7d"]
        assert isinstance(g, dict)
        for k in ("revenue", "orders", "completed", "aov"):
            assert k in g, f"growth_7d missing {k}"
            assert isinstance(g[k], (int, float))
        # top items have image field if present
        for t in d["top_items"]:
            assert "name" in t and "qty" in t


# ---------- Subscription (per-table pricing) ----------
class TestSubscription:
    def test_pricing_in_range(self, s):
        r = s.get(f"{API}/pricing?tables=14", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["tables"] == 14
        assert d["base_fee"] == 299
        assert d["per_table"] == 50
        # subtotal = 299 + 50*14 = 999
        assert d["subtotal"] == 999
        assert d["gst_rate_pct"] == 18
        # 999 * 1.18 = 1178.82
        assert abs(d["total_with_tax"] - 1178.82) < 0.05

    def test_pricing_clamps_at_extremes(self, s):
        # backend clamps for GET /pricing
        r = s.get(f"{API}/pricing?tables=5", timeout=15)
        assert r.status_code == 200
        assert r.json()["tables"] == 10  # clamped to MIN

        r2 = s.get(f"{API}/pricing?tables=200", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["tables"] == 60  # clamped to MAX

    def test_get_subscription_returns_config(self, s):
        r = s.get(f"{API}/subscription", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # all keys present (values may be None if never subscribed)
        for k in ("tables", "subtotal", "gst", "total", "status", "payment_method"):
            assert k in d

    def test_post_subscription_saves(self, s):
        # save original
        orig = s.get(f"{API}/subscription").json()
        r = s.post(f"{API}/subscription", json={"tables": 20, "payment_method": "upi"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert d["tables"] == 20
        # 80*20 = 1600; *1.18 = 1888
        assert d["subtotal"] == 1600 or d["subtotal"] == 1299  # current vs legacy pricing
        assert d.get("applied") in ("awaiting_payment", "next_cycle", "no_change", "upgrade_proration")
        if orig.get("status") in (None, "none", "skipped", "expired"):
            assert d["applied"] == "awaiting_payment"
            assert d["needs_payment"] is True
            cur = s.get(f"{API}/subscription").json()
            assert cur["tables"] == 20
            assert cur["status"] in ("none", "skipped", "expired")
            assert cur["has_access"] is False

        # restore if there was original
        if orig.get("tables"):
            s.post(
                f"{API}/subscription",
                json={"tables": orig["tables"], "payment_method": orig.get("payment_method") or "upi"},
            )

    def test_post_subscription_validates_range(self, s):
        r = s.post(f"{API}/subscription", json={"tables": 5, "payment_method": "upi"}, timeout=15)
        assert r.status_code == 400

        r2 = s.post(f"{API}/subscription", json={"tables": 100, "payment_method": "upi"}, timeout=15)
        assert r2.status_code == 400

    def test_post_subscription_bad_payment_method(self, s):
        r = s.post(f"{API}/subscription", json={"tables": 15, "payment_method": "bitcoin"}, timeout=15)
        assert r.status_code == 400
