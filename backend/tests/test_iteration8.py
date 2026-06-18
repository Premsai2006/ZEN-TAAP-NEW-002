"""TableTaap Iteration 8 — OTP recovery + regressions."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://restaurant-ops-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
MANAGER_PIN = "1234"
PHONE = "9876543210"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module", autouse=True)
def ensure_phone(s):
    # Ensure manager profile has the test phone
    r = s.get(f"{API}/profile", timeout=15)
    if r.status_code == 200 and (r.json().get("contact_number") or "")[-7:] != PHONE[-7:]:
        s.put(f"{API}/profile", json={"contact_number": PHONE}, timeout=15)
    yield
    # Restore manager PIN to 1234
    # Will run request-otp + verify-otp to ensure pin is back
    try:
        ro = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        if ro.status_code == 200:
            otp = ro.json().get("demo_otp")
            s.post(f"{API}/auth/verify-otp", json={"contact_number": PHONE, "otp": otp, "new_pin": MANAGER_PIN}, timeout=15)
    except Exception:
        pass


class TestOTPFlow:
    def test_request_otp_correct_phone(self, s):
        r = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("success") is True
        assert "demo_otp" in data
        otp = data["demo_otp"]
        assert isinstance(otp, str) and len(otp) == 6 and otp.isdigit()
        assert "message" in data

    def test_request_otp_wrong_phone(self, s):
        r = s.post(f"{API}/auth/request-otp", json={"contact_number": "1112223334"}, timeout=15)
        assert r.status_code == 401

    def test_verify_otp_wrong_code(self, s):
        # Request a real OTP first
        ro = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        assert ro.status_code == 200
        r = s.post(f"{API}/auth/verify-otp",
                   json={"contact_number": PHONE, "otp": "000000", "new_pin": "9999"},
                   timeout=15)
        # If random OTP happened to be 000000 (rare), accept that case
        if r.status_code == 200:
            # roll back
            ro2 = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
            s.post(f"{API}/auth/verify-otp", json={"contact_number": PHONE, "otp": ro2.json()["demo_otp"], "new_pin": MANAGER_PIN}, timeout=15)
        else:
            assert r.status_code == 401
            assert "OTP" in r.text or "Incorrect" in r.text

    def test_verify_otp_success_then_login_with_new_pin_then_single_use(self, s):
        # Step 1: request OTP
        ro = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        assert ro.status_code == 200
        otp = ro.json()["demo_otp"]
        new_pin = "8765"

        # Step 2: verify OTP and reset PIN
        v = s.post(f"{API}/auth/verify-otp",
                   json={"contact_number": PHONE, "otp": otp, "new_pin": new_pin},
                   timeout=15)
        assert v.status_code == 200, v.text
        assert v.json().get("success") is True

        # Step 3: login with new PIN works
        lg = s.post(f"{API}/auth/login", json={"pin": new_pin}, timeout=15)
        assert lg.status_code == 200, lg.text
        token = lg.json().get("token")
        assert token and token.startswith("mgr-")

        # Step 3b: old PIN should fail
        lg_old = s.post(f"{API}/auth/login", json={"pin": MANAGER_PIN}, timeout=15)
        assert lg_old.status_code == 401

        # Step 4: re-verify with same OTP → must fail (single-use, deleted from db)
        v2 = s.post(f"{API}/auth/verify-otp",
                    json={"contact_number": PHONE, "otp": otp, "new_pin": "7777"},
                    timeout=15)
        assert v2.status_code == 400
        assert "No OTP" in v2.text or "request a new" in v2.text

        # Step 5: restore manager PIN to 1234 for downstream tests
        ro3 = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        otp3 = ro3.json()["demo_otp"]
        restore = s.post(f"{API}/auth/verify-otp",
                         json={"contact_number": PHONE, "otp": otp3, "new_pin": MANAGER_PIN},
                         timeout=15)
        assert restore.status_code == 200
        lg_back = s.post(f"{API}/auth/login", json={"pin": MANAGER_PIN}, timeout=15)
        assert lg_back.status_code == 200

    def test_verify_otp_without_request(self, s):
        # Drain any existing OTP by completing a flow first, then test no-request path
        # Make sure no OTP exists by completing one full successful flow first
        ro = s.post(f"{API}/auth/request-otp", json={"contact_number": PHONE}, timeout=15)
        if ro.status_code == 200:
            s.post(f"{API}/auth/verify-otp",
                   json={"contact_number": PHONE, "otp": ro.json()["demo_otp"], "new_pin": MANAGER_PIN},
                   timeout=15)
        # Now no OTP exists
        r = s.post(f"{API}/auth/verify-otp",
                   json={"contact_number": PHONE, "otp": "123456", "new_pin": "5555"},
                   timeout=15)
        assert r.status_code == 400


# ---------- Regressions ----------
class TestRegression:
    def test_manager_login(self, s):
        r = s.post(f"{API}/auth/login", json={"pin": MANAGER_PIN}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("token", "").startswith("mgr-")

    def test_subscription_has_cycle_dates(self, s):
        r = s.get(f"{API}/subscription", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Should have at least some date info for cycle pills
        assert any(k in data for k in ("cycle_start", "trial_start", "next_cycle_start", "trial_end"))

    def test_customer_login_default(self, s):
        r = s.post(f"{API}/auth/customer-login", json={"pin": "1234"}, timeout=15)
        assert r.status_code == 200

    def test_profile_has_phone(self, s):
        r = s.get(f"{API}/profile", timeout=15)
        assert r.status_code == 200
        assert r.json().get("contact_number", "")[-7:] == PHONE[-7:]
