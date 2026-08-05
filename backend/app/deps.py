from datetime import datetime, timezone
from fastapi import HTTPException, Request, Response, Depends
from app.config import MGR_COOKIE, DEMO_MODE
from app.database import db
from app.services import restaurants as rest_svc


def extract_manager_token(request: Request) -> str:
    cookie_token = request.cookies.get(MGR_COOKIE)
    if cookie_token:
        return cookie_token.strip()
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def set_manager_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=MGR_COOKIE,
        value=token,
        httponly=True,
        secure=not DEMO_MODE,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 30,
    )


def clear_manager_cookie(response: Response) -> None:
    response.delete_cookie(key=MGR_COOKIE, path="/")


async def require_manager(request: Request):
    token = extract_manager_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    sess = await db.sessions.find_one({"scope": "manager", "token": token})
    if not sess:
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    if not sess.get("restaurant_id"):
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}},
    )
    return sess


async def require_manager_or_kitchen(request: Request):
    token = extract_manager_token(request)
    if not token:
        # Also accept kitchen token from Authorization only
        auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    sess = await db.sessions.find_one(
        {"token": token, "scope": {"$in": ["manager", "kitchen"]}}
    )
    if not sess or not sess.get("restaurant_id"):
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}},
    )
    return sess


async def has_active_subscription(restaurant_id: str) -> bool:
    doc = await rest_svc.get_by_id(restaurant_id) or {}
    status = doc.get("subscription_status", "none")
    return status in ("trial", "active")


async def require_subscription(sess: dict = Depends(require_manager)):
    rid = sess.get("restaurant_id")
    if not await has_active_subscription(rid):
        raise HTTPException(
            status_code=402,
            detail="Subscribe to ZenTaap to use this feature. You can browse the dashboard freely.",
        )
    return sess


async def require_manager_subscription(sess: dict = Depends(require_manager)):
    return await require_subscription(sess)


RequireManager = Depends(require_manager)
RequireSubscription = Depends(require_subscription)
