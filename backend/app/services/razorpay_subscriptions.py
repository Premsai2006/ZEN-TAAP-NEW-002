"""Razorpay Subscriptions — customer + monthly mandate (autopay) checkout."""
from __future__ import annotations

import logging
import time
from typing import Optional, Tuple

from app.services import restaurants as rest_svc
from app.services.pricing import compute_price, compute_price_for_restaurant
from app.services.razorpay_client import razorpay_client
from app.services.razorpay_plans import get_plan_id_for_tables, get_plan_id_for_restaurant

logger = logging.getLogger(__name__)

# Monthly renewals for up to 10 years
SUBSCRIPTION_TOTAL_COUNT = 120


async def ensure_customer(restaurant_id: str) -> str:
    doc = await rest_svc.require_restaurant_id(restaurant_id)
    existing = (doc.get("razorpay_customer_id") or "").strip()
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    if existing:
        try:
            client.customer.fetch(existing)
            return existing
        except Exception as exc:
            logger.warning("Stale razorpay_customer_id=%s — recreating (%s)", existing, exc)
            await rest_svc.update_restaurant(restaurant_id, {"razorpay_customer_id": None})

    name = doc.get("restaurant_name") or doc.get("manager_name") or "ZenTaap Restaurant"
    email = (doc.get("email") or "").strip() or None
    contact = (doc.get("contact_number") or doc.get("phone") or "").strip() or None

    payload = {
        "name": name[:128],
        "notes": {"restaurant_id": restaurant_id},
    }
    if email:
        payload["email"] = email
    if contact:
        payload["contact"] = contact[-15:]

    customer = client.customer.create(payload)
    customer_id = customer["id"]
    await rest_svc.update_restaurant(restaurant_id, {"razorpay_customer_id": customer_id})
    return customer_id


async def cancel_subscription_now(subscription_id: Optional[str], *, at_cycle_end: bool = False) -> bool:
    if not subscription_id:
        return False
    client = razorpay_client()
    if not client:
        return False
    try:
        if at_cycle_end:
            client.subscription.cancel(subscription_id, {"cancel_at_cycle_end": 1})
        else:
            client.subscription.cancel(subscription_id)
        return True
    except Exception as exc:
        logger.warning("Razorpay cancel subscription failed %s: %s", subscription_id, exc)
        return False


async def cancel_subscription_at_cycle_end(subscription_id: Optional[str]) -> bool:
    return await cancel_subscription_now(subscription_id, at_cycle_end=True)


async def update_subscription_plan(restaurant_id: str, tables: int) -> Optional[str]:
    """
    Try to point an existing Razorpay subscription at the new table-tier plan.
    Works for card mandates; UPI mandates cannot be updated (returns None).
    """
    doc = await rest_svc.require_restaurant_id(restaurant_id)
    sub_id = (doc.get("razorpay_subscription_id") or "").strip()
    if not sub_id:
        return None
    client = razorpay_client()
    if not client:
        return None
    plan_id = await get_plan_id_for_restaurant(doc, int(tables))
    try:
        client.subscription.update(
            sub_id,
            {
                "plan_id": plan_id,
                "schedule_change_at": "cycle_end",
                "customer_notify": 1,
            },
        )
        await rest_svc.update_restaurant(
            restaurant_id,
            {
                "razorpay_plan_id": plan_id,
                "pending_razorpay_plan_tables": int(tables),
            },
        )
        logger.info("Updated Razorpay sub %s → plan %s (tables=%s)", sub_id, plan_id, tables)
        return plan_id
    except Exception as exc:
        logger.warning("Could not update Razorpay subscription plan %s: %s", sub_id, exc)
        return None


async def prepare_upgraded_mandate(
    restaurant_id: str,
    *,
    tables: int,
    next_cycle_iso: Optional[str],
) -> dict:
    """
    After a mid-cycle proration payment:
    1) Try updating the existing subscription plan (cards).
    2) If that fails (typical for UPI), cancel old sub at cycle end and create a
       new subscription for the higher table count starting at next_cycle.
       Frontend must open checkout so the customer authorizes the new max amount.
    """
    from app.services.subscription_access import parse_dt

    # Card path — silent plan change at cycle end
    updated = await update_subscription_plan(restaurant_id, int(tables))
    if updated:
        return {
            "needs_checkout": False,
            "mode": "plan_updated",
            "plan_id": updated,
            "message": f"Next autopay will charge the {tables}-table plan.",
        }

    doc = await rest_svc.require_restaurant_id(restaurant_id)
    old_sub = (doc.get("razorpay_subscription_id") or "").strip()
    if old_sub:
        await cancel_subscription_now(old_sub, at_cycle_end=True)

    start_at = None
    next_dt = parse_dt(next_cycle_iso)
    if next_dt:
        ts = int(next_dt.timestamp())
        if ts > int(time.time()) + 120:
            start_at = ts

    checkout, _sub = await create_checkout_subscription(
        restaurant_id,
        tables=int(tables),
        start_at=start_at,
        replace_existing=False,
    )
    price = compute_price_for_restaurant(int(tables), doc)
    return {
        "needs_checkout": True,
        "mode": "new_mandate",
        "message": (
            f"Authorize monthly autopay for {tables} tables "
            f"({price['total_with_tax']:.0f}/mo) from the next billing date."
        ),
        **checkout,
    }


async def create_checkout_subscription(
    restaurant_id: str,
    *,
    tables: int,
    start_at: Optional[int] = None,
    replace_existing: bool = True,
) -> Tuple[dict, dict]:
    """
    Create a Razorpay Subscription (monthly mandate / autopay).
    First Checkout payment authorises the mandate; later charges auto-debit.
    Returns (checkout_payload_for_frontend, raw_subscription).
    """
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    doc = await rest_svc.require_restaurant_id(restaurant_id)
    old_sub = (doc.get("razorpay_subscription_id") or "").strip()
    # Replace any previous mandate so renew/expired always gets a fresh monthly subscription
    if replace_existing and old_sub:
        await cancel_subscription_now(old_sub, at_cycle_end=False)

    plan_id = await get_plan_id_for_restaurant(doc, int(tables))
    customer_id = await ensure_customer(restaurant_id)
    price = compute_price_for_restaurant(int(tables), doc)
    amount_paise = int(price["amount_paise"])

    payload = {
        "plan_id": plan_id,
        "customer_id": customer_id,
        "customer_notify": 1,
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "quantity": 1,
        "notes": {
            "restaurant_id": restaurant_id,
            "tables": str(int(tables)),
            "kind": "monthly_mandate",
            "product": "zentaap",
            "billing_override": "1" if price.get("billing_override") else "0",
        },
    }
    # Optional future start (e.g. after mid-cycle upgrade) — still collects mandate auth now
    if start_at and int(start_at) > int(time.time()) + 60:
        payload["start_at"] = int(start_at)

    sub = client.subscription.create(payload)

    await rest_svc.update_restaurant(
        restaurant_id,
        {
            "pending_checkout_tables": int(tables),
            "pending_checkout_subscription_id": sub["id"],
            "pending_checkout_amount_paise": amount_paise,
            "pending_checkout_kind": "monthly_mandate",
            "pending_checkout_preserve_cycle": False,
            "pending_checkout_next_cycle": None,
            "razorpay_subscription_id": sub["id"],
            "razorpay_plan_id": plan_id,
            "pending_razorpay_plan_tables": int(tables),
        },
    )

    desc = (
        f"ZenTaap DEMO mandate · ₹{amount_paise/100:.0f}/mo"
        if price.get("billing_override")
        else f"ZenTaap {tables} tables — monthly autopay mandate"
    )
    if start_at:
        desc = f"{desc} (starts next cycle)"

    checkout = {
        "mode": "subscription",
        "subscription_id": sub["id"],
        "plan_id": plan_id,
        "amount": amount_paise,
        "currency": "INR",
        "customer_id": customer_id,
        "short_url": sub.get("short_url"),
        "status": sub.get("status"),
        "restaurant_id": restaurant_id,
        "tables": int(tables),
        "mandate": True,
        "autopay": True,
        "billing_override": bool(price.get("billing_override")),
        "description": desc,
        "start_at": start_at,
    }
    return checkout, sub


def verify_subscription_signature(
    *,
    razorpay_subscription_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> None:
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")
    client.utility.verify_payment_signature(
        {
            "razorpay_subscription_id": razorpay_subscription_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
        }
    )


def fetch_subscription(subscription_id: str) -> Optional[dict]:
    client = razorpay_client()
    if not client or not subscription_id:
        return None
    try:
        return client.subscription.fetch(subscription_id)
    except Exception as exc:
        logger.warning("subscription.fetch failed %s: %s", subscription_id, exc)
        return None
