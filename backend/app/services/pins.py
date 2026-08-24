"""PIN hashing helpers — bcrypt with plaintext migration."""
from __future__ import annotations

from passlib.context import CryptContext

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return _pwd.hash(pin)


def looks_hashed(value: str | None) -> bool:
    if not value:
        return False
    return value.startswith("$2a$") or value.startswith("$2b$") or value.startswith("$2y$")


def verify_pin(plain: str, stored: str | None) -> bool:
    if not stored or not plain:
        return False
    if looks_hashed(stored):
        try:
            return _pwd.verify(plain, stored)
        except Exception:
            return False
    # Legacy plaintext — constant-time-ish compare
    return plain == stored


def needs_rehash(stored: str | None) -> bool:
    return bool(stored) and not looks_hashed(stored)
