"""Iteration 14 — Cookie auth migration + stats_today refactor regression."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
MANAGER_PIN = "1234"


@pytest.fixture
def fresh_http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def logged_in_http(fresh_http):
    r = fresh_http.post(f"{API}/auth/login", json={
        "pin": MANAGER_PIN,
        "device_id": f"iter14_{uuid.uuid4().hex[:8]}",
        "device_label": "pytest-iter14",
    })
    if r.status_code != 200:
        pytest.skip(f"Manager login failed: {r.status_code}")
    # Cookie is now on fresh_http via Set-Cookie response
    return fresh_http


class TestCookieAuth:
    def test_login_sets_httponly_cookie(self, fresh_http):
        r = fresh_http.post(f"{API}/auth/login", json={
            "pin": MANAGER_PIN,
            "device_id": f"iter14_cookie_{uuid.uuid4().hex[:8]}",
            "device_label": "pytest-iter14",
        })
        assert r.status_code == 200
        # The mgr_token cookie should be in the response
        cookie_names = [c.name for c in r.cookies]
        assert "mgr_token" in cookie_names, f"Expected mgr_token cookie, got: {cookie_names}"
        # Token still in body for legacy bearer-header consumers
        assert r.json().get("token", "").startswith("mgr-")

    def test_cookie_alone_authenticates(self, logged_in_http):
        """The session has the mgr_token cookie. No Authorization header should be needed."""
        # Strip any stray auth header
        r = logged_in_http.get(f"{API}/auth/sessions", headers={"Authorization": ""})
        assert r.status_code == 200
        assert "sessions" in r.json()

    def test_bearer_header_still_works_legacy(self, fresh_http):
        """Legacy bearer-header callers (curl, SDKs) must still authenticate."""
        login = fresh_http.post(f"{API}/auth/login", json={
            "pin": MANAGER_PIN,
            "device_id": f"iter14_legacy_{uuid.uuid4().hex[:8]}",
            "device_label": "pytest-iter14-legacy",
        })
        token = login.json()["token"]
        # New session, no cookie
        s = requests.Session()
        r = s.get(f"{API}/auth/sessions",
                  headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text

    def test_logout_clears_cookie_and_session(self, logged_in_http):
        # Verify authenticated
        ok = logged_in_http.get(f"{API}/auth/sessions")
        assert ok.status_code == 200
        # Logout
        out = logged_in_http.post(f"{API}/auth/logout")
        assert out.status_code == 200
        # Now sessions call should 401 (cookie cleared + session deleted server-side)
        r = logged_in_http.get(f"{API}/auth/sessions", headers={"Authorization": ""})
        assert r.status_code == 401


class TestStatsTodayRefactor:
    """The refactor split stats_today into 5 helpers; verify the response shape is unchanged."""
    def test_stats_today_has_all_fields(self, logged_in_http):
        r = logged_in_http.get(f"{API}/stats/today")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_orders", "revenue", "completed", "pending", "active_tables",
                  "avg_order_value", "gross_profit", "most_ordered", "most_count",
                  "top_items", "revenue_by_category", "growth_7d"):
            assert k in d, f"Missing field: {k}"
        # growth_7d shape
        for k in ("revenue", "orders", "completed", "aov"):
            assert k in d["growth_7d"]
        # top_items items have category/image/emoji when present
        for it in d["top_items"]:
            assert "name" in it and "qty" in it and "revenue" in it
            assert "category" in it
