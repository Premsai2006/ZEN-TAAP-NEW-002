from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager
from app.models import ProfileUpdate, KitchenPinUpdate
from app.services import auth_service as auth

router = APIRouter(tags=["profile"])


@router.get("/profile")
async def get_profile():
    p = await auth.get_profile() or {}
    p.pop("pin", None)
    p.pop("key", None)
    return {
        "manager_name": p.get("manager_name", ""),
        "email": p.get("email", ""),
        "contact_number": p.get("contact_number", ""),
        "restaurant_name": p.get("restaurant_name", ""),
    }


@router.put("/profile", dependencies=[Depends(require_manager)])
async def update_profile(body: ProfileUpdate):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.settings.update_one({"key": "manager_profile"}, {"$set": update}, upsert=True)
    if "restaurant_name" in update:
        await db.settings.update_one(
            {"key": "restaurant"}, {"$set": {"restaurant_name": update["restaurant_name"]}}, upsert=True
        )
    return await get_profile()


@router.put("/settings/kitchen-pin", dependencies=[Depends(require_manager)])
async def update_kitchen_pin(body: KitchenPinUpdate):
    auth.validate_short_pin(body.new_pin, "Kitchen PIN")
    await db.settings.update_one(
        {"key": "restaurant"}, {"$set": {"kitchen_pin": body.new_pin}}, upsert=True
    )
    return {"success": True}


@router.get("/settings/kitchen-pin", dependencies=[Depends(require_manager)])
async def get_kitchen_pin():
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    return {"kitchen_pin": doc.get("kitchen_pin") or ""}
