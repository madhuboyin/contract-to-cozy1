// apps/workers/src/lib/redact.ts
//
// WKR-015: worker logs and failure alerts must never contain tokens,
// document contents, policy numbers, claim numbers, or unredacted provider
// credentials. Structured log fields are covered by the pino `redact`
// config in ./logger.ts (mirrors apps/backend/src/lib/logger.ts's paths).
// That only redacts by object key, though — the biggest actual leak
// (jobFailureAlert.ts embedding up to 2000 raw characters of a stack trace
// in an email body) is free text, not a structured object, so it needs a
// text-level scrub instead.
//
// Deliberately workers-local, same reasoning as workerRunResult.ts: a
// scheduler/alerting-only concern with no backend caller, so it doesn't
// need a slot in the Docker curated copy list.

const REDACTED = '[REDACTED]';

/** Object/log-path key names censored wherever they appear — mirrors backend's DEFAULT_SENSITIVE_KEYS plus WKR-015's own list (policy/claim numbers). */
export const SENSITIVE_KEY_NAMES: readonly string[] = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'apiKey',
  'secret',
  'mfaSecret',
  'authorization',
  'ssn',
  'policyNumber',
  'claimNumber',
  'credential',
  'credentials',
];

// Label fragments used for the free-text "key: value" / "key=value" scrub
// below — spacing/casing-tolerant variants of SENSITIVE_KEY_NAMES so a
// message like "API Key: sk_live_..." or "policy number 123456" is caught,
// not just the exact camelCase field name a structured object would use.
// 'authorization' is deliberately not in this list — it gets its own
// pattern below so "Authorization: Bearer <token>" redacts as one unit
// instead of the generic KV pass re-matching the word "Bearer" that the
// Bearer-specific pass already substituted in.
const KV_LABEL_FRAGMENTS = [
  'password(?:[\\s_-]?hash)?',
  'refresh[\\s_-]?token',
  'access[\\s_-]?token',
  'api[\\s_-]?key',
  'mfa[\\s_-]?secret',
  'secret',
  'ssn',
  'policy[\\s_-]?number',
  'claim[\\s_-]?number',
  'credentials?',
  'token',
];

const SENSITIVE_KV_PATTERN = new RegExp(
  `\\b(${KV_LABEL_FRAGMENTS.join('|')})\\b(\\s*[:=]\\s*)"?([^\\s,"]+)`,
  'gi',
);
// Handles both "Authorization: Bearer <token>" and a bare "Authorization: <token>"
// (Basic/raw API-key headers) as one unit, before the generic Bearer/KV passes
// below would otherwise redact "Bearer" and the header value separately.
const AUTHORIZATION_HEADER_PATTERN = /\b(authorization)(\s*[:=]\s*)(?:Bearer\s+)?[^\s,"]+/gi;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._-]{10,}/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
// Connection strings (Postgres/Redis/Mongo) embed credentials in the URL
// itself — Prisma/ioredis error messages routinely echo these back verbatim.
const CONNECTION_STRING_PATTERN = /(postgres(?:ql)?|redis|rediss|mongodb(?:\+srv)?):\/\/[^:\s/@]+:[^@\s]+@/gi;
// S3 presigned URLs carry the authorization in query params, not headers.
const PRESIGNED_URL_PARAM_PATTERN = /(X-Amz-(?:Signature|Credential|Security-Token))=[^&\s]+/gi;

/**
 * Scrub free text (log lines, stack traces, alert-email bodies) of emails,
 * bearer/JWT tokens, connection-string credentials, presigned-URL
 * signatures, and labeled credential/policy/claim values. Not reversible
 * and not exhaustive — a conservative best-effort pass for text that isn't
 * structured enough for a by-key redactor. Deliberately does NOT touch
 * generic opaque-looking strings (UUIDs, cuids, job/property IDs) — those
 * are the safe correlation identifiers operators need to keep debugging
 * from this output.
 */
export function redactText(text: string): string {
  if (!text) return text;
  return text
    .replace(CONNECTION_STRING_PATTERN, (_match, scheme: string) => `${scheme}://${REDACTED}@`)
    .replace(PRESIGNED_URL_PARAM_PATTERN, (_match, param: string) => `${param}=${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(AUTHORIZATION_HEADER_PATTERN, (_match, label: string, sep: string) => `${label}${sep}${REDACTED}`)
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED}`)
    .replace(SENSITIVE_KV_PATTERN, (_match, label: string, sep: string) => `${label}${sep}${REDACTED}`)
    .replace(EMAIL_PATTERN, REDACTED);
}
