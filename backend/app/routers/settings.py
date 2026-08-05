from fastapi import APIRouter, HTTPException, Depends
from app.deps import require_manager
from app.models import RestaurantSettings, SettingsUpdate
from app.services import restaurants as rest_svc

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=RestaurantSettings)
async def get_settings(sess=Depends(require_manager)):
    doc = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    return RestaurantSettings(**rest_svc.settings_view(doc))


@router.put("", response_model=RestaurantSettings)
async def update_settings(body: SettingsUpdate, sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to save — make a change first.")
    if "phone" in update and update["phone"] is not None:
        update["phone"] = update["phone"].strip()
    await rest_svc.update_restaurant(rid, update)
    doc = await rest_svc.require_restaurant_id(rid)
    return RestaurantSettings(**rest_svc.settings_view(doc))
