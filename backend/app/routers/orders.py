from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager, require_subscription, require_manager_or_kitchen
from app.models import Order, OrderCreate, OrderUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=List[Order])
async def list_orders(sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    return await db.orders.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("order_number", -1).to_list(500)


@router.post("", response_model=Order)
async def create_order(body: OrderCreate, sess=Depends(require_subscription)):
    """Manager-created order (rare); customers use /api/r/{slug}/orders."""
    rid = sess["restaurant_id"]
    if body.table < 0:
        raise HTTPException(status_code=400, detail="Please choose a valid table number.")
    last = await db.orders.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    amount = sum(i.qty * i.price for i in body.items)
    order = Order(
        restaurant_id=rid,
        order_number=next_num,
        table=body.table,
        items=body.items,
        amount=amount,
    )
    await db.orders.insert_one(order.model_dump())
    return order


@router.put("/{order_id}", response_model=Order)
async def update_order(order_id: str, body: OrderUpdate, sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    # Kitchen/manager can update when restaurant has access; soft-check via status on restaurant
    from app.deps import has_active_subscription
    if not await has_active_subscription(rid):
        raise HTTPException(
            status_code=402,
            detail="Subscribe to ZenTaap to use this feature. You can browse the dashboard freely.",
        )
    res = await db.orders.update_one(
        {"id": order_id, "restaurant_id": rid},
        {"$set": {"status": body.status}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="That order was not found.")
    return await db.orders.find_one({"id": order_id, "restaurant_id": rid}, {"_id": 0})
