from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import has_active_subscription
from app.models import Order, OrderCreate, MenuItem, Category
from app.services import restaurants as rest_svc

router = APIRouter(prefix="/r", tags=["public-restaurant"])


@router.get("/{slug}")
async def get_public_restaurant(slug: str):
    doc = await rest_svc.require_by_slug(slug)
    return rest_svc.public_restaurant_view(doc)


@router.get("/{slug}/menu", response_model=List[MenuItem])
async def public_menu(slug: str):
    doc = await rest_svc.require_by_slug(slug)
    items = await db.menu_items.find(
        {"restaurant_id": doc["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    for it in items:
        if "images" not in it or it.get("images") is None:
            it["images"] = [it["image_url"]] if it.get("image_url") else []
    return items


@router.get("/{slug}/categories", response_model=List[Category])
async def public_categories(slug: str):
    doc = await rest_svc.require_by_slug(slug)
    return await db.categories.find(
        {"restaurant_id": doc["id"]}, {"_id": 0}
    ).sort("name", 1).to_list(500)


@router.post("/{slug}/orders", response_model=Order)
async def public_create_order(slug: str, body: OrderCreate):
    doc = await rest_svc.require_by_slug(slug)
    if not await has_active_subscription(doc["id"]):
        raise HTTPException(
            status_code=402,
            detail="This restaurant is not accepting orders right now.",
        )
    if body.table < 0:
        raise HTTPException(status_code=400, detail="Please choose a valid table number.")
    last = await db.orders.find(
        {"restaurant_id": doc["id"]}, {"_id": 0}
    ).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    amount = sum(i.qty * i.price for i in body.items)
    order = Order(
        restaurant_id=doc["id"],
        order_number=next_num,
        table=body.table,
        items=body.items,
        amount=amount,
    )
    payload = order.model_dump()
    await db.orders.insert_one(payload)
    return order
