import uuid
import pytest

from app.services.table_sessions import merge_bill_lines, session_total


def test_merge_bill_lines_combines_same_item():
    orders = [
        {
            "status": "new",
            "items": [{"name": "Biryani", "qty": 2, "price": 200}],
            "amount": 400,
        },
        {
            "status": "cooking",
            "items": [
                {"name": "Coke", "qty": 1, "price": 50},
                {"name": "Ice Cream", "qty": 1, "price": 120},
            ],
            "amount": 170,
        },
    ]
    lines = merge_bill_lines(orders)
    by_name = {l["name"]: l for l in lines}
    assert by_name["Biryani"]["qty"] == 2
    assert by_name["Biryani"]["amount"] == 400
    assert by_name["Coke"]["amount"] == 50
    assert by_name["Ice Cream"]["amount"] == 120
    assert session_total(orders) == 570


def test_merge_skips_cancelled_and_keeps_separate_prices():
    orders = [
        {"status": "cancelled", "items": [{"name": "Biryani", "qty": 1, "price": 200}], "amount": 200},
        {"status": "new", "items": [{"name": "Tea", "qty": 1, "price": 20}], "amount": 20},
        {"status": "new", "items": [{"name": "Tea", "qty": 2, "price": 25}], "amount": 50},
    ]
    lines = merge_bill_lines(orders)
    teas = [l for l in lines if l["name"] == "Tea"]
    assert len(teas) == 2
    assert "Biryani" not in {l["name"] for l in lines}
    assert session_total(orders) == 70


@pytest.mark.asyncio
async def test_same_table_orders_share_session_until_settle():
    from app.database import db
    from app.services import table_sessions as sess_svc
    from app.services.restaurants import ensure_indexes

    rid = f"test-sitting-{uuid.uuid4()}"
    await ensure_indexes()
    try:
        first = await sess_svc.create_attached_order(
            rid, 5,
            [{"name": "Biryani", "qty": 2, "price": 200, "menu_item_id": None}],
            400.0, None,
        )
        second = await sess_svc.create_attached_order(
            rid, 5,
            [{"name": "Coke", "qty": 1, "price": 50, "menu_item_id": None},
             {"name": "Ice Cream", "qty": 1, "price": 120, "menu_item_id": None}],
            170.0, None,
        )
        assert first.session_id
        assert first.session_id == second.session_id
        assert first.session_code == second.session_code
        assert first.session_code.startswith("T5-")

        view = await sess_svc.get_session(rid, first.session_id)
        assert view["status"] == "open"
        assert view["current_total"] == 570
        assert {l["name"] for l in view["lines"]} == {"Biryani", "Coke", "Ice Cream"}

        public = await sess_svc.public_table_session(rid, 5)
        assert public["session"]["id"] == first.session_id

        pending = await sess_svc.request_bill(rid, first.session_id)
        assert pending["status"] == "payment_pending"

        third = await sess_svc.create_attached_order(
            rid, 5,
            [{"name": "Water", "qty": 1, "price": 20, "menu_item_id": None}],
            20.0, None,
        )
        assert third.session_id == first.session_id

        closed = await sess_svc.settle_session(rid, first.session_id, "upi")
        assert closed["status"] == "closed"
        assert closed["payment_mode"] == "upi"

        nxt = await sess_svc.create_attached_order(
            rid, 5,
            [{"name": "Tea", "qty": 1, "price": 30, "menu_item_id": None}],
            30.0, None,
        )
        assert nxt.session_id != first.session_id
        assert nxt.session_code != first.session_code

        walk1 = await sess_svc.create_attached_order(
            rid, 0,
            [{"name": "Samosa", "qty": 1, "price": 40, "menu_item_id": None}],
            40.0, None,
        )
        walk2 = await sess_svc.create_attached_order(
            rid, 0,
            [{"name": "Samosa", "qty": 1, "price": 40, "menu_item_id": None}],
            40.0, None,
        )
        assert walk1.session_id != walk2.session_id
    finally:
        await db.orders.delete_many({"restaurant_id": rid})
        await db.table_sessions.delete_many({"restaurant_id": rid})
