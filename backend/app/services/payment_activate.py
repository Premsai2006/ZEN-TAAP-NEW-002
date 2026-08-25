"""Activate subscription after a verified Razorpay payment + payment ledger."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.database import db
from app.services.pricing import compute_price
from app.services.subscription_access import BILLING_CYCLE_DAYS
from app.services import restaurants as rest_svc


async def record_payment(
    *,
    restaurant_id: str,
    payment_id: Optional[str],
    order_id: Optional[str],
    subscription_id: Optional[str] = None,
    amount_paise: Optional[int],
    currency: str = "INR",
    status: str = "captured",
    source: str = "verify",
    tables: Optional[int] = None,
    raw: Optional[dict] = None,
) -> dict:
    """Idempotent payment history row keyed by payment_id when present."""
    now = datetime.now(timezone.utc).isoformat()
    if payment_id:
        existing = await db.payments.find_one({"payment_id": payment_id, "restaurant_id": restaurant_id})
        if existing:
            existing.pop("_id", None)
            return existing

    doc = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "payment_id": payment_id,
        "order_id": order_id,
        "subscription_id": subscription_id,
        "amount_paise": amount_paise,
        "amount": (amount_paise / 100.0) if amount_paise is not None else None,
        "currency": currency,
        "status": status,
        "source": source,
        "tables": tables,
        "created_at": now,
        "raw": raw or {},
    }
    await db.payments.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


async def activate_paid_subscription(
    restaurant_id: str,
    *,
    payment_id: Optional[str] = None,
    order_id: Optional[str] = None,
    subscription_id: Optional[str] = None,
    amount_paise: Optional[int] = None,
    enable_autopay: bool = False,
    source: str = "verify",
    tables_override: Optional[int] = None,
) -> dict:
    """Mark restaurant active and extend billing cycle after verified payment."""
    doc = await rest_svc.require_restaurant_id(restaurant_id)
    now = datetime.now(timezone.utc)
    next_cycle = now + timedelta(days=BILLING_CYCLE_DAYS)

    tables = tables_override or doc.get("pending_tables") or doc.get("subscription_tables")
    try:
        tables = int(tables) if tables is not None else None
    except Exception:
        tables = doc.get("subscription_tables")

    update = {
        "subscription_status": "active",
        "payment_status": "paid",
        "last_payment_id": payment_id,
        "last_payment_order_id": order_id,
        "last_payment_at": now.isoformat(),
        "cycle_start": now.isoformat(),
        "next_cycle_start": next_cycle.isoformat(),
        "autopay_enabled": bool(enable_autopay or subscription_id),
        "autopay_ready": bool(subscription_id),
    }
    if subscription_id:
        update["razorpay_subscription_id"] = subscription_id

    if tables:
        price = compute_price(int(tables))
        update.update({
            "subscription_tables": int(tables),
            "subscription_subtotal": price["subtotal"],
            "subscription_gst": price["gst_amount"],
            "subscription_total": price["total_with_tax"],
            "pending_tables": None,
            "pending_subtotal": None,
            "pending_total": None,
        })

    await rest_svc.update_restaurant(restaurant_id, update)
    await record_payment(
        restaurant_id=restaurant_id,
        payment_id=payment_id,
        order_id=order_id,
        subscription_id=subscription_id,
        amount_paise=amount_paise,
        source=source,
        tables=tables,
    )
    return {**doc, **update, "next_cycle_start": next_cycle.isoformat()}
