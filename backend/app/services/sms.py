"""OTP delivery: 2Factor SMS first, Gmail SMTP as fallback."""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional, Tuple
from urllib.parse import quote

import requests

from app.config import (
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_TLS,
    SMTP_USER,
    TWOFACTOR_API_KEY,
    TWOFACTOR_COUNTRY_CODE,
    TWOFACTOR_OTP_TEMPLATE,
)

logger = logging.getLogger(__name__)
TWOFACTOR_BASE = "https://2factor.in/API/V1"


def smtp_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


def twofactor_configured() -> bool:
    return bool(TWOFACTOR_API_KEY)


def otp_delivery_configured() -> bool:
    return twofactor_configured()


def india_msisdn(phone_digits: str) -> str:
    """Normalize to 91XXXXXXXXXX for 2Factor."""
    d = "".join(ch for ch in (phone_digits or "") if ch.isdigit())
    cc = "".join(ch for ch in (TWOFACTOR_COUNTRY_CODE or "91") if ch.isdigit()) or "91"
    if d.startswith(cc) and len(d) > 10:
        d = d[len(cc):]
    if len(d) > 10:
        d = d[-10:]
    if len(d) != 10:
        return ""
    return f"{cc}{d}"


def mask_phone(phone_digits: str) -> str:
    d = "".join(ch for ch in (phone_digits or "") if ch.isdigit())
    if len(d) >= 10:
        d = d[-10:]
        return f"{d[:2]}******{d[-2:]}"
    if len(d) >= 4:
        return f"{d[:2]}****{d[-2:]}"
    return "your phone"


def send_otp_sms_sync(phone_digits: str, otp: str) -> Tuple[bool, str]:
    """Send a custom 6-digit OTP via 2Factor SMS API."""
    if not twofactor_configured():
        return False, "sms_not_configured"
    msisdn = india_msisdn(phone_digits)
    if not msisdn:
        return False, "invalid_phone"
    otp = "".join(ch for ch in (otp or "") if ch.isdigit())
    if not otp:
        return False, "invalid_otp"

    key = quote(TWOFACTOR_API_KEY, safe="-")
    parts = [TWOFACTOR_BASE, key, "SMS", msisdn, quote(otp, safe="")]
    if TWOFACTOR_OTP_TEMPLATE:
        parts.append(quote(TWOFACTOR_OTP_TEMPLATE, safe="-_."))
    url = "/".join(parts)

    try:
        r = requests.get(url, timeout=15)
        data = r.json() if r.content else {}
    except Exception as e:
        logger.warning("2Factor OTP send failed: %s", e)
        return False, "sms_error"

    status = str(data.get("Status") or "").strip().lower()
    if r.ok and status == "success":
        return True, "sms_ok"
    detail = str(data.get("Details") or r.text or "sms_error")[:200]
    logger.warning("2Factor OTP rejected: %s", detail)
    return False, "sms_rejected"


async def send_otp_sms(phone_digits: str, otp: str) -> Tuple[bool, str]:
    return await asyncio.to_thread(send_otp_sms_sync, phone_digits, otp)


async def send_otp_email(to_email: str, otp: str, *, restaurant_name: str = "") -> Tuple[bool, str]:
    """Send PIN-reset OTP to the restaurant email. Returns (ok, detail)."""
    to_email = (to_email or "").strip()
    if not to_email or "@" not in to_email:
        return False, "missing_email"
    if not smtp_configured():
        return False, "smtp_not_configured"

    subject = "ZenTaap PIN reset code"
    name = restaurant_name.strip() or "your restaurant"
    body = (
        f"Your ZenTaap PIN reset code for {name} is:\n\n"
        f"    {otp}\n\n"
        f"This code expires in 5 minutes.\n"
        f"If you did not request this, you can ignore this email.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM or SMTP_USER
    msg["To"] = to_email
    msg.set_content(body)

    def _send() -> None:
        if SMTP_USE_TLS:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as server:
                server.ehlo()
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=ssl.create_default_context()) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)

    try:
        await asyncio.to_thread(_send)
        return True, "smtp_ok"
    except Exception as e:
        logger.warning("SMTP OTP send failed: %s", e)
        return False, "smtp_error"


async def deliver_pin_reset_otp(
    *,
    phone_digits: str,
    email: str = "",
    otp: str,
    restaurant_name: str = "",
) -> Tuple[bool, str, Optional[str]]:
    """
    SMS only (2Factor). No voice/call OTP and no email fallback.
    Returns (ok, channel, masked_destination).
    """
    _ = email, restaurant_name
    if twofactor_configured():
        ok, _detail = await send_otp_sms(phone_digits, otp)
        if ok:
            return True, "sms", mask_phone(phone_digits)
    return False, "none", None


def sms_configured() -> bool:
    return otp_delivery_configured()
