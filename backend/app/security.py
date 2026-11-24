"""Keys, message encryption and session tokens."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import settings


def wrap_school_key(dek: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(settings.master_key).encrypt(nonce, dek, b"school-key")


def unwrap_school_key(wrapped: bytes) -> bytes:
    return AESGCM(settings.master_key).decrypt(wrapped[:12], wrapped[12:], b"school-key")


def seal(dek: bytes, plaintext: str, aad: str) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return nonce, AESGCM(dek).encrypt(nonce, plaintext.encode(), aad.encode())


def unseal(dek: bytes, nonce: bytes, ciphertext: bytes, aad: str) -> str:
    return AESGCM(dek).decrypt(bytes(nonce), bytes(ciphertext), aad.encode()).decode()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def issue_session(user_id: str, ttl_seconds: int = 12 * 3600) -> str:
    exp = str(int(time.time()) + ttl_seconds)
    msg = f"{user_id}.{exp}"
    sig = hmac.new(settings.secret_key, msg.encode(), hashlib.sha256).digest()[:18]
    return f"{msg}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"


def read_session(token: str) -> str | None:
    try:
        user_id, exp, sig = token.split(".")
    except ValueError:
        return None
    msg = f"{user_id}.{exp}"
    good = base64.urlsafe_b64encode(hmac.new(settings.secret_key, msg.encode(), hashlib.sha256).digest()[:18]).decode().rstrip("=")
    if not hmac.compare_digest(good, sig) or int(exp) < time.time():
        return None
    return user_id
