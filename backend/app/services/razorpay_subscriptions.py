"""Razorpay Subscriptions — customer + recurring checkout."""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from app.services import restaurants as rest_svc
from app.services.pricing import compute_price
from app.services.razorpay_client import razorpay_client
from app.services.razorpay_plans import get_plan_id_for_tables

logger = logging.getLogger(__name__)

# Monthly renewals for up to 10 years
SUBSCRIPTION_TOTAL_COUNT = 120


async def ensure_customer(restaurant_id: str) -> str:
    doc = await rest_svc.require_restaurant_id(restaurant_id)
    existing = (doc.get("razorpay_customer_id") or "").strip()
    if existing:
        return existing

    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

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
        payload["contact"] = contact

    customer = client.customer.create(payload)
    customer_id = customer["id"]
    await rest_svc.update_restaurant(restaurant_id, {"razorpay_customer_id": customer_id})
    return customer_id


async def create_checkout_subscription(
    restaurant_id: str,
    *,
    tables: int,
) -> Tuple[dict, dict]:
    """
    Create a Razorpay Subscription for monthly billing.
    Returns (checkout_payload_for_frontend, raw_subscription).
    """
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    plan_id = await get_plan_id_for_tables(int(tables))
    customer_id = await ensure_customer(restaurant_id)
    price = compute_price(int(tables))
    amount_paise = int(round(price["total_with_tax"] * 100))

    sub = client.subscription.create(
        {
            "plan_id": plan_id,
            "customer_id": customer_id,
            "customer_notify": 1,
            "total_count": SUBSCRIPTION_TOTAL_COUNT,
            "quantity": 1,
            "notes": {
                "restaurant_id": restaurant_id,
                "tables": str(int(tables)),
            },
        }
    )

    await rest_svc.update_restaurant(
        restaurant_id,
        {
            "pending_checkout_tables": int(tables),
            "pending_checkout_subscription_id": sub["id"],
            "pending_checkout_amount_paise": amount_paise,
            "razorpay_subscription_id": sub["id"],
        },
    )

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


async def cancel_subscription_at_cycle_end(subscription_id: Optional[str]) -> bool:
    if not subscription_id:
        return False
    client = razorpay_client()
    if not client:
        return False
    try:
        client.subscription.cancel(subscription_id, {"cancel_at_cycle_end": 1})
        return True
    except Exception as exc:
        logger.warning("Razorpay cancel subscription failed %s: %s", subscription_id, exc)
        return False
