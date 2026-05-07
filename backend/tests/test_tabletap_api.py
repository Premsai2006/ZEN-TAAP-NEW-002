"""TableTap Manager Dashboard backend API tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fall back to frontend env file
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "123456"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert isinstance(data.get("token"), str) and data["token"].startswith("mgr-")

    def test_login_wrong_pin(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "99999"}, timeout=15)
        assert r.status_code == 401

    def test_login_non_numeric(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "abcdef"}, timeout=15)
        assert r.status_code == 400


# ---------- Categories ----------
class TestCategories:
    def test_list_categories_seed(self, s):
        r = s.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        for expected in ["Starters", "Main Course", "Rice & Biryani", "Breads", "Drinks", "Desserts"]:
            assert expected in names, f"missing seeded category {expected}"

    def test_create_and_delete_category(self, s):
        # cleanup any leftover
        existing = s.get(f"{API}/categories", timeout=15).json()
        for c in existing:
            if c["name"].lower() == "test cat":
                s.delete(f"{API}/categories/{c['id']}")

        r = s.post(f"{API}/categories", json={"name": "TEST Cat"}, timeout=15)
        assert r.status_code == 200, r.text
        cat = r.json()
        assert cat["name"] == "TEST Cat"
        assert "id" in cat
        cat_id = cat["id"]

        # case-insensitive duplicate rejection
        dup = s.post(f"{API}/categories", json={"name": "test cat"}, timeout=15)
        assert dup.status_code == 400

        # GET to verify persistence
        listed = s.get(f"{API}/categories", timeout=15).json()
        assert any(c["id"] == cat_id for c in listed)

        # delete
        d = s.delete(f"{API}/categories/{cat_id}", timeout=15)
        assert d.status_code == 200

        # verify removed
        listed2 = s.get(f"{API}/categories", timeout=15).json()
        assert not any(c["id"] == cat_id for c in listed2)


# ---------- Menu ----------
class TestMenu:
    def test_list_menu_seeded(self, s):
        r = s.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 10
        first = items[0]
        assert "available" in first and first["available"] is True
        assert "image_url" in first

    def test_menu_crud_and_toggle(self, s):
        payload = {
            "name": "TEST_Pasta",
            "price": 199.0,
            "category": "Starters",
            "emoji": "🍝",
            "image_url": "",
            "available": True,
        }
        c = s.post(f"{API}/menu", json=payload, timeout=15)
        assert c.status_code == 200, c.text
        item = c.json()
        assert item["name"] == "TEST_Pasta"
        assert item["price"] == 199.0
        assert item["available"] is True
        item_id = item["id"]

        # toggle availability false
        u = s.put(f"{API}/menu/{item_id}", json={"available": False}, timeout=15)
        assert u.status_code == 200
        assert u.json()["available"] is False

        # GET verify
        listed = s.get(f"{API}/menu", timeout=15).json()
        match = next((i for i in listed if i["id"] == item_id), None)
        assert match is not None
        assert match["available"] is False

        # delete
        d = s.delete(f"{API}/menu/{item_id}", timeout=15)
        assert d.status_code == 200

        # verify gone
        d2 = s.delete(f"{API}/menu/{item_id}", timeout=15)
        assert d2.status_code == 404


# ---------- Orders ----------
class TestOrders:
    def test_list_orders_sorted_desc(self, s):
        r = s.get(f"{API}/orders", timeout=15)
        assert r.status_code == 200
        orders = r.json()
        assert len(orders) >= 6
        nums = [o["order_number"] for o in orders]
        assert nums == sorted(nums, reverse=True)

    def test_create_order_increments_and_computes_amount(self, s):
        prev = s.get(f"{API}/orders", timeout=15).json()
        prev_max = max(o["order_number"] for o in prev) if prev else 1000
        payload = {
            "table": 99,
            "items": [
                {"name": "TEST_Item", "qty": 2, "price": 100.0},
                {"name": "TEST_Item2", "qty": 1, "price": 50.0},
            ],
        }
        c = s.post(f"{API}/orders", json=payload, timeout=15)
        assert c.status_code == 200, c.text
        order = c.json()
        assert order["order_number"] == prev_max + 1
        assert order["amount"] == 250.0
        assert order["status"] == "new"
        order_id = order["id"]

        # update status: cooking
        u1 = s.put(f"{API}/orders/{order_id}", json={"status": "cooking"}, timeout=15)
        assert u1.status_code == 200
        assert u1.json()["status"] == "cooking"

        # delivered
        u2 = s.put(f"{API}/orders/{order_id}", json={"status": "delivered"}, timeout=15)
        assert u2.status_code == 200
        assert u2.json()["status"] == "delivered"


# ---------- Stats ----------
class TestStats:
    def test_stats_today(self, s):
        r = s.get(f"{API}/stats/today", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ["total_orders", "revenue", "completed", "pending", "active_tables", "most_ordered", "top_items"]:
            assert k in data, f"missing key {k}"
        assert isinstance(data["top_items"], list)
        if data["top_items"]:
            assert "category" in data["top_items"][0]
            assert "qty" in data["top_items"][0]
            assert "revenue" in data["top_items"][0]


# ---------- Image Upload ----------
class TestImageUpload:
    def test_valid_data_url(self, s):
        tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZqUTQAAAABJRU5ErkJggg=="
        r = s.post(f"{API}/upload-image", json={"data": tiny}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("data:image")

    def test_invalid_url(self, s):
        r = s.post(f"{API}/upload-image", json={"data": "https://example.com/x.png"}, timeout=15)
        assert r.status_code == 400

    def test_too_large(self, s):
        big = "data:image/png;base64," + ("A" * 2_600_000)
        r = s.post(f"{API}/upload-image", json={"data": big}, timeout=15)
        assert r.status_code == 400
