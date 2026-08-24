"""OTP delivery via Gmail SMTP (Google App Password)."""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Tuple

from app.config import (
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASSWORD,
    SMTP_FROM,
    SMTP_USE_TLS,
)

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(SMTP_USER and SMTP_PASSWORD)


def otp_delivery_configured() -> bool:
    return smtp_configured()


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


# Back-compat aliases used by older imports
def sms_configured() -> bool:
    return otp_delivery_configured()


async def send_otp_sms(_phone_digits: str, otp: str) -> Tuple[bool, str]:
    """Deprecated SMS path — OTP is email-only via SMTP now."""
    return False, "use_email_smtp"
