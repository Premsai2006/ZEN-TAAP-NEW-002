from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_subscription
from app.models import Order, OrderCreate, OrderUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=List[Order])
async def list_orders():
    return await db.orders.find({}, {"_id": 0}).sort("order_number", -1).to_list(500)


@router.post("", response_model=Order, dependencies=[Depends(require_subscription)])
async def create_order(body: OrderCreate):
    # table 0 = walk-in; reject negative
    if body.table < 0:
        raise HTTPException(status_code=400, detail="Invalid table number")
    last = await db.orders.find({}, {"_id": 0}).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    amount = sum(i.qty * i.price for i in body.items)
    order = Order(order_number=next_num, table=body.table, items=body.items, amount=amount)
    await db.orders.insert_one(order.model_dump())
    return order


@router.put("/{order_id}", response_model=Order, dependencies=[Depends(require_subscription)])
async def update_order(order_id: str, body: OrderUpdate):
    res = await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return await db.orders.find_one({"id": order_id}, {"_id": 0})
