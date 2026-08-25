"""Multi-tenant restaurant helpers + one-time migration from singleton settings."""
from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from typing import Optional

from fastapi import HTTPException

from app.database import db
from app.services.auth_service import digits

logger = logging.getLogger("zentaap.restaurants")

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_slug(raw: str) -> str:
    """Only lowercase letters, digits, and hyphens. Apostrophes/special chars are removed."""
    s = unicodedata.normalize("NFKD", raw or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.strip().lower()
    # Drop apostrophe-like characters entirely (BT's → bts, not bt-s)
    s = re.sub(r"[''`´]", "", s)
    # Any other non-alphanumeric → hyphen
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def validate_slug(slug: str) -> str:
    slug = normalize_slug(slug)
    if len(slug) < 2 or len(slug) > 48:
        raise HTTPException(
            status_code=400,
            detail="Restaurant URL must be 2–48 characters using only letters, numbers, and hyphens.",
        )
    if not SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="Restaurant URL can only use lowercase letters, numbers, and hyphens — no spaces or special characters.",
        )
    reserved = {"api", "login", "signup", "manager", "kitchen", "customer", "subscribe", "r", "www", "admin"}
    if slug in reserved:
        raise HTTPException(status_code=400, detail="That URL name is reserved. Please choose another.")
    return slug


def phone_key(contact: str) -> str:
    d = digits(contact)
    return d[-10:] if len(d) >= 10 else d


async def get_by_id(restaurant_id: str) -> Optional[dict]:
    if not restaurant_id:
        return None
    return await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})


async def get_by_slug(slug: str) -> Optional[dict]:
    slug = normalize_slug(slug)
    if not slug:
        return None
    return await db.restaurants.find_one({"slug": slug}, {"_id": 0})


async def get_by_phone(contact: str) -> Optional[dict]:
    key = phone_key(contact)
    if len(key) < 7:
        return None
    doc = await db.restaurants.find_one({"phone_key": key}, {"_id": 0})
    if doc:
        return doc
    cursor = db.restaurants.find({}, {"_id": 0})
    async for row in cursor:
        saved = phone_key(row.get("contact_number") or row.get("phone") or "")
        if saved and saved == key:
            return row
    return None


async def require_restaurant_id(restaurant_id: str) -> dict:
    doc = await get_by_id(restaurant_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Restaurant not found.")
    return doc


async def require_by_slug(slug: str) -> dict:
    doc = await get_by_slug(slug)
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="No restaurant found with that URL. Check Manager → Profile for your restaurant URL.",
        )
    return doc


async def update_restaurant(restaurant_id: str, fields: dict) -> None:
    await db.restaurants.update_one({"id": restaurant_id}, {"$set": fields})


async def ensure_indexes():
    try:
        await db.restaurants.create_index("slug", unique=True)
        await db.restaurants.create_index("phone_key", unique=True)
        await db.restaurants.create_index("id", unique=True)
        await db.menu_items.create_index([("restaurant_id", 1), ("id", 1)])
        await db.categories.create_index([("restaurant_id", 1), ("id", 1)])
        await db.orders.create_index([("restaurant_id", 1), ("order_number", -1)])
        await db.sessions.create_index([("restaurant_id", 1), ("scope", 1), ("device_id", 1)])
        await db.staff.create_index([("restaurant_id", 1), ("id", 1)])
        await db.admin_audit.create_index("created_at")
        await db.payments.create_index("payment_id", sparse=True)
        await db.restaurants.create_index("razorpay_subscription_id", sparse=True)
        await db.razorpay_plans.create_index("tables", unique=True)
    except Exception as e:
        logger.warning("Index ensure skipped/failed: %s", e)


async def migrate_singleton_to_restaurants() -> Optional[str]:
    """
    If legacy settings.manager_profile / settings.restaurant exist and no restaurants yet,
    create one restaurant and backfill restaurant_id on menu/orders/categories/sessions.
    """
    existing = await db.restaurants.find_one({}, {"_id": 0, "id": 1})
    if existing:
        return existing.get("id")

    profile = await db.settings.find_one({"key": "manager_profile"}, {"_id": 0}) or {}
    rest = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    pin = profile.get("pin")
    if not pin:
        legacy = await db.settings.find_one({"key": "manager_pin"}, {"_id": 0})
        pin = legacy.get("value") if legacy else None
    if not pin and not rest:
        return None

    name = (profile.get("restaurant_name") or rest.get("restaurant_name") or "restaurant").strip()
    slug = normalize_slug(name) or "restaurant"
    # Ensure unique slug
    base = slug
    n = 1
    while await db.restaurants.find_one({"slug": slug}):
        n += 1
        slug = f"{base}-{n}"

    contact = (profile.get("contact_number") or rest.get("phone") or "").strip()
    rid = str(uuid.uuid4())
    doc = {
        "id": rid,
        "slug": slug,
        "manager_name": (profile.get("manager_name") or "").strip(),
        "restaurant_name": name or "ZenTaap Restaurant",
        "contact_number": contact,
        "phone": contact or (rest.get("phone") or ""),
        "phone_key": phone_key(contact or rest.get("phone") or "") or f"migrated-{rid[:8]}",
        "email": (profile.get("email") or "").strip(),
        "pin": pin or "",
        "logo_url": rest.get("logo_url") or "",
        "gst_number": rest.get("gst_number") or "",
        "gst_rate": rest.get("gst_rate"),
        "address": rest.get("address") or "",
        "printer_type": rest.get("printer_type") or "browser",
        "theme": rest.get("theme") or "dark",
        "kitchen_pin": rest.get("kitchen_pin") or "",
        "customer_pin": rest.get("customer_pin") or "",
        "subscription_plan": rest.get("subscription_plan"),
        "subscription_status": rest.get("subscription_status") or "none",
        "subscription_tables": rest.get("subscription_tables"),
        "subscription_subtotal": rest.get("subscription_subtotal"),
        "subscription_gst": rest.get("subscription_gst"),
        "subscription_total": rest.get("subscription_total"),
        "trial_start": rest.get("trial_start"),
        "trial_end": rest.get("trial_end"),
        "cycle_start": rest.get("cycle_start"),
        "next_cycle_start": rest.get("next_cycle_start"),
        "payment_method": rest.get("payment_method"),
        "pending_tables": rest.get("pending_tables"),
        "pending_subtotal": rest.get("pending_subtotal"),
        "pending_total": rest.get("pending_total"),
        "autopay_enabled": bool(rest.get("autopay_enabled", False)),
        "autopay": rest.get("autopay", True),
        "razorpay_customer_id": rest.get("razorpay_customer_id"),
        "razorpay_subscription_id": rest.get("razorpay_subscription_id"),
        "last_payment_id": rest.get("last_payment_id"),
        "last_payment_order_id": rest.get("last_payment_order_id"),
        "last_payment_at": rest.get("last_payment_at"),
    }
    await db.restaurants.insert_one(doc)
    await db.menu_items.update_many(
        {"restaurant_id": {"$exists": False}}, {"$set": {"restaurant_id": rid}}
    )
    await db.menu_items.update_many({"restaurant_id": None}, {"$set": {"restaurant_id": rid}})
    await db.categories.update_many(
        {"restaurant_id": {"$exists": False}}, {"$set": {"restaurant_id": rid}}
    )
    await db.categories.update_many({"restaurant_id": None}, {"$set": {"restaurant_id": rid}})
    await db.orders.update_many(
        {"restaurant_id": {"$exists": False}}, {"$set": {"restaurant_id": rid}}
    )
    await db.orders.update_many({"restaurant_id": None}, {"$set": {"restaurant_id": rid}})
    await db.sessions.update_many(
        {"scope": "manager", "restaurant_id": {"$exists": False}},
        {"$set": {"restaurant_id": rid}},
    )
    logger.info("Migrated singleton restaurant → id=%s slug=%s", rid, slug)
    return rid


def public_restaurant_view(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "slug": doc.get("slug"),
        "restaurant_name": doc.get("restaurant_name") or "",
        "logo_url": doc.get("logo_url") or "",
        "theme": doc.get("theme") or "dark",
    }


def settings_view(doc: dict) -> dict:
    return {
        "restaurant_name": doc.get("restaurant_name") or "ZenTaap Restaurant",
        "logo_url": doc.get("logo_url") or "",
        "gst_number": doc.get("gst_number") or "",
        "gst_rate": doc.get("gst_rate"),
        "address": doc.get("address") or "",
        "phone": doc.get("phone") or doc.get("contact_number") or "",
        "printer_type": doc.get("printer_type") or "browser",
        "theme": doc.get("theme") or "dark",
        "subscription_plan": doc.get("subscription_plan"),
        "subscription_status": doc.get("subscription_status") or "none",
        "trial_start": doc.get("trial_start"),
        "trial_end": doc.get("trial_end"),
        "autopay": bool(doc.get("autopay", True)),
        "payment_method": doc.get("payment_method"),
        "customer_pin": doc.get("customer_pin") or "",
        "kitchen_pin": doc.get("kitchen_pin") or "",
    }
