from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from app.database import db
from app.deps import require_manager, require_subscription, require_manager_or_kitchen
from app.models import Order, OrderCreate, OrderUpdate, OrderItem
from app.services.order_pricing import reprice_items, enforce_table_limit
from app.services import restaurants as rest_svc

router = APIRouter(prefix="/orders", tags=["orders"])

ALLOWED_STATUSES = {"new", "cooking", "done", "delivered", "cancelled", "paid"}


class SettleBody(BaseModel):
    payment_mode: str = "cash"  # cash | upi | card | other
    clear_table: bool = True


@router.get("", response_model=List[Order])
async def list_orders(sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    return await db.orders.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("order_number", -1).to_list(500)


@router.post("", response_model=Order)
async def create_order(body: OrderCreate, sess=Depends(require_subscription)):
    """Manager / counter walk-in order. Prices recalculated from menu."""
    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    enforce_table_limit(body.table, doc.get("subscription_tables"))
    priced_items, amount = await reprice_items(rid, body.items)
    last = await db.orders.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    items = [OrderItem(**i) for i in priced_items]
    notes = (getattr(body, "notes", None) or "")[:500]
    order = Order(
        restaurant_id=rid,
        order_number=next_num,
        table=body.table,
        items=items,
        amount=amount,
        notes=notes or None,
    )
    payload = order.model_dump()
    await db.orders.insert_one(payload)
    return order


@router.put("/{order_id}", response_model=Order)
async def update_order(order_id: str, body: OrderUpdate, sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    from app.deps import has_active_subscription
    if not await has_active_subscription(rid):
        raise HTTPException(
            status_code=402,
            detail="Subscribe to ZenTaap to use this feature. You can browse the dashboard freely.",
        )
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid order status.")
    existing = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="That order was not found.")
    if existing.get("status") == "cancelled" and body.status != "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled orders cannot be reopened.")
    updates = {"status": body.status}
    if body.status == "cancelled":
        updates["cancelled_at"] = datetime.now(timezone.utc).isoformat()
    if body.status == "paid":
        updates["paid_at"] = datetime.now(timezone.utc).isoformat()
        updates["payment_mode"] = "manual"
    res = await db.orders.update_one(
        {"id": order_id, "restaurant_id": rid},
        {"$set": updates},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="That order was not found.")
    return await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})


@router.post("/{order_id}/settle")
async def settle_order(order_id: str, body: SettleBody, sess=Depends(require_subscription)):
    """Mark bill paid (cash/UPI/etc.) and optionally clear the table's open tickets."""
    rid = sess["restaurant_id"]
    mode = (body.payment_mode or "cash").lower().strip()
    if mode not in ("cash", "upi", "card", "other"):
        raise HTTPException(status_code=400, detail="Choose cash, UPI, card, or other.")
    order = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="That order was not found.")
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot settle a cancelled order.")
    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id, "restaurant_id": rid},
        {"$set": {"status": "paid", "paid_at": now, "payment_mode": mode}},
    )
    cleared = 0
    if body.clear_table and order.get("table", 0) > 0:
        r = await db.orders.update_many(
            {
                "restaurant_id": rid,
                "table": order["table"],
                "status": {"$in": ["new", "cooking", "done", "delivered"]},
            },
            {"$set": {"status": "paid", "paid_at": now, "payment_mode": mode}},
        )
        cleared = r.modified_count
    updated = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    return {"success": True, "order": updated, "table_orders_cleared": cleared}
