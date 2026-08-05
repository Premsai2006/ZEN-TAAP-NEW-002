from typing import List
from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager, require_subscription
from app.models import Category, CategoryCreate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=List[Category])
async def list_categories(sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    return await db.categories.find(
        {"restaurant_id": rid}, {"_id": 0}
    ).sort("name", 1).to_list(500)


@router.post("", response_model=Category)
async def create_category(body: CategoryCreate, sess=Depends(require_subscription)):
    rid = sess["restaurant_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter a category name.")
    existing = await db.categories.find_one({
        "restaurant_id": rid,
        "name": {"$regex": f"^{name}$", "$options": "i"},
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="A category with that name already exists.")
    slug = name.lower().replace(" ", "-").replace("&", "and")
    cat = Category(name=name, slug=slug, restaurant_id=rid)
    await db.categories.insert_one(cat.model_dump())
    return cat


@router.put("/{cat_id}", response_model=Category)
async def rename_category(cat_id: str, body: CategoryCreate, sess=Depends(require_subscription)):
    rid = sess["restaurant_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter a category name.")
    cat = await db.categories.find_one({"id": cat_id, "restaurant_id": rid}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="That category was not found.")
    dup = await db.categories.find_one({
        "restaurant_id": rid,
        "id": {"$ne": cat_id},
        "name": {"$regex": f"^{name}$", "$options": "i"},
    }, {"_id": 0})
    if dup:
        raise HTTPException(status_code=400, detail="A category with that name already exists.")
    slug = name.lower().replace(" ", "-").replace("&", "and")
    old_name = cat["name"]
    await db.categories.update_one(
        {"id": cat_id, "restaurant_id": rid},
        {"$set": {"name": name, "slug": slug}},
    )
    await db.menu_items.update_many(
        {"restaurant_id": rid, "category": old_name},
        {"$set": {"category": name}},
    )
    return Category(id=cat_id, name=name, slug=slug, restaurant_id=rid)


@router.delete("/{cat_id}")
async def delete_category(cat_id: str, sess=Depends(require_subscription)):
    rid = sess["restaurant_id"]
    cat = await db.categories.find_one({"id": cat_id, "restaurant_id": rid}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="That category was not found.")
    await db.menu_items.update_many(
        {"restaurant_id": rid, "category": cat["name"]},
        {"$set": {"category": ""}},
    )
    await db.categories.delete_one({"id": cat_id, "restaurant_id": rid})
    return {"success": True}
