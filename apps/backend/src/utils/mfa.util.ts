// apps/backend/src/utils/mfa.util.ts
//
// TOTP (RFC 6238) operations and AES-256-GCM secret encryption.
// Implemented with Node.js built-in `crypto` only — no external library.
//
// MFA_ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars).
// Generate with: openssl rand -hex 32

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const ALGO     = 'aes-256-gcm';
const APP_NAME = 'ContractToCozy';

// ---------------------------------------------------------------------------
// Base32 (RFC 4648) — used to encode/decode TOTP secrets for authenticator apps
// ---------------------------------------------------------------------------

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits  = 0;
  let value = 0;
  let out   = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += B32_ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  let bits  = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// TOTP core (RFC 6238 / RFC 4226)
// ---------------------------------------------------------------------------

function computeTotp(secretBuf: Buffer, counter: bigint): string {
  // 8-byte big-endian counter
  const ctrBuf = Buffer.alloc(8);
  ctrBuf.writeBigInt64BE(counter);

  const hmac   = createHmac('sha1', secretBuf).update(ctrBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  // Avoid sign-bit contamination: multiply the high byte instead of <<24
  const code = (
    ((hmac[offset]     & 0x7f) * 0x1000000) +
    ((hmac[offset + 1] & 0xff) << 16) +
    ((hmac[offset + 2] & 0xff) <<  8) +
     (hmac[offset + 3] & 0xff)
  ) % 1_000_000;

  return String(code).padStart(6, '0');
}

/** Constant-time string comparison — prevents timing attacks on code checks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

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

  return [
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a previously encrypted TOTP secret.
 * Throws if the ciphertext has been tampered with (GCM auth-tag mismatch).
 */
export function decryptTotpSecret(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');

  const [ivHex, tagHex, dataHex] = parts;
  const key     = getEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  return (
    decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') +
    decipher.final('utf8')
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a new random TOTP secret for a user.
 * Returns the base32-encoded secret (for QR codes), the encrypted form
 * ready to be stored in the database, and the otpauth:// URI for the QR code.
 */
export function generateTotpSecret(email: string): {
  base32Secret:    string;
  encryptedSecret: string;
  otpauthUri:      string;
} {
  const secretBuf   = randomBytes(20);           // 160-bit — HOTP RFC recommendation
  const base32Secret    = base32Encode(secretBuf);
  const encryptedSecret = encryptTotpSecret(base32Secret);

  const label      = encodeURIComponent(`${APP_NAME}:${email}`);
  const issuer     = encodeURIComponent(APP_NAME);
  const otpauthUri = `otpauth://totp/${label}?secret=${base32Secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

  return { base32Secret, encryptedSecret, otpauthUri };
}

/**
 * Verify a 6-digit TOTP code against a stored encrypted secret.
 * Allows a ±1 time-step window (±30 s) to accommodate clock drift.
 * Returns true if the code is valid for any step in the window.
 */
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  try {
    const base32  = decryptTotpSecret(encryptedSecret);
    const keyBuf  = base32Decode(base32);
    const counter = BigInt(Math.floor(Date.now() / 1000 / 30));

    for (let delta = -1n; delta <= 1n; delta++) {
      if (safeEqual(computeTotp(keyBuf, counter + delta), code)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Normalize user-entered recovery codes so UI formatting differences
 * (spaces/hyphens/casing) do not affect verification.
 */
export function normalizeRecoveryCode(input: string): string {
  return input.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function formatRecoveryCode(normalized: string): string {
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

/**
 * Generate one-time recovery codes for MFA fallback.
 * Codes are returned in user-facing format (e.g. "A1B2-C3D4").
 */
export function generateRecoveryCodes(count = 10): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    const normalized = randomBytes(4).toString('hex').toUpperCase();
    set.add(formatRecoveryCode(normalized));
  }
  return Array.from(set);
}

/**
 * Hash normalized recovery code values before DB storage.
 */
export function hashRecoveryCode(input: string): string {
  const normalized = normalizeRecoveryCode(input);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
