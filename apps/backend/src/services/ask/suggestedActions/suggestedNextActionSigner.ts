// Plan §4.1: purpose-bound HMAC-SHA-256 proof for landing starters, which have no source execution.
//
// - Dedicated secret (ASK_SUGGESTED_ACTION_SIGNING_SECRET); never JWT_SECRET.
// - Token = base64url(claims JSON) "." base64url(HMAC); the claims carry the signing-key version, so rotation can accept the
//   immediately previous key (ASK_SUGGESTED_ACTION_SIGNING_SECRET_PREVIOUS / _KEY_VERSION_PREVIOUS) for at most one token
//   lifetime. The deployed secret values are provisioned and rotated by the user, not by this code.
// - A missing or unusable secret never crashes startup or Ask: signing returns null (the starter degrades to ordinary text)
//   and a bounded, secret-free diagnostic is logged once per process.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../../../lib/logger';
import { SUGGESTED_NEXT_ACTION_REGISTRY_VERSION } from './suggestedNextAction.contract';

export const STARTER_TOKEN_TTL_MS = 15 * 60 * 1000;
const MIN_SECRET_LENGTH = 32;
const TOKEN_PURPOSE = 'ask-suggested-action-starter';

export interface StarterTokenClaims {
  /** Purpose binding: a token minted for another purpose can never verify here even under the same secret. */
  p: typeof TOKEN_PURPOSE;
  /** Signing-key version. */
  kv: string;
  /** Operation/outcome registry version at issue time. */
  rv: string;
  uid: string;
  sid: string;
  pid: string | null;
  /** Starter registry id (the server-declared starter), also the action id's identity input. */
  stid: string;
  aid: string;
  /** The preallocated clientRequestId the request must reuse. */
  crid: string;
  iat: number;
  exp: number;
}

export type StarterTokenRejection =
  | 'NOT_CONFIGURED' | 'MALFORMED' | 'BAD_SIGNATURE' | 'UNKNOWN_KEY_VERSION' | 'WRONG_PURPOSE' | 'EXPIRED'
  | 'REGISTRY_VERSION_MISMATCH' | 'USER_MISMATCH' | 'SESSION_MISMATCH' | 'PROPERTY_MISMATCH' | 'REQUEST_ID_MISMATCH' | 'ACTION_MISMATCH';

export type StarterTokenVerification =
  | { ok: true; claims: StarterTokenClaims }
  | { ok: false; reason: StarterTokenRejection };

interface SigningKey { version: string; secret: string }
interface SigningKeyring { active: SigningKey | null; previous: SigningKey | null }

type Env = Readonly<Record<string, string | undefined>>;

let configDiagnosticLogged = false;

function usableKey(version: string | undefined, secret: string | undefined): SigningKey | null {
  const trimmedSecret = secret?.trim();
  const trimmedVersion = version?.trim();
  if (!trimmedSecret || trimmedSecret.length < MIN_SECRET_LENGTH) return null;
  // A copied template placeholder is not a secret, even when it happens to be long enough.
  if (/^(?:replace-with|changeme)/i.test(trimmedSecret)) return null;
  if (!trimmedVersion || !/^[A-Za-z0-9_-]{1,16}$/.test(trimmedVersion)) return null;
  return { version: trimmedVersion, secret: trimmedSecret };
}

export function readSigningKeyring(env: Env = process.env): SigningKeyring {
  const active = usableKey(env.ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION ?? '1', env.ASK_SUGGESTED_ACTION_SIGNING_SECRET);
  const previous = env.ASK_SUGGESTED_ACTION_SIGNING_SECRET_PREVIOUS
    ? usableKey(env.ASK_SUGGESTED_ACTION_SIGNING_KEY_VERSION_PREVIOUS, env.ASK_SUGGESTED_ACTION_SIGNING_SECRET_PREVIOUS)
    : null;
  return { active, previous: previous && previous.version !== active?.version ? previous : null };
}

function reportMissingConfiguration(env: Env): void {
  if (configDiagnosticLogged) return;
  configDiagnosticLogged = true;
  // No secret material, only whether a value was present at all.
  logger.warn({
    secretPresent: Boolean(env.ASK_SUGGESTED_ACTION_SIGNING_SECRET),
    minLength: MIN_SECRET_LENGTH,
  }, '[ask-suggested-actions] starter signing is not configured; landing starters degrade to ordinary text');
}

/** Test seam: lets a test observe the once-per-process diagnostic again. */
export function resetSigningDiagnosticsForTests(): void {
  configDiagnosticLogged = false;
}

export function isStarterSigningConfigured(env: Env = process.env): boolean {
  return readSigningKeyring(env).active !== null;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export interface StarterTokenInput {
  userId: string;
  sessionId: string;
  propertyId: string | null;
  starterRegistryId: string;
  actionId: string;
  clientRequestId: string;
  now?: Date;
}

/** Returns null (never throws) when signing is not configured, so the caller can fall back to an ordinary-text starter. */
export function signStarterToken(input: StarterTokenInput, env: Env = process.env): string | null {
  const { active } = readSigningKeyring(env);
  if (!active) {
    reportMissingConfiguration(env);
    return null;
  }
  const issuedAt = (input.now ?? new Date()).getTime();
  const claims: StarterTokenClaims = {
    p: TOKEN_PURPOSE, kv: active.version, rv: SUGGESTED_NEXT_ACTION_REGISTRY_VERSION,
    uid: input.userId, sid: input.sessionId, pid: input.propertyId, stid: input.starterRegistryId,
    aid: input.actionId, crid: input.clientRequestId, iat: issuedAt, exp: issuedAt + STARTER_TOKEN_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${sign(payload, active.secret).toString('base64url')}`;
}

function isClaims(value: unknown): value is StarterTokenClaims {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const str = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200;
  return typeof c.p === 'string' && str(c.kv) && str(c.rv) && str(c.uid) && str(c.sid) && (c.pid === null || str(c.pid))
    && str(c.stid) && str(c.aid) && str(c.crid) && Number.isFinite(c.iat) && Number.isFinite(c.exp);
}

export interface StarterTokenExpectation {
  userId: string;
  sessionId: string;
  propertyId: string | null;
  clientRequestId: string;
  actionId: string;
  now?: Date;
}

/**
 * Verifies signature (constant time), purpose, key version, registry version, lifetime, and every scope binding. The
 * 15-minute lifetime is enforced from the claims regardless of key version, so accepting the previous key during rotation
 * can never extend a token past one lifetime.
 */
export function verifyStarterToken(token: string, expected: StarterTokenExpectation, env: Env = process.env): StarterTokenVerification {
  const keyring = readSigningKeyring(env);
  if (!keyring.active) {
    reportMissingConfiguration(env);
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'MALFORMED' };
  const [payload, signature] = parts as [string, string];
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (!isClaims(claims)) return { ok: false, reason: 'MALFORMED' };
  const key = [keyring.active, keyring.previous].find((candidate) => candidate?.version === claims.kv) ?? null;
  if (!key) return { ok: false, reason: 'UNKNOWN_KEY_VERSION' };
  const expectedSignature = sign(payload, key.secret);
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) return { ok: false, reason: 'BAD_SIGNATURE' };
  if (claims.p !== TOKEN_PURPOSE) return { ok: false, reason: 'WRONG_PURPOSE' };
  const now = (expected.now ?? new Date()).getTime();
  if (claims.exp <= now || claims.iat > now + 60_000 || claims.exp - claims.iat > STARTER_TOKEN_TTL_MS) return { ok: false, reason: 'EXPIRED' };
  if (claims.rv !== SUGGESTED_NEXT_ACTION_REGISTRY_VERSION) return { ok: false, reason: 'REGISTRY_VERSION_MISMATCH' };
  if (claims.uid !== expected.userId) return { ok: false, reason: 'USER_MISMATCH' };
  if (claims.sid !== expected.sessionId) return { ok: false, reason: 'SESSION_MISMATCH' };
  if (claims.pid !== expected.propertyId) return { ok: false, reason: 'PROPERTY_MISMATCH' };
  if (claims.crid !== expected.clientRequestId) return { ok: false, reason: 'REQUEST_ID_MISMATCH' };
  if (claims.aid !== expected.actionId) return { ok: false, reason: 'ACTION_MISMATCH' };
  return { ok: true, claims };
}
