from datetime import datetime, timezone
from fastapi import HTTPException, Request, Response, Depends
from app.config import MGR_COOKIE, ADM_COOKIE, DEMO_MODE
from app.database import db
from app.services import restaurants as rest_svc
from app.services.subscription_access import refresh_subscription_status, has_access_status


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


def extract_admin_token(request: Request) -> str:
    cookie_token = request.cookies.get(ADM_COOKIE)
    if cookie_token:
        return cookie_token.strip()
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def set_admin_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=ADM_COOKIE,
        value=token,
        httponly=True,
        secure=not DEMO_MODE,
        samesite="lax",
        path="/",
        max_age=60 * 60 * 24 * 7,
    )


def clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(key=ADM_COOKIE, path="/")


async def _reject_if_suspended(restaurant_id: str):
    if not restaurant_id:
        return
    rest = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "suspended": 1})
    if rest and rest.get("suspended"):
        raise HTTPException(
            status_code=403,
            detail="This restaurant is suspended. Contact ZenTaap support.",
        )


def require_roles(*roles: str):
    allowed = {r.lower() for r in roles}

    async def _inner(sess: dict = Depends(require_manager)):
        role = (sess.get("role") or "owner").lower()
        if role not in allowed:
            raise HTTPException(status_code=403, detail="You don't have permission for this.")
        return sess

    return _inner


async def require_admin(request: Request):
    token = extract_admin_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    sess = await db.sessions.find_one({"scope": "admin", "token": token})
    if not sess:
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}},
    )
    return sess


async def require_manager(request: Request):
    token = extract_manager_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    sess = await db.sessions.find_one({"scope": "manager", "token": token})
    if not sess:
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    if not sess.get("restaurant_id"):
        raise HTTPException(status_code=401, detail="Session expired — please log in again.")
    await _reject_if_suspended(sess["restaurant_id"])
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}},
    )
    sess.setdefault("role", "owner")
    return sess


async def require_manager_or_kitchen(request: Request):
    token = extract_manager_token(request)
    if not token:
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
    await _reject_if_suspended(sess["restaurant_id"])
    await db.sessions.update_one(
        {"_id": sess["_id"]},
        {"$set": {"last_used": datetime.now(timezone.utc).isoformat()}},
    )
    sess.setdefault("role", "kitchen" if sess.get("scope") == "kitchen" else "owner")
    return sess


async def has_active_subscription(restaurant_id: str) -> bool:
    """Enforce trial_end + billing cycle (with short grace) on every gate check."""
    doc, status = await refresh_subscription_status(restaurant_id)
    if doc.get("suspended"):
        return False
    return has_access_status(status)


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


def assert_role(sess: dict, *roles: str) -> None:
    role = (sess.get("role") or "owner").lower()
    if role not in {r.lower() for r in roles}:
        raise HTTPException(status_code=403, detail="You don't have permission for this.")


RequireManager = Depends(require_manager)
RequireSubscription = Depends(require_subscription)
