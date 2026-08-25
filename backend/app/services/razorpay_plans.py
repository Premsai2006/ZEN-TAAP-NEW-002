"""Razorpay Plan cache — one monthly plan per table tier (10–60)."""
from __future__ import annotations

import logging
from typing import Optional

from app.database import db
from app.services.pricing import compute_price, compute_price_for_restaurant
from app.services.razorpay_client import razorpay_client

logger = logging.getLogger(__name__)

COLLECTION = "razorpay_plans"


async def get_plan_id_for_tables(tables: int, *, amount_paise: Optional[int] = None) -> Optional[str]:
    """Return cached Razorpay plan_id for this table count (and optional amount override)."""
    tables = int(tables)
    if amount_paise is not None:
        row = await db[COLLECTION].find_one(
            {"tables": tables, "amount_paise": int(amount_paise), "override": True},
            {"_id": 0},
        )
        if row and row.get("plan_id"):
            return row["plan_id"]
        return await ensure_plan_for_tables(tables, amount_paise=int(amount_paise), override=True)

    row = await db[COLLECTION].find_one({"tables": tables, "override": {"$ne": True}}, {"_id": 0})
    if row and row.get("plan_id"):
        return row["plan_id"]
    return await ensure_plan_for_tables(tables)


async def get_plan_id_for_restaurant(restaurant: dict, tables: int) -> str:
    price = compute_price_for_restaurant(int(tables), restaurant)
    if price.get("billing_override"):
        return await get_plan_id_for_tables(int(tables), amount_paise=price["amount_paise"])
    return await get_plan_id_for_tables(int(tables))


async def ensure_plan_for_tables(
    tables: int,
    *,
    amount_paise: Optional[int] = None,
    override: bool = False,
) -> str:
    price = compute_price(int(tables))
    if amount_paise is None:
        amount_paise = int(round(price["total_with_tax"] * 100))
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    query = {"tables": int(tables), "amount_paise": int(amount_paise), "override": bool(override)}
    existing = await db[COLLECTION].find_one(query, {"_id": 0})
    if existing and existing.get("plan_id") and existing.get("amount_paise") == amount_paise:
        return existing["plan_id"]

    name = (
        f"ZenTaap DEMO mandate ₹{amount_paise/100:.0f}"
        if override
        else f"ZenTaap {tables} tables / month"
    )
    plan = client.plan.create(
        {
            "period": "monthly",
            "interval": 1,
            "item": {
                "name": name,
                "amount": int(amount_paise),
                "currency": "INR",
                "description": (
                    "ZenTaap demo micro-mandate"
                    if override
                    else f"ZenTaap monthly subscription — {tables} tables incl. GST"
                ),
            },
            "notes": {
                "tables": str(tables),
                "product": "zentaap",
                "override": "1" if override else "0",
            },
        }
    )
    plan_id = plan["id"]
    await db[COLLECTION].update_one(
        {"tables": int(tables), "amount_paise": int(amount_paise), "override": bool(override)},
        {
            "$set": {
                "tables": int(tables),
                "plan_id": plan_id,
                "amount_paise": int(amount_paise),
                "amount_inr": amount_paise / 100.0,
                "override": bool(override),
            }
        },
        upsert=True,
    )
    logger.info(
        "Razorpay plan ready tables=%s plan_id=%s amount_paise=%s override=%s",
        tables, plan_id, amount_paise, override,
    )
    return plan_id


async def bootstrap_all_plans(min_tables: int = 10, max_tables: int = 60) -> dict:
    """Create/cache plans for every table tier. Used by deploy script."""
    created = {}
    for tables in range(min_tables, max_tables + 1):
        created[str(tables)] = await ensure_plan_for_tables(tables)
    return created
