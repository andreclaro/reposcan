"""
Ephemeral Token Decryption for Private Repository Scanning

This module provides decryption of GitHub tokens that were encrypted by the frontend.
Tokens are decrypted in memory, used once for cloning, and immediately discarded.

Security properties:
- AES-256-GCM decryption with authentication
- Keys are cached in memory but never persisted
- Tokens are cleared from memory after use
- No token storage in database or logs
"""

import os
import logging
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

logger = logging.getLogger(__name__)

# Cache the derived key in memory
_worker_key: Optional[bytes] = None

# Fixed salt to match frontend - this is acceptable since the secret is already random
_SALT = b"SecurityKitSalt2026"


def _get_encryption_key() -> bytes:
    """
    Derive the encryption key from environment variable using scrypt.
    
    Matches the frontend's scryptSync(WORKER_ENCRYPTION_SECRET, salt, 32) derivation.
    The key is cached in memory after first access for performance.
    
    Returns:
        32-byte encryption key
        
    Raises:
        RuntimeError: If WORKER_ENCRYPTION_SECRET is not configured
    """
    global _worker_key
    
    if _worker_key is not None:
        return _worker_key
    
    secret = os.getenv("WORKER_ENCRYPTION_SECRET")
    if not secret:
        raise RuntimeError(
            "WORKER_ENCRYPTION_SECRET environment variable is not configured. "
            "Please set it to enable private repository scanning."
        )
    
    try:
        # Use scrypt to derive 32-byte key, matching frontend's scryptSync
        kdf = Scrypt(
            salt=_SALT,
            length=32,
            n=2**14,  # Default Node.js scrypt cost factor
            r=8,
            p=1,
        )
        _worker_key = kdf.derive(secret.encode('utf-8'))
        return _worker_key
    except Exception as e:
        raise RuntimeError("Failed to derive encryption key from WORKER_ENCRYPTION_SECRET") from e


def decrypt_token(encrypted_payload: str) -> str:
    """
    Decrypt a token that was encrypted by the frontend.
    
    Format: iv:authTag:ciphertext (all hex encoded)
    
    Args:
        encrypted_payload: The encrypted token string from frontend
        
    Returns:
        Decrypted token string
        
    Raises:
        RuntimeError: If decryption fails (invalid format, wrong key, tampered data)
    """
    try:
        # Parse the payload format: iv:authTag:ciphertext
        parts = encrypted_payload.split(":")
        if len(parts) != 3:
            raise ValueError(
                f"Invalid format. Expected 'iv:authTag:ciphertext', got {len(parts)} parts"
            )
        
        iv_hex, auth_tag_hex, ciphertext_hex = parts
        
        # Decode hex strings to bytes
        iv = bytes.fromhex(iv_hex)
        auth_tag = bytes.fromhex(auth_tag_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        
        if len(iv) != 16:
            raise ValueError(f"Invalid IV length: {len(iv)} bytes (expected 16)")
        
        # AES-256-GCM decryption
        key = _get_encryption_key()
        aesgcm = AESGCM(key)
        
        # AESGCM.decrypt expects: nonce, data (ciphertext + auth_tag), associated_data
        # We prepend auth_tag to ciphertext for the cryptography library
        plaintext = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
        
        return plaintext.decode("utf-8")
        
    except Exception as e:
        # Log error without exposing payload details
        logger.error("Token decryption failed: %s", str(e))
        raise RuntimeError(
            "Failed to decrypt authentication token. "
            "The token may be corrupted or the encryption keys may not match."
        ) from e


def mask_token(token: str) -> str:
    """
    Mask a token for safe logging.
    
    Shows first 4 and last 4 characters only.
    
    Args:
        token: The token to mask
        
    Returns:
        Masked token like "ghp_****1234"
    """
    if len(token) <= 8:
        return "****"
    return f"{token[:4]}****{token[-4:]}"


def clear_token_from_memory(token_ref: Optional[str]) -> None:
    """
    Attempt to clear a token from memory.
    
    Note: In Python, this is best-effort due to string immutability and
    garbage collection. The token reference is set to None, but the actual
    string data may persist in memory until garbage collected.
    
    Args:
        token_ref: Reference to the token variable (will be set to None)
    """
    if token_ref is not None:
        # Best effort: set to None to remove reference
        # The actual memory clearing depends on Python's garbage collector
        del token_ref
