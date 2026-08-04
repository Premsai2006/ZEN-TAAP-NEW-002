from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from app.database import db
from app.config import TRIAL_DAYS
from app.models import SubscribeBody
from app.services.pricing import compute_price

router = APIRouter(tags=["subscription"])


def _parse_dt(iso: str):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _advance_cycle_to_future(next_cycle_iso: str, now: datetime) -> str:
    """Roll next_cycle forward in 30-day steps until it is in the future."""
    try:
        next_dt = _parse_dt(next_cycle_iso)
    except Exception:
        return (now + timedelta(days=30)).isoformat()
    while next_dt <= now:
        next_dt = next_dt + timedelta(days=30)
    return next_dt.isoformat()


@router.get("/pricing")
async def pricing(tables: int = 14):
    return compute_price(tables)


@router.get("/subscription")
async def get_subscription():
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    cycle_start = doc.get("cycle_start")
    next_cycle = doc.get("next_cycle_start")
    now = datetime.now(timezone.utc)
    status = doc.get("subscription_status", "none")

    # Auto-expire when cycle ended without renewal payment
    if next_cycle and status in ("active", "trial"):
        try:
            next_dt = _parse_dt(next_cycle)
            last_paid = doc.get("last_payment_at")
            last_paid_dt = None
            if last_paid:
                try:
                    last_paid_dt = _parse_dt(last_paid)
                except Exception:
                    last_paid_dt = None
            if now >= next_dt and (last_paid_dt is None or last_paid_dt < (next_dt - timedelta(days=1))):
                status = "expired"
                await db.settings.update_one(
                    {"key": "restaurant"}, {"$set": {"subscription_status": "expired"}}
                )
            elif now >= next_dt and last_paid_dt and last_paid_dt >= (next_dt - timedelta(days=1)):
                # Paid recently — roll cycle forward and apply pending table change
                new_next = _advance_cycle_to_future(next_cycle, now)
                updates = {"next_cycle_start": new_next, "cycle_start": next_dt.isoformat()}
                if doc.get("pending_tables"):
                    price = compute_price(int(doc["pending_tables"]))
                    updates.update({
                        "subscription_tables": doc["pending_tables"],
                        "subscription_subtotal": price["subtotal"],
                        "subscription_gst": price["gst_amount"],
                        "subscription_total": price["total_with_tax"],
                        "pending_tables": None,
                        "pending_subtotal": None,
                        "pending_total": None,
                    })
                    doc["subscription_tables"] = doc["pending_tables"]
                    doc["subscription_total"] = price["total_with_tax"]
                    doc["pending_tables"] = None
                next_cycle = new_next
                await db.settings.update_one({"key": "restaurant"}, {"$set": updates})
        except Exception:
            pass

    # Never advertise a past next_cycle_start as the effective date for active subs
    effective_from = next_cycle
    if next_cycle and status in ("active", "trial"):
        try:
            if _parse_dt(next_cycle) < now:
                effective_from = now.isoformat()
                next_cycle = _advance_cycle_to_future(next_cycle, now)
                await db.settings.update_one(
                    {"key": "restaurant"}, {"$set": {"next_cycle_start": next_cycle}}
                )
                effective_from = next_cycle
        except Exception:
            pass

    cycle_end = None
    if next_cycle:
        try:
            d = _parse_dt(next_cycle) - timedelta(days=1)
            cycle_end = d.isoformat()
        except Exception:
            cycle_end = next_cycle

    has_access = status in ("trial", "active")
    return {
        "tables": doc.get("subscription_tables"),
        "subtotal": doc.get("subscription_subtotal"),
        "gst": doc.get("subscription_gst"),
        "total": doc.get("subscription_total"),
        "status": status,
        "has_access": has_access,
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
        "razorpay_customer_id": doc.get("razorpay_customer_id"),
        "razorpay_subscription_id": doc.get("razorpay_subscription_id"),
        "last_payment_id": doc.get("last_payment_id"),
        "last_payment_at": doc.get("last_payment_at"),
    }


@router.post("/subscription")
async def create_subscription(body: SubscribeBody):
    if body.payment_method not in ("card", "upi", "netbanking", "wallet"):
        raise HTTPException(status_code=400, detail="Invalid payment method")
    price = compute_price(body.tables)
    now = datetime.now(timezone.utc)
    existing = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    current_status = existing.get("subscription_status", "none")
    current_tables = existing.get("subscription_tables")

    if current_status in ("none", "skipped", "expired") or not current_tables:
        trial_end = now + timedelta(days=TRIAL_DAYS)
        # New signups get a trial; expired renewals go straight to active after payment
        status = "trial" if current_status in ("none", "skipped") else "active"
        cycle_start = now
        next_cycle = cycle_start + timedelta(days=30)
        update = {
            "subscription_tables": body.tables,
            "subscription_subtotal": price["subtotal"],
            "subscription_gst": price["gst_amount"],
            "subscription_total": price["total_with_tax"],
            "subscription_status": status,
            "trial_start": now.isoformat() if status == "trial" else existing.get("trial_start"),
            "trial_end": trial_end.isoformat() if status == "trial" else existing.get("trial_end"),
            "cycle_start": cycle_start.isoformat(),
            "next_cycle_start": next_cycle.isoformat(),
            "payment_method": body.payment_method,
            "pending_tables": None,
            "pending_subtotal": None,
            "pending_total": None,
            "last_payment_at": now.isoformat(),
        }
        await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
        return {
            "success": True,
            "applied": "immediate",
            **price,
            "trial_start": update["trial_start"],
            "trial_end": update["trial_end"],
            "cycle_start": update["cycle_start"],
            "next_cycle_start": update["next_cycle_start"],
        }

    if body.tables == current_tables:
        await db.settings.update_one(
            {"key": "restaurant"},
            {"$set": {
                "payment_method": body.payment_method,
                "pending_tables": None,
                "pending_subtotal": None,
                "pending_total": None,
            }},
        )
        return {"success": True, "applied": "no_change", "tables": current_tables}

    next_cycle_iso = existing.get("next_cycle_start")
    cycle_start_iso = existing.get("cycle_start")
    if not cycle_start_iso:
        cycle_start_iso = existing.get("trial_start") or now.isoformat()
    if not next_cycle_iso:
        try:
            base = _parse_dt(cycle_start_iso)
        except Exception:
            base = now
        next_cycle_iso = (base + timedelta(days=30)).isoformat()

    # If next cycle date is already past, apply immediately (issue #6)
    apply_now = False
    try:
        if _parse_dt(next_cycle_iso) <= now:
            apply_now = True
    except Exception:
        apply_now = True

    if apply_now:
        new_next = (now + timedelta(days=30)).isoformat()
        update = {
            "subscription_tables": body.tables,
            "subscription_subtotal": price["subtotal"],
            "subscription_gst": price["gst_amount"],
            "subscription_total": price["total_with_tax"],
            "payment_method": body.payment_method,
            "pending_tables": None,
            "pending_subtotal": None,
            "pending_total": None,
            "cycle_start": now.isoformat(),
            "next_cycle_start": new_next,
        }
        await db.settings.update_one({"key": "restaurant"}, {"$set": update})
        return {
            "success": True,
            "applied": "immediate",
            **price,
            "cycle_start": update["cycle_start"],
            "next_cycle_start": new_next,
        }

    pending_update = {
        "pending_tables": body.tables,
        "pending_subtotal": price["subtotal"],
        "pending_total": price["total_with_tax"],
        "payment_method": body.payment_method,
        "cycle_start": cycle_start_iso,
        "next_cycle_start": next_cycle_iso,
    }
    await db.settings.update_one({"key": "restaurant"}, {"$set": pending_update})
    return {
        "success": True,
        "applied": "next_cycle",
        "current_tables": current_tables,
        "pending_tables": body.tables,
        "pending_total": price["total_with_tax"],
        "cycle_start": cycle_start_iso,
        "next_cycle_start": next_cycle_iso,
    }


@router.put("/subscription/autopay")
async def toggle_autopay(body: dict):
    enable = bool(body.get("enabled", False))
    await db.settings.update_one({"key": "restaurant"}, {"$set": {"autopay_enabled": enable}})
    return {"success": True, "autopay_enabled": enable}
