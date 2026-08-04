from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager
from app.models import RestaurantSettings, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=RestaurantSettings)
async def get_settings():
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0})
    if not doc:
        s = RestaurantSettings()
        await db.settings.insert_one({"key": "restaurant", **s.model_dump()})
        return s
    doc.pop("key", None)
    return RestaurantSettings(**doc)


@router.put("", response_model=RestaurantSettings, dependencies=[Depends(require_manager)])
async def update_settings(body: SettingsUpdate):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0})
    doc.pop("key", None)
    return RestaurantSettings(**doc)
