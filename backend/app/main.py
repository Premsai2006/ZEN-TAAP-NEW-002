import logging
import re
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from app.config import DEMO_MODE, CORS_ORIGINS
from app.database import client, db
from app.routers import (
    auth, profile, categories, menu, orders, settings, subscription, payments, stats, upload,
    public_restaurant,
)
from app.services import restaurants as rest_svc

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("zentaap")

app = FastAPI(title="ZenTaap Manager API")
api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(profile.router)
api_router.include_router(categories.router)
api_router.include_router(menu.router)
api_router.include_router(orders.router)
api_router.include_router(settings.router)
api_router.include_router(subscription.router)
api_router.include_router(payments.router)
api_router.include_router(stats.router)
api_router.include_router(upload.router)
api_router.include_router(public_restaurant.router)


@api_router.get("/")
async def root():
    return {"message": "ZenTaap Manager API", "multi_tenant": True}


app.include_router(api_router)

_raw_origins = CORS_ORIGINS
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
if not DEMO_MODE and "*" in _origins:
    _origins = ["http://localhost:3000"]
    logger.warning(
        "CORS_ORIGINS contained '*' in non-demo mode — restricted to localhost. "
        "Set CORS_ORIGINS to your real frontend origin(s) for production."
    )
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed():
    await rest_svc.ensure_indexes()
    migrated = await rest_svc.migrate_singleton_to_restaurants()
    if migrated:
        logger.info("Multi-tenant migration ready: restaurant_id=%s", migrated)

    # Fix known spelling typo in menu item names (issue #12)
    cursor = db.menu_items.find({"name": {"$regex": "Muttion", "$options": "i"}})
    async for item in cursor:
        fixed = re.sub(r"(?i)muttion", "Mutton", item.get("name") or "")
        if fixed != item.get("name"):
            await db.menu_items.update_one({"id": item["id"]}, {"$set": {"name": fixed}})
            logger.info("Fixed menu spelling: %s → %s", item.get("name"), fixed)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
