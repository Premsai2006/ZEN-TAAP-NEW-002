import logging
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends

from app.config import (
    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, RAZORPAY_PAYMENT_LINK,
)
from app.models import RazorpayOrderBody, VerifyPaymentBody, VerifySubscriptionBody
from app.services.pricing import compute_price, compute_upgrade_proration, compute_price_for_restaurant
from app.deps import require_manager
from app.services import restaurants as rest_svc
from app.services.payment_activate import activate_paid_subscription, record_payment
from app.services.razorpay_client import razorpay_client, razorpay_configured
from app.services.razorpay_subscriptions import (
    create_checkout_subscription,
    create_upgrade_subscription,
    verify_subscription_signature,
    fetch_subscription,
)
from app.database import db
from app.services.subscription_access import refresh_subscription_status

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)


def _extract_payment_entity(data: dict) -> dict:
    return ((data.get("payload") or {}).get("payment") or {}).get("entity", {}) or {}


def _extract_subscription_entity(data: dict) -> dict:
    return ((data.get("payload") or {}).get("subscription") or {}).get("entity", {}) or {}


@router.get("/config")
async def payments_config():
    return {
        "key_id": RAZORPAY_KEY_ID or "",
        "configured": razorpay_configured(),
        "fallback_link": RAZORPAY_PAYMENT_LINK,
        "autopay_supported": razorpay_configured(),
        "subscription_checkout": True,
    }


@router.post("/create-subscription")
async def create_razorpay_subscription(body: RazorpayOrderBody, sess=Depends(require_manager)):
    """Create a Razorpay Subscription for monthly recurring billing (or mid-cycle upgrade)."""
    if not razorpay_configured():
        raise HTTPException(
            status_code=503,
            detail="Online payments are not configured yet. Ask ZenTaap support to add Razorpay keys.",
        )
    rid = sess["restaurant_id"]
    try:
        doc, status = await refresh_subscription_status(rid)
        current = int(doc.get("subscription_tables") or 0)
        # Mid-cycle table increase → one checkout: proration addon + new higher mandate
        if status == "active" and current > 0 and int(body.tables) > current:
            checkout, _sub = await create_upgrade_subscription(rid, tables=body.tables)
        else:
            checkout, _sub = await create_checkout_subscription(rid, tables=body.tables)
    except Exception as exc:
        logger.exception("create-subscription failed rid=%s", rid)
        raise HTTPException(status_code=502, detail=f"Could not start subscription checkout: {exc}") from exc

    return {
        "configured": True,
        "key_id": RAZORPAY_KEY_ID,
        **checkout,
    }


@router.post("/create-order")
async def create_razorpay_order(body: RazorpayOrderBody, sess=Depends(require_manager)):
    """One-time order — used for mid-cycle upgrade proration (legacy renew also works)."""
    client = razorpay_client()
    rid = sess["restaurant_id"]
    if not client:
        raise HTTPException(
            status_code=503,
            detail="Online payments are not configured yet. Ask ZenTaap support to add Razorpay keys.",
        )

    doc, status = await refresh_subscription_status(rid)
    current_tables = doc.get("subscription_tables")
    kind = "subscription"
    preserve_cycle = False
    next_cycle_keep = None
    proration = None

    if (
        status == "active"
        and current_tables
        and int(body.tables) > int(current_tables)
    ):
        proration = compute_upgrade_proration(
            int(current_tables),
            int(body.tables),
            doc.get("next_cycle_start"),
            restaurant=doc,
        )
        amount_paise = proration["amount_paise"]
        kind = proration["kind"]
        preserve_cycle = bool(proration.get("preserve_cycle"))
        next_cycle_keep = proration.get("next_cycle_start")
        price_note = proration
    else:
        price = compute_price_for_restaurant(body.tables, doc)
        amount_paise = int(price["amount_paise"])
        price_note = price
        if price.get("billing_override"):
            kind = "monthly_mandate"
    if amount_paise < 100:
        amount_paise = 100

    receipt = f"zt_{rid[:8]}_{uuid.uuid4().hex[:8]}"[:40]
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
        "receipt": receipt,
        "notes": {
            "restaurant_id": rid,
            "tables": str(body.tables),
            "kind": kind,
            "preserve_cycle": "1" if preserve_cycle else "0",
        },
    })
    await rest_svc.update_restaurant(rid, {
        "pending_checkout_tables": body.tables,
        "pending_checkout_order_id": order["id"],
        "pending_checkout_amount_paise": amount_paise,
        "pending_checkout_kind": kind,
        "pending_checkout_preserve_cycle": preserve_cycle,
        "pending_checkout_next_cycle": next_cycle_keep,
    })
    return {
        "configured": True,
        "mode": "order",
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
        "restaurant_id": rid,
        "kind": kind,
        "preserve_cycle": preserve_cycle,
        "proration": proration,
        "pricing": price_note if not proration else None,
    }


@router.post("/verify-subscription")
async def verify_razorpay_subscription(body: VerifySubscriptionBody, sess=Depends(require_manager)):
    """Verify first/recurring subscription payment signature and activate access."""
    if not razorpay_configured():
        raise HTTPException(status_code=503, detail="Online payments are not configured.")
    if not body.razorpay_subscription_id or not body.razorpay_payment_id:
        raise HTTPException(status_code=400, detail="Incomplete subscription payment details.")

    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    known_subs = {
        s for s in (
            doc.get("razorpay_subscription_id"),
            doc.get("pending_checkout_subscription_id"),
        ) if s
    }
    if known_subs and body.razorpay_subscription_id not in known_subs:
        raise HTTPException(status_code=400, detail="Subscription does not match this account.")

    signature_ok = False
    if body.razorpay_signature:
        try:
            verify_subscription_signature(
                razorpay_subscription_id=body.razorpay_subscription_id,
                razorpay_payment_id=body.razorpay_payment_id,
                razorpay_signature=body.razorpay_signature,
            )
            signature_ok = True
        except Exception as exc:
            logger.warning(
                "Subscription signature verify failed (will try payment.fetch fallback): %s",
                exc,
            )

    amount_paise = doc.get("pending_checkout_amount_paise")
    tables = doc.get("pending_checkout_tables") or doc.get("subscription_tables")
    payment_kind = doc.get("pending_checkout_kind") or "monthly_mandate"
    preserve_cycle = bool(doc.get("pending_checkout_preserve_cycle"))
    next_cycle_keep = doc.get("pending_checkout_next_cycle")
    already_active = str(doc.get("subscription_status") or "").lower() == "active"
    keep_cycle = preserve_cycle or (already_active and payment_kind == "upgrade_proration")

    client = razorpay_client()
    pay = None
    if client:
        try:
            pay = client.payment.fetch(body.razorpay_payment_id)
            pay_status = str(pay.get("status", "")).lower()
            if pay_status not in ("captured", "authorized"):
                raise HTTPException(status_code=400, detail="Payment is not completed yet.")
            amount_paise = pay.get("amount", amount_paise)
            pay_sub = (pay.get("subscription_id") or "").strip()
            if pay_sub and pay_sub != body.razorpay_subscription_id:
                raise HTTPException(status_code=400, detail="Payment does not belong to this subscription.")
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("payment.fetch failed after subscription verify: %s", exc)
            pay = None

    # Signature missing/wrong but Razorpay confirms captured payment for this sub → still activate
    if not signature_ok:
        if not pay or str(pay.get("status", "")).lower() not in ("captured", "authorized"):
            raise HTTPException(status_code=400, detail="Subscription payment could not be verified.")
        logger.info(
            "Activated via payment.fetch fallback restaurant=%s payment=%s",
            rid,
            body.razorpay_payment_id,
        )

    updated = await activate_paid_subscription(
        rid,
        payment_id=body.razorpay_payment_id,
        order_id=None,
        subscription_id=body.razorpay_subscription_id,
        amount_paise=amount_paise,
        enable_autopay=True,
        source="verify_subscription",
        tables_override=int(tables) if tables else None,
        preserve_cycle=keep_cycle,
        next_cycle_override=(next_cycle_keep or doc.get("next_cycle_start")) if keep_cycle else None,
        payment_kind=payment_kind,
    )

    sub_meta = fetch_subscription(body.razorpay_subscription_id) or {}
    sub_status = str(sub_meta.get("status") or "").lower()
    mandate_ready = sub_status in ("active", "authenticated")

    await rest_svc.update_restaurant(rid, {
        "pending_checkout_tables": None,
        "pending_checkout_order_id": None,
        "pending_checkout_amount_paise": None,
        "pending_checkout_subscription_id": None,
        "pending_checkout_kind": None,
        "pending_checkout_preserve_cycle": None,
        "pending_checkout_next_cycle": None,
        "razorpay_subscription_id": body.razorpay_subscription_id,
        "autopay_enabled": True,
        "autopay_ready": mandate_ready,
        "razorpay_subscription_status": sub_status or "created",
    })
    return {
        "success": True,
        "status": "active",
        "autopay_enabled": True,
        "autopay_ready": mandate_ready,
        "mandate": True,
        "subscription_status": sub_status or None,
        "payment_id": body.razorpay_payment_id,
        "subscription_id": body.razorpay_subscription_id,
        "next_cycle_start": updated.get("next_cycle_start"),
        "cycle_start": updated.get("cycle_start"),
        "tables": updated.get("subscription_tables"),
        "payment_kind": payment_kind,
        "preserve_cycle": keep_cycle,
        "amount_paise": amount_paise,
        "message": (
            f"Upgrade unlocked. Autopay is now set for {tables} tables from the next cycle."
            if payment_kind == "upgrade_proration"
            else "Monthly autopay mandate is active. ZenTaap will auto-deduct each billing cycle."
        ),
    }


@router.post("/verify")
async def verify_razorpay_payment(body: VerifyPaymentBody, sess=Depends(require_manager)):
    """Legacy one-time order verify — prefer /verify-subscription."""
    client = razorpay_client()
    if not client:
        raise HTTPException(status_code=503, detail="Online payments are not configured.")
    if not body.razorpay_signature or not body.razorpay_order_id or not body.razorpay_payment_id:
        raise HTTPException(status_code=400, detail="Incomplete payment details.")

    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
        })
    except Exception:
        raise HTTPException(status_code=400, detail="Payment could not be verified.")

    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    amount_paise = doc.get("pending_checkout_amount_paise")
    tables = doc.get("pending_checkout_tables") or doc.get("subscription_tables")
    preserve_cycle = bool(doc.get("pending_checkout_preserve_cycle"))
    next_cycle_keep = doc.get("pending_checkout_next_cycle")
    payment_kind = doc.get("pending_checkout_kind") or "subscription"

    try:
        pay = client.payment.fetch(body.razorpay_payment_id)
        if pay.get("order_id") and pay.get("order_id") != body.razorpay_order_id:
            raise HTTPException(status_code=400, detail="Payment does not match this order.")
        if str(pay.get("status", "")).lower() not in ("captured", "authorized"):
            raise HTTPException(status_code=400, detail="Payment is not completed yet.")
        amount_paise = pay.get("amount", amount_paise)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Razorpay payment.fetch failed: %s", exc)

    updated = await activate_paid_subscription(
        rid,
        payment_id=body.razorpay_payment_id,
        order_id=body.razorpay_order_id,
        amount_paise=amount_paise,
        enable_autopay=bool(body.enable_autopay),
        source="verify",
        tables_override=int(tables) if tables else None,
        preserve_cycle=preserve_cycle,
        next_cycle_override=next_cycle_keep,
        payment_kind=payment_kind,
    )
    # Mid-cycle upgrades now use create-subscription (addon + new mandate) in one checkout.
    # Legacy one-time order path: just unlock tables; do not open a second mandate step.
    await rest_svc.update_restaurant(rid, {
        "pending_checkout_tables": None,
        "pending_checkout_order_id": None,
        "pending_checkout_amount_paise": None,
        "pending_checkout_kind": None,
        "pending_checkout_preserve_cycle": None,
        "pending_checkout_next_cycle": None,
    })
    return {
        "success": True,
        "status": "active",
        "autopay_enabled": bool(updated.get("autopay_enabled")),
        "autopay_ready": bool(updated.get("autopay_ready")),
        "payment_id": body.razorpay_payment_id,
        "next_cycle_start": updated.get("next_cycle_start"),
        "cycle_start": updated.get("cycle_start"),
        "tables": updated.get("subscription_tables"),
        "payment_kind": payment_kind,
        "preserve_cycle": preserve_cycle,
        "amount_paise": amount_paise,
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
    client = razorpay_client()
    if not client or not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook not configured.")
    if not sig:
        raise HTTPException(status_code=400, detail="Missing webhook signature.")
    try:
        client.utility.verify_webhook_signature(payload.decode(), sig, RAZORPAY_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Payment webhook could not be verified.")

    import json as _json
    try:
        data = _json.loads(payload.decode() or "{}")
    except Exception:
        data = {}

    event = data.get("event", "")
    logger.info("Razorpay webhook event=%s", event)

    if event in ("subscription.activated", "subscription.charged", "payment.captured"):
        entity = _extract_payment_entity(data)
        sub_entity = _extract_subscription_entity(data)
        pid = entity.get("id")
        oid = entity.get("order_id")
        sub_id = entity.get("subscription_id") or sub_entity.get("id")
        notes = entity.get("notes") or sub_entity.get("notes") or {}
        rid = notes.get("restaurant_id")
        tables = notes.get("tables")
        amount = entity.get("amount")

        if not rid and sub_id:
            doc = await db.restaurants.find_one(
                {
                    "$or": [
                        {"razorpay_subscription_id": sub_id},
                        {"pending_checkout_subscription_id": sub_id},
                    ]
                },
                {"_id": 0, "id": 1},
            )
            rid = doc.get("id") if doc else None

        if rid:
            rest_doc = await rest_svc.get_by_id(rid) or {}
            kind = notes.get("kind") or rest_doc.get("pending_checkout_kind") or "subscription"
            # Monthly mandate renewals always start a new cycle; only upgrade_proration keeps dates
            is_upgrade = kind == "upgrade_proration" or (
                event == "payment.captured"
                and str(notes.get("preserve_cycle") or "").strip() in ("1", "true", "True")
            )
            if event in ("subscription.charged", "subscription.activated"):
                is_upgrade = False
                kind = "monthly_mandate"
            preserve = bool(is_upgrade)
            if preserve and kind == "upgrade_proration":
                preserve = preserve or bool(rest_doc.get("pending_checkout_preserve_cycle"))
            next_keep = rest_doc.get("pending_checkout_next_cycle") if preserve else None
            await activate_paid_subscription(
                rid,
                payment_id=pid,
                order_id=oid,
                subscription_id=sub_id,
                amount_paise=amount,
                enable_autopay=True,
                source="webhook",
                tables_override=int(tables) if tables else None,
                preserve_cycle=preserve,
                next_cycle_override=next_keep,
                payment_kind=kind if preserve else "monthly_mandate",
            )
            clear = {
                "pending_checkout_tables": None,
                "pending_checkout_order_id": None,
                "pending_checkout_amount_paise": None,
                "pending_checkout_kind": None,
                "pending_checkout_preserve_cycle": None,
                "pending_checkout_next_cycle": None,
                "autopay_enabled": True,
                "autopay_ready": True,
            }
            if sub_id:
                clear["razorpay_subscription_id"] = sub_id
                clear["razorpay_subscription_status"] = "active"
            await rest_svc.update_restaurant(rid, clear)
        else:
            logger.warning("Webhook missing restaurant_id; payment %s ignored", pid)
            await record_payment(
                restaurant_id="unknown",
                payment_id=pid,
                order_id=oid,
                subscription_id=sub_id,
                amount_paise=amount,
                status="unmapped",
                source="webhook",
                raw={"event": event},
            )

    elif event in ("payment.failed", "subscription.halted", "subscription.cancelled"):
        entity = _extract_payment_entity(data) or _extract_subscription_entity(data)
        notes = entity.get("notes") or {}
        sub_id = entity.get("id") if event.startswith("subscription.") else entity.get("subscription_id")
        rid = notes.get("restaurant_id")
        if not rid and sub_id:
            doc = await db.restaurants.find_one(
                {
                    "$or": [
                        {"razorpay_subscription_id": sub_id},
                        {"pending_checkout_subscription_id": sub_id},
                    ]
                },
                {"_id": 0, "id": 1},
            )
            rid = doc.get("id") if doc else None
        if rid:
            updates = {"payment_status": "failed"}
            if event in ("subscription.halted", "subscription.cancelled"):
                updates["subscription_status"] = "expired"
                updates["autopay_enabled"] = False
                updates["autopay_ready"] = False
            await rest_svc.update_restaurant(rid, updates)
            await record_payment(
                restaurant_id=rid,
                payment_id=entity.get("id") if event == "payment.failed" else None,
                order_id=entity.get("order_id"),
                subscription_id=sub_id,
                amount_paise=entity.get("amount"),
                status="failed",
                source="webhook",
            )

    return {"received": True, "event": event}
