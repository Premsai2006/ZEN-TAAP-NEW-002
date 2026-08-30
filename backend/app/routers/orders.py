from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.database import db
from app.deps import require_manager, require_subscription, require_manager_or_kitchen, assert_role, has_active_subscription
from app.models import Order, OrderCreate, OrderUpdate
from app.services.order_pricing import reprice_items, enforce_table_limit
from app.services import restaurants as rest_svc
from app.services import table_sessions as sess_svc

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
    assert_role(sess, "owner", "manager", "cashier")
    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    enforce_table_limit(body.table, doc.get("subscription_tables"))
    priced_items, amount = await reprice_items(rid, body.items)
    notes = (getattr(body, "notes", None) or "")[:500] or None
    return await sess_svc.create_attached_order(rid, body.table, priced_items, amount, notes)


@router.put("/{order_id}", response_model=Order)
async def update_order(order_id: str, body: OrderUpdate, sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    if body.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid order status.")
    existing = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="That order was not found.")
    if not await has_active_subscription(rid):
        # Expired restaurants may finish in-flight tickets; new work stays locked.
        if existing.get("status") not in ("new", "cooking", "done", "delivered"):
            raise HTTPException(
                status_code=402,
                detail="Subscribe to ZenTaap to use this feature. You can browse the dashboard freely.",
            )
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
    if body.status in ("cancelled", "paid"):
        await sess_svc.maybe_close_empty_session(rid, existing.get("session_id"))
    return await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})


@router.post("/{order_id}/settle")
async def settle_order(order_id: str, body: SettleBody, sess=Depends(require_manager)):
    """Mark bill paid (cash/UPI/etc.) and optionally clear the table's open tickets."""
    assert_role(sess, "owner", "manager", "cashier")
    rid = sess["restaurant_id"]
    mode = (body.payment_mode or "cash").lower().strip()
    if mode not in ("cash", "upi", "card", "other"):
        raise HTTPException(status_code=400, detail="Choose cash, UPI, card, or other.")
    order = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="That order was not found.")
    if order.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot settle a cancelled order.")
    if not await has_active_subscription(rid) and order.get("status") not in ("new", "cooking", "done", "delivered"):
        raise HTTPException(
            status_code=402,
            detail="Subscribe to ZenTaap to use this feature. You can browse the dashboard freely.",
        )
    session_id = order.get("session_id")
    table = int(order.get("table") or 0)
    if body.clear_table:
        if table > 0 and not session_id:
            session = await sess_svc.attach_or_open_session(rid, table)
            session_id = session["id"]
            await db.orders.update_one(
                {"id": order_id, "restaurant_id": rid},
                {"$set": {"session_id": session_id, "session_code": session.get("session_code")}},
            )
        if session_id:
            closed = await sess_svc.settle_session(rid, session_id, mode)
            updated = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
            paid_n = sum(1 for o in closed.get("orders") or [] if o.get("status") == "paid")
            return {
                "success": True,
                "order": updated,
                "session": closed,
                "table_orders_cleared": max(paid_n - 1, 0),
            }

    now = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id, "restaurant_id": rid},
        {"$set": {"status": "paid", "paid_at": now, "payment_mode": mode}},
    )
    await sess_svc.maybe_close_empty_session(rid, session_id)
    updated = await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
    return {"success": True, "order": updated, "table_orders_cleared": 0}
