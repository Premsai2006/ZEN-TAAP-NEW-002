from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager, require_subscription
from app.models import MenuItem, MenuItemCreate, MenuItemUpdate

router = APIRouter(prefix="/menu", tags=["menu"])


@router.get("", response_model=List[MenuItem])
async def list_menu(sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    items = await db.menu_items.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    for it in items:
        if "images" not in it or it.get("images") is None:
            it["images"] = [it["image_url"]] if it.get("image_url") else []
    return items


@router.post("", response_model=MenuItem)
async def create_menu(body: MenuItemCreate, sess=Depends(require_subscription)):
    from app.deps import assert_role
    assert_role(sess, "owner", "manager")
    rid = sess["restaurant_id"]
    payload = body.model_dump()
    if payload.get("images") is None:
        payload["images"] = [payload["image_url"]] if payload.get("image_url") else []
    elif payload["images"] and not payload.get("image_url"):
        payload["image_url"] = payload["images"][0]
    item = MenuItem(**payload, restaurant_id=rid)
    await db.menu_items.insert_one(item.model_dump())
    return item


@router.put("/{item_id}", response_model=MenuItem)
async def update_menu(item_id: str, body: MenuItemUpdate, sess=Depends(require_subscription)):
    from app.deps import assert_role
    assert_role(sess, "owner", "manager")
    rid = sess["restaurant_id"]
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to save — make a change first.")
    if "images" in update and "image_url" not in update:
        update["image_url"] = update["images"][0] if update["images"] else ""
    res = await db.menu_items.update_one(
        {"id": item_id, "restaurant_id": rid}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="That menu item was not found.")
    item = await db.menu_items.find_one({"id": item_id, "restaurant_id": rid}, {"_id": 0})
    if "images" not in item or item.get("images") is None:
        item["images"] = [item["image_url"]] if item.get("image_url") else []
    return item


@router.delete("/{item_id}")
async def delete_menu(item_id: str, sess=Depends(require_subscription)):
    from app.deps import assert_role
    assert_role(sess, "owner", "manager")
    rid = sess["restaurant_id"]
    res = await db.menu_items.delete_one({"id": item_id, "restaurant_id": rid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="That menu item was not found.")
    return {"success": True}
