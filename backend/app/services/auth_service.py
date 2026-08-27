import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Request

from app.config import (
    MAX_DEVICES, MAX_PIN_ATTEMPTS, LOCKOUT_MINUTES,
    PIN_MIN_NEW, PIN_MAX, PIN_MIN_LEGACY,
)
from app.database import db


def digits(s: str) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())


def validate_pin(pin: str, *, new: bool = False):
    """Validate PIN. new=True enforces 6–10 for signup/change/OTP; login uses legacy 4–10."""
    if not pin or not pin.isdigit():
        raise HTTPException(status_code=400, detail="Your PIN can only contain numbers.")
    mn = PIN_MIN_NEW if new else PIN_MIN_LEGACY
    if len(pin) < mn or len(pin) > PIN_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Your PIN must be {mn}–{PIN_MAX} digits.",
        )


def validate_short_pin(pin: str, label: str = "PIN"):
    if not pin or not pin.isdigit():
        raise HTTPException(status_code=400, detail=f"{label} can only contain numbers.")
    if len(pin) < 4 or len(pin) > 6:
        raise HTTPException(status_code=400, detail=f"{label} must be 4–6 digits.")


def _attempt_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    ip = (forwarded.split(",")[0].strip() if forwarded else "") or (
        request.client.host if request.client else "unknown"
    )
    return f"login:{ip}"


async def check_login_lockout(request: Request):
    key = _attempt_key(request)
    rec = await db.login_attempts.find_one({"key": key}, {"_id": 0})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until:
        try:
            until = datetime.fromisoformat(locked_until.replace("Z", "+00:00"))
        except Exception:
            return
        now = datetime.now(timezone.utc)
        if now < until:
            mins = max(1, int((until - now).total_seconds() // 60) + 1)
            raise HTTPException(
                status_code=429,
                detail="Please try again in a few minutes.",
            )
        await db.login_attempts.delete_one({"key": key})


async def record_login_failure(request: Request):
    key = _attempt_key(request)
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"key": key}) or {}
    count = int(rec.get("count") or 0) + 1
    update = {"count": count, "last_attempt": now.isoformat()}
    if count >= MAX_PIN_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0
    await db.login_attempts.update_one({"key": key}, {"$set": update}, upsert=True)
    if count >= MAX_PIN_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Please try again in a few minutes.",
        )
    raise HTTPException(
        status_code=401,
        detail="Incorrect PIN.",
    )


async def clear_login_failures(request: Request):
    await db.login_attempts.delete_one({"key": _attempt_key(request)})


async def register_session(
    restaurant_id: str,
    device_id: Optional[str],
    device_label: Optional[str],
    *,
    scope: str = "manager",
    staff_id: Optional[str] = None,
    role: Optional[str] = None,
) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    prefix = "mgr" if scope == "manager" else scope
    token = f"{prefix}-{uuid.uuid4()}"
    if not device_id:
        device_id = uuid.uuid4().hex[:16]
    label = (device_label or "Unknown device")[:80]
    role = role or ("kitchen" if scope == "kitchen" else "owner")
    extra = {"role": role, "staff_id": staff_id}

    existing = await db.sessions.find(
        {"restaurant_id": restaurant_id, "scope": scope, "device_id": device_id}
    ).to_list(20)
    if existing:
        keep = existing[0]
        if len(existing) > 1:
            await db.sessions.delete_many({
                "restaurant_id": restaurant_id,
                "scope": scope,
                "device_id": device_id,
                "_id": {"$ne": keep["_id"]},
            })
        await db.sessions.update_one(
            {"_id": keep["_id"]},
            {"$set": {
                "scope": scope,
                "restaurant_id": restaurant_id,
                "token": token,
                "last_used": now_iso,
                "device_label": label,
                "device_id": device_id,
                **extra,
            }},
        )
    else:
        sessions = await db.sessions.find(
            {"restaurant_id": restaurant_id, "scope": scope}, {"_id": 0}
        ).to_list(50)
        seen = set()
        unique = []
        for s in sessions:
            did = s.get("device_id")
            if did and did in seen:
                await db.sessions.delete_one({
                    "restaurant_id": restaurant_id,
                    "device_id": did,
                    "token": s.get("token"),
                })
                continue
            if did:
                seen.add(did)
            unique.append(s)
        if len(unique) >= MAX_DEVICES:
            unique.sort(key=lambda s: s.get("last_used") or s.get("created_at") or "")
            oldest = unique[0]
            await db.sessions.delete_one({
                "restaurant_id": restaurant_id,
                "scope": scope,
                "device_id": oldest["device_id"],
            })
        await db.sessions.insert_one({
            "scope": scope,
            "restaurant_id": restaurant_id,
            "device_id": device_id,
            "device_label": label,
            "token": token,
            "created_at": now_iso,
            "last_used": now_iso,
            **extra,
        })

    all_sess = await db.sessions.find(
        {"restaurant_id": restaurant_id, "scope": scope},
        {"_id": 0, "device_id": 1},
    ).to_list(50)
    active = len({s["device_id"] for s in all_sess if s.get("device_id")})
    return {
        "token": token,
        "device_id": device_id,
        "active_devices": active,
        "restaurant_id": restaurant_id,
        "role": role,
        "staff_id": staff_id,
    }


async def list_unique_sessions(restaurant_id: str, scope: str = "manager") -> list:
    docs = await db.sessions.find(
        {"restaurant_id": restaurant_id, "scope": scope},
        {"_id": 0, "token": 0},
    ).to_list(50)
    by_device = {}
    for s in docs:
        did = s.get("device_id") or s.get("created_at") or id(s)
        prev = by_device.get(did)
        if not prev or (s.get("last_used") or "") > (prev.get("last_used") or ""):
            by_device[did] = s
    result = list(by_device.values())
    result.sort(key=lambda s: s.get("last_used") or s.get("created_at") or "", reverse=True)
    return result
