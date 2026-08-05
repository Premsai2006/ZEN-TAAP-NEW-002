from fastapi import APIRouter, HTTPException, Depends
from app.database import db
from app.deps import require_manager
from app.models import ProfileUpdate, KitchenPinUpdate
from app.services import auth_service as auth
from app.services import restaurants as rest_svc

router = APIRouter(tags=["profile"])


@router.get("/profile")
async def get_profile(sess=Depends(require_manager)):
    doc = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    return {
        "manager_name": doc.get("manager_name", ""),
        "email": doc.get("email", ""),
        "contact_number": doc.get("contact_number", ""),
        "restaurant_name": doc.get("restaurant_name", ""),
        "slug": doc.get("slug", ""),
        "restaurant_id": doc.get("id"),
    }


@router.put("/profile")
async def update_profile(body: ProfileUpdate, sess=Depends(require_manager)):
    rid = sess["restaurant_id"]
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to save — make a change first.")

    if "slug" in update and update["slug"] is not None:
        new_slug = rest_svc.validate_slug(update["slug"])
        other = await rest_svc.get_by_slug(new_slug)
        if other and other.get("id") != rid:
            raise HTTPException(status_code=400, detail="That URL name is already taken.")
        update["slug"] = new_slug

    if "contact_number" in update and update["contact_number"] is not None:
        contact = update["contact_number"].strip()
        digs = auth.digits(contact)
        if len(digs) < 7:
            raise HTTPException(status_code=400, detail="Please enter a valid phone number.")
        other = await rest_svc.get_by_phone(contact)
        if other and other.get("id") != rid:
            raise HTTPException(status_code=400, detail="That phone number is already used by another account.")
        update["contact_number"] = contact
        update["phone"] = contact
        update["phone_key"] = rest_svc.phone_key(contact)

    await rest_svc.update_restaurant(rid, update)
    doc = await rest_svc.require_restaurant_id(rid)
    return {
        "manager_name": doc.get("manager_name", ""),
        "email": doc.get("email", ""),
        "contact_number": doc.get("contact_number", ""),
        "restaurant_name": doc.get("restaurant_name", ""),
        "slug": doc.get("slug", ""),
        "restaurant_id": doc.get("id"),
    }


@router.put("/settings/kitchen-pin")
async def update_kitchen_pin(body: KitchenPinUpdate, sess=Depends(require_manager)):
    auth.validate_short_pin(body.new_pin, "Kitchen PIN")
    await rest_svc.update_restaurant(sess["restaurant_id"], {"kitchen_pin": body.new_pin})
    return {"success": True}


@router.get("/settings/kitchen-pin")
async def get_kitchen_pin(sess=Depends(require_manager)):
    doc = await rest_svc.require_restaurant_id(sess["restaurant_id"])
    return {"kitchen_pin": doc.get("kitchen_pin") or "", "customer_pin": doc.get("kitchen_pin") or ""}
