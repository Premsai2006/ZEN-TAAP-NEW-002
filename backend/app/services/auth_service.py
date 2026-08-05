import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Request

from app.config import (
    MAX_DEVICES, DEMO_MODE, MAX_PIN_ATTEMPTS, LOCKOUT_MINUTES,
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


async def get_profile():
    return await db.settings.find_one({"key": "manager_profile"}, {"_id": 0})


async def get_stored_pin() -> Optional[str]:
    p = await get_profile()
    stored = p.get("pin") if p else None
    if not stored:
        legacy = await db.settings.find_one({"key": "manager_pin"}, {"_id": 0})
        stored = legacy["value"] if legacy else None
    return stored


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
                detail=f"Too many incorrect attempts. Try again in {mins} minute(s).",
            )
        # Lock expired — clear
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
    remaining = MAX_PIN_ATTEMPTS - count
    if count >= MAX_PIN_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many incorrect attempts. Locked for {LOCKOUT_MINUTES} minutes.",
        )
    raise HTTPException(
        status_code=401,
        detail=f"Incorrect PIN. {remaining} attempt(s) remaining before lockout.",
    )


async def clear_login_failures(request: Request):
    await db.login_attempts.delete_one({"key": _attempt_key(request)})


async def register_session(device_id: Optional[str], device_label: Optional[str]) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    token = f"mgr-{uuid.uuid4()}"
    if not device_id:
        device_id = uuid.uuid4().hex[:16]
    label = (device_label or "Unknown device")[:80]

    # Dedupe: remove any extra docs with same device_id (keep at most one via replace).
    existing = await db.sessions.find({"device_id": device_id}).to_list(20)
    if existing:
        # Keep one, delete extras, then update
        keep = existing[0]
        if len(existing) > 1:
            await db.sessions.delete_many({
                "device_id": device_id,
                "_id": {"$ne": keep["_id"]},
            })
        await db.sessions.update_one(
            {"_id": keep["_id"]},
            {"$set": {
                "scope": "manager",
                "token": token,
                "last_used": now_iso,
                "device_label": label,
                "device_id": device_id,
            }},
        )
    else:
        sessions = await db.sessions.find({"scope": "manager"}, {"_id": 0}).to_list(50)
        # Dedupe by device_id in memory then enforce cap
        seen = set()
        unique = []
        for s in sessions:
            did = s.get("device_id")
            if did and did in seen:
                await db.sessions.delete_one({"device_id": did, "token": s.get("token")})
                continue
            if did:
                seen.add(did)
            unique.append(s)
        if len(unique) >= MAX_DEVICES:
            unique.sort(key=lambda s: s.get("last_used") or s.get("created_at") or "")
            oldest = unique[0]
            await db.sessions.delete_one({"device_id": oldest["device_id"]})
        await db.sessions.insert_one({
            "scope": "manager",
            "device_id": device_id,
            "device_label": label,
            "token": token,
            "created_at": now_iso,
            "last_used": now_iso,
        })

    # Count unique device_ids
    all_sess = await db.sessions.find({"scope": "manager"}, {"_id": 0, "device_id": 1}).to_list(50)
    active = len({s["device_id"] for s in all_sess if s.get("device_id")})
    return {"token": token, "device_id": device_id, "active_devices": active}


async def list_unique_sessions() -> list:
    docs = await db.sessions.find({"scope": "manager"}, {"_id": 0, "token": 0}).to_list(50)
    by_device = {}
    for s in docs:
        did = s.get("device_id") or s.get("created_at") or id(s)
        prev = by_device.get(did)
        if not prev:
            by_device[did] = s
            continue
        # Keep most recently used
        if (s.get("last_used") or "") > (prev.get("last_used") or ""):
            by_device[did] = s
    result = list(by_device.values())
    result.sort(key=lambda s: s.get("last_used") or s.get("created_at") or "", reverse=True)
    return result


async def contact_matches(given: str) -> bool:
    p = await get_profile()
    if not p or not p.get("contact_number"):
        return True  # no contact on file — skip
    saved = digits(p.get("contact_number"))
    given_d = digits(given)
    return bool(saved and given_d and saved[-7:] == given_d[-7:])
