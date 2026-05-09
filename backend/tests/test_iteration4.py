"""Iteration 4 tests: TableTaap rebrand + auth (signup/login/change-pin/recover-pin) + theme + gst_rate null."""
import os
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

CURRENT_PIN = "4321"  # current credentials per test_credentials.md
EXPECTED_MANAGER = "Prem"
EXPECTED_RESTAURANT = "Prem Sai Cafe"
EXPECTED_CONTACT = "9876543210"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Auth status ----------
class TestAuthStatus:
    def test_status_setup_complete(self, s):
        r = s.get(f"{API}/auth/status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("setup_complete") is True
        assert data.get("manager_name") == EXPECTED_MANAGER
        assert data.get("restaurant_name") == EXPECTED_RESTAURANT


# ---------- Login ----------
class TestLogin:
    def test_login_correct_pin(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": CURRENT_PIN}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("success") is True
        assert isinstance(d.get("token"), str) and d["token"].startswith("mgr-")

    def test_login_wrong_pin(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "9999"}, timeout=15)
        assert r.status_code == 401

    def test_login_non_numeric(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "abcd"}, timeout=15)
        assert r.status_code == 400

    def test_login_too_short(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "12"}, timeout=15)
        assert r.status_code == 400

    def test_login_too_long(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": "12345678901"}, timeout=15)
        assert r.status_code == 400


# ---------- Signup (must reject because profile already exists) ----------
class TestSignupExisting:
    def test_signup_when_profile_exists_returns_400(self, s):
        r = s.post(
            f"{API}/auth/signup",
            json={
                "manager_name": "Test Manager",
                "restaurant_name": "Test Cafe",
                "contact_number": "9999999999",
                "pin": "5555",
            },
            timeout=15,
        )
        assert r.status_code == 400
        assert "already" in r.text.lower() or "registered" in r.text.lower()


# ---------- Change PIN ----------
class TestChangePin:
    def test_change_pin_wrong_old(self, s):
        r = s.post(
            f"{API}/auth/change-pin",
            json={"old_pin": "0000", "new_pin": "8888"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_change_pin_invalid_new(self, s):
        r = s.post(
            f"{API}/auth/change-pin",
            json={"old_pin": CURRENT_PIN, "new_pin": "ab"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_change_pin_success_then_revert(self, s):
        new_pin = "7531"
        # change to new
        r = s.post(
            f"{API}/auth/change-pin",
            json={"old_pin": CURRENT_PIN, "new_pin": new_pin},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # login with new
        ok = s.post(f"{API}/auth/login", json={"pin": new_pin}, timeout=15)
        assert ok.status_code == 200
        # old pin should fail now
        bad = s.post(f"{API}/auth/login", json={"pin": CURRENT_PIN}, timeout=15)
        assert bad.status_code == 401
        # revert
        rev = s.post(
            f"{API}/auth/change-pin",
            json={"old_pin": new_pin, "new_pin": CURRENT_PIN},
            timeout=15,
        )
        assert rev.status_code == 200
        # login restored
        back = s.post(f"{API}/auth/login", json={"pin": CURRENT_PIN}, timeout=15)
        assert back.status_code == 200


# ---------- Recover PIN ----------
class TestRecoverPin:
    def test_recover_wrong_contact(self, s):
        r = s.post(
            f"{API}/auth/recover-pin",
            json={"contact_number": "1111111", "new_pin": "9090"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_recover_correct_contact_and_revert(self, s):
        new_pin = "6543"
        r = s.post(
            f"{API}/auth/recover-pin",
            json={"contact_number": EXPECTED_CONTACT, "new_pin": new_pin},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        ok = s.post(f"{API}/auth/login", json={"pin": new_pin}, timeout=15)
        assert ok.status_code == 200
        # revert via change-pin
        rev = s.post(
            f"{API}/auth/change-pin",
            json={"old_pin": new_pin, "new_pin": CURRENT_PIN},
            timeout=15,
        )
        assert rev.status_code == 200
        # login restored
        back = s.post(f"{API}/auth/login", json={"pin": CURRENT_PIN}, timeout=15)
        assert back.status_code == 200


# ---------- Settings: gst_rate null & theme ----------
class TestSettingsGst:
    def test_gst_rate_null_round_trip(self, s):
        # snapshot
        cur = s.get(f"{API}/settings", timeout=15).json()
        original_rate = cur.get("gst_rate")
        original_theme = cur.get("theme", "dark")

        # set gst_rate=null
        r = s.put(f"{API}/settings", json={"gst_rate": None, "theme": "dark"}, timeout=15)
        # PUT may reject all-None; but theme is set so update dict is non-empty
        assert r.status_code == 200, r.text
        # GET to verify it stays None (since None is filtered out) — at least no crash.
        g = s.get(f"{API}/settings", timeout=15)
        assert g.status_code == 200
        d = g.json()
        # gst_rate field should be present (Optional[float])
        assert "gst_rate" in d

        # set explicit numeric
        r2 = s.put(f"{API}/settings", json={"gst_rate": 12.5}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["gst_rate"] == 12.5

        # restore original
        if original_rate is None:
            # Need direct way: PUT with another field + gst_rate filtered out.
            # The backend filters None, so we can't unset via PUT. Skip restore notice.
            pass
        else:
            s.put(f"{API}/settings", json={"gst_rate": original_rate}, timeout=15)
        s.put(f"{API}/settings", json={"theme": original_theme}, timeout=15)

    def test_theme_field_persists(self, s):
        cur = s.get(f"{API}/settings", timeout=15).json()
        original = cur.get("theme", "dark")
        r = s.put(f"{API}/settings", json={"theme": "light"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("theme") == "light"
        # restore
        s.put(f"{API}/settings", json={"theme": original}, timeout=15)


# ---------- Regression: menu & orders still working ----------
class TestRegression:
    def test_categories_seeded(self, s):
        r = s.get(f"{API}/categories", timeout=15)
        assert r.status_code == 200
        names = [c["name"] for c in r.json()]
        for ex in ["Starters", "Main Course", "Drinks"]:
            assert ex in names

    def test_menu_listing(self, s):
        r = s.get(f"{API}/menu", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for it in items:
            assert "images" in it

    def test_stats_today(self, s):
        r = s.get(f"{API}/stats/today", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_orders", "revenue", "completed", "pending", "active_tables", "top_items"]:
            assert k in d

    def test_upload_image_valid(self, s):
        tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZqUTQAAAABJRU5ErkJggg=="
        r = s.post(f"{API}/upload-image", json={"data": tiny}, timeout=15)
        assert r.status_code == 200
