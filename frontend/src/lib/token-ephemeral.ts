/**
 * Ephemeral Token Encryption for Private Repository Scanning
 * 
 * This module provides encryption/decryption of GitHub tokens for secure
 * pass-through from frontend to workers. Tokens are encrypted with a shared
 * key and travel through the queue (Redis) to the worker.
 * 
 * Security properties:
 * - AES-256-GCM encryption with random IV
 * - Authentication tag prevents tampering
 * - Tokens are never stored in database
 * - Shared key only exists in environment variables
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const WORKER_ENCRYPTION_SECRET = process.env.WORKER_ENCRYPTION_SECRET;

// Cache the derived key (32 bytes for AES-256)
let _derivedKey: Buffer | null = null;

/**
 * Derive a 32-byte encryption key from the shared secret.
 * Uses scrypt for key derivation with a fixed salt.
 */
function getEncryptionKey(): Buffer {
  if (_derivedKey) {
    return _derivedKey;
  }

  if (!WORKER_ENCRYPTION_SECRET) {
    throw new Error(
      "WORKER_ENCRYPTION_SECRET is not configured. " +
      "Please set it in your environment variables."
    );
  }

  // Use scrypt to derive a 32-byte key from the base64 secret
  // Salt is fixed but this is acceptable since the secret is already random
  _derivedKey = scryptSync(WORKER_ENCRYPTION_SECRET, "SecurityKitSalt2026", 32);
  return _derivedKey;
}

/**
 * Encrypt a GitHub token for one-time worker use.
 * 
 * Format: iv:authTag:ciphertext (all hex encoded)
 * - iv: 16 bytes (128 bits) random initialization vector
 * - authTag: 16 bytes (128 bits) GCM authentication tag
 * - ciphertext: variable length encrypted data
 * 
 * @param token - The GitHub OAuth token to encrypt
 * @returns Encrypted token string in format "iv:authTag:ciphertext"
 * @throws Error if encryption fails or secret not configured
 */
export function encryptTokenForWorker(token: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(16);
    
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    throw new Error(
      `Failed to encrypt token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Decrypt a token that was encrypted for worker use.
 * 
 * NOTE: This is primarily for testing. In production, only the Python
 * backend should decrypt tokens.
 * 
 * @param encryptedPayload - The encrypted token in format "iv:authTag:ciphertext"
 * @returns The decrypted token
 * @throws Error if decryption fails
 */
export function decryptTokenFromWorker(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted payload format. Expected iv:authTag:ciphertext");
    }
    
    const [ivHex, authTagHex, ciphertextHex] = parts;
    
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");
    
    if (iv.length !== 16) {
      throw new Error("Invalid IV length. Expected 16 bytes.");
    }
    
    const key = getEncryptionKey();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, undefined, "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    throw new Error(
      `Failed to decrypt token: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if the encryption is properly configured.
 * @returns true if WORKER_ENCRYPTION_SECRET is set
 */
export function isEncryptionConfigured(): boolean {
  return !!WORKER_ENCRYPTION_SECRET;
}

/**
 * Mask a token for safe logging.
 * Shows first 4 and last 4 characters only.
 * 
 * @param token - The token to mask
 * @returns Masked token like "ghp_****1234"
 */
export function maskToken(token: string): string {
  if (token.length <= 8) {
    return "****";
  }
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}
