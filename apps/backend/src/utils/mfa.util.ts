// apps/backend/src/utils/mfa.util.ts
//
// TOTP (RFC 6238) operations and AES-256-GCM secret encryption.
//
// The TOTP secret is generated per-user, encrypted with AES-256-GCM using
// MFA_ENCRYPTION_KEY before being stored in the database. This means a
// database dump alone is insufficient to extract valid TOTP secrets.
//
// MFA_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars).
// Generate with: openssl rand -hex 32

import * as OTPAuth from 'otpauth';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

const ALGO     = 'aes-256-gcm';
const APP_NAME = 'ContractToCozy';

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const hex = process.env.MFA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes) in production');
    }
    // Development fallback — never ship to production
    return Buffer.from('0'.repeat(64), 'hex');
  }
  return Buffer.from(hex, 'hex');
}

// ---------------------------------------------------------------------------
// Encryption / decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a TOTP secret string with AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex).
 */
export function encryptTotpSecret(plaintext: string): string {
  const key    = getEncryptionKey();
  const iv     = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a previously encrypted TOTP secret.
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decryptTotpSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');

  const [ivHex, tagHex, dataHex] = parts;
  const key      = getEncryptionKey();
  const iv       = Buffer.from(ivHex,  'hex');
  const authTag  = Buffer.from(tagHex, 'hex');
  const data     = Buffer.from(dataHex,'hex');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// TOTP operations
// ---------------------------------------------------------------------------

/**
 * Generate a new random TOTP secret for a user.
 * Returns the base32-encoded secret (used in QR codes) and the encrypted
 * form ready to be stored in the database.
 */
export function generateTotpSecret(email: string): {
  base32Secret:    string;
  encryptedSecret: string;
  otpauthUri:      string;
} {
  const secret = new OTPAuth.Secret({ size: 20 }); // 160-bit secret (HOTP RFC recommended)

  const totp = new OTPAuth.TOTP({
    issuer:    APP_NAME,
    label:     email,
    algorithm: 'SHA1',
    digits:    6,
    period:    30,
    secret,
  });

  return {
    base32Secret:    secret.base32,
    encryptedSecret: encryptTotpSecret(secret.base32),
    otpauthUri:      totp.toString(),
  };
}

/**
 * Verify a TOTP code against a stored encrypted secret.
 * Allows a ±1 time-step window (30 s each side) to accommodate clock drift.
 * Returns true if the code is valid, false otherwise.
 */
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  // Reject obviously invalid input before decrypting
  if (!/^\d{6}$/.test(code)) return false;

  try {
    const base32Secret = decryptTotpSecret(encryptedSecret);

    const totp = new OTPAuth.TOTP({
      issuer:    APP_NAME,
      algorithm: 'SHA1',
      digits:    6,
      period:    30,
      secret:    OTPAuth.Secret.fromBase32(base32Secret),
    });

    // validate returns null if invalid, or the time-step delta if valid
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}
