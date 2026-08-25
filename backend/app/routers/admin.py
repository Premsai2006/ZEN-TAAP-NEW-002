"""Platform admin — login, restaurant/subscription insights, pricing config."""
from __future__ import annotations

import logging
import uuid
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.config import ADMIN_PASSWORD, ADMIN_USERNAME
from app.database import db
from app.deps import clear_admin_cookie, require_admin, set_admin_cookie
from app.models import AdminLoginBody, AdminPasswordBody, PricingUpdateBody
from app.services import auth_service as auth
from app.services import pricing as pricing_svc
from app.services.pins import looks_hashed, verify_pin
from app.services.subscription_access import has_access_status, refresh_subscription_status

logger = logging.getLogger("zentaap.admin")
router = APIRouter(prefix="/admin", tags=["admin"])


def _hash_admin_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw((password or "").encode("utf-8")[:72], bcrypt.gensalt()).decode()


def _verify_admin_password(plain: str, stored: str | None) -> bool:
    if not stored or not plain:
        return False
    if looks_hashed(stored):
        try:
            import bcrypt
            return bcrypt.checkpw(plain.encode("utf-8")[:72], stored.encode("utf-8"))
        except Exception:
            return verify_pin(plain, stored)
    return plain == stored

SAFE_REST_PROJECTION = {
    "_id": 0,
    "pin": 0,
    "kitchen_pin": 0,
    "customer_pin": 0,
}


async def bootstrap_admin():
    """Create the env-configured admin once. Never overwrite a password set in the panel."""
    user = (ADMIN_USERNAME or "").strip().lower()
    password = ADMIN_PASSWORD or ""
    if not user or not password:
        logger.warning("ADMIN_USERNAME / ADMIN_PASSWORD not set — admin panel login is disabled.")
        return
    existing = await db.admins.find_one({"username": user})
    if existing:
        logger.info("Admin account already exists for username=%s", user)
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.admins.insert_one({
        "id": str(uuid.uuid4()),
        "username": user,
        "password": _hash_admin_password(password),
        "created_at": now,
        "updated_at": now,
    })
    logger.info("Admin account created for username=%s", user)


def _public_pricing():
    cfg = pricing_svc.get_pricing_config()
    preview_n = cfg["min_tables"]
    preview = pricing_svc.compute_price(preview_n)
    return {
        **cfg,
        "gst_rate_pct": round(cfg["gst_rate"] * 100, 2),
        "preview": preview,
        "updated_at": cfg.get("updated_at"),
        "updated_by": cfg.get("updated_by") or "",
    }


def _restaurant_row(doc: dict, status: str) -> dict:
    tables = doc.get("subscription_tables")
    total = doc.get("subscription_total")
    try:
        total_f = float(total) if total is not None else 0.0
    except (TypeError, ValueError):
        total_f = 0.0
    return {
        "id": doc.get("id"),
        "slug": doc.get("slug") or "",
        "restaurant_name": doc.get("restaurant_name") or "",
        "manager_name": doc.get("manager_name") or "",
        "contact_number": doc.get("contact_number") or doc.get("phone") or "",
        "email": doc.get("email") or "",
        "status": status,
        "has_access": has_access_status(status),
        "tables": tables,
        "monthly_total": total_f,
        "payment_method": doc.get("payment_method") or "",
        "payment_status": doc.get("payment_status") or "",
        "autopay_enabled": bool(doc.get("autopay_enabled", False)),
        "trial_end": doc.get("trial_end"),
        "cycle_start": doc.get("cycle_start"),
        "next_cycle_start": doc.get("next_cycle_start"),
        "last_payment_at": doc.get("last_payment_at"),
        "created_at": doc.get("created_at"),
    }


@router.post("/login")
async def admin_login(body: AdminLoginBody, request: Request, response: Response):
    await auth.check_login_lockout(request)
    username = (body.username or "").strip().lower()
    password = body.password or ""
    if not username or not password:
        raise HTTPException(status_code=400, detail="Enter your admin username and password.")
    admin = await db.admins.find_one({"username": username}, {"_id": 0})
    if not admin or not _verify_admin_password(password, admin.get("password")):
        await auth.record_login_failure(request)
    await auth.clear_login_failures(request)
    token = f"adm-{uuid.uuid4()}"
    now = datetime.now(timezone.utc).isoformat()
    await db.sessions.insert_one({
        "scope": "admin",
        "username": username,
        "token": token,
        "created_at": now,
        "last_used": now,
    })
    set_admin_cookie(response, token)
    return {"success": True, "token": token, "username": username}


@router.post("/logout")
async def admin_logout(request: Request, response: Response, sess=Depends(require_admin)):
    await db.sessions.delete_one({"scope": "admin", "token": sess.get("token")})
    clear_admin_cookie(response)
    return {"success": True}


@router.get("/me")
async def admin_me(sess=Depends(require_admin)):
    return {"username": sess.get("username") or "", "scope": "admin"}


@router.put("/password")
async def change_admin_password(body: AdminPasswordBody, sess=Depends(require_admin)):
    username = (sess.get("username") or "").strip().lower()
    if not username:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    current = body.current_password or ""
    new = body.new_password or ""
    if len(new) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    if len(new.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="New password is too long.")
    if current == new:
        raise HTTPException(status_code=400, detail="New password must be different from the current one.")
    admin = await db.admins.find_one({"username": username})
    if not admin or not _verify_admin_password(current, admin.get("password")):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    now = datetime.now(timezone.utc).isoformat()
    await db.admins.update_one(
        {"username": username},
        {"$set": {"password": _hash_admin_password(new), "updated_at": now}},
    )
    logger.info("Admin password changed for username=%s", username)
    return {"success": True}


@router.get("/pricing")
async def get_pricing(sess=Depends(require_admin)):
    return _public_pricing()


@router.put("/pricing")
async def update_pricing(body: PricingUpdateBody, sess=Depends(require_admin)):
    cfg = pricing_svc.get_pricing_config()
    per_table = float(body.per_table)
    if per_table <= 0 or per_table > 100_000:
        raise HTTPException(status_code=400, detail="Per-table price must be greater than 0.")
    base_fee = cfg["base_fee"] if body.base_fee is None else float(body.base_fee)
    if base_fee < 0 or base_fee > 100_000:
        raise HTTPException(status_code=400, detail="Base fee cannot be negative.")
    gst_pct = round(cfg["gst_rate"] * 100, 2) if body.gst_rate_pct is None else float(body.gst_rate_pct)
    if gst_pct < 0 or gst_pct > 100:
        raise HTTPException(status_code=400, detail="GST rate must be between 0 and 100.")
    min_tables = cfg["min_tables"] if body.min_tables is None else int(body.min_tables)
    max_tables = cfg["max_tables"] if body.max_tables is None else int(body.max_tables)
    if min_tables < 1 or max_tables < min_tables or max_tables > 200:
        raise HTTPException(status_code=400, detail="Table range must be 1–200, with max ≥ min.")

    saved = await pricing_svc.save_pricing(
        {
            "per_table": per_table,
            "base_fee": base_fee,
            "gst_rate": round(gst_pct / 100.0, 4),
            "min_tables": min_tables,
            "max_tables": max_tables,
        },
        updated_by=sess.get("username") or "",
    )
    logger.info(
        "Pricing updated by %s: per_table=%s gst=%s tables=%s-%s",
        sess.get("username"), saved["per_table"], saved["gst_rate"], saved["min_tables"], saved["max_tables"],
    )
    return _public_pricing()


@router.get("/overview")
async def overview(sess=Depends(require_admin)):
    cfg = pricing_svc.get_pricing_config()
    restaurants = []
    status_counts = Counter()
    mrr = 0.0
    access_tables = 0
    access_count = 0
    async for raw in db.restaurants.find({}, SAFE_REST_PROJECTION):
        doc, status = await refresh_subscription_status(raw.get("id") or "", raw)
        row = _restaurant_row(doc, status)
        restaurants.append(row)
        status_counts[status or "none"] += 1
        if has_access_status(status):
            access_count += 1
            if row["tables"]:
                access_tables += int(row["tables"] or 0)
        if status == "active":
            mrr += row["monthly_total"] or 0

    restaurants.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    recent = restaurants[:8]

    return {
        "pricing": _public_pricing(),
        "counts": {
            "restaurants": len(restaurants),
            "active": status_counts.get("active", 0),
            "trial": status_counts.get("trial", 0),
            "expired": status_counts.get("expired", 0),
            "none": status_counts.get("none", 0) + status_counts.get("skipped", 0),
            "with_access": access_count,
        },
        "status_breakdown": dict(status_counts),
        "mrr": round(mrr, 2),
        "tables_under_access": access_tables,
        "avg_tables": round(access_tables / access_count, 1) if access_count else 0,
        "list_price_10": pricing_svc.compute_price(max(cfg["min_tables"], min(10, cfg["max_tables"]))),
        "recent": recent,
    }


@router.get("/restaurants")
async def list_restaurants(sess=Depends(require_admin)):
    rows = []
    async for raw in db.restaurants.find({}, SAFE_REST_PROJECTION):
        doc, status = await refresh_subscription_status(raw.get("id") or "", raw)
        rows.append(_restaurant_row(doc, status))
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"restaurants": rows, "count": len(rows)}


@router.get("/restaurants/{restaurant_id}")
async def restaurant_detail(restaurant_id: str, sess=Depends(require_admin)):
    raw = await db.restaurants.find_one({"id": restaurant_id}, SAFE_REST_PROJECTION)
    if not raw:
        raise HTTPException(status_code=404, detail="Restaurant not found.")
    doc, status = await refresh_subscription_status(restaurant_id, raw)
    row = _restaurant_row(doc, status)
    menu_count = await db.menu_items.count_documents({"restaurant_id": restaurant_id})
    cat_count = await db.categories.count_documents({"restaurant_id": restaurant_id})
    order_count = await db.orders.count_documents({"restaurant_id": restaurant_id})
    paid_count = await db.orders.count_documents({"restaurant_id": restaurant_id, "status": "paid"})
    return {
        **row,
        "address": doc.get("address") or "",
        "gst_number": doc.get("gst_number") or "",
        "theme": doc.get("theme") or "dark",
        "razorpay_customer_id": doc.get("razorpay_customer_id") or "",
        "razorpay_subscription_id": doc.get("razorpay_subscription_id") or "",
        "menu_items": menu_count,
        "categories": cat_count,
        "orders": order_count,
        "paid_orders": paid_count,
    }
