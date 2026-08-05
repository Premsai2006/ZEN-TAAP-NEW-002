import uuid
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response, Depends

from app.config import MAX_DEVICES, DEMO_MODE
from app.database import db
from app.deps import require_manager, extract_manager_token, set_manager_cookie, clear_manager_cookie
from app.models import (
    LoginRequest, SignupRequest, ChangePinRequest, RecoverPinRequest,
    RequestOtpBody, VerifyOtpBody, KitchenLoginBody, CustomerLoginBody,
)
from app.services import auth_service as auth
from app.services import restaurants as rest_svc

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
async def auth_status():
    # Multi-tenant: always allow signup + login; FE no longer gates on setup_complete.
    count = await db.restaurants.count_documents({})
    return {
        "setup_complete": count > 0,
        "multi_tenant": True,
        "restaurant_count": count,
    }


@router.post("/signup")
async def signup(req: SignupRequest, request: Request, response: Response):
    if not req.manager_name.strip():
        raise HTTPException(status_code=400, detail="Please enter the manager's name.")
    if not req.restaurant_name.strip():
        raise HTTPException(status_code=400, detail="Please enter your restaurant name.")
    digs = auth.digits(req.contact_number)
    if len(digs) < 7:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number.")
    auth.validate_pin(req.pin, new=True)

    slug_src = req.slug or req.restaurant_name
    slug = rest_svc.validate_slug(slug_src)
    if await rest_svc.get_by_slug(slug):
        raise HTTPException(status_code=400, detail="That URL name is already taken. Please choose another.")

    phone_key = rest_svc.phone_key(req.contact_number)
    if len(phone_key) < 7:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number.")
    if await rest_svc.get_by_phone(req.contact_number):
        raise HTTPException(
            status_code=400,
            detail="An account with this phone number already exists. Please log in instead.",
        )

    rid = str(uuid.uuid4())
    contact = req.contact_number.strip()
    doc = {
        "id": rid,
        "slug": slug,
        "manager_name": req.manager_name.strip(),
        "restaurant_name": req.restaurant_name.strip(),
        "contact_number": contact,
        "phone": contact,
        "phone_key": phone_key,
        "email": (req.email or "").strip(),
        "pin": req.pin,
        "logo_url": "",
        "gst_number": "",
        "gst_rate": None,
        "address": "",
        "printer_type": "browser",
        "theme": "dark",
        "kitchen_pin": "",
        "customer_pin": "",
        "subscription_status": "none",
        "autopay_enabled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.restaurants.insert_one(doc)

    sess = await auth.register_session(rid, None, "Signup device")
    set_manager_cookie(response, sess["token"])
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": rid,
        "slug": slug,
        "device_id": sess["device_id"],
        "active_devices": sess["active_devices"],
        "max_devices": MAX_DEVICES,
    }


@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    await auth.check_login_lockout(request)
    auth.validate_pin(req.pin, new=False)

    if not req.contact_number or len(auth.digits(req.contact_number)) < 7:
        raise HTTPException(status_code=400, detail="Please enter your phone number.")

    restaurant = await rest_svc.get_by_phone(req.contact_number)
    if not restaurant or not restaurant.get("pin"):
        await auth.record_login_failure(request)

    if req.pin != restaurant.get("pin"):
        await auth.record_login_failure(request)

    await auth.clear_login_failures(request)
    sess = await auth.register_session(restaurant["id"], req.device_id, req.device_label)
    set_manager_cookie(response, sess["token"])
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": restaurant["id"],
        "slug": restaurant.get("slug"),
        "device_id": sess["device_id"],
        "active_devices": sess["active_devices"],
        "max_devices": MAX_DEVICES,
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = extract_manager_token(request)
    if token:
        await db.sessions.delete_one({"token": token})
    clear_manager_cookie(response)
    return {"success": True}


@router.get("/sessions")
async def list_sessions(sess=Depends(require_manager)):
    docs = await auth.list_unique_sessions(sess["restaurant_id"])
    return {"sessions": docs, "max_devices": MAX_DEVICES, "active": len(docs)}


@router.delete("/sessions/{device_id}")
async def revoke_session(device_id: str, sess=Depends(require_manager)):
    r = await db.sessions.delete_many({
        "scope": "manager",
        "restaurant_id": sess["restaurant_id"],
        "device_id": device_id,
    })
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="That device was already signed out.")
    return {"success": True}


@router.post("/change-pin")
async def change_pin(req: ChangePinRequest, sess=Depends(require_manager)):
    restaurant = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    if req.old_pin != restaurant.get("pin"):
        raise HTTPException(status_code=401, detail="Current PIN is incorrect. Please try again.")
    auth.validate_pin(req.new_pin, new=True)
    await rest_svc.update_restaurant(sess["restaurant_id"], {"pin": req.new_pin})
    return {"success": True}


@router.post("/recover-pin")
async def recover_pin(req: RecoverPinRequest):
    raise HTTPException(
        status_code=410,
        detail="PIN recovery now uses OTP. Please use Forgot PIN on the login screen.",
    )


@router.post("/request-otp")
async def request_otp(body: RequestOtpBody):
    restaurant = await rest_svc.get_by_phone(body.contact_number)
    if not restaurant or not restaurant.get("contact_number"):
        raise HTTPException(status_code=404, detail="No phone number is saved on this account.")
    saved = auth.digits(restaurant.get("contact_number"))
    given = auth.digits(body.contact_number)
    if not saved or saved[-7:] != given[-7:]:
        raise HTTPException(status_code=401, detail="That phone number does not match our records.")
    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.otps.update_one(
        {"key": f"pin_reset:{restaurant['id']}"},
        {"$set": {
            "otp": otp,
            "restaurant_id": restaurant["id"],
            "contact_last7": saved[-7:],
            "expires_at": expires.isoformat(),
        }},
        upsert=True,
    )
    masked = f"+91 •••••{saved[-4:]}" if len(saved) >= 4 else "your phone"
    resp = {"success": True, "message": f"Code sent to {masked}"}
    if DEMO_MODE:
        resp["demo_otp"] = otp
    return resp


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    restaurant = await rest_svc.get_by_phone(body.contact_number)
    if not restaurant:
        raise HTTPException(status_code=404, detail="No account found with that phone number.")
    rec = await db.otps.find_one({"key": f"pin_reset:{restaurant['id']}"}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP requested. Please request a new code.")
    try:
        expires = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    if rec.get("contact_last7") != auth.digits(body.contact_number)[-7:]:
        raise HTTPException(status_code=401, detail="That phone number does not match our records.")
    if rec.get("otp") != body.otp.strip():
        raise HTTPException(status_code=401, detail="Incorrect OTP. Please try again.")
    auth.validate_pin(body.new_pin, new=True)
    await rest_svc.update_restaurant(restaurant["id"], {"pin": body.new_pin})
    await db.otps.delete_one({"key": f"pin_reset:{restaurant['id']}"})
    return {"success": True}


@router.post("/kitchen-login")
async def kitchen_login(body: KitchenLoginBody):
    if not body.slug:
        raise HTTPException(status_code=400, detail="Please open the kitchen page for your restaurant.")
    restaurant = await rest_svc.require_by_slug(body.slug)
    expected = restaurant.get("kitchen_pin") or ""
    if not expected:
        raise HTTPException(status_code=404, detail="Kitchen PIN is not set yet. Ask your manager to set one up.")
    if body.pin != expected:
        raise HTTPException(status_code=401, detail="Incorrect Kitchen PIN. Please try again.")
    sess = await auth.register_session(
        restaurant["id"], None, "Kitchen display", scope="kitchen"
    )
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": restaurant["id"],
        "slug": restaurant.get("slug"),
    }


@router.post("/customer-login")
async def customer_login(body: CustomerLoginBody):
    return {"success": True, "token": f"cust-{uuid.uuid4()}"}
