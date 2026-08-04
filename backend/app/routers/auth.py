import uuid
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends

from app.config import MAX_DEVICES, DEMO_MODE
from app.database import db
from app.deps import require_manager, extract_manager_token, set_manager_cookie, clear_manager_cookie
from app.models import (
    LoginRequest, SignupRequest, ChangePinRequest, RecoverPinRequest,
    RequestOtpBody, VerifyOtpBody, KitchenLoginBody, KitchenPinUpdate, CustomerLoginBody,
)
from app.services import auth_service as auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def auth_status():
    p = await auth.get_profile()
    if p and p.get("pin"):
        return {
            "setup_complete": True,
            "manager_name": p.get("manager_name", ""),
            "restaurant_name": p.get("restaurant_name", ""),
        }
    return {"setup_complete": False}


@router.post("/signup")
async def signup(req: SignupRequest):
    existing = await auth.get_profile()
    if existing and existing.get("pin"):
        raise HTTPException(
            status_code=400,
            detail=(
                "This ZenTaap deployment already has a restaurant registered. "
                "Multi-restaurant hosting requires a separate deployment. Please log in instead."
            ),
        )
    if not req.manager_name.strip():
        raise HTTPException(status_code=400, detail="Manager name required")
    if not req.restaurant_name.strip():
        raise HTTPException(status_code=400, detail="Restaurant name required")
    digs = auth.digits(req.contact_number)
    if len(digs) < 7:
        raise HTTPException(status_code=400, detail="Valid contact number required")
    auth.validate_pin(req.pin, new=True)

    profile = {
        "key": "manager_profile",
        "manager_name": req.manager_name.strip(),
        "restaurant_name": req.restaurant_name.strip(),
        "contact_number": req.contact_number.strip(),
        "email": (req.email or "").strip(),
        "pin": req.pin,
    }
    await db.settings.update_one({"key": "manager_profile"}, {"$set": profile}, upsert=True)
    await db.settings.update_one(
        {"key": "restaurant"},
        {"$set": {"restaurant_name": req.restaurant_name.strip(), "phone": req.contact_number.strip()}},
        upsert=True,
    )
    return {"success": True, "token": f"mgr-{uuid.uuid4()}"}


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    await auth.check_login_lockout(request)
    auth.validate_pin(req.pin, new=False)
    stored = await auth.get_stored_pin()
    if not stored:
        raise HTTPException(status_code=404, detail="No manager registered. Please sign up first.")

    # Optional contact verification — when provided (or required by FE), must match.
    p = await auth.get_profile()
    if req.contact_number:
        if not await auth.contact_matches(req.contact_number):
            await auth.record_login_failure(request)
    elif p and p.get("contact_number") and req.contact_number is not None and req.contact_number == "":
        raise HTTPException(status_code=400, detail="Contact number required")

    if req.pin != stored:
        await auth.record_login_failure(request)

    await auth.clear_login_failures(request)
    sess = await auth.register_session(req.device_id, req.device_label)
    set_manager_cookie(response, sess["token"])
    return {
        "success": True,
        "token": sess["token"],
        "device_id": sess["device_id"],
        "active_devices": sess["active_devices"],
        "max_devices": MAX_DEVICES,
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = extract_manager_token(request)
    if token:
        await db.sessions.delete_one({"scope": "manager", "token": token})
    clear_manager_cookie(response)
    return {"success": True}


@router.get("/sessions", dependencies=[Depends(require_manager)])
async def list_sessions():
    docs = await auth.list_unique_sessions()
    return {"sessions": docs, "max_devices": MAX_DEVICES, "active": len(docs)}


@router.delete("/sessions/{device_id}", dependencies=[Depends(require_manager)])
async def revoke_session(device_id: str):
    r = await db.sessions.delete_many({"scope": "manager", "device_id": device_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}


@router.post("/change-pin")
async def change_pin(req: ChangePinRequest):
    stored = await auth.get_stored_pin()
    if not stored:
        raise HTTPException(status_code=404, detail="No manager registered")
    if req.old_pin != stored:
        raise HTTPException(status_code=401, detail="Current PIN is incorrect")
    auth.validate_pin(req.new_pin, new=True)
    await db.settings.update_one(
        {"key": "manager_profile"}, {"$set": {"pin": req.new_pin}}, upsert=True
    )
    return {"success": True}


@router.post("/recover-pin")
async def recover_pin(req: RecoverPinRequest):
    """Deprecated insecure path — OTP verification is required."""
    raise HTTPException(
        status_code=410,
        detail="PIN recovery requires OTP verification. Use Forgot PIN on the login screen.",
    )


@router.post("/request-otp")
async def request_otp(body: RequestOtpBody):
    p = await auth.get_profile()
    if not p or not p.get("contact_number"):
        raise HTTPException(status_code=404, detail="No manager phone number on record")
    saved = auth.digits(p.get("contact_number"))
    given = auth.digits(body.contact_number)
    if not saved or saved[-7:] != given[-7:]:
        raise HTTPException(status_code=401, detail="Phone number does not match our records")
    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.otps.update_one(
        {"key": "pin_reset"},
        {"$set": {"otp": otp, "contact_last7": saved[-7:], "expires_at": expires.isoformat()}},
        upsert=True,
    )
    masked = f"+91 •••••{saved[-4:]}" if len(saved) >= 4 else "your phone"
    resp = {"success": True, "message": f"OTP sent to {masked}"}
    if DEMO_MODE:
        resp["demo_otp"] = otp
    return resp


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    rec = await db.otps.find_one({"key": "pin_reset"}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested. Please request a new code.")
    try:
        expires = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    if rec.get("contact_last7") != auth.digits(body.contact_number)[-7:]:
        raise HTTPException(status_code=401, detail="Phone number mismatch")
    if rec.get("otp") != body.otp.strip():
        raise HTTPException(status_code=401, detail="Incorrect OTP")
    auth.validate_pin(body.new_pin, new=True)
    await db.settings.update_one(
        {"key": "manager_profile"}, {"$set": {"pin": body.new_pin}}, upsert=True
    )
    await db.otps.delete_one({"key": "pin_reset"})
    return {"success": True}


@router.post("/kitchen-login")
async def kitchen_login(body: KitchenLoginBody):
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    expected = doc.get("kitchen_pin") or ""
    if not expected:
        raise HTTPException(status_code=404, detail="Kitchen PIN not set yet. Ask your manager to configure it.")
    if body.pin != expected:
        raise HTTPException(status_code=401, detail="Incorrect Kitchen PIN")
    return {"success": True, "token": f"kitchen-{uuid.uuid4()}"}


@router.post("/customer-login")
async def customer_login(body: CustomerLoginBody):
    return {"success": True, "token": f"cust-{uuid.uuid4()}"}
