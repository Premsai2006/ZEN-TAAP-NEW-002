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
from app.services.payment_activate import activate_paid_subscription, record_payment
from app.database import db

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
        "autopay_supported": False,  # UPI Autopay / Razorpay Subscriptions not wired yet
    }


@router.post("/create-order")
async def create_razorpay_order(body: RazorpayOrderBody, sess=Depends(require_manager)):
    price = compute_price(body.tables)
    amount_paise = int(round(price["total_with_tax"] * 100))
    client = _razorpay_client()
    rid = sess["restaurant_id"]
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Online payments are not configured yet. Ask ZenTaap support to add Razorpay keys.",
        )
    receipt = f"zt_{rid[:8]}_{uuid.uuid4().hex[:8]}"[:40]
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
        "receipt": receipt,
        "notes": {"restaurant_id": rid, "tables": str(body.tables)},
    })
    # Stash pending checkout intent (tables) until verify
    await rest_svc.update_restaurant(rid, {
        "pending_checkout_tables": body.tables,
        "pending_checkout_order_id": order["id"],
        "pending_checkout_amount_paise": amount_paise,
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
    """Fail-closed: requires Razorpay keys + valid signature. Activates only after verify."""
    client = _razorpay_client()
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Online payments are not configured. Payment cannot be verified.",
        )
    if not body.razorpay_signature or not body.razorpay_order_id or not body.razorpay_payment_id:
        raise HTTPException(
            status_code=400,
            detail="Incomplete payment details. Please complete checkout and try again.",
        )
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

    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    amount_paise = doc.get("pending_checkout_amount_paise")
    tables = doc.get("pending_checkout_tables") or doc.get("subscription_tables")

    # Optional: confirm payment object with Razorpay
    try:
        pay = client.payment.fetch(body.razorpay_payment_id)
        if pay.get("order_id") and pay.get("order_id") != body.razorpay_order_id:
            raise HTTPException(status_code=400, detail="Payment does not match this order.")
        if str(pay.get("status", "")).lower() not in ("captured", "authorized"):
            raise HTTPException(status_code=400, detail="Payment is not completed yet.")
        amount_paise = pay.get("amount", amount_paise)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Razorpay payment.fetch failed (continuing after signature OK): %s", e)

    updated = await activate_paid_subscription(
        rid,
        payment_id=body.razorpay_payment_id,
        order_id=body.razorpay_order_id,
        amount_paise=amount_paise,
        enable_autopay=bool(body.enable_autopay),
        source="verify",
        tables_override=int(tables) if tables else None,
    )
    await rest_svc.update_restaurant(rid, {
        "pending_checkout_tables": None,
        "pending_checkout_order_id": None,
        "pending_checkout_amount_paise": None,
    })
    return {
        "success": True,
        "status": "active",
        "autopay_enabled": bool(updated.get("autopay_enabled")),
        "autopay_ready": False,
        "payment_id": body.razorpay_payment_id,
        "next_cycle_start": updated.get("next_cycle_start"),
        "cycle_start": updated.get("cycle_start"),
    }


@router.get("/history")
async def payment_history(sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    rows = await db.payments.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return {"payments": rows}


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    client = _razorpay_client()
    if not client or not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook not configured.")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing webhook signature.")
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
        oid = entity.get("order_id")
        notes = entity.get("notes") or {}
        rid = notes.get("restaurant_id")
        tables = notes.get("tables")
        amount = entity.get("amount")
        if rid:
            await activate_paid_subscription(
                rid,
                payment_id=pid,
                order_id=oid,
                amount_paise=amount,
                enable_autopay=True,
                source="webhook",
                tables_override=int(tables) if tables else None,
            )
        else:
            logger.warning("Webhook missing restaurant_id notes; payment %s ignored", pid)
            await record_payment(
                restaurant_id="unknown",
                payment_id=pid,
                order_id=oid,
                amount_paise=amount,
                status="unmapped",
                source="webhook",
                raw={"event": event},
            )
    elif event in ("payment.failed", "subscription.halted"):
        entity = ((data.get("payload") or {}).get("payment") or {}).get("entity", {})
        notes = entity.get("notes") or {}
        rid = notes.get("restaurant_id")
        if rid:
            await rest_svc.update_restaurant(rid, {"payment_status": "failed"})
            await record_payment(
                restaurant_id=rid,
                payment_id=entity.get("id"),
                order_id=entity.get("order_id"),
                amount_paise=entity.get("amount"),
                status="failed",
                source="webhook",
            )
    return {"received": True, "event": event}
