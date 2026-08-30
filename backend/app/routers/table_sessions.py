from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import require_manager, require_manager_or_kitchen, assert_role
from app.services import restaurants as rest_svc
from app.services import table_sessions as sess_svc

router = APIRouter(prefix="/table-sessions", tags=["table-sessions"])


class SettleSessionBody(BaseModel):
    payment_mode: str = "cash"


@router.get("/floor")
async def floor(sess=Depends(require_manager_or_kitchen)):
    rid = sess["restaurant_id"]
    doc = await rest_svc.require_restaurant_id(rid)
    n = doc.get("subscription_tables") or 15
    try:
        n = int(n)
    except (TypeError, ValueError):
        n = 15
    if n < 1:
        n = 15
    return await sess_svc.floor_payload(rid, n)


@router.get("/{session_id}")
async def get_session(session_id: str, sess=Depends(require_manager_or_kitchen)):
    return await sess_svc.get_session(sess["restaurant_id"], session_id)


@router.post("/{session_id}/request-bill")
async def request_bill(session_id: str, sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager", "cashier")
    return await sess_svc.request_bill(sess["restaurant_id"], session_id)


@router.post("/{session_id}/settle")
async def settle_session(session_id: str, body: SettleSessionBody, sess=Depends(require_manager)):
    assert_role(sess, "owner", "manager", "cashier")
    closed = await sess_svc.settle_session(sess["restaurant_id"], session_id, body.payment_mode)
    return {"success": True, "session": closed}
