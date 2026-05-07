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
    restaurant_name: str = "TableTap Restaurant"
    logo_url: str = ""
    gst_number: str = ""
    gst_rate: float = 5.0  # percent
    address: str = ""
    phone: str = ""
    printer_type: str = "browser"  # browser | thermal-58mm | thermal-80mm


class SettingsUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    logo_url: Optional[str] = None
    gst_number: Optional[str] = None
    gst_rate: Optional[float] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    printer_type: Optional[str] = None


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


class ImageUploadRequest(BaseModel):
    data: str  # base64 data URL


# ---------- Auth ----------
@api_router.post("/auth/login")
async def login(req: LoginRequest):
    if not req.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be numeric")
    if len(req.pin) < 1 or len(req.pin) > 10:
        raise HTTPException(status_code=400, detail="PIN must be 1-10 digits")
    settings = await db.settings.find_one({"key": "manager_pin"}, {"_id": 0})
    stored = settings["value"] if settings else DEFAULT_PIN
    if req.pin != stored:
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    return {"success": True, "token": f"mgr-{uuid.uuid4()}"}


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


@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    cat = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    if not cat:
        raise HTTPException(status_code=404, detail="Not found")
    # also remove menu items in this category
    await db.menu_items.delete_many({"category": cat["name"]})
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
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.settings.update_one({"key": "restaurant"}, {"$set": update}, upsert=True)
    doc = await db.settings.find_one({"key": "restaurant"}, {"_id": 0})
    doc.pop("key", None)
    return RestaurantSettings(**doc)


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
    today_iso = datetime.now(timezone.utc).date().isoformat()
    orders = await db.orders.find({"created_at": {"$regex": f"^{today_iso}"}}, {"_id": 0}).to_list(1000)
    total_orders = len(orders)
    revenue = sum(o["amount"] for o in orders)
    completed = sum(1 for o in orders if o["status"] in ("done", "delivered"))
    pending = sum(1 for o in orders if o["status"] == "new")
    active_tables = len({o["table"] for o in orders if o["status"] in ("new", "cooking")})

    # top items
    counter = {}
    for o in orders:
        for it in o["items"]:
            key = it["name"]
            entry = counter.setdefault(key, {"name": key, "qty": 0, "revenue": 0.0})
            entry["qty"] += it["qty"]
            entry["revenue"] += it["qty"] * it["price"]
    top = sorted(counter.values(), key=lambda x: x["qty"], reverse=True)[:6]

    # attach category for top items
    if top:
        names = [t["name"] for t in top]
        items = await db.menu_items.find({"name": {"$in": names}}, {"_id": 0}).to_list(100)
        cat_map = {i["name"]: i["category"] for i in items}
        for t in top:
            t["category"] = cat_map.get(t["name"], "")

    most_ordered = top[0]["name"] if top else "—"
    most_count = top[0]["qty"] if top else 0

    return {
        "total_orders": total_orders,
        "revenue": revenue,
        "completed": completed,
        "pending": pending,
        "active_tables": active_tables,
        "most_ordered": most_ordered,
        "most_count": most_count,
        "top_items": top,
    }


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

    # settings
    if not await db.settings.find_one({"key": "manager_pin"}):
        await db.settings.insert_one({"key": "manager_pin", "value": DEFAULT_PIN})

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
