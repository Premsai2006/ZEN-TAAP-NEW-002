"""Iteration 6 backend tests: deferred subscription state machine + revenue label format."""
import os
import re
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
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


def _reset_subscription(s):
    """Reset to status='none' by directly nulling subscription fields via mongo would require admin —
    Instead, mock reset by issuing PUT /api/settings cannot reset status. So we use a helper that
    simulates 'none' by checking current state and adjusting tests accordingly."""
    # No direct endpoint exists — tests adapt to current state.
    pass


# ---------- /api/subscription GET shape (deferred-cycle fields) ----------
class TestSubscriptionShape:
    def test_get_subscription_includes_deferred_fields(self, s):
        r = s.get(f"{API}/subscription", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("tables", "subtotal", "gst", "total", "status",
                  "trial_start", "trial_end", "payment_method",
                  "pending_tables", "pending_subtotal", "pending_total",
                  "cycle_start", "next_cycle_start",
                  "intro_trial_eligible", "needs_payment"):
            assert k in d, f"missing key '{k}' in /api/subscription response (got {list(d.keys())})"


# ---------- POST /api/subscription state machine ----------
class TestSubscriptionStateMachine:
    """Tests the deferred-cycle logic.
    NOTE: Backend has no reset endpoint, so we cover scenarios using whatever current state is."""

    def test_post_validates_tables_range(self, s):
        r = s.post(f"{API}/subscription", json={"tables": 9, "payment_method": "upi"}, timeout=15)
        assert r.status_code == 400
        r = s.post(f"{API}/subscription", json={"tables": 61, "payment_method": "upi"}, timeout=15)
        assert r.status_code == 400

    def test_post_then_get_persists_with_cycle_fields(self, s):
        cur = s.get(f"{API}/subscription").json()
        if cur.get("status") in (None, "none", "skipped") or not cur.get("tables"):
            r = s.post(f"{API}/subscription", json={"tables": 15, "payment_method": "upi"}, timeout=15)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d.get("applied") == "awaiting_payment"
            assert d.get("needs_payment") is True

        post_state = s.get(f"{API}/subscription").json()
        # Access starts only after payment; unpaid first-time stays none/skipped/expired
        if post_state["status"] in ("none", "skipped", "expired"):
            assert post_state.get("has_access") is False
            return
        assert post_state["status"] in ("trial", "active")

    def test_change_tables_returns_next_cycle_deferred(self, s):
        # Read current
        cur = s.get(f"{API}/subscription").json()
        if cur["status"] not in ("trial", "active"):
            pytest.skip("Requires an already-paid subscription")
        current_tables = cur["tables"]
        new_tables = current_tables + 5 if current_tables + 5 <= 60 else current_tables - 5

        r = s.post(f"{API}/subscription", json={"tables": new_tables, "payment_method": "upi"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("applied") == "next_cycle"
        assert d["current_tables"] == current_tables
        assert d["pending_tables"] == new_tables

        # GET verifies pending fields populated but current unchanged
        cur2 = s.get(f"{API}/subscription").json()
        assert cur2["tables"] == current_tables, "Current tables MUST NOT change mid-cycle"
        assert cur2["pending_tables"] == new_tables
        assert cur2["pending_total"] is not None
        # 299 + 50*new_tables = subtotal; *1.18 = total
        expected_subtotal = 299 + 50 * new_tables
        assert cur2["pending_subtotal"] == expected_subtotal

    def test_post_with_same_tables_returns_no_change_clears_pending(self, s):
        cur = s.get(f"{API}/subscription").json()
        if cur["status"] not in ("trial", "active"):
            pytest.skip("Requires an already-paid subscription")
        current_tables = cur["tables"]
        r = s.post(f"{API}/subscription",
                   json={"tables": current_tables, "payment_method": "card"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("applied") == "no_change"
        assert d.get("tables") == current_tables

        cur2 = s.get(f"{API}/subscription").json()
        assert cur2["tables"] == current_tables
        assert cur2["pending_tables"] is None
        assert cur2["pending_subtotal"] is None
        assert cur2["pending_total"] is None
        assert cur2["payment_method"] == "card"


# ---------- /api/stats/revenue?period=week label format ----------
class TestRevenueWeekLabel:
    def test_week_series_has_7_entries_with_day_and_month(self, s):
        r = s.get(f"{API}/stats/revenue?period=week", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["period"] == "week"
        series = d["series"]
        assert len(series) == 7, f"expected 7 weekly entries, got {len(series)}"

        # label pattern: "DD Mon" (e.g., "12 Jun") and weekday field present (e.g., "Mon")
        label_re = re.compile(r"^\d{1,2}\s+[A-Z][a-z]{2}$")
        weekday_re = re.compile(r"^[A-Z][a-z]{2}$")
        for entry in series:
            assert "label" in entry and "weekday" in entry and "revenue" in entry
            assert label_re.match(entry["label"]), f"bad label format: {entry['label']!r}"
            assert weekday_re.match(entry["weekday"]), f"bad weekday format: {entry['weekday']!r}"
            assert isinstance(entry["revenue"], (int, float))
