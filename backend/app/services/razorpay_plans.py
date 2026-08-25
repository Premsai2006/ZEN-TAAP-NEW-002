"""Razorpay Plan cache — one monthly plan per table tier (10–60)."""
from __future__ import annotations

import logging
from typing import Optional

from app.database import db
from app.services.pricing import compute_price
from app.services.razorpay_client import razorpay_client

logger = logging.getLogger(__name__)

COLLECTION = "razorpay_plans"


async def get_plan_id_for_tables(tables: int) -> Optional[str]:
    """Return cached Razorpay plan_id for this table count, creating if needed."""
    row = await db[COLLECTION].find_one({"tables": int(tables)}, {"_id": 0})
    if row and row.get("plan_id"):
        return row["plan_id"]
    return await ensure_plan_for_tables(int(tables))


async def ensure_plan_for_tables(tables: int) -> str:
    price = compute_price(int(tables))
    amount_paise = int(round(price["total_with_tax"] * 100))
    client = razorpay_client()
    if not client:
        raise RuntimeError("Razorpay is not configured")

    existing = await db[COLLECTION].find_one({"tables": int(tables)}, {"_id": 0})
    if existing and existing.get("plan_id") and existing.get("amount_paise") == amount_paise:
        return existing["plan_id"]

    plan = client.plan.create(
        {
            "period": "monthly",
            "interval": 1,
            "item": {
                "name": f"ZenTaap {tables} tables / month",
                "amount": amount_paise,
                "currency": "INR",
                "description": f"ZenTaap monthly subscription — {tables} tables incl. GST",
            },
            "notes": {"tables": str(tables), "product": "zentaap"},
        }
    )
    plan_id = plan["id"]
    await db[COLLECTION].update_one(
        {"tables": int(tables)},
        {
            "$set": {
                "tables": int(tables),
                "plan_id": plan_id,
                "amount_paise": amount_paise,
                "amount_inr": price["total_with_tax"],
            }
        },
        upsert=True,
    )
    logger.info("Razorpay plan ready tables=%s plan_id=%s amount_paise=%s", tables, plan_id, amount_paise)
    return plan_id


async def bootstrap_all_plans(min_tables: int = 10, max_tables: int = 60) -> dict:
    """Create/cache plans for every table tier. Used by deploy script."""
    created = {}
    for tables in range(min_tables, max_tables + 1):
        created[str(tables)] = await ensure_plan_for_tables(tables)
    return created
