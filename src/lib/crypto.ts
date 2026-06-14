/**
 * AES-256-GCM Encryption/Decryption Utility
 *
 * Provides symmetric encryption for sensitive values using AES-256-GCM.
 * The master key is derived from a machine-specific salt using PBKDF2.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256-bit key
const ITERATIONS = 100_000; // PBKDF2 iterations

// Machine-specific salt: derived from hostname + platform to be consistent per machine
function getMachineSalt(): string {
  // Use a combination of environment variables that are stable per deployment
  // Falls back to a default if not available
  return (
    process.env.CRYPTO_MASTER_SALT ||
    // Combine multiple stable identifiers for machine-specificity
    `${process.env.HOSTNAME || "default-host"}:${process.platform}:${process.arch}:print-order-salt-2024`
  );
}

// Derive a 256-bit key from the machine salt using PBKDF2
function deriveKey(salt: Buffer): Buffer {
  const machineSalt = getMachineSalt();
  return crypto.pbkdf2Sync(machineSalt, salt, ITERATIONS, KEY_LENGTH, "sha512");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Output format: salt:iv:authTag:ciphertext (all hex-encoded)
 *
 * @param plaintext - The string to encrypt
 * @returns Hex-encoded encrypted string
 */
export function encrypt(plaintext: string): string {
  // Generate a random salt for this encryption
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt an encrypted string that was encrypted with the encrypt() function.
 *
 * @param encrypted - The hex-encoded encrypted string (salt:iv:authTag:ciphertext)
 * @returns The original plaintext string
 * @throws Error if decryption fails (tampered data or wrong key)
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted format: expected salt:iv:authTag:ciphertext");
  }

  const salt = Buffer.from(parts[0], "hex");
  const iv = Buffer.from(parts[1], "hex");
  const authTag = Buffer.from(parts[2], "hex");
  const ciphertext = parts[3];

  const key = deriveKey(salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Hash a value using SHA-256 (one-way, for logging sensitive data safely).
 *
 * @param value - The string to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Compute SHA-256 hash of a buffer (for file integrity verification).
 *
 * @param buffer - The buffer to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Generate an HMAC signature for message authentication.
 *
 * @param message - The message to sign
 * @param secret - The secret key for HMAC
 * @returns Hex-encoded HMAC-SHA256 signature
 */
export function generateHMAC(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify an HMAC signature.
 *
 * @param message - The original message
 * @param signature - The HMAC signature to verify
 * @param secret - The secret key for HMAC
 * @returns True if the signature is valid
 */
export function verifyHMAC(message: string, signature: string, secret: string): boolean {
  const expected = generateHMAC(message, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token.
 *
 * @param byteLength - Number of random bytes (default: 32 = 256 bits)
 * @returns Hex-encoded random token
 */
export function generateSecureToken(byteLength: number = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}
