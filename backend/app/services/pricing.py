from datetime import datetime, timezone
from math import ceil
from typing import Optional
import time

from fastapi import HTTPException

from app.config import BASE_FEE, PER_TABLE, GST_RATE, MIN_TABLES, MAX_TABLES
from app.services.subscription_access import BILLING_CYCLE_DAYS, parse_dt

_cache = {
    "base_fee": float(BASE_FEE),
    "per_table": float(PER_TABLE),
    "gst_rate": float(GST_RATE),
    "min_tables": int(MIN_TABLES),
    "max_tables": int(MAX_TABLES),
    "updated_at": None,
    "updated_by": "",
}
_loaded_at = 0.0
_CACHE_TTL = 2.0


def get_pricing_config() -> dict:
    return dict(_cache)


def apply_pricing_cache(doc: dict) -> dict:
    if not doc:
        return get_pricing_config()
    if doc.get("base_fee") is not None:
        _cache["base_fee"] = float(doc["base_fee"])
    if doc.get("per_table") is not None:
        _cache["per_table"] = float(doc["per_table"])
    if doc.get("gst_rate") is not None:
        _cache["gst_rate"] = float(doc["gst_rate"])
    if doc.get("min_tables") is not None:
        _cache["min_tables"] = int(doc["min_tables"])
    if doc.get("max_tables") is not None:
        _cache["max_tables"] = int(doc["max_tables"])
    if "updated_at" in doc:
        _cache["updated_at"] = doc.get("updated_at")
    if "updated_by" in doc:
        _cache["updated_by"] = doc.get("updated_by") or ""
    return get_pricing_config()


def compute_price(tables: int) -> dict:
    cfg = _cache
    lo, hi = 1, 500
    if tables < lo or tables > hi:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {lo} and {hi} tables.",
        )
    per = cfg["per_table"]
    base = 0  # per-table only; platform base fee is not used
    gst_rate = cfg["gst_rate"]
    subtotal = round(base + per * tables, 2)
    gst = round(subtotal * gst_rate, 2)
    total = round(subtotal + gst, 2)
    gst_pct = gst_rate * 100
    gst_rate_pct = int(round(gst_pct)) if abs(gst_pct - round(gst_pct)) < 0.001 else round(gst_pct, 2)
    return {
        "tables": tables,
        "base_fee": base,
        "per_table": per,
        "tables_subtotal": round(per * tables, 2),
        "subtotal": subtotal,
        "gst_rate_pct": gst_rate_pct,
        "gst_amount": gst,
        "total_with_tax": total,
        "per_table_with_tax": round(total / tables, 2) if tables else 0,
        "amount_paise": int(round(total * 100)),
        "billing_override": False,
        "min_tables": lo,
        "max_tables": hi,
    }


def restaurant_billing_override_paise(restaurant: Optional[dict]) -> Optional[int]:
    """Per-restaurant micro-mandate amount (paise). Disabled — not custom restaurant pricing."""
    return None
    # if not restaurant:
    #     return None
    # raw = restaurant.get("billing_override_paise")
    # if raw is None:
    #     return None
    # try:
    #     paise = int(raw)
    # except Exception:
    #     return None
    # # Allow ₹1–₹10 only for safety
    # if paise < 100 or paise > 1000:
    #     return None
    # return paise


def compute_price_for_restaurant(tables: int, restaurant: Optional[dict] = None) -> dict:
    """Normal pricing, or fixed micro amount when restaurant has billing_override_paise."""
    base = compute_price(tables)
    override = restaurant_billing_override_paise(restaurant)
    if not override:
        return base
    gst_rate = _cache["gst_rate"]
    total = round(override / 100.0, 2)
    subtotal = round(total / (1 + gst_rate), 2)
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
    cfg = _cache
    lo, hi = 1, 500
    gst_rate = cfg["gst_rate"]
    if new_tables <= current_tables:
        raise HTTPException(status_code=400, detail="New table count must be higher than your current plan.")
    if new_tables < lo or new_tables > hi:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {lo} and {hi} tables.",
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
            "monthly_current": compute_price(current_tables)["total_with_tax"] if current_tables >= lo else 0,
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
    gst_pct = gst_rate * 100
    gst_rate_pct = int(round(gst_pct)) if abs(gst_pct - round(gst_pct)) < 0.001 else round(gst_pct, 2)
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
        "gst_rate_pct": gst_rate_pct,
        "total_with_tax": prorated_total,
        "amount_paise": int(round(prorated_total * 100)),
        "message": (
            f"Pay for {extra} extra table(s) for the remaining {remaining_days} day(s). "
            f"From {next_dt.date().isoformat()} you'll be billed the full {new_tables}-table plan."
        ),
    }


async def hydrate_pricing(force: bool = False):
    """Load admin-configured pricing from Mongo, or persist current defaults."""
    global _loaded_at
    if not force and _loaded_at and (time.monotonic() - _loaded_at) < _CACHE_TTL:
        return get_pricing_config()
    from app.database import db

    defaults = {
        "key": "pricing",
        "base_fee": float(BASE_FEE),
        "per_table": float(PER_TABLE),
        "gst_rate": float(GST_RATE),
        "min_tables": int(MIN_TABLES),
        "max_tables": int(MAX_TABLES),
    }
    doc = await db.app_config.find_one({"key": "pricing"})
    if not doc:
        await db.app_config.insert_one({
            **defaults,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        apply_pricing_cache(defaults)
        _loaded_at = time.monotonic()
        return get_pricing_config()
    apply_pricing_cache(doc)
    _loaded_at = time.monotonic()
    return get_pricing_config()


async def save_pricing(fields: dict, updated_by: str = "") -> dict:
    from app.database import db

    payload = {
        "key": "pricing",
        "base_fee": float(fields["base_fee"]),
        "per_table": float(fields["per_table"]),
        "gst_rate": float(fields["gst_rate"]),
        "min_tables": int(fields["min_tables"]),
        "max_tables": int(fields["max_tables"]),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": updated_by or "",
    }
    await db.app_config.update_one({"key": "pricing"}, {"$set": payload}, upsert=True)
    global _loaded_at
    _loaded_at = time.monotonic()
    return apply_pricing_cache(payload)
