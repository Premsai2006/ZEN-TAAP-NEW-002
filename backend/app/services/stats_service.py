from datetime import datetime, timezone, date, timedelta
from app.database import db


async def orders_in_range(start_iso: str, end_iso: str) -> list:
    return await db.orders.find(
        {"created_at": {"$gte": start_iso, "$lt": end_iso}}, {"_id": 0}
    ).to_list(5000)


def aggregate_orders(orders: list) -> dict:
    n = len(orders)
    rev = sum(o["amount"] for o in orders)
    comp = sum(1 for o in orders if o["status"] in ("done", "delivered"))
    return {
        "orders": n,
        "revenue": rev,
        "completed": comp,
        "aov": round(rev / n, 2) if n else 0,
    }


def growth_pct(current: float, prior: float) -> float:
    if prior == 0:
        return 100.0 if current > 0 else 0.0
    return round((current - prior) / prior * 100, 1)


async def seven_day_growth(today: date) -> dict:
    last_7_start = today - timedelta(days=6)
    last_7_end = today + timedelta(days=1)
    prev_7_start = today - timedelta(days=13)
    prev_7_end = today - timedelta(days=6)
    current = aggregate_orders(await orders_in_range(last_7_start.isoformat(), last_7_end.isoformat()))
    prior = aggregate_orders(await orders_in_range(prev_7_start.isoformat(), prev_7_end.isoformat()))
    return {
        "revenue": growth_pct(current["revenue"], prior["revenue"]),
        "orders": growth_pct(current["orders"], prior["orders"]),
        "completed": growth_pct(current["completed"], prior["completed"]),
        "aov": growth_pct(current["aov"], prior["aov"]),
    }


def count_top_items(orders: list) -> list:
    counter = {}
    for o in orders:
        for it in o.get("items") or []:
            entry = counter.setdefault(it["name"], {"name": it["name"], "qty": 0, "revenue": 0.0})
            entry["qty"] += it["qty"]
            entry["revenue"] += it["qty"] * it["price"]
    return sorted(counter.values(), key=lambda x: x["qty"], reverse=True)[:6]


async def menu_meta_for(orders: list) -> tuple:
    item_names = list({it["name"] for o in orders for it in (o.get("items") or [])})
    items = (
        await db.menu_items.find({"name": {"$in": item_names}}, {"_id": 0}).to_list(500)
        if item_names else []
    )
    cat_map = {i["name"]: (i.get("category") or "Uncategorized") for i in items}
    img_map = {
        i["name"]: ((i.get("images") or ([i.get("image_url")] if i.get("image_url") else []))[0]
                    if (i.get("images") or i.get("image_url")) else "")
        for i in items
    }
    emoji_map = {i["name"]: i.get("emoji", "🍽️") for i in items}
    cost_map = {i["name"]: i.get("cost_price") for i in items}
    return cat_map, img_map, emoji_map, cost_map


def revenue_by_category(orders: list, cat_map: dict, revenue: float) -> list:
    cat_rev = {}
    for o in orders:
        for it in o.get("items") or []:
            cat = cat_map.get(it["name"], "Uncategorized")
            cat_rev[cat] = cat_rev.get(cat, 0) + it["qty"] * it["price"]
    return [
        {"category": k, "revenue": round(v, 2), "percent": round((v / revenue * 100) if revenue else 0, 1)}
        for k, v in sorted(cat_rev.items(), key=lambda x: x[1], reverse=True)
    ]


def compute_gross_profit(orders: list, cost_map: dict) -> tuple:
    """Returns (gross_profit_or_None, note). Uses real cost_price when available."""
    total_cost = 0.0
    known = False
    for o in orders:
        for it in o.get("items") or []:
            cost = cost_map.get(it["name"])
            if cost is not None:
                total_cost += float(cost) * it["qty"]
                known = True
    if not known:
        return None, "Add cost prices on menu items to track real gross profit"
    revenue = sum(o["amount"] for o in orders)
    return round(revenue - total_cost, 2), None


async def fetch_orders_for_period(period: str) -> list:
    now = datetime.now(timezone.utc)
    today = now.date()
    if period == "today":
        return await db.orders.find(
            {"created_at": {"$regex": f"^{today.isoformat()}"}}, {"_id": 0}
        ).to_list(2000)
    if period == "yesterday":
        y = (today - timedelta(days=1)).isoformat()
        return await db.orders.find(
            {"created_at": {"$regex": f"^{y}"}}, {"_id": 0}
        ).to_list(2000)
    if period == "week":
        start = (today - timedelta(days=6)).isoformat()
        end = (today + timedelta(days=1)).isoformat()
        return await orders_in_range(start, end)
    # total — all orders
    return await db.orders.find({}, {"_id": 0}).to_list(5000)


async def build_stats_payload(orders: list, today: date) -> dict:
    total_orders = len(orders)
    revenue = sum(o["amount"] for o in orders)
    completed = sum(1 for o in orders if o["status"] in ("done", "delivered"))
    pending = sum(1 for o in orders if o["status"] == "new")
    active_tables = len({
        o["table"] for o in orders
        if o["status"] in ("new", "cooking") and o.get("table")
    })
    avg_order_value = round(revenue / total_orders, 2) if total_orders else 0

    cat_map, img_map, emoji_map, cost_map = await menu_meta_for(orders)
    gross_profit, gp_note = compute_gross_profit(orders, cost_map)

    growth_7d = await seven_day_growth(today)
    top = count_top_items(orders)
    for t in top:
        t["category"] = cat_map.get(t["name"], "Uncategorized")
        t["image"] = img_map.get(t["name"], "")
        t["emoji"] = emoji_map.get(t["name"], "🍽️")

    return {
        "total_orders": total_orders,
        "revenue": revenue,
        "completed": completed,
        "pending": pending,
        "active_tables": active_tables,
        "avg_order_value": avg_order_value,
        "gross_profit": gross_profit,
        "gross_profit_note": gp_note,
        "most_ordered": top[0]["name"] if top else "—",
        "most_count": top[0]["qty"] if top else 0,
        "top_items": top,
        "revenue_by_category": revenue_by_category(orders, cat_map, revenue),
        "growth_7d": growth_7d,
    }
