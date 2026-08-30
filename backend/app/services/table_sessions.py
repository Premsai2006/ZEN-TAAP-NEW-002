"""Dining sittings: one open session per table, many kitchen tickets, one bill."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from app.database import db
from app.models import Order, OrderItem

IST = timezone(timedelta(hours=5, minutes=30))

OPEN_SESSION = ("open", "payment_pending")
BILLABLE_ORDER = ("new", "cooking", "done", "delivered")
PAY_MODES = ("cash", "upi", "card", "other")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ist_day() -> str:
    return datetime.now(IST).strftime("%Y%m%d")


def _strip_id(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


def merge_bill_lines(orders: list) -> list:
    """Combine non-cancelled order lines by name + unit price for the printed bill."""
    buckets = {}
    for o in orders or []:
        if o.get("status") == "cancelled":
            continue
        for it in o.get("items") or []:
            name = it.get("name") or ""
            price = float(it.get("price") or 0)
            qty = int(it.get("qty") or 0)
            if qty < 1:
                continue
            key = (name, price)
            row = buckets.setdefault(key, {"name": name, "qty": 0, "price": price})
            row["qty"] += qty
    lines = []
    for row in buckets.values():
        lines.append({
            "name": row["name"],
            "qty": row["qty"],
            "price": row["price"],
            "amount": round(row["qty"] * row["price"], 2),
        })
    return lines


def session_total(orders: list) -> float:
    return round(
        sum(float(o.get("amount") or 0) for o in (orders or []) if o.get("status") != "cancelled"),
        2,
    )


async def find_open_session(restaurant_id: str, table: int) -> Optional[dict]:
    if table <= 0:
        return None
    doc = await db.table_sessions.find_one(
        {
            "restaurant_id": restaurant_id,
            "table": int(table),
            "status": {"$in": list(OPEN_SESSION)},
        },
        {"_id": 0},
    )
    return doc


async def _next_session_code(restaurant_id: str, table: int) -> str:
    day = _ist_day()
    prefix = f"W-{day}-" if table <= 0 else f"T{int(table)}-{day}-"
    last = await db.table_sessions.find(
        {"restaurant_id": restaurant_id, "session_code": {"$regex": f"^{re.escape(prefix)}"}},
        {"_id": 0, "session_code": 1},
    ).sort("session_code", -1).limit(1).to_list(1)
    seq = 1
    if last:
        try:
            seq = int(str(last[0].get("session_code") or "").rsplit("-", 1)[-1]) + 1
        except (TypeError, ValueError):
            seq = 1
    return f"{prefix}{seq:03d}"


async def create_session(restaurant_id: str, table: int) -> dict:
    table = int(table)
    for _ in range(8):
        code = await _next_session_code(restaurant_id, table)
        doc = {
            "id": str(uuid.uuid4()),
            "restaurant_id": restaurant_id,
            "table": table,
            "session_code": code,
            "status": "open",
            "opened_at": _now_iso(),
            "closed_at": None,
            "paid_at": None,
            "payment_mode": None,
        }
        try:
            await db.table_sessions.insert_one(dict(doc))
            return doc
        except DuplicateKeyError:
            existing = await find_open_session(restaurant_id, table)
            if existing:
                return existing
            continue
    raise HTTPException(status_code=500, detail="Couldn't open a table session. Please try again.")


async def _legacy_open_orders(restaurant_id: str, table: int) -> list:
    return await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "table": int(table),
            "status": {"$in": list(BILLABLE_ORDER)},
            "$or": [
                {"session_id": {"$exists": False}},
                {"session_id": None},
                {"session_id": ""},
            ],
        },
        {"_id": 0},
    ).to_list(500)


async def backfill_table(restaurant_id: str, table: int) -> Optional[dict]:
    """Attach leftover unpaid tickets (no session_id) to the open sitting."""
    if table <= 0:
        return None
    orphans = await _legacy_open_orders(restaurant_id, table)
    session = await find_open_session(restaurant_id, table)
    if not orphans and session:
        return session
    if not orphans:
        return session
    if not session:
        session = await create_session(restaurant_id, table)
    ids = [o["id"] for o in orphans if o.get("id")]
    if ids:
        await db.orders.update_many(
            {"id": {"$in": ids}, "restaurant_id": restaurant_id},
            {"$set": {"session_id": session["id"], "session_code": session["session_code"]}},
        )
    return session


async def backfill_restaurant(restaurant_id: str) -> None:
    tables = await db.orders.distinct(
        "table",
        {
            "restaurant_id": restaurant_id,
            "table": {"$gt": 0},
            "status": {"$in": list(BILLABLE_ORDER)},
            "$or": [
                {"session_id": {"$exists": False}},
                {"session_id": None},
                {"session_id": ""},
            ],
        },
    )
    for table in tables:
        try:
            t = int(table)
        except (TypeError, ValueError):
            continue
        if t > 0:
            await backfill_table(restaurant_id, t)


async def attach_or_open_session(restaurant_id: str, table: int) -> dict:
    """
    First order on an empty table opens a sitting.
    Later orders (QR or counter) join the same sitting until staff close it.
    Walk-in (table 0) always starts a new sitting so guests are not mixed.
    """
    table = int(table)
    if table <= 0:
        return await create_session(restaurant_id, 0)
    existing = await find_open_session(restaurant_id, table)
    if existing:
        return existing
    await backfill_table(restaurant_id, table)
    existing = await find_open_session(restaurant_id, table)
    if existing:
        return existing
    return await create_session(restaurant_id, table)


async def session_orders(restaurant_id: str, session_id: str) -> list:
    return await db.orders.find(
        {"restaurant_id": restaurant_id, "session_id": session_id},
        {"_id": 0},
    ).sort("created_at", 1).to_list(500)


def serialize_session(session: dict, orders: list, public: bool = False) -> dict:
    billable = [o for o in orders if o.get("status") != "cancelled"]
    total = session_total(billable)
    out = {
        "id": session.get("id"),
        "table": session.get("table"),
        "session_code": session.get("session_code"),
        "status": session.get("status"),
        "opened_at": session.get("opened_at"),
        "closed_at": session.get("closed_at"),
        "paid_at": session.get("paid_at"),
        "payment_mode": session.get("payment_mode"),
        "current_total": total,
        "order_count": len(billable),
        "lines": merge_bill_lines(billable),
        "orders": [
            {
                "id": o.get("id"),
                "order_number": o.get("order_number"),
                "status": o.get("status"),
                "amount": o.get("amount"),
                "items": o.get("items") or [],
                "notes": o.get("notes"),
                "created_at": o.get("created_at"),
                "payment_mode": o.get("payment_mode"),
            }
            for o in orders
        ],
    }
    if not public:
        out["restaurant_id"] = session.get("restaurant_id")
    return out


async def get_session(restaurant_id: str, session_id: str) -> dict:
    session = await db.table_sessions.find_one(
        {"id": session_id, "restaurant_id": restaurant_id},
        {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail="That table session was not found.")
    orders = await session_orders(restaurant_id, session_id)
    return serialize_session(session, orders)


async def require_open_session(restaurant_id: str, session_id: str) -> dict:
    session = await db.table_sessions.find_one(
        {"id": session_id, "restaurant_id": restaurant_id},
        {"_id": 0},
    )
    if not session:
        raise HTTPException(status_code=404, detail="That table session was not found.")
    if session.get("status") == "closed":
        raise HTTPException(status_code=400, detail="This table session is already closed.")
    return session


async def settle_session(restaurant_id: str, session_id: str, payment_mode: str) -> dict:
    mode = (payment_mode or "cash").lower().strip()
    if mode not in PAY_MODES:
        raise HTTPException(status_code=400, detail="Choose cash, UPI, card, or other.")
    session = await require_open_session(restaurant_id, session_id)
    now = _now_iso()
    await db.orders.update_many(
        {
            "restaurant_id": restaurant_id,
            "session_id": session_id,
            "status": {"$nin": ["cancelled", "paid"]},
        },
        {"$set": {"status": "paid", "paid_at": now, "payment_mode": mode}},
    )
    await db.table_sessions.update_one(
        {"id": session_id, "restaurant_id": restaurant_id},
        {
            "$set": {
                "status": "closed",
                "closed_at": now,
                "paid_at": now,
                "payment_mode": mode,
            }
        },
    )
    session.update({"status": "closed", "closed_at": now, "paid_at": now, "payment_mode": mode})
    orders = await session_orders(restaurant_id, session_id)
    return serialize_session(session, orders)


async def request_bill(restaurant_id: str, session_id: str) -> dict:
    session = await require_open_session(restaurant_id, session_id)
    if session.get("status") != "payment_pending":
        await db.table_sessions.update_one(
            {"id": session_id, "restaurant_id": restaurant_id, "status": "open"},
            {"$set": {"status": "payment_pending"}},
        )
        session["status"] = "payment_pending"
    orders = await session_orders(restaurant_id, session_id)
    return serialize_session(session, orders)


async def maybe_close_empty_session(restaurant_id: str, session_id: Optional[str]) -> None:
    if not session_id:
        return
    remaining = await db.orders.count_documents(
        {
            "restaurant_id": restaurant_id,
            "session_id": session_id,
            "status": {"$in": list(BILLABLE_ORDER)},
        }
    )
    if remaining > 0:
        return
    session = await db.table_sessions.find_one(
        {"id": session_id, "restaurant_id": restaurant_id, "status": {"$in": list(OPEN_SESSION)}},
        {"_id": 0},
    )
    if not session:
        return
    now = _now_iso()
    paid_n = await db.orders.count_documents(
        {"restaurant_id": restaurant_id, "session_id": session_id, "status": "paid"}
    )
    fields = {"status": "closed", "closed_at": now}
    if paid_n:
        fields["paid_at"] = now
        if not session.get("payment_mode"):
            fields["payment_mode"] = "manual"
    await db.table_sessions.update_one(
        {"id": session_id, "restaurant_id": restaurant_id},
        {"$set": fields},
    )


async def create_attached_order(restaurant_id: str, table: int, priced_items: list, amount: float, notes: Optional[str]) -> Order:
    session = await attach_or_open_session(restaurant_id, table)
    last = await db.orders.find(
        {"restaurant_id": restaurant_id}, {"_id": 0}
    ).sort("order_number", -1).limit(1).to_list(1)
    next_num = (last[0]["order_number"] + 1) if last else 1001
    items = [OrderItem(**i) for i in priced_items]
    order = Order(
        restaurant_id=restaurant_id,
        order_number=next_num,
        table=int(table),
        items=items,
        amount=amount,
        notes=notes,
        session_id=session["id"],
        session_code=session.get("session_code"),
    )
    await db.orders.insert_one(order.model_dump())
    return order


async def floor_payload(restaurant_id: str, table_count: int) -> dict:
    await backfill_restaurant(restaurant_id)
    n = max(int(table_count or 0), 0)
    sessions = await db.table_sessions.find(
        {"restaurant_id": restaurant_id, "status": {"$in": list(OPEN_SESSION)}},
        {"_id": 0},
    ).to_list(500)
    by_table = {int(s["table"]): s for s in sessions if int(s.get("table") or 0) > 0}
    session_ids = [s["id"] for s in sessions]
    orders = []
    if session_ids:
        orders = await db.orders.find(
            {"restaurant_id": restaurant_id, "session_id": {"$in": session_ids}},
            {"_id": 0},
        ).to_list(3000)
    orders_by_sid = {}
    for o in orders:
        orders_by_sid.setdefault(o.get("session_id"), []).append(o)

    rows = []
    for t in range(1, n + 1):
        s = by_table.get(t)
        if not s:
            rows.append({
                "table": t,
                "session_id": None,
                "session_code": None,
                "status": "available",
                "current_total": 0,
                "order_count": 0,
                "opened_at": None,
            })
            continue
        sess_orders = orders_by_sid.get(s["id"]) or []
        billable = [o for o in sess_orders if o.get("status") != "cancelled"]
        rows.append({
            "table": t,
            "session_id": s["id"],
            "session_code": s.get("session_code"),
            "status": s.get("status") or "open",
            "current_total": session_total(billable),
            "order_count": len(billable),
            "opened_at": s.get("opened_at"),
        })

    walk_in = []
    for s in sessions:
        if int(s.get("table") or 0) != 0:
            continue
        sess_orders = orders_by_sid.get(s["id"]) or []
        billable = [o for o in sess_orders if o.get("status") != "cancelled"]
        walk_in.append({
            "table": 0,
            "session_id": s["id"],
            "session_code": s.get("session_code"),
            "status": s.get("status") or "open",
            "current_total": session_total(billable),
            "order_count": len(billable),
            "opened_at": s.get("opened_at"),
        })

    occupied = sum(1 for r in rows if r["status"] != "available")
    return {
        "tables": rows,
        "walk_in": walk_in,
        "occupied": occupied,
        "available": n - occupied,
        "table_count": n,
    }


async def public_table_session(restaurant_id: str, table: int) -> dict:
    table = int(table)
    if table <= 0:
        return {"session": None}
    await backfill_table(restaurant_id, table)
    session = await find_open_session(restaurant_id, table)
    if not session:
        return {"session": None}
    orders = await session_orders(restaurant_id, session["id"])
    return {"session": serialize_session(session, orders, public=True)}
