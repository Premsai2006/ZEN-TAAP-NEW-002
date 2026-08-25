"""PIN hashing helpers — bcrypt with plaintext migration."""
from __future__ import annotations

import bcrypt


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw((pin or "").encode("utf-8")[:72], bcrypt.gensalt()).decode()


def looks_hashed(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("$2a$") or value.startswith("$2b$") or value.startswith("$2y$")


def verify_pin(plain: str, stored: str | None) -> bool:
    if not stored or not plain:
        return False
    if looks_hashed(stored):
        try:
            return bcrypt.checkpw(plain.encode("utf-8")[:72], stored.encode("utf-8"))
        except Exception:
            return False
    # Legacy plaintext
    return plain == stored


def needs_rehash(stored: str | None) -> bool:
    return bool(stored) and not looks_hashed(stored)
