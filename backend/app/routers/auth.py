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
    SignupOtpBody, StaffCreateBody, StaffActiveBody, StaffPinBody,
)
from app.services import auth_service as auth
from app.services import restaurants as rest_svc
from app.services import staff as staff_svc
from app.services.pins import hash_pin, verify_pin, needs_rehash
from app.deps import require_manager, extract_manager_token, set_manager_cookie, clear_manager_cookie, assert_role
from app.services.sms import deliver_pin_reset_otp, otp_delivery_configured, smtp_configured, twofactor_configured

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


@router.post("/signup/request-otp")
async def signup_request_otp(body: SignupOtpBody):
    digs = auth.digits(body.contact_number)
    if len(digs) < 7:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number.")
    phone_key = rest_svc.phone_key(body.contact_number)
    if await rest_svc.get_by_phone(body.contact_number):
        raise HTTPException(
            status_code=400,
            detail="An account with this phone number already exists. Please log in instead.",
        )
    to_email = (body.email or "").strip()
    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    sent_ok, channel, masked = False, "none", None
    if otp_delivery_configured():
        sent_ok, channel, masked = await deliver_pin_reset_otp(
            phone_digits=digs,
            email=to_email,
            otp=otp,
            restaurant_name="ZenTaap",
        )
    await db.otps.update_one(
        {"key": f"signup:{phone_key}"},
        {"$set": {
            "otp": otp,
            "phone_key": phone_key,
            "email": to_email,
            "expires_at": expires.isoformat(),
            "channel": channel,
        }},
        upsert=True,
    )
    resp = {
        "success": True,
        "message": f"Code sent to {masked or 'your phone or email'}" if sent_ok else "Code generated.",
        "channel": channel if sent_ok else "none",
    }
    if DEMO_MODE:
        resp["demo_otp"] = otp
        if not sent_ok:
            resp["message"] = "Demo code generated. Use it to verify this phone number."
        return resp
    if not otp_delivery_configured():
        raise HTTPException(
            status_code=503,
            detail="OTP is not configured. Set TWOFACTOR_API_KEY or SMTP on the server.",
        )
    if not sent_ok:
        raise HTTPException(status_code=502, detail="Could not send the OTP. Please try again.")
    return resp


async def _consume_signup_otp(contact: str, otp: str):
    phone_key = rest_svc.phone_key(contact)
    rec = await db.otps.find_one({"key": f"signup:{phone_key}"}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Please request a verification code first.")
    try:
        expires = datetime.fromisoformat(rec["expires_at"].replace("Z", "+00:00"))
    except Exception:
        expires = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new code.")
    if rec.get("otp") != (otp or "").strip():
        raise HTTPException(status_code=401, detail="Incorrect OTP. Please try again.")
    await db.otps.delete_one({"key": f"signup:{phone_key}"})


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
    await _consume_signup_otp(req.contact_number, req.otp)

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
        "pin": hash_pin(req.pin),
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
    await staff_svc.ensure_owner(doc)

    sess = await auth.register_session(rid, None, "Signup device", role="owner")
    set_manager_cookie(response, sess["token"])
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": rid,
        "slug": slug,
        "device_id": sess["device_id"],
        "active_devices": sess["active_devices"],
        "max_devices": MAX_DEVICES,
        "role": "owner",
        "landing": "manager",
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

    matched = await staff_svc.match_login(restaurant, req.pin)
    if not matched:
        await auth.record_login_failure(request)
    if restaurant.get("suspended"):
        raise HTTPException(
            status_code=403,
            detail="This restaurant is suspended. Contact ZenTaap support.",
        )

    if matched["role"] == "owner" and needs_rehash(restaurant.get("pin")):
        await rest_svc.update_restaurant(restaurant["id"], {"pin": hash_pin(req.pin)})

    await auth.clear_login_failures(request)
    landing = "kitchen" if matched["role"] == "kitchen" else "manager"
    scope = "kitchen" if matched["role"] == "kitchen" else "manager"
    sess = await auth.register_session(
        restaurant["id"],
        req.device_id,
        req.device_label,
        scope=scope,
        staff_id=matched["staff_id"],
        role=matched["role"],
    )
    if scope == "manager":
        set_manager_cookie(response, sess["token"])
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": restaurant["id"],
        "slug": restaurant.get("slug"),
        "device_id": sess["device_id"],
        "active_devices": sess["active_devices"],
        "max_devices": MAX_DEVICES,
        "role": matched["role"],
        "staff_name": matched["name"],
        "landing": landing,
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
    assert_role(sess, "owner")
    restaurant = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    if not verify_pin(req.old_pin, restaurant.get("pin")):
        raise HTTPException(status_code=401, detail="Current PIN is incorrect. Please try again.")
    auth.validate_pin(req.new_pin, new=True)
    await rest_svc.update_restaurant(sess["restaurant_id"], {"pin": hash_pin(req.new_pin)})
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
    if rest_svc.phone_key(saved) != rest_svc.phone_key(given):
        raise HTTPException(status_code=401, detail="That phone number does not match our records.")

    to_email = (restaurant.get("email") or "").strip()
    if not twofactor_configured() and smtp_configured() and (not to_email or "@" not in to_email):
        raise HTTPException(
            status_code=400,
            detail="No email is saved on this account. Add an email in Profile, then try Forgot PIN again.",
        )

    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)

    sent_ok, channel, masked = False, "none", None
    if otp_delivery_configured():
        sent_ok, channel, masked = await deliver_pin_reset_otp(
            phone_digits=saved,
            email=to_email,
            otp=otp,
            restaurant_name=restaurant.get("restaurant_name") or "",
        )

    await db.otps.update_one(
        {"key": f"pin_reset:{restaurant['id']}"},
        {"$set": {
            "otp": otp,
            "restaurant_id": restaurant["id"],
            "contact_last7": saved[-7:],
            "expires_at": expires.isoformat(),
            "channel": channel,
            "email": to_email if channel == "email" else "",
            "phone": saved[-10:] if channel == "sms" else "",
        }},
        upsert=True,
    )

    if channel == "sms":
        dest_msg = f"Code sent to {masked or 'your phone'}"
    elif channel == "email":
        dest_msg = f"Code sent to {masked or 'your email'}"
    else:
        dest_msg = "Code generated."

    resp = {
        "success": True,
        "message": dest_msg,
        "channel": channel if sent_ok else "none",
        "sms_delivered": bool(sent_ok and channel == "sms"),
        "email_delivered": bool(sent_ok and channel == "email"),
    }
    if DEMO_MODE:
        resp["demo_otp"] = otp
        if not sent_ok:
            resp["message"] = "Demo code generated. Add TWOFACTOR_API_KEY to send a real SMS."
        return resp
    if not otp_delivery_configured():
        raise HTTPException(
            status_code=503,
            detail="OTP SMS is not configured. Set TWOFACTOR_API_KEY on the server.",
        )
    if not sent_ok:
        raise HTTPException(
            status_code=502,
            detail="Could not send the OTP. Check TWOFACTOR_API_KEY (and DLT template if required) and try again.",
        )
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
    if rec.get("phone_key") and rec.get("phone_key") != rest_svc.phone_key(body.contact_number):
        raise HTTPException(status_code=401, detail="That phone number does not match our records.")
    elif rec.get("contact_last7") and rec.get("contact_last7") != auth.digits(body.contact_number)[-7:]:
        raise HTTPException(status_code=401, detail="That phone number does not match our records.")
    if rec.get("otp") != body.otp.strip():
        raise HTTPException(status_code=401, detail="Incorrect OTP. Please try again.")
    auth.validate_pin(body.new_pin, new=True)
    await rest_svc.update_restaurant(restaurant["id"], {"pin": hash_pin(body.new_pin)})
    await db.otps.delete_one({"key": f"pin_reset:{restaurant['id']}"})
    return {"success": True}


@router.post("/kitchen-login")
async def kitchen_login(body: KitchenLoginBody):
    if not body.slug:
        raise HTTPException(status_code=400, detail="Please open the kitchen page for your restaurant.")
    restaurant = await rest_svc.require_by_slug(body.slug)
    if restaurant.get("suspended"):
        raise HTTPException(
            status_code=403,
            detail="This restaurant is suspended. Contact ZenTaap support.",
        )
    expected = restaurant.get("kitchen_pin") or ""
    staff_rec = None
    if expected and verify_pin(body.pin, expected):
        if needs_rehash(expected):
            await rest_svc.update_restaurant(restaurant["id"], {"kitchen_pin": hash_pin(body.pin)})
    else:
        staff_rec = await staff_svc.match_kitchen_staff(restaurant["id"], body.pin)
        if not staff_rec:
            has_staff = await db.staff.find_one(
                {"restaurant_id": restaurant["id"], "role": "kitchen", "active": True},
                {"_id": 1},
            )
            if not expected and not has_staff:
                raise HTTPException(
                    status_code=404,
                    detail="Kitchen PIN is not set yet. Ask your manager to set one up.",
                )
            raise HTTPException(status_code=401, detail="Incorrect Kitchen PIN. Please try again.")
    sess = await auth.register_session(
        restaurant["id"],
        None,
        (staff_rec.get("name") if staff_rec else None) or "Kitchen display",
        scope="kitchen",
        staff_id=staff_rec["id"] if staff_rec else None,
        role="kitchen",
    )
    return {
        "success": True,
        "token": sess["token"],
        "restaurant_id": restaurant["id"],
        "slug": restaurant.get("slug"),
        "role": "kitchen",
        "landing": "kitchen",
    }


@router.get("/me")
async def auth_me(sess=Depends(require_manager)):
    doc = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    role = sess.get("role") or "owner"
    staff_name = doc.get("manager_name") or "Owner"
    if sess.get("staff_id"):
        rec = await db.staff.find_one({"id": sess["staff_id"]}, {"_id": 0, "name": 1})
        if rec and rec.get("name"):
            staff_name = rec["name"]
    return {
        "restaurant_id": sess["restaurant_id"],
        "slug": doc.get("slug") or "",
        "role": role,
        "staff_id": sess.get("staff_id") or "",
        "staff_name": staff_name,
        "restaurant_name": doc.get("restaurant_name") or "",
        "suspended": bool(doc.get("suspended")),
    }


@router.get("/staff")
async def list_staff(sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager")
    await staff_svc.ensure_owner(await rest_svc.require_restaurant_id(sess["restaurant_id"]))
    return {"staff": await staff_svc.list_staff(sess["restaurant_id"])}


@router.post("/staff")
async def create_staff(body: StaffCreateBody, sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager")
    return await staff_svc.create_staff(
        sess["restaurant_id"], name=body.name, role=body.role, pin=body.pin,
    )


@router.put("/staff/{staff_id}/active")
async def set_staff_active(staff_id: str, body: StaffActiveBody, sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager")
    return await staff_svc.set_staff_active(sess["restaurant_id"], staff_id, body.active)


@router.put("/staff/{staff_id}/pin")
async def reset_staff_pin(staff_id: str, body: StaffPinBody, sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager")
    return await staff_svc.reset_staff_pin(sess["restaurant_id"], staff_id, body.pin)


@router.post("/customer-login")
async def customer_login(body: CustomerLoginBody):
    raise HTTPException(
        status_code=410,
        detail="Customer PIN login is not used. Guests order via the restaurant QR link.",
    )
