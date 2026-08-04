from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager, require_subscription
from app.models import MenuItem, MenuItemCreate, MenuItemUpdate

router = APIRouter(prefix="/menu", tags=["menu"])


@router.get("", response_model=List[MenuItem])
async def list_menu():
    items = await db.menu_items.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for it in items:
        if "images" not in it or it.get("images") is None:
            it["images"] = [it["image_url"]] if it.get("image_url") else []
    return items


@router.post("", response_model=MenuItem, dependencies=[Depends(require_manager), Depends(require_subscription)])
async def create_menu(body: MenuItemCreate):
    payload = body.model_dump()
    if payload.get("images") is None:
        payload["images"] = [payload["image_url"]] if payload.get("image_url") else []
    elif payload["images"] and not payload.get("image_url"):
        payload["image_url"] = payload["images"][0]
    item = MenuItem(**payload)
    await db.menu_items.insert_one(item.model_dump())
    return item


@router.put("/{item_id}", response_model=MenuItem, dependencies=[Depends(require_manager), Depends(require_subscription)])
async def update_menu(item_id: str, body: MenuItemUpdate):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "images" in update and "image_url" not in update:
        update["image_url"] = update["images"][0] if update["images"] else ""
    res = await db.menu_items.update_one({"id": item_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    item = await db.menu_items.find_one({"id": item_id}, {"_id": 0})
    if "images" not in item or item.get("images") is None:
        item["images"] = [item["image_url"]] if item.get("image_url") else []
    return item


@router.delete("/{item_id}", dependencies=[Depends(require_manager), Depends(require_subscription)])
async def delete_menu(item_id: str):
    res = await db.menu_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}
