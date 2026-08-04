import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from app.config import (
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_PAYMENT_LINK,
)
from app.database import db
from app.models import RazorpayOrderBody, VerifyPaymentBody
from app.services.pricing import compute_price

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
async def create_razorpay_order(body: RazorpayOrderBody):
    price = compute_price(body.tables)
    amount_paise = int(round(price["total_with_tax"] * 100))
    client = _razorpay_client()
    if not client:
        return {
            "configured": False,
            "fallback_link": RAZORPAY_PAYMENT_LINK,
            "amount": amount_paise,
            "currency": "INR",
            "note": "Razorpay API keys not configured — using public payment-page redirect (no autopay).",
        }
    receipt = f"zentaap_{uuid.uuid4().hex[:16]}"[:40]
    order = client.order.create(
        {"amount": amount_paise, "currency": "INR", "payment_capture": 1, "receipt": receipt}
    )
    return {
        "configured": True,
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
    }


@router.post("/verify")
async def verify_razorpay_payment(body: VerifyPaymentBody):
    client = _razorpay_client()
    if client and body.razorpay_signature:
        try:
            client.utility.verify_payment_signature({
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            })
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Signature verification failed: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()
    update = {
        "subscription_status": "active",
        "last_payment_id": body.razorpay_payment_id,
        "last_payment_order_id": body.razorpay_order_id,
        "last_payment_at": now_iso,
        "autopay_enabled": bool(body.enable_autopay),
    }
    await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
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
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Webhook signature invalid: {e}")
    try:
        import json as _json
        data = _json.loads(payload.decode() or "{}")
    except Exception:
        data = {}
    event = data.get("event", "")
    if event in ("payment.captured", "subscription.charged"):
        pid = ((data.get("payload") or {}).get("payment") or {}).get("entity", {}).get("id")
        await db.settings.update_one(
            {"key": "restaurant"},
            {"$set": {
                "subscription_status": "active",
                "last_payment_id": pid,
                "last_payment_at": datetime.now(timezone.utc).isoformat(),
                "autopay_enabled": True,
            }},
        )
    return {"received": True, "event": event}
