from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from app.config import TRIAL_DAYS
from app.models import SubscribeBody
from app.services.pricing import compute_price, compute_upgrade_proration, compute_price_for_restaurant
from app.deps import require_manager
from app.services import restaurants as rest_svc
from app.services.razorpay_client import razorpay_configured
from app.services.razorpay_subscriptions import cancel_subscription_at_cycle_end
from app.services.subscription_access import (
    parse_dt,
    advance_cycle_to_future,
    refresh_subscription_status,
    has_access_status,
    BILLING_CYCLE_DAYS,
)

router = APIRouter(tags=["subscription"])


@router.get("/pricing")
async def pricing(tables: int = 14):
    return compute_price(tables)


@router.get("/pricing/me")
async def pricing_for_me(tables: int = 14, sess=Depends(require_manager)):
    """Restaurant-aware pricing (honours billing_override_paise for demo accounts)."""
    doc, _status = await refresh_subscription_status(sess["restaurant_id"])
    return compute_price_for_restaurant(tables, doc)


@router.get("/pricing/upgrade-quote")
async def upgrade_quote(tables: int, sess=Depends(require_manager)):
    """Preview mid-cycle upgrade proration for the logged-in restaurant."""
    doc, status = await refresh_subscription_status(sess["restaurant_id"])
    current = int(doc.get("subscription_tables") or 0)
    monthly = compute_price_for_restaurant(tables, doc)
    if status != "active" or current < 1:
        return {"applicable": False, "reason": "not_active", "monthly": monthly}
    if tables <= current:
        return {
            "applicable": False,
            "reason": "decrease_or_same",
            "current_tables": current,
            "monthly": monthly,
        }
    prorate = compute_upgrade_proration(current, tables, doc.get("next_cycle_start"), restaurant=doc)
    return {"applicable": True, "proration": prorate, "monthly": monthly}

@router.get("/subscription")
async def get_subscription(sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    doc, status = await refresh_subscription_status(rid)
    cycle_start = doc.get("cycle_start")
    next_cycle = doc.get("next_cycle_start")
    now = datetime.now(timezone.utc)

    # Apply pending tables when a paid cycle rolls (after verify extended next_cycle)
    if status == "active" and doc.get("pending_tables"):
        next_dt = parse_dt(next_cycle)
        last_paid = parse_dt(doc.get("last_payment_at"))
        if next_dt and last_paid and last_paid >= (next_dt - timedelta(days=1)):
            # recently paid into this cycle — pending already cleared on verify usually
            pass

    # Never advertise a past next_cycle_start for active subs display
    effective_from = next_cycle
    if next_cycle and status in ("active", "trial"):
        try:
            if parse_dt(next_cycle) and parse_dt(next_cycle) < now and status == "active":
                # still in grace — show current next_cycle
                effective_from = next_cycle
        except Exception:
            pass

    cycle_end = None
    if next_cycle:
        d = parse_dt(next_cycle)
        if d:
            cycle_end = (d - timedelta(days=1)).isoformat()
        else:
            cycle_end = next_cycle

    return {
        "tables": doc.get("subscription_tables"),
        "subtotal": doc.get("subscription_subtotal"),
        "gst": doc.get("subscription_gst"),
        "total": doc.get("subscription_total"),
        "status": status,
        "has_access": has_access_status(status),
        "payment_status": doc.get("payment_status"),
        "trial_start": doc.get("trial_start"),
        "trial_end": doc.get("trial_end"),
        "payment_method": doc.get("payment_method"),
        "pending_tables": doc.get("pending_tables"),
        "pending_subtotal": doc.get("pending_subtotal"),
        "pending_total": doc.get("pending_total"),
        "cycle_start": cycle_start,
        "next_cycle_start": next_cycle,
        "effective_from": effective_from,
        "cycle_end": cycle_end,
        "autopay_enabled": bool(doc.get("autopay_enabled", False)),
        "autopay_ready": bool(doc.get("autopay_ready", False)),
        "autopay_supported": razorpay_configured(),
        "mandate": bool(doc.get("razorpay_subscription_id") and doc.get("autopay_enabled")),
        "razorpay_customer_id": doc.get("razorpay_customer_id"),
        "razorpay_subscription_id": doc.get("razorpay_subscription_id"),
        "razorpay_subscription_status": doc.get("razorpay_subscription_status"),
        "last_payment_id": doc.get("last_payment_id"),
        "last_payment_at": doc.get("last_payment_at"),
        "needs_payment": status in ("expired", "none") or doc.get("payment_status") in ("failed", "grace"),
    }


@router.post("/subscription")
async def create_subscription(body: SubscribeBody, sess=Depends(require_manager)):
    """
    Plan selection:
    - none/skipped → start free trial (no payment, no last_payment_at)
    - expired → stash plan intent; stays expired until /payments/verify
    - active mid-cycle table change → pending until next cycle (no free upgrade)
    """
    # Razorpay Checkout handles method selection; keep a loose label for records.
    pay_method = (body.payment_method or "razorpay").strip().lower() or "razorpay"
    if pay_method not in ("card", "upi", "netbanking", "wallet", "razorpay"):
        pay_method = "razorpay"
    body.payment_method = pay_method
    now = datetime.now(timezone.utc)
    existing, current_status = await refresh_subscription_status(sess["restaurant_id"])
    price = compute_price_for_restaurant(body.tables, existing)
    current_tables = existing.get("subscription_tables")

    # --- First-time / skipped: start trial only (no payment yet) ---
    if current_status in ("none", "skipped"):
        trial_end = now + timedelta(days=TRIAL_DAYS)
        update = {
            "subscription_tables": body.tables,
            "subscription_subtotal": price["subtotal"],
            "subscription_gst": price["gst_amount"],
            "subscription_total": price["total_with_tax"],
            "subscription_status": "trial",
            "payment_status": "trial",
            "trial_start": now.isoformat(),
            "trial_end": trial_end.isoformat(),
            "cycle_start": now.isoformat(),
            "next_cycle_start": (now + timedelta(days=BILLING_CYCLE_DAYS)).isoformat(),
            "payment_method": body.payment_method,
            "pending_tables": None,
            "pending_subtotal": None,
            "pending_total": None,
        }
        await rest_svc.update_restaurant(sess["restaurant_id"], update)
        return {
            "success": True,
            "applied": "trial",
            "needs_payment": False,
            **price,
            "trial_start": update["trial_start"],
            "trial_end": update["trial_end"],
            "cycle_start": update["cycle_start"],
            "next_cycle_start": update["next_cycle_start"],
            "status": "trial",
        }

    # --- Expired: save plan intent, require payment before active ---
    if current_status == "expired":
        update = {
            "pending_checkout_tables": body.tables,
            "subscription_tables": body.tables,
            "subscription_subtotal": price["subtotal"],
            "subscription_gst": price["gst_amount"],
            "subscription_total": price["total_with_tax"],
            "payment_method": body.payment_method,
            # Keep expired until verify
            "subscription_status": "expired",
            "payment_status": "awaiting_payment",
        }
        await rest_svc.update_restaurant(sess["restaurant_id"], update)
        return {
            "success": True,
            "applied": "awaiting_payment",
            "needs_payment": True,
            **price,
            "status": "expired",
        }

    if body.tables == current_tables:
        await rest_svc.update_restaurant(sess["restaurant_id"], {
            "payment_method": body.payment_method,
            "pending_tables": None,
            "pending_subtotal": None,
            "pending_total": None,
        })
        return {"success": True, "applied": "no_change", "tables": current_tables, "needs_payment": False}

    next_cycle_iso = existing.get("next_cycle_start")
    cycle_start_iso = existing.get("cycle_start") or existing.get("trial_start") or now.isoformat()
    if not next_cycle_iso:
        base = parse_dt(cycle_start_iso) or now
        next_cycle_iso = (base + timedelta(days=BILLING_CYCLE_DAYS)).isoformat()

    # Mid-cycle: schedule for next cycle (charged on next paid renewal)
    # Increasing tables mid-cycle requires payment to apply immediately
    increasing = int(body.tables) > int(current_tables or 0)
    next_dt = parse_dt(next_cycle_iso)
    cycle_past = bool(next_dt and next_dt <= now)

    if increasing and (cycle_past or current_status == "active"):
        # Mid-cycle upgrade: prorate extra tables for remaining days; keep cycle end
        prorate = compute_upgrade_proration(int(current_tables), body.tables, next_cycle_iso, now, restaurant=existing)
        await rest_svc.update_restaurant(sess["restaurant_id"], {
            "pending_checkout_tables": body.tables,
            "pending_checkout_kind": prorate["kind"],
            "pending_checkout_preserve_cycle": prorate["preserve_cycle"],
            "pending_checkout_next_cycle": prorate.get("next_cycle_start"),
            "pending_checkout_amount_paise": prorate["amount_paise"],
            "payment_method": body.payment_method,
            "payment_status": "awaiting_upgrade_payment",
        })
        return {
            "success": True,
            "applied": "upgrade_proration" if prorate["preserve_cycle"] else "awaiting_payment",
            "needs_payment": True,
            "current_tables": current_tables,
            "pending_tables": body.tables,
            "proration": prorate,
            "status": current_status,
            "message": prorate.get("message"),
            "tables": body.tables,
            "subtotal": prorate["subtotal"],
            "gst_amount": prorate["gst_amount"],
            "total_with_tax": prorate["total_with_tax"],
        }

    pending_update = {
        "pending_tables": body.tables,
        "pending_subtotal": price["subtotal"],
        "pending_total": price["total_with_tax"],
        "payment_method": body.payment_method,
        "cycle_start": cycle_start_iso,
        "next_cycle_start": next_cycle_iso,
    }
    await rest_svc.update_restaurant(sess["restaurant_id"], pending_update)
    return {
        "success": True,
        "applied": "next_cycle",
        "needs_payment": False,
        "current_tables": current_tables,
        "pending_tables": body.tables,
        "pending_total": price["total_with_tax"],
        "cycle_start": cycle_start_iso,
        "next_cycle_start": next_cycle_iso,
    }


@router.put("/subscription/autopay")
async def toggle_autopay(body: dict, sess=Depends(require_manager)):
    """Toggle Razorpay recurring — cancel at cycle end when disabled."""
    enable = bool(body.get("enabled", False))
    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    sub_id = doc.get("razorpay_subscription_id")

    if not enable and sub_id:
        await cancel_subscription_at_cycle_end(sub_id)

    await rest_svc.update_restaurant(rid, {
        "autopay_enabled": enable,
        "autopay_ready": bool(sub_id and enable),
    })
    return {
        "success": True,
        "autopay_enabled": enable,
        "autopay_ready": bool(sub_id and enable),
        "autopay_supported": razorpay_configured(),
        "message": (
            "Autopay enabled — Razorpay will charge monthly on your saved method."
            if enable
            else "Autopay cancelled — no further automatic charges after this billing cycle."
        ),
    }
