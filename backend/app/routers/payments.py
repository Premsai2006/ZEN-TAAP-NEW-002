import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends

from app.config import (
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_PAYMENT_LINK,
)
from app.models import RazorpayOrderBody, VerifyPaymentBody
from app.services.pricing import compute_price
from app.deps import require_manager
from app.services import restaurants as rest_svc

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


def _razorpay_client():
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        return None
    try:
        import razorpay
        return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    except Exception as e:
        logger.warning("Razorpay client init failed: %s", e)
        return None


@router.get("/config")
async def payments_config():
    return {
        "key_id": RAZORPAY_KEY_ID or "",
        "configured": bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET),
        "fallback_link": RAZORPAY_PAYMENT_LINK,
    }


@router.post("/create-order")
async def create_razorpay_order(body: RazorpayOrderBody, sess=Depends(require_manager)):
    price = compute_price(body.tables)
    amount_paise = int(round(price["total_with_tax"] * 100))
    client = _razorpay_client()
    rid = sess["restaurant_id"]
    if not client:
        return {
            "configured": False,
            "fallback_link": RAZORPAY_PAYMENT_LINK,
            "amount": amount_paise,
            "currency": "INR",
            "restaurant_id": rid,
            "note": "Razorpay API keys not configured — using public payment-page redirect (no autopay).",
        }
    receipt = f"zt_{rid[:8]}_{uuid.uuid4().hex[:8]}"[:40]
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
        "receipt": receipt,
        "notes": {"restaurant_id": rid, "tables": str(body.tables)},
    })
    return {
        "configured": True,
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "restaurant_id": rid,
    }


@router.post("/verify")
async def verify_razorpay_payment(body: VerifyPaymentBody, sess=Depends(require_manager)):
    client = _razorpay_client()
    if client and body.razorpay_signature:
        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            })
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Payment could not be verified. Please try again or contact support.",
            )

    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "subscription_status": "active",
        "last_payment_id": body.razorpay_payment_id,
        "last_payment_order_id": body.razorpay_order_id,
        "last_payment_at": now_iso,
        "autopay_enabled": bool(body.enable_autopay),
    }
    await rest_svc.update_restaurant(sess["restaurant_id"], update)
    return {
        "success": True,
        "status": "active",
        "autopay_enabled": update["autopay_enabled"],
        "payment_id": body.razorpay_payment_id,
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    client = _razorpay_client()
    if client and RAZORPAY_WEBHOOK_SECRET and sig:
        try:
            client.utility.verify_webhook_signature(payload.decode(), sig, RAZORPAY_WEBHOOK_SECRET)
        except Exception:
            raise HTTPException(status_code=400, detail="Payment webhook could not be verified.")
    try:
        import json as _json
        data = _json.loads(payload.decode() or "{}")
    except Exception:
        data = {}
    event = data.get("event", "")
    if event in ("payment.captured", "subscription.charged"):
        entity = ((data.get("payload") or {}).get("payment") or {}).get("entity", {})
        pid = entity.get("id")
        notes = entity.get("notes") or {}
        rid = notes.get("restaurant_id")
        update = {
            "subscription_status": "active",
            "last_payment_id": pid,
            "last_payment_at": datetime.now(timezone.utc).isoformat(),
            "autopay_enabled": True,
        }
        if rid:
            await rest_svc.update_restaurant(rid, update)
        else:
            logger.warning("Webhook missing restaurant_id notes; payment %s ignored for tenant update", pid)
    return {"received": True, "event": event}
