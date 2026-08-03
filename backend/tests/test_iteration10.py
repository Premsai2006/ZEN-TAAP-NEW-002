"""Iteration 10 backend tests:
- 2-device session cap (POST /auth/login with device_id, GET/DELETE /auth/sessions)
- GET /subscription returns has_access and auto-expires when next_cycle_start passes
"""

import os
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"

# Load backend env to get MONGO_URL/DB_NAME
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module", autouse=True)
def cleanup_test_sessions(mongo):
    """Delete any test_* device sessions before & after tests."""
    async def _clean():
        await mongo.sessions.delete_many({"device_id": {"$regex": "^test_"}})
    _run(_clean())
    yield
    _run(_clean())


# ---------------- AUTH / SESSIONS ----------------

class TestAuthSessions:
    def test_login_with_device_d1(self):
        r = requests.post(f"{API}/auth/login", json={
            "pin": "1234", "device_id": "test_d1", "device_label": "Test Device 1",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert d["device_id"] == "test_d1"
        assert isinstance(d["token"], str) and d["token"].startswith("mgr-")
        assert d["max_devices"] == 2
        assert d["active_devices"] >= 1

    def test_login_with_device_d2_active_2(self):
        r = requests.post(f"{API}/auth/login", json={
            "pin": "1234", "device_id": "test_d2", "device_label": "Test Device 2",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["device_id"] == "test_d2"
        # active_devices may include non-test sessions, so we check via sessions list

    def test_sessions_contains_d1_and_d2(self, mongo):
        async def _check():
            docs = await mongo.sessions.find({"device_id": {"$regex": "^test_"}}).to_list(10)
            ids = sorted([d["device_id"] for d in docs])
            return ids
        ids = _run(_check())
        assert "test_d1" in ids
        assert "test_d2" in ids

    def test_third_device_evicts_lru(self, mongo):
        # Pre: clean ALL manager sessions first so the cap is enforced cleanly
        async def _purge_managers():
            await mongo.sessions.delete_many({"scope": "manager"})
        _run(_purge_managers())

        # Log in d1, d2, d3 sequentially
        r1 = requests.post(f"{API}/auth/login", json={"pin": "1234", "device_id": "test_d1", "device_label": "D1"})
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/auth/login", json={"pin": "1234", "device_id": "test_d2", "device_label": "D2"})
        assert r2.status_code == 200
        assert r2.json()["active_devices"] == 2

        r3 = requests.post(f"{API}/auth/login", json={"pin": "1234", "device_id": "test_d3", "device_label": "D3"})
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["active_devices"] == 2, f"Expected cap at 2, got {d3['active_devices']}"

        # GET sessions: should contain test_d2 and test_d3 only (d1 was LRU and evicted)
        gr = requests.get(f"{API}/auth/sessions")
        assert gr.status_code == 200
        sd = gr.json()
        assert sd["max_devices"] == 2
        ids = [s["device_id"] for s in sd["sessions"]]
        assert "test_d3" in ids
        assert "test_d2" in ids
        assert "test_d1" not in ids, f"d1 should have been evicted; sessions={ids}"

    def test_get_sessions_shape(self):
        r = requests.get(f"{API}/auth/sessions")
        assert r.status_code == 200
        d = r.json()
        assert "sessions" in d and "max_devices" in d and "active" in d
        assert d["max_devices"] == 2
        for s in d["sessions"]:
            assert "device_id" in s
            assert "device_label" in s
            assert "created_at" in s
            assert "last_used" in s
            assert "token" not in s  # token must NOT be exposed in list

    def test_delete_session_success(self):
        # Delete test_d2 (created in previous test)
        r = requests.delete(f"{API}/auth/sessions/test_d2")
        assert r.status_code == 200
        assert r.json()["success"] is True

        gr = requests.get(f"{API}/auth/sessions")
        ids = [s["device_id"] for s in gr.json()["sessions"]]
        assert "test_d2" not in ids

    def test_delete_session_not_found(self):
        r = requests.delete(f"{API}/auth/sessions/test_does_not_exist_xyz")
        assert r.status_code == 404


# ---------------- SUBSCRIPTION has_access + auto-expire ----------------

class TestSubscriptionHasAccess:
    def test_subscription_has_access_field(self):
        r = requests.get(f"{API}/subscription")
        assert r.status_code == 200
        d = r.json()
        assert "has_access" in d
        assert isinstance(d["has_access"], bool)
        assert "status" in d
        if d["status"] in ("trial", "active"):
            assert d["has_access"] is True
        else:
            assert d["has_access"] is False

    def test_auto_expire_on_past_cycle(self, mongo):
        """Force next_cycle_start to a past date with status=active; GET /subscription
        should flip status to 'expired' and persist it."""
        async def _setup():
            # Save originals so we can restore
            orig = await mongo.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
            await mongo.settings.update_one(
                {"key": "restaurant"},
                {"$set": {
                    "next_cycle_start": "2025-01-01T00:00:00+00:00",
                    "subscription_status": "active",
                    "last_payment_at": "2024-12-01T00:00:00+00:00",  # old payment
                }},
                upsert=True,
            )
            return orig

        async def _restore(orig):
            # Restore meaningful fields back; if missing, set future date + active
            restore = {
                "next_cycle_start": orig.get("next_cycle_start") or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "subscription_status": orig.get("subscription_status", "active"),
            }
            if "last_payment_at" in orig:
                restore["last_payment_at"] = orig["last_payment_at"]
            await mongo.settings.update_one({"key": "restaurant"}, {"$set": restore})

        orig = _run(_setup())
        try:
            r = requests.get(f"{API}/subscription")
            assert r.status_code == 200
            d = r.json()
            assert d["status"] == "expired", f"Expected status='expired', got {d['status']}"
            assert d["has_access"] is False

            # Verify persistence in DB
            async def _check_persist():
                doc = await mongo.settings.find_one({"key": "restaurant"}, {"_id": 0})
                return doc.get("subscription_status")
            persisted = _run(_check_persist())
            assert persisted == "expired"
        finally:
            # Restore to active + future cycle so other tests/dashboards are clean
            async def _final_restore():
                future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                await mongo.settings.update_one(
                    {"key": "restaurant"},
                    {"$set": {
                        "subscription_status": "active",
                        "next_cycle_start": future,
                    }},
                )
            _run(_final_restore())
            # If orig had a different state, optionally restore that too
            _run(_restore(orig))


# ---------------- Regression: existing flows ----------------

class TestRegression:
    def test_payments_config_returns_fallback(self):
        r = requests.get(f"{API}/payments/config")
        assert r.status_code == 200
        d = r.json()
        assert "configured" in d
        assert "fallback_link" in d

    def test_login_wrong_pin(self):
        r = requests.post(f"{API}/auth/login", json={"pin": "9999", "device_id": "test_wrong", "device_label": "x"})
        assert r.status_code == 401
