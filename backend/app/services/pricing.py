from datetime import datetime, timezone
from fastapi import HTTPException
from app.config import BASE_FEE, PER_TABLE, GST_RATE, MIN_TABLES, MAX_TABLES

_cache = {
    "base_fee": float(BASE_FEE),
    "per_table": float(PER_TABLE),
    "gst_rate": float(GST_RATE),
    "min_tables": int(MIN_TABLES),
    "max_tables": int(MAX_TABLES),
    "updated_at": None,
    "updated_by": "",
}


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
    lo, hi = cfg["min_tables"], cfg["max_tables"]
    if tables < lo or tables > hi:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {lo} and {hi} tables.",
        )
    per = cfg["per_table"]
    base = cfg["base_fee"]
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
        "min_tables": lo,
        "max_tables": hi,
    }


async def hydrate_pricing():
    """Load admin-configured pricing from Mongo, or persist current defaults."""
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
        return apply_pricing_cache(defaults)
    return apply_pricing_cache(doc)


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
    return apply_pricing_cache(payload)
