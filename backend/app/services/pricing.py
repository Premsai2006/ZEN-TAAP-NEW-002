from fastapi import HTTPException
from datetime import datetime, timezone
from math import ceil
from typing import Optional

from app.config import BASE_FEE, PER_TABLE, GST_RATE, MIN_TABLES, MAX_TABLES
from app.services.subscription_access import BILLING_CYCLE_DAYS, parse_dt


def compute_price(tables: int) -> dict:
    if tables < MIN_TABLES or tables > MAX_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {MIN_TABLES} and {MAX_TABLES} tables.",
        )
    subtotal = round(BASE_FEE + PER_TABLE * tables, 2)
    gst = round(subtotal * GST_RATE, 2)
    total = round(subtotal + gst, 2)
    return {
        "tables": tables,
        "base_fee": BASE_FEE,
        "per_table": PER_TABLE,
        "tables_subtotal": round(PER_TABLE * tables, 2),
        "subtotal": subtotal,
        "gst_rate_pct": int(GST_RATE * 100),
        "gst_amount": gst,
        "total_with_tax": total,
        "per_table_with_tax": round(total / tables, 2) if tables else 0,
        "amount_paise": int(round(total * 100)),
        "billing_override": False,
    }


def restaurant_billing_override_paise(restaurant: Optional[dict]) -> Optional[int]:
    """Per-restaurant micro-mandate amount (paise). Only set on demo accounts."""
    if not restaurant:
        return None
    raw = restaurant.get("billing_override_paise")
    if raw is None:
        return None
    try:
        paise = int(raw)
    except Exception:
        return None
    # Allow ₹1–₹10 only for safety
    if paise < 100 or paise > 1000:
        return None
    return paise


def compute_price_for_restaurant(tables: int, restaurant: Optional[dict] = None) -> dict:
    """Normal pricing, or fixed micro amount when restaurant has billing_override_paise."""
    base = compute_price(tables)
    override = restaurant_billing_override_paise(restaurant)
    if not override:
        return base
    total = round(override / 100.0, 2)
    subtotal = round(total / (1 + GST_RATE), 2)
    gst = round(total - subtotal, 2)
    return {
        **base,
        "subtotal": subtotal,
        "gst_amount": gst,
        "total_with_tax": total,
        "per_table_with_tax": round(total / tables, 2) if tables else 0,
        "amount_paise": override,
        "billing_override": True,
        "billing_override_paise": override,
        "message": f"Demo mandate account — charged ₹{total:.2f} only (not standard pricing).",
    }


def compute_upgrade_proration(
    current_tables: int,
    new_tables: int,
    next_cycle_start: Optional[str],
    now: Optional[datetime] = None,
    restaurant: Optional[dict] = None,
) -> dict:
    """
    Charge only the price difference for remaining days in the current cycle.
    Keeps next_cycle_start unchanged after payment.
    """
    if new_tables <= current_tables:
        raise HTTPException(status_code=400, detail="New table count must be higher than your current plan.")
    if new_tables < MIN_TABLES or new_tables > MAX_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {MIN_TABLES} and {MAX_TABLES} tables.",
        )

    override = restaurant_billing_override_paise(restaurant)
    if override:
        return {
            "kind": "upgrade_proration",
            "current_tables": current_tables,
            "new_tables": new_tables,
            "extra_tables": new_tables - current_tables,
            "remaining_days": 1,
            "cycle_days": BILLING_CYCLE_DAYS,
            "next_cycle_start": next_cycle_start,
            "preserve_cycle": True,
            "monthly_current": override / 100.0,
            "monthly_new": override / 100.0,
            "monthly_diff": 0,
            "subtotal": round(override / 100.0, 2),
            "gst_amount": 0,
            "gst_rate_pct": 0,
            "total_with_tax": round(override / 100.0, 2),
            "amount_paise": override,
            "billing_override": True,
            "message": f"Demo upgrade — pay ₹{override/100:.2f} to unlock more tables.",
        }

    now = now or datetime.now(timezone.utc)
    next_dt = parse_dt(next_cycle_start)
    if not next_dt or next_dt <= now:
        full = compute_price(new_tables)
        return {
            "kind": "full_cycle",
            "current_tables": current_tables,
            "new_tables": new_tables,
            "extra_tables": new_tables - current_tables,
            "remaining_days": BILLING_CYCLE_DAYS,
            "cycle_days": BILLING_CYCLE_DAYS,
            "next_cycle_start": (now.isoformat() if not next_dt else next_cycle_start),
            "preserve_cycle": False,
            "monthly_current": compute_price(current_tables)["total_with_tax"] if current_tables >= MIN_TABLES else 0,
            "monthly_new": full["total_with_tax"],
            "monthly_diff": full["total_with_tax"],
            "subtotal": full["subtotal"],
            "gst_amount": full["gst_amount"],
            "total_with_tax": full["total_with_tax"],
            "amount_paise": int(round(full["total_with_tax"] * 100)),
        }

    remaining_sec = (next_dt - now).total_seconds()
    remaining_days = max(1, ceil(remaining_sec / 86400))
    remaining_days = min(remaining_days, BILLING_CYCLE_DAYS)

    old_p = compute_price(current_tables)
    new_p = compute_price(new_tables)
    monthly_diff = round(new_p["total_with_tax"] - old_p["total_with_tax"], 2)
    prorated_total = round(monthly_diff * (remaining_days / BILLING_CYCLE_DAYS), 2)
    if prorated_total < 1:
        prorated_total = 1.0

    monthly_sub_diff = round(new_p["subtotal"] - old_p["subtotal"], 2)
    ratio = remaining_days / BILLING_CYCLE_DAYS
    prorated_sub = round(monthly_sub_diff * ratio, 2)
    prorated_gst = round(prorated_total - prorated_sub, 2)

    extra = new_tables - current_tables
    return {
        "kind": "upgrade_proration",
        "current_tables": current_tables,
        "new_tables": new_tables,
        "extra_tables": extra,
        "remaining_days": remaining_days,
        "cycle_days": BILLING_CYCLE_DAYS,
        "next_cycle_start": next_dt.isoformat(),
        "preserve_cycle": True,
        "monthly_current": old_p["total_with_tax"],
        "monthly_new": new_p["total_with_tax"],
        "monthly_diff": monthly_diff,
        "per_extra_table_month": round(monthly_diff / extra, 2) if extra else 0,
        "subtotal": prorated_sub,
        "gst_amount": prorated_gst,
        "gst_rate_pct": int(GST_RATE * 100),
        "total_with_tax": prorated_total,
        "amount_paise": int(round(prorated_total * 100)),
        "message": (
            f"Pay for {extra} extra table(s) for the remaining {remaining_days} day(s). "
            f"From {next_dt.date().isoformat()} you'll be billed the full {new_tables}-table plan."
        ),
    }
