from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, date


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

DEFAULT_PIN = "123456"


# ---------- Models ----------
class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    slug: str


class CategoryCreate(BaseModel):
    name: str


class MenuItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    category: Optional[str] = ""
    emoji: Optional[str] = "🍽️"
    image_url: Optional[str] = ""
    images: List[str] = Field(default_factory=list)
    available: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MenuItemCreate(BaseModel):
    name: str
    price: float
    category: Optional[str] = ""
    emoji: Optional[str] = "🍽️"
    image_url: Optional[str] = ""
    images: Optional[List[str]] = None
    available: bool = True


class MenuItemUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    available: Optional[bool] = None


class RestaurantSettings(BaseModel):
    restaurant_name: str = "TableTaap Restaurant"
    logo_url: str = ""
    gst_number: str = ""
    gst_rate: Optional[float] = None
    address: str = ""
    phone: str = ""
    printer_type: str = "browser"
    theme: str = "dark"
    # Subscription
    subscription_plan: Optional[str] = None  # "core" | "prime" | "elite"
    subscription_status: str = "none"  # "none" | "trial" | "active" | "skipped"
    trial_start: Optional[str] = None
    trial_end: Optional[str] = None
    autopay: bool = True
    payment_method: Optional[str] = None  # "card" | "upi" | "netbanking"


class SettingsUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    logo_url: Optional[str] = None
    gst_number: Optional[str] = None
    gst_rate: Optional[float] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    printer_type: Optional[str] = None
    theme: Optional[str] = None


class SubscribeRequest(BaseModel):
    # Deprecated — subscription model removed. Kept for backwards compatibility only.
    plan: str = ""
    payment_method: str = ""


class OrderItem(BaseModel):
    name: str
    qty: int
    price: float


class Order(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: int
    table: int
    items: List[OrderItem]
    amount: float
    status: str = "new"  # new, cooking, done, delivered
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OrderCreate(BaseModel):
    table: int
    items: List[OrderItem]


class OrderUpdate(BaseModel):
    status: str


class LoginRequest(BaseModel):
    pin: str


class SignupRequest(BaseModel):
    manager_name: str
    restaurant_name: str
    contact_number: str
    pin: str
    email: Optional[str] = None


class ProfileUpdate(BaseModel):
    manager_name: Optional[str] = None
    email: Optional[str] = None
    contact_number: Optional[str] = None
    restaurant_name: Optional[str] = None


class ChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str


class RecoverPinRequest(BaseModel):
    contact_number: str
    new_pin: str


class ImageUploadRequest(BaseModel):
    data: str  # base64 data URL


def _validate_pin(pin: str):
    if not pin or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be numeric")
    if len(pin) < 4 or len(pin) > 10:
        raise HTTPException(status_code=400, detail="PIN must be 4-10 digits")


# ---------- Auth ----------
async def _get_profile():
    return await db.settings.find_one({"key": "manager_profile"}, {"_id": 0})


@api_router.get("/auth/status")
async def auth_status():
    p = await _get_profile()
    if p and p.get("pin"):
        return {
            "setup_complete": True,
            "manager_name": p.get("manager_name", ""),
            "restaurant_name": p.get("restaurant_name", ""),
        }
    return {"setup_complete": False}


@api_router.post("/auth/signup")
async def signup(req: SignupRequest):
    existing = await _get_profile()
    if existing and existing.get("pin"):
        raise HTTPException(status_code=400, detail="Manager already registered. Use Login.")
    if not req.manager_name.strip():
        raise HTTPException(status_code=400, detail="Manager name required")
    if not req.restaurant_name.strip():
        raise HTTPException(status_code=400, detail="Restaurant name required")
    digits = "".join(ch for ch in req.contact_number if ch.isdigit())
    if len(digits) < 7:
        raise HTTPException(status_code=400, detail="Valid contact number required")
    _validate_pin(req.pin)

    profile = {
        "key": "manager_profile",
        "manager_name": req.manager_name.strip(),
        "restaurant_name": req.restaurant_name.strip(),
        "contact_number": req.contact_number.strip(),
        "email": (req.email or "").strip(),
        "pin": req.pin,
    }
    await db.settings.update_one({"key": "manager_profile"}, {"$set": profile}, upsert=True)
    # Also reflect restaurant_name into RestaurantSettings for bill branding
    await db.settings.update_one(
        {"key": "restaurant"},
        {"$set": {"restaurant_name": req.restaurant_name.strip(), "phone": req.contact_number.strip()}},
        upsert=True,
    )
    return {"success": True, "token": f"mgr-{uuid.uuid4()}"}


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    _validate_pin(req.pin)
    p = await _get_profile()
    stored = p.get("pin") if p else None
    if not stored:
        # legacy fallback for installs that haven't signed up yet
        legacy = await db.settings.find_one({"key": "manager_pin"}, {"_id": 0})
        stored = legacy["value"] if legacy else None
    if not stored:
        raise HTTPException(status_code=404, detail="No manager registered. Please sign up first.")
    if req.pin != stored:
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    return {"success": True, "token": f"mgr-{uuid.uuid4()}"}


@api_router.post("/auth/change-pin")
async def change_pin(req: ChangePinRequest):
    p = await _get_profile()
    stored = p.get("pin") if p else None
    if not stored:
        legacy = await db.settings.find_one({"key": "manager_pin"}, {"_id": 0})
        stored = legacy["value"] if legacy else None
    if not stored:
        raise HTTPException(status_code=404, detail="No manager registered")
    if req.old_pin != stored:
        raise HTTPException(status_code=401, detail="Current PIN is incorrect")
    _validate_pin(req.new_pin)
    await db.settings.update_one(
        {"key": "manager_profile"}, {"$set": {"pin": req.new_pin}}, upsert=True
    )
    return {"success": True}


@api_router.post("/auth/recover-pin")
async def recover_pin(req: RecoverPinRequest):
    p = await _get_profile()
    if not p or not p.get("contact_number"):
        raise HTTPException(status_code=404, detail="No manager registered")
    saved_digits = "".join(ch for ch in (p.get("contact_number") or "") if ch.isdigit())
    given_digits = "".join(ch for ch in req.contact_number if ch.isdigit())
    if not saved_digits or saved_digits[-7:] != given_digits[-7:]:
        raise HTTPException(status_code=401, detail="Contact number does not match our records")
    _validate_pin(req.new_pin)
    await db.settings.update_one(
        {"key": "manager_profile"}, {"$set": {"pin": req.new_pin}}, upsert=True
    )
    return {"success": True}


@api_router.get("/profile")
async def get_profile():
    p = await _get_profile() or {}
    p.pop("pin", None)
    p.pop("key", None)
    return {
        "manager_name": p.get("manager_name", ""),
        "email": p.get("email", ""),
        "contact_number": p.get("contact_number", ""),
        "restaurant_name": p.get("restaurant_name", ""),
    }


@api_router.put("/profile")
async def update_profile(body: ProfileUpdate):
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.settings.update_one({"key": "manager_profile"}, {"$set": update}, upsert=True)
    # mirror restaurant_name to settings for bill branding
    if "restaurant_name" in update:
        await db.settings.update_one(
            {"key": "restaurant"}, {"$set": {"restaurant_name": update["restaurant_name"]}}, upsert=True
        )
    return await get_profile()


# ---------- Categories ----------
@api_router.get("/categories", response_model=List[Category])
async def list_categories():
    cats = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return cats


@api_router.post("/categories", response_model=Category)
async def create_category(body: CategoryCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.categories.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    slug = name.lower().replace(" ", "-").replace("&", "and")
    cat = Category(name=name, slug=slug)
    await db.categories.insert_one(cat.model_dump())
    return cat


@api_router.put("/categories/{cat_id}", response_model=Category)
async def rename_category(cat_id: str, body: CategoryCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    dup = await db.categories.find_one(
        {"id": {"$ne": cat_id}, "name": {"$regex": f"^{name}$", "$options": "i"}}, {"_id": 0}
    )
    if dup:
        raise HTTPException(status_code=400, detail="Another category with that name exists")
    slug = name.lower().replace(" ", "-").replace("&", "and")
    old_name = cat["name"]
    await db.categories.update_one({"id": cat_id}, {"$set": {"name": name, "slug": slug}})
    # Update referencing menu items
    await db.menu_items.update_many({"category": old_name}, {"$set": {"category": name}})
    return Category(id=cat_id, name=name, slug=slug)


@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    # Move items in this category to Uncategorized (preserve menu items)
    await db.menu_items.update_many({"category": cat["name"]}, {"$set": {"category": ""}})
    await db.categories.delete_one({"id": cat_id})
    return {"success": True}


# ---------- Menu ----------
@api_router.get("/menu", response_model=List[MenuItem])
async def list_menu():
    items = await db.menu_items.find({}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    for it in items:
        if "images" not in it or it.get("images") is None:
            it["images"] = [it["image_url"]] if it.get("image_url") else []
    return items


# ---------- Settings ----------
@api_router.get("/settings", response_model=RestaurantSettings)
async def get_settings():
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0})
    if not doc:
        s = RestaurantSettings()
        await db.settings.insert_one({"key": "restaurant", **s.model_dump()})
        return s
    doc.pop("key", None)
    return RestaurantSettings(**doc)


@api_router.put("/settings", response_model=RestaurantSettings)
async def update_settings(body: SettingsUpdate):
    # Use exclude_unset so explicit null values (e.g. clearing gst_rate) are honored
    update = body.model_dump(exclude_unset=True)
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0})
    doc.pop("key", None)
    return RestaurantSettings(**doc)


# ---------- Subscription (per-table pricing) ----------
BASE_FEE = 299  # ₹/month
PER_TABLE = 50  # ₹ per table per month
GST_RATE = 0.18  # 18% GST on SaaS in India
MIN_TABLES = 10
MAX_TABLES = 60
TRIAL_DAYS = 4


def _compute_price(tables: int):
    if tables < MIN_TABLES or tables > MAX_TABLES:
        raise HTTPException(status_code=400, detail=f"Tables must be between {MIN_TABLES} and {MAX_TABLES}")
    subtotal = BASE_FEE + PER_TABLE * tables
    gst = round(subtotal * GST_RATE, 2)
    total = round(subtotal + gst, 2)
    return {
        "tables": tables,
        "base_fee": BASE_FEE,
        "per_table": PER_TABLE,
        "tables_subtotal": PER_TABLE * tables,
        "subtotal": subtotal,
        "gst_rate_pct": int(GST_RATE * 100),
        "gst_amount": gst,
        "total_with_tax": total,
        "per_table_with_tax": round(total / tables, 2) if tables else 0,
    }


class SubscribeBody(BaseModel):
    tables: int
    payment_method: str  # "card" | "upi" | "netbanking" | "wallet"


@api_router.get("/pricing")
async def pricing(tables: int = 14):
    return _compute_price(max(MIN_TABLES, min(MAX_TABLES, tables)))


@api_router.get("/subscription")
async def get_subscription():
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0}) or {}
    return {
        "tables": doc.get("subscription_tables"),
        "subtotal": doc.get("subscription_subtotal"),
        "gst": doc.get("subscription_gst"),
        "total": doc.get("subscription_total"),
        "status": doc.get("subscription_status", "none"),
        "trial_start": doc.get("trial_start"),
        "trial_end": doc.get("trial_end"),
        "payment_method": doc.get("payment_method"),
    }


@api_router.post("/subscription")
async def create_subscription(body: SubscribeBody):
    if body.payment_method not in ("card", "upi", "netbanking", "wallet"):
        raise HTTPException(status_code=400, detail="Invalid payment method")
    price = _compute_price(body.tables)
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    trial_end = now + timedelta(days=TRIAL_DAYS)
    update = {
        "subscription_tables": body.tables,
        "subscription_subtotal": price["subtotal"],
        "subscription_gst": price["gst_amount"],
        "subscription_total": price["total_with_tax"],
        "subscription_status": "trial",
        "trial_start": now.isoformat(),
        "trial_end": trial_end.isoformat(),
        "payment_method": body.payment_method,
    }
    await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
    return {"success": True, **price, "trial_start": update["trial_start"], "trial_end": update["trial_end"]}


@api_router.post("/menu", response_model=MenuItem)
async def create_menu(body: MenuItemCreate):
    payload = body.model_dump()
    if payload.get("images") is None:
        payload["images"] = [payload["image_url"]] if payload.get("image_url") else []
    elif payload["images"] and not payload.get("image_url"):
        payload["image_url"] = payload["images"][0]
    item = MenuItem(**payload)
    await db.menu_items.insert_one(item.model_dump())
    return item


@api_router.put("/menu/{item_id}", response_model=MenuItem)
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


@api_router.delete("/menu/{item_id}")
async def delete_menu(item_id: str):
    res = await db.menu_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"success": True}


# ---------- Orders ----------
@api_router.get("/orders", response_model=List[Order])
async def list_orders():
    orders = await db.orders.find({}, {"_id": 0}).sort("order_number", -1).to_list(500)
    return orders


@api_router.post("/orders", response_model=Order)
async def create_order(body: OrderCreate):
    last = await db.orders.find({}, {"_id": 0}).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    amount = sum(i.qty * i.price for i in body.items)
    order = Order(order_number=next_num, table=body.table, items=body.items, amount=amount)
    await db.orders.insert_one(order.model_dump())
    return order


@api_router.put("/orders/{order_id}", response_model=Order)
async def update_order(order_id: str, body: OrderUpdate):
    res = await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return order


# ---------- Stats ----------
@api_router.get("/stats/today")
async def stats_today():
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()
    orders = await db.orders.find({"created_at": {"$regex": f"^{today_iso}"}}, {"_id": 0}).to_list(1000)
    total_orders = len(orders)
    revenue = sum(o["amount"] for o in orders)
    completed = sum(1 for o in orders if o["status"] in ("done", "delivered"))
    pending = sum(1 for o in orders if o["status"] == "new")
    active_tables = len({o["table"] for o in orders if o["status"] in ("new", "cooking")})

    avg_order_value = round(revenue / total_orders, 2) if total_orders else 0
    gross_profit = round(revenue * 0.65, 2)

    # 7-day vs prior-7-day growth
    last_7_start = today - timedelta(days=6)
    last_7_end = today + timedelta(days=1)
    prev_7_start = today - timedelta(days=13)
    prev_7_end = today - timedelta(days=6)

    async def _agg(start_iso, end_iso):
        os_ = await db.orders.find(
            {"created_at": {"$gte": start_iso, "$lt": end_iso}}, {"_id": 0}
        ).to_list(5000)
        rev = sum(o["amount"] for o in os_)
        comp = sum(1 for o in os_ if o["status"] in ("done", "delivered"))
        return {
            "orders": len(os_),
            "revenue": rev,
            "completed": comp,
            "aov": round(rev / len(os_), 2) if os_ else 0,
        }

    current = await _agg(last_7_start.isoformat(), last_7_end.isoformat())
    prior = await _agg(prev_7_start.isoformat(), prev_7_end.isoformat())

    def _grow(c, p):
        if p == 0:
            return 100.0 if c > 0 else 0.0
        return round((c - p) / p * 100, 1)

    growth_7d = {
        "revenue": _grow(current["revenue"], prior["revenue"]),
        "orders": _grow(current["orders"], prior["orders"]),
        "completed": _grow(current["completed"], prior["completed"]),
        "aov": _grow(current["aov"], prior["aov"]),
    }

    # top items
    counter = {}
    for o in orders:
        for it in o["items"]:
            key = it["name"]
            entry = counter.setdefault(key, {"name": key, "qty": 0, "revenue": 0.0})
            entry["qty"] += it["qty"]
            entry["revenue"] += it["qty"] * it["price"]
    top = sorted(counter.values(), key=lambda x: x["qty"], reverse=True)[:6]

    item_names = list({it_name for o in orders for it_name in (i["name"] for i in o["items"])})
    items = (
        await db.menu_items.find({"name": {"$in": item_names}}, {"_id": 0}).to_list(500)
        if item_names else []
    )
    cat_map = {i["name"]: (i.get("category") or "Uncategorized") for i in items}
    img_map = {i["name"]: (i.get("images") or ([i.get("image_url")] if i.get("image_url") else []))[0] if i.get("images") or i.get("image_url") else "" for i in items}
    emoji_map = {i["name"]: i.get("emoji", "🍽️") for i in items}

    if top:
        for t in top:
            t["category"] = cat_map.get(t["name"], "Uncategorized")
            t["image"] = img_map.get(t["name"], "")
            t["emoji"] = emoji_map.get(t["name"], "🍽️")

    cat_rev = {}
    for o in orders:
        for it in o["items"]:
            cat = cat_map.get(it["name"], "Uncategorized")
            cat_rev[cat] = cat_rev.get(cat, 0) + it["qty"] * it["price"]
    revenue_by_category = [
        {"category": k, "revenue": round(v, 2), "percent": round((v / revenue * 100) if revenue else 0, 1)}
        for k, v in sorted(cat_rev.items(), key=lambda x: x[1], reverse=True)
    ]

    most_ordered = top[0]["name"] if top else "—"
    most_count = top[0]["qty"] if top else 0

    return {
        "total_orders": total_orders,
        "revenue": revenue,
        "completed": completed,
        "pending": pending,
        "active_tables": active_tables,
        "avg_order_value": avg_order_value,
        "gross_profit": gross_profit,
        "most_ordered": most_ordered,
        "most_count": most_count,
        "top_items": top,
        "revenue_by_category": revenue_by_category,
        "growth_7d": growth_7d,
    }


@api_router.get("/stats/revenue")
async def stats_revenue(period: str = "week"):
    """Returns time-series revenue for charts. period in {today, yesterday, week, total}."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    today = now.date()
    series = []
    if period == "today":
        # hourly buckets for today
        today_iso = today.isoformat()
        orders = await db.orders.find({"created_at": {"$regex": f"^{today_iso}"}}, {"_id": 0}).to_list(2000)
        buckets = {h: 0.0 for h in range(0, 24, 2)}
        for o in orders:
            try:
                hr = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).hour
                key = (hr // 2) * 2
                buckets[key] = buckets.get(key, 0) + o["amount"]
            except Exception:
                pass
        for h in sorted(buckets):
            series.append({"label": f"{h:02d}:00", "revenue": round(buckets[h], 2)})
    elif period == "yesterday":
        y = (today - timedelta(days=1)).isoformat()
        orders = await db.orders.find({"created_at": {"$regex": f"^{y}"}}, {"_id": 0}).to_list(2000)
        buckets = {h: 0.0 for h in range(0, 24, 2)}
        for o in orders:
            try:
                hr = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).hour
                key = (hr // 2) * 2
                buckets[key] = buckets.get(key, 0) + o["amount"]
            except Exception:
                pass
        for h in sorted(buckets):
            series.append({"label": f"{h:02d}:00", "revenue": round(buckets[h], 2)})
    elif period == "week":
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            d_iso = d.isoformat()
            orders = await db.orders.find({"created_at": {"$regex": f"^{d_iso}"}}, {"_id": 0}).to_list(2000)
            total = sum(o["amount"] for o in orders)
            series.append({"label": d.strftime("%a"), "revenue": round(total, 2)})
    else:  # total — last 12 weeks
        for i in range(11, -1, -1):
            start = today - timedelta(days=(i + 1) * 7 - 1)
            end = today - timedelta(days=i * 7)
            from_re = start.isoformat()
            to_re = end.isoformat()
            orders = await db.orders.find(
                {"created_at": {"$gte": from_re, "$lt": (end + timedelta(days=1)).isoformat()}}, {"_id": 0}
            ).to_list(5000)
            total = sum(o["amount"] for o in orders)
            series.append({"label": start.strftime("%d %b"), "revenue": round(total, 2)})

    grand_total = round(sum(p["revenue"] for p in series), 2)
    return {"period": period, "series": series, "total": grand_total}


# ---------- Image Upload ----------
@api_router.post("/upload-image")
async def upload_image(req: ImageUploadRequest):
    # Just echo back the data URL — we store base64 directly in menu items
    if not req.data.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Invalid image data")
    if len(req.data) > 2_500_000:
        raise HTTPException(status_code=400, detail="Image too large (max ~1.8MB)")
    return {"url": req.data}


# ---------- Seed ----------
@app.on_event("startup")
async def seed():
    # categories
    if await db.categories.count_documents({}) == 0:
        defaults = ["Starters", "Main Course", "Rice & Biryani", "Breads", "Drinks", "Desserts"]
        for n in defaults:
            slug = n.lower().replace(" ", "-").replace("&", "and")
            await db.categories.insert_one(Category(name=n, slug=slug).model_dump())

    # menu items
    if await db.menu_items.count_documents({}) == 0:
        seed_items = [
            ("Paneer Tikka", 220, "Starters", "🧀"),
            ("Chicken 65", 260, "Starters", "🍗"),
            ("Dal Makhani", 220, "Main Course", "🥘"),
            ("Butter Chicken", 320, "Main Course", "🍛"),
            ("Chicken Biryani", 300, "Rice & Biryani", "🍛"),
            ("Veg Biryani", 240, "Rice & Biryani", "🍚"),
            ("Butter Naan", 60, "Breads", "🫓"),
            ("Garlic Naan", 80, "Breads", "🫓"),
            ("Mango Lassi", 120, "Drinks", "🥭"),
            ("Gulab Jamun", 120, "Desserts", "🟤"),
        ]
        for n, p, c, e in seed_items:
            await db.menu_items.insert_one(MenuItem(name=n, price=p, category=c, emoji=e).model_dump())

    # demo orders for today
    if await db.orders.count_documents({}) == 0:
        today = datetime.now(timezone.utc).isoformat()
        demo_orders = [
            (1021, 4, [("Butter Chicken", 2, 320), ("Garlic Naan", 4, 80)], "new"),
            (1020, 7, [("Paneer Tikka", 1, 220), ("Dal Makhani", 1, 220)], "cooking"),
            (1019, 2, [("Chicken Biryani", 3, 300)], "cooking"),
            (1018, 9, [("Butter Chicken", 2, 320), ("Butter Naan", 6, 60)], "done"),
            (1017, 5, [("Veg Biryani", 2, 240), ("Mango Lassi", 2, 120)], "delivered"),
            (1016, 11, [("Chicken 65", 2, 260), ("Butter Naan", 3, 60)], "delivered"),
        ]
        for num, table, items, status in demo_orders:
            ois = [OrderItem(name=n, qty=q, price=pr) for n, q, pr in items]
            amt = sum(o.qty * o.price for o in ois)
            o = Order(order_number=num, table=table, items=ois, amount=amt, status=status, created_at=today)
            await db.orders.insert_one(o.model_dump())

    # restaurant settings (manager_pin is no longer auto-seeded — first-time signup creates the profile)
    if not await db.settings.find_one({"key": "restaurant"}):
        s = RestaurantSettings()
        await db.settings.insert_one({"key": "restaurant", **s.model_dump()})


@api_router.get("/")
async def root():
    return {"message": "TableTap Manager API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
