// apps/backend/src/lib/redaction.ts
//
// Generic deep-redaction utility for logs/telemetry/error payloads. Built
// for the personalization engine's "schema-aware redaction and never log
// profile/rule evaluation payloads" requirement
// (docs/personalization/01-codebase-assessment.md risk table), but usable
// anywhere a payload might carry sensitive keys before it reaches a log
// line, metric label, or error response.

const REDACTED = '[REDACTED]';

/**
 * Key names (case-insensitive, matched anywhere in the object tree) that
 * redactSensitiveKeys() redacts by default. Covers both generic
 * credentials/PII and personalization-shaped fields the docs call out
 * (profile answers/trait values/explanation text/evidence) — none of those
 * exist as real fields yet, but are reserved here so future personalization
 * code gets redaction "for free" the moment it starts passing objects
 * through logger.error/warn/info, rather than needing a redaction pass
 * added after the fact.
 */
export const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'mfaSecret',
  'ssn',
  'dateOfBirth',
  // Personalization-shaped fields (reserved ahead of the fields existing):
  'traitValue',
  'valueJson',
  'evidenceJson',
  'profileAnswer',
  'explanationText',
  'rawSnapshot',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Deep-clones `value`, replacing any object key whose name matches
 * `sensitiveKeys` (case-insensitive) with the literal string '[REDACTED]'.
 * Safe to call on arbitrary JSON-shaped data before logging it — does not
 * mutate the input. Depth-limited so a pathological/cyclic-looking input
 * can't cause unbounded recursion.
 */
export function redactSensitiveKeys(
  value: unknown,
  sensitiveKeys: readonly string[] = DEFAULT_SENSITIVE_KEYS,
  depth = 0
): unknown {
  if (depth > 20) return REDACTED;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveKeys(item, sensitiveKeys, depth + 1));
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const lowerKeys = new Set(sensitiveKeys.map((k) => k.toLowerCase()));
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (lowerKeys.has(key.toLowerCase())) {
      result[key] = REDACTED;
    } else {
      result[key] = redactSensitiveKeys(val, sensitiveKeys, depth + 1);
    }
  }
  return result;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUID_PATTERN = /^c[a-z0-9]{20,}$/i;

/**
 * Builds a safe-to-log metric label from a code, per
 * docs/personalization/08-personalization-frd.md: "Labels use codes, never
 * IDs with high cardinality or trait values." Returns 'unknown' for
 * anything that isn't a short, code-shaped string — including UUID/cuid
 * primary keys (unbounded cardinality, the exact thing this guards
 * against) and free text.
 */
export function toMetricLabel(code: unknown): string {
  if (typeof code !== 'string') return 'unknown';
  const trimmed = code.trim();
  if (
    !trimmed ||
    trimmed.length > 64 ||
    !/^[a-zA-Z0-9_.-]+$/.test(trimmed) ||
    UUID_PATTERN.test(trimmed) ||
    CUID_PATTERN.test(trimmed)
  ) {
    return 'unknown';
  }
  return trimmed;
}
