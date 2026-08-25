"""Restaurant staff: owner, manager, cashier, kitchen — each with their own PIN."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.database import db
from app.services.auth_service import validate_pin
from app.services.pins import hash_pin, verify_pin

ROLES = ("owner", "manager", "cashier", "kitchen")
MANAGE_ROLES = ("owner", "manager")
FRONT_ROLES = ("owner", "manager", "cashier")


def public_staff(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "name": doc.get("name") or "",
        "role": doc.get("role") or "cashier",
        "active": bool(doc.get("active", True)),
        "created_at": doc.get("created_at"),
    }


async def list_staff(restaurant_id: str) -> list:
    docs = await db.staff.find(
        {"restaurant_id": restaurant_id},
        {"_id": 0, "pin": 0},
    ).to_list(100)
    docs.sort(key=lambda s: (s.get("role") != "owner", s.get("created_at") or ""))
    return [public_staff(s) for s in docs]


async def ensure_owner(restaurant: dict) -> dict:
    rid = restaurant["id"]
    existing = await db.staff.find_one({"restaurant_id": rid, "role": "owner"}, {"_id": 0})
    if existing:
        return existing
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "restaurant_id": rid,
        "name": restaurant.get("manager_name") or "Owner",
        "role": "owner",
        "pin": None,
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.staff.insert_one(doc)
    return doc


async def create_staff(restaurant_id: str, *, name: str, role: str, pin: str) -> dict:
    role = (role or "").strip().lower()
    if role not in ROLES or role == "owner":
        raise HTTPException(status_code=400, detail="Choose manager, cashier, or kitchen.")
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Please enter the staff member's name.")
    validate_pin(pin, new=True)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "name": name,
        "role": role,
        "pin": hash_pin(pin),
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.staff.insert_one(doc)
    return public_staff(doc)


async def set_staff_active(restaurant_id: str, staff_id: str, active: bool) -> dict:
    rec = await db.staff.find_one({"id": staff_id, "restaurant_id": restaurant_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    if rec.get("role") == "owner":
        raise HTTPException(status_code=400, detail="The owner account cannot be deactivated.")
    now = datetime.now(timezone.utc).isoformat()
    await db.staff.update_one(
        {"id": staff_id, "restaurant_id": restaurant_id},
        {"$set": {"active": bool(active), "updated_at": now}},
    )
    if not active:
        await db.sessions.delete_many({"restaurant_id": restaurant_id, "staff_id": staff_id})
    rec["active"] = bool(active)
    return public_staff(rec)


async def reset_staff_pin(restaurant_id: str, staff_id: str, pin: str) -> dict:
    rec = await db.staff.find_one({"id": staff_id, "restaurant_id": restaurant_id}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="Staff member not found.")
    if rec.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Change the owner PIN from Settings.")
    validate_pin(pin, new=True)
    now = datetime.now(timezone.utc).isoformat()
    await db.staff.update_one(
        {"id": staff_id, "restaurant_id": restaurant_id},
        {"$set": {"pin": hash_pin(pin), "updated_at": now}},
    )
    await db.sessions.delete_many({"restaurant_id": restaurant_id, "staff_id": staff_id})
    return public_staff(rec)


async def match_login(restaurant: dict, pin: str) -> Optional[dict]:
    """Return {staff_id, name, role} if PIN matches owner or an active staff member."""
    if verify_pin(pin, restaurant.get("pin")):
        owner = await ensure_owner(restaurant)
        return {"staff_id": owner["id"], "name": owner.get("name") or restaurant.get("manager_name") or "Owner", "role": "owner"}
    cursor = db.staff.find({"restaurant_id": restaurant["id"], "active": True})
    async for rec in cursor:
        stored = rec.get("pin")
        if stored and verify_pin(pin, stored):
            return {
                "staff_id": rec["id"],
                "name": rec.get("name") or "",
                "role": rec.get("role") or "cashier",
            }
    return None


async def match_kitchen_staff(restaurant_id: str, pin: str) -> Optional[dict]:
    cursor = db.staff.find({"restaurant_id": restaurant_id, "role": "kitchen", "active": True})
    async for rec in cursor:
        stored = rec.get("pin")
        if stored and verify_pin(pin, stored):
            return rec
    return None
