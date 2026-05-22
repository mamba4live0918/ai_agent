"""AES-256-GCM encryption/decryption for files and sensitive fields.

Key must be a 32-byte (256-bit) base64-encoded string.
Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"
"""
import os
import secrets
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_key_from_env(env_var: str) -> bytes:
    key_b64 = os.getenv(env_var, "")
    if not key_b64:
        # Auto-generate a key for this session (files won't survive restarts)
        key_b64 = secrets.token_urlsafe(32)
    try:
        return base64.urlsafe_b64decode(key_b64 + "==")
    except Exception:
        return base64.urlsafe_b64decode(secrets.token_urlsafe(32) + "==")


# Lazy-loaded keys — auto-generated if not set in env
_file_key: bytes | None = None
_db_key: bytes | None = None


def get_file_key() -> bytes:
    global _file_key
    if _file_key is None:
        _file_key = _get_key_from_env("FILE_ENCRYPTION_KEY")
    return _file_key


def get_db_key() -> bytes:
    global _db_key
    if _db_key is None:
        _db_key = _get_key_from_env("DB_ENCRYPTION_KEY")
    return _db_key


def encrypt_bytes(plaintext: bytes, key: bytes | None = None) -> bytes:
    """Encrypt bytes with AES-256-GCM. Returns nonce + ciphertext."""
    if key is None:
        key = get_file_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_bytes(encrypted: bytes, key: bytes | None = None) -> bytes:
    """Decrypt bytes encrypted with encrypt_bytes."""
    if key is None:
        key = get_file_key()
    nonce = encrypted[:12]
    ciphertext = encrypted[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)


def encrypt_string(plaintext: str, key: bytes | None = None) -> str:
    """Encrypt a string, return base64-encoded ciphertext."""
    if key is None:
        key = get_db_key()
    encrypted = encrypt_bytes(plaintext.encode("utf-8"), key=key)
    return base64.urlsafe_b64encode(encrypted).decode("ascii")


def decrypt_string(encoded: str, key: bytes | None = None) -> str:
    """Decrypt a string encrypted with encrypt_string."""
    if key is None:
        key = get_db_key()
    encrypted = base64.urlsafe_b64decode(encoded.encode("ascii"))
    return decrypt_bytes(encrypted, key=key).decode("utf-8")
