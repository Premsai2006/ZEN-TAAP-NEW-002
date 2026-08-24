"""Subscription access / expiry helpers."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

from app.config import TRIAL_DAYS
from app.services import restaurants as rest_svc

BILLING_CYCLE_DAYS = 30
# Short grace after next_cycle before hard expiry (failed payment buffer)
GRACE_DAYS = 2


def parse_dt(iso: Optional[str]) -> Optional[datetime]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except Exception:
        return None


def advance_cycle_to_future(next_cycle_iso: Optional[str], now: datetime) -> str:
    next_dt = parse_dt(next_cycle_iso) or now
    while next_dt <= now:
        next_dt = next_dt + timedelta(days=BILLING_CYCLE_DAYS)
    return next_dt.isoformat()


async def refresh_subscription_status(restaurant_id: str, doc: Optional[dict] = None) -> Tuple[dict, str]:
    """
    Enforce trial_end and billing cycle expiry. Persists expired status when needed.
    Returns (doc, status).
    """
    if doc is None:
        doc = await rest_svc.get_by_id(restaurant_id) or {}
    status = doc.get("subscription_status") or "none"
    now = datetime.now(timezone.utc)
    updates = {}

    if status == "trial":
        trial_end = parse_dt(doc.get("trial_end"))
        if trial_end and now >= trial_end:
            status = "expired"
            updates["subscription_status"] = "expired"
            updates["payment_status"] = "trial_ended"
        elif not trial_end:
            # Backfill missing trial_end from trial_start
            trial_start = parse_dt(doc.get("trial_start"))
            if trial_start:
                te = trial_start + timedelta(days=TRIAL_DAYS)
                updates["trial_end"] = te.isoformat()
                if now >= te:
                    status = "expired"
                    updates["subscription_status"] = "expired"

    if status == "active":
        next_cycle = parse_dt(doc.get("next_cycle_start"))
        if next_cycle:
            grace_end = next_cycle + timedelta(days=GRACE_DAYS)
            if now >= grace_end:
                status = "expired"
                updates["subscription_status"] = "expired"
                updates["payment_status"] = "cycle_ended"
            elif now >= next_cycle:
                # In grace — mark payment_failed hint but keep access
                if doc.get("payment_status") != "grace":
                    updates["payment_status"] = "grace"

    if updates:
        await rest_svc.update_restaurant(restaurant_id, updates)
        doc = {**doc, **updates}

    return doc, status


def has_access_status(status: str) -> bool:
    return status in ("trial", "active")
