"""Razorpay Subscriptions — customer + monthly mandate (autopay) checkout."""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

from app.config import TRIAL_DAYS
from app.services import restaurants as rest_svc
from app.services.pricing import compute_price, compute_price_for_restaurant, hydrate_pricing
from app.services.razorpay_client import razorpay_client
from app.services.razorpay_plans import get_plan_id_for_tables, get_plan_id_for_restaurant
from app.services.subscription_access import first_paid_cycle_end, intro_trial_eligible

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


async def abandon_pending_checkout(restaurant_id: str) -> dict:
    """
    User closed Razorpay without paying.
    Cancel the unpaid pending subscription only; never touch the live mandate.
    """
    doc = await rest_svc.require_restaurant_id(restaurant_id)
    pending = (doc.get("pending_checkout_subscription_id") or "").strip()
    live = (doc.get("razorpay_subscription_id") or "").strip()
    cancelled_pending = False
    if pending and pending != live:
        cancelled_pending = await cancel_subscription_now(pending, at_cycle_end=False)
    elif pending and pending == live:
        # Expired-renew path stored pending as live id before pay — cancel only if not active access
        status = str(doc.get("subscription_status") or "").lower()
        if status not in ("active", "trial"):
            cancelled_pending = await cancel_subscription_now(pending, at_cycle_end=False)
            live = ""

    clear = {
        "pending_checkout_tables": None,
        "pending_checkout_order_id": None,
        "pending_checkout_amount_paise": None,
        "pending_checkout_subscription_id": None,
        "pending_checkout_kind": None,
        "pending_checkout_preserve_cycle": None,
        "pending_checkout_next_cycle": None,
        "pending_razorpay_plan_tables": None,
        "previous_razorpay_subscription_id": None,
    }
    # If we wiped an unpaid-only subscription id on expired renew, clear it
    if pending and pending == (doc.get("razorpay_subscription_id") or "").strip():
        status = str(doc.get("subscription_status") or "").lower()
        if status not in ("active", "trial"):
            clear["razorpay_subscription_id"] = None
            clear["autopay_enabled"] = False
            clear["autopay_ready"] = False

    await rest_svc.update_restaurant(restaurant_id, clear)
    return {
        "cancelled_pending": cancelled_pending,
        "pending_subscription_id": pending or None,
        "kept_live_subscription_id": live if live and live != pending else (live or None),
    }


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


async def create_upgrade_subscription(
    restaurant_id: str,
    *,
    tables: int,
) -> Tuple[dict, dict]:
    """
    ONE checkout for mid-cycle upgrades:
    - Addon = prorated difference for remaining days (charged now)
    - Plan = full new table tier (mandate max), first charge at next_cycle_start
    - Old subscription cancelled at cycle end (no double debit)
    """
    from app.services.pricing import compute_upgrade_proration
    from app.services.subscription_access import parse_dt

    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    doc = await rest_svc.require_restaurant_id(restaurant_id)
    current = int(doc.get("subscription_tables") or 0)
    if tables <= current:
        raise ValueError("New table count must be higher than current plan.")

    prorate = compute_upgrade_proration(
        current,
        int(tables),
        doc.get("next_cycle_start"),
        restaurant=doc,
    )
    addon_paise = max(100, int(prorate["amount_paise"]))
    next_cycle_iso = prorate.get("next_cycle_start") or doc.get("next_cycle_start")
    preserve = bool(prorate.get("preserve_cycle"))

    start_at = None
    next_dt = parse_dt(next_cycle_iso)
    if preserve and next_dt:
        ts = int(next_dt.timestamp())
        if ts > int(time.time()) + 120:
            start_at = ts

    old_sub = (doc.get("razorpay_subscription_id") or "").strip()
    # Do NOT cancel the live mandate until the upgrade payment succeeds.
    # Cancelling here + a Razorpay webhook was wiping active plans when users closed checkout.

    plan_id = await get_plan_id_for_restaurant(doc, int(tables))
    customer_id = await ensure_customer(restaurant_id)
    price = compute_price_for_restaurant(int(tables), doc)

    extra = int(tables) - current
    days = prorate.get("remaining_days") or "?"
    payload = {
        "plan_id": plan_id,
        "customer_id": customer_id,
        "customer_notify": 1,
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "quantity": 1,
        "addons": [
            {
                "item": {
                    "name": f"Upgrade +{extra} tables ({days} days left)",
                    "amount": addon_paise,
                    "currency": "INR",
                }
            }
        ],
        "notes": {
            "restaurant_id": restaurant_id,
            "tables": str(int(tables)),
            "kind": "upgrade_proration",
            "preserve_cycle": "1" if preserve else "0",
            "product": "zentaap",
            "current_tables": str(current),
            "addon_paise": str(addon_paise),
            "previous_subscription_id": old_sub or "",
        },
    }
    if start_at:
        payload["start_at"] = start_at

    sub = client.subscription.create(payload)

    await rest_svc.update_restaurant(
        restaurant_id,
        {
            "pending_checkout_tables": int(tables),
            "pending_checkout_subscription_id": sub["id"],
            "pending_checkout_amount_paise": addon_paise,
            "pending_checkout_kind": "upgrade_proration",
            "pending_checkout_preserve_cycle": preserve,
            "pending_checkout_next_cycle": next_cycle_iso,
            # Keep current live mandate id until pay succeeds
            "previous_razorpay_subscription_id": old_sub or doc.get("previous_razorpay_subscription_id"),
            "razorpay_plan_id": plan_id,
            "pending_razorpay_plan_tables": int(tables),
        },
    )

    checkout = {
        "mode": "subscription",
        "subscription_id": sub["id"],
        "plan_id": plan_id,
        "amount": addon_paise,
        "currency": "INR",
        "customer_id": customer_id,
        "short_url": sub.get("short_url"),
        "status": sub.get("status"),
        "restaurant_id": restaurant_id,
        "tables": int(tables),
        "mandate": True,
        "autopay": True,
        "upgrade": True,
        "proration": prorate,
        "monthly_amount_paise": int(price["amount_paise"]),
        "start_at": start_at,
        "description": (
            f"Pay {addon_paise/100:.0f} for +{extra} tables now · "
            f"then {price['total_with_tax']:.0f}/mo from next cycle"
        ),
    }
    return checkout, sub


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

    First-ever payment: charge the monthly amount now via addon, and set start_at
    to one calendar month + TRIAL_DAYS so AutoPay's next debit includes the
    intro bonus. Renewals charge the plan on the normal monthly cycle.
    Returns (checkout_payload_for_frontend, raw_subscription).
    """
    await hydrate_pricing()
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    doc = await rest_svc.require_restaurant_id(restaurant_id)
    old_sub = (doc.get("razorpay_subscription_id") or "").strip()
    status = str(doc.get("subscription_status") or "").lower()
    # Only kill the old Razorpay sub when renewing an expired/inactive account.
    # Never cancel a live active mandate before the new checkout is paid.
    if replace_existing and old_sub and status not in ("active", "trial"):
        await cancel_subscription_now(old_sub, at_cycle_end=False)

    plan_id = await get_plan_id_for_restaurant(doc, int(tables))
    customer_id = await ensure_customer(restaurant_id)
    price = compute_price_for_restaurant(int(tables), doc)
    amount_paise = int(price["amount_paise"])
    intro = intro_trial_eligible(doc) and status not in ("active", "trial")

    intro_start_at = start_at
    intro_next_iso = None
    if intro and not intro_start_at:
        intro_end = first_paid_cycle_end(datetime.now(timezone.utc), intro=True)
        intro_start_at = int(intro_end.timestamp())
        intro_next_iso = intro_end.isoformat()

    payload = {
        "plan_id": plan_id,
        "customer_id": customer_id,
        "customer_notify": 1,
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "quantity": 1,
        "notes": {
            "restaurant_id": restaurant_id,
            "tables": str(int(tables)),
            "kind": "first_cycle_intro" if intro else "monthly_mandate",
            "product": "zentaap",
            "billing_override": "1" if price.get("billing_override") else "0",
            "previous_subscription_id": old_sub if status in ("active", "trial") else "",
            "intro_trial": "1" if intro else "0",
        },
    }
    if intro:
        payload["addons"] = [
            {
                "item": {
                    "name": f"First month + {TRIAL_DAYS}-day intro",
                    "amount": max(100, amount_paise),
                    "currency": "INR",
                }
            }
        ]
    # Optional future start (intro bonus, or after mid-cycle upgrade) — still collects mandate auth now
    if intro_start_at and int(intro_start_at) > int(time.time()) + 60:
        payload["start_at"] = int(intro_start_at)

    sub = client.subscription.create(payload)

    update = {
        "pending_checkout_tables": int(tables),
        "pending_checkout_subscription_id": sub["id"],
        "pending_checkout_amount_paise": amount_paise,
        "pending_checkout_kind": "first_cycle_intro" if intro else "monthly_mandate",
        "pending_checkout_preserve_cycle": False,
        "pending_checkout_next_cycle": intro_next_iso,
        "razorpay_plan_id": plan_id,
        "pending_razorpay_plan_tables": int(tables),
    }
    if status in ("active", "trial") and old_sub:
        # Keep live mandate until pay succeeds
        update["previous_razorpay_subscription_id"] = old_sub
    else:
        # Expired/new: pending sub becomes the tracked id after pay; store pending only for now
        update["razorpay_subscription_id"] = sub["id"]
        update["previous_razorpay_subscription_id"] = None

    await rest_svc.update_restaurant(restaurant_id, update)

    desc = (
        f"ZenTaap DEMO mandate · ₹{amount_paise/100:.0f}/mo"
        if price.get("billing_override")
        else f"ZenTaap {tables} tables — monthly autopay mandate"
    )
    if intro:
        desc = (
            f"Pay ₹{amount_paise/100:.0f} now · first AutoPay in 1 month + {TRIAL_DAYS} extra days"
        )
    elif intro_start_at:
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
        "intro_trial": intro,
        "intro_bonus_days": TRIAL_DAYS if intro else 0,
        "description": desc,
        "start_at": intro_start_at if intro else start_at,
        "next_cycle_start": intro_next_iso,
    }
    return checkout, sub


def verify_subscription_signature(
    *,
    razorpay_subscription_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> None:
    """
    Razorpay subscription checkout signs: payment_id|subscription_id
    (NOT order_id|payment_id — that is only for Orders API).
    """
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")
    client.utility.verify_subscription_payment_signature(
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
