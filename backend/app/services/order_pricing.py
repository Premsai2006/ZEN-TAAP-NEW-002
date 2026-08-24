"""Order pricing from menu + table limit checks."""
from __future__ import annotations

from typing import List, Tuple
from fastapi import HTTPException
from app.database import db


async def reprice_items(restaurant_id: str, items) -> Tuple[list, float]:
    """Rebuild line items using menu prices; reject unknown / unavailable dishes."""
    if not items:
        raise HTTPException(status_code=400, detail="Add at least one item to the order.")

    names = [i.name for i in items]
    menu = await db.menu_items.find(
        {"restaurant_id": restaurant_id, "name": {"$in": names}},
        {"_id": 0, "id": 1, "name": 1, "price": 1, "available": 1},
    ).to_list(500)
    by_name = {m["name"]: m for m in menu}

    priced = []
    for line in items:
        m = by_name.get(line.name)
        if not m:
            raise HTTPException(
                status_code=400,
                detail=f"'{line.name}' is not on the menu anymore. Please refresh and try again.",
            )
        if m.get("available") is False:
            raise HTTPException(
                status_code=400,
                detail=f"'{line.name}' is not available right now.",
            )
        qty = int(line.qty or 0)
        if qty < 1:
            raise HTTPException(status_code=400, detail="Item quantity must be at least 1.")
        price = float(m["price"])
        priced.append({"name": m["name"], "qty": qty, "price": price})

    amount = sum(i["qty"] * i["price"] for i in priced)
    return priced, float(amount)


def enforce_table_limit(table: int, subscription_tables) -> None:
    if table < 0:
        raise HTTPException(status_code=400, detail="Please choose a valid table number.")
    # table 0 = walk-in always allowed
    if table == 0:
        return
    max_t = subscription_tables
    if max_t is None:
        return
    try:
        max_t = int(max_t)
    except Exception:
        return
    if max_t > 0 and table > max_t:
        raise HTTPException(
            status_code=400,
            detail=f"Table {table} is outside your plan ({max_t} tables). Upgrade tables or use 1–{max_t}.",
        )
