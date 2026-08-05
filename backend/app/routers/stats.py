from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from app.database import db
from app.deps import require_subscription
from app.services import stats_service as stats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/today")
async def stats_today(sess=Depends(require_subscription)):
    rid = sess["restaurant_id"]
    today = datetime.now(timezone.utc).date()
    orders = await stats.fetch_orders_for_period("today", rid)
    return await stats.build_stats_payload(orders, today, rid)


@router.get("/summary")
async def stats_summary(period: str = "today", sess=Depends(require_subscription)):
    """Period-aware stats for Sales dashboard. period in {today, yesterday, week, total}."""
    if period not in ("today", "yesterday", "week", "total"):
        period = "today"
    rid = sess["restaurant_id"]
    today = datetime.now(timezone.utc).date()
    orders = await stats.fetch_orders_for_period(period, rid)
    payload = await stats.build_stats_payload(orders, today, rid)
    payload["period"] = period
    return payload


@router.get("/revenue")
async def stats_revenue(period: str = "week", sess=Depends(require_subscription)):
    rid = sess["restaurant_id"]
    now = datetime.now(timezone.utc)
    today = now.date()
    series = []
    if period == "today":
        today_iso = today.isoformat()
        orders = await db.orders.find(
            {"restaurant_id": rid, "created_at": {"$regex": f"^{today_iso}"}}, {"_id": 0}
        ).to_list(2000)
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
        orders = await db.orders.find(
            {"restaurant_id": rid, "created_at": {"$regex": f"^{y}"}}, {"_id": 0}
        ).to_list(2000)
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
            orders = await db.orders.find(
                {"restaurant_id": rid, "created_at": {"$regex": f"^{d_iso}"}}, {"_id": 0}
            ).to_list(2000)
            total = sum(o["amount"] for o in orders)
            series.append({"label": d.strftime("%d %b"), "weekday": d.strftime("%a"), "revenue": round(total, 2)})
    else:
        for i in range(11, -1, -1):
            start = today - timedelta(days=(i + 1) * 7 - 1)
            end = today - timedelta(days=i * 7)
            orders = await db.orders.find(
                {
                    "restaurant_id": rid,
                    "created_at": {"$gte": start.isoformat(), "$lt": (end + timedelta(days=1)).isoformat()},
                },
                {"_id": 0},
            ).to_list(5000)
            total = sum(o["amount"] for o in orders)
            series.append({"label": start.strftime("%d %b"), "revenue": round(total, 2)})

    grand_total = round(sum(p["revenue"] for p in series), 2)
    return {"period": period, "series": series, "total": grand_total}
