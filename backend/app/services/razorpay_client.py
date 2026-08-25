"""Shared Razorpay client helper."""
from __future__ import annotations

import logging
from typing import Optional

from app.config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

logger = logging.getLogger(__name__)


def razorpay_client():
    if not (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET):
        return None
    try:
        import razorpay

        return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    except Exception as exc:
        logger.warning("Razorpay client init failed: %s", exc)
        return None


def razorpay_configured() -> bool:
    return razorpay_client() is not None
