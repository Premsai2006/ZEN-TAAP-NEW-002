from typing import List
from fastapi import APIRouter, HTTPException
from app.database import db
from app.deps import has_active_subscription
from app.models import Order, OrderCreate, MenuItem, Category
from app.services import restaurants as rest_svc
from app.services.order_pricing import reprice_items, enforce_table_limit
from app.services import table_sessions as sess_svc
from app.services.subscription_access import refresh_subscription_status, has_access_status

router = APIRouter(prefix="/r", tags=["public-restaurant"])


async def _public_access(doc: dict) -> tuple[dict, str, bool]:
    """Refresh billing status and decide if QR ordering is live."""
    if doc.get("suspended"):
        status = str(doc.get("subscription_status") or "none")
        return doc, status, False
    fresh, status = await refresh_subscription_status(doc["id"], doc)
    return fresh, status, has_access_status(status)


@router.get("/{slug}")
async def get_public_restaurant(slug: str):
    doc = await rest_svc.require_by_slug(slug)
    fresh, status, enabled = await _public_access(doc)
    return rest_svc.public_restaurant_view(
        fresh,
        ordering_enabled=enabled,
        subscription_status=status,
    )


@router.get("/{slug}/menu", response_model=List[MenuItem])
async def public_menu(slug: str):
    doc = await rest_svc.require_by_slug(slug)
    _fresh, _status, enabled = await _public_access(doc)
    if not enabled:
        return []
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
    _fresh, _status, enabled = await _public_access(doc)
    if not enabled:
        return []
    return await db.categories.find(
        {"restaurant_id": doc["id"]}, {"_id": 0}
    ).sort("name", 1).to_list(500)


@router.post("/{slug}/orders", response_model=Order)
async def public_create_order(slug: str, body: OrderCreate):
    doc = await rest_svc.require_by_slug(slug)
    if doc.get("suspended"):
        raise HTTPException(
            status_code=403,
            detail="This restaurant is not accepting orders right now.",
        )
    if not await has_active_subscription(doc["id"]):
        raise HTTPException(
            status_code=402,
            detail="Subscription expired. This restaurant is not accepting orders.",
        )
    enforce_table_limit(body.table, doc.get("subscription_tables"))
    priced_items, amount = await reprice_items(doc["id"], body.items)
    notes = (body.notes or "")[:500] or None
    return await sess_svc.create_attached_order(doc["id"], body.table, priced_items, amount, notes)


@router.get("/{slug}/tables/{table}/session")
async def public_table_session(slug: str, table: int):
    doc = await rest_svc.require_by_slug(slug)
    _fresh, _status, enabled = await _public_access(doc)
    if not enabled or table < 1:
        return {"session": None}
    enforce_table_limit(table, doc.get("subscription_tables"))
    return await sess_svc.public_table_session(doc["id"], table)
