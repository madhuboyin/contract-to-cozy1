// apps/backend/src/lib/logger.ts
// Structured logger for ContractToCozy backend.
//
// Production:  JSON output — pipe to your SIEM / Grafana Loki / CloudWatch.
// Development: Pretty-printed via pino-pretty.
//
// Security audit events always carry { audit: true } so they can be filtered
// independently from general operational logs:
//   jq 'select(.audit == true)' <log-stream>

import pino from 'pino';
import pinoLoki from 'pino-loki';
import { getRequestId } from './requestContext';

// Pino v10 has strict overload types that reject logger.info-style
// `logger.info('prefix:', value)` calls. This looser interface accepts
// both the structured `(obj, msg)` form and the legacy `(msg, ...args)` form
// so existing call sites don't need to be rewritten.
export interface AppLogger {
  info(msgOrObj: unknown, ...args: unknown[]): void;
  warn(msgOrObj: unknown, ...args: unknown[]): void;
  error(msgOrObj: unknown, ...args: unknown[]): void;
  debug(msgOrObj: unknown, ...args: unknown[]): void;
  fatal(msgOrObj: unknown, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): AppLogger;
}

const isDev = process.env.NODE_ENV !== 'production';

// Loki gateway outages (observed in prod) used to mean zero log lines
// anywhere, since pino-loki was the sole destination. Piping both stdout
// and Loki through pino.multistream() keeps them in the main thread — unlike
// pino.transport({ targets: [...] }), which spawns one worker_threads
// instance per target and segfaulted this cluster's Raspberry Pi pods
// (see memory: fix_production_logging_pino_loki_no_stdout).
function createProdStream() {
  const lokiStream = pinoLoki({
    host: process.env.LOKI_HOST || 'http://loki-gateway.monitoring.svc.cluster.local',
    basicAuth: {
      username: process.env.LOKI_USERNAME || '',
      password: process.env.LOKI_PASSWORD || '',
    },
    headers: {
      'X-Scope-OrgID': process.env.LOKI_TENANT_ID || 'fake',
    },
    labels: {
      app: 'backend',
      env: process.env.NODE_ENV || 'production',
    },
    batching: true,
    interval: 5,
  });

  return pino.multistream([{ stream: process.stdout }, { stream: lokiStream }]);
}

const options = {
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'backend',
    env: process.env.NODE_ENV || 'development',
  },
  // Redact sensitive fields wherever they appear in the log object tree.
  // pino redacts by path — wildcards cover nested occurrences.
  redact: {
    paths: [
      'req.headers.authorization',
      'body.password',
      'body.newPassword',
      'body.currentPassword',
      'body.token',
      'body.refreshToken',
      'body.vaultPassword',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      // Personalization-shaped fields, reserved ahead of the fields
      // existing (see docs/personalization/01-codebase-assessment.md's
      // "never log profile/rule evaluation payloads" risk item and
      // lib/redaction.ts's DEFAULT_SENSITIVE_KEYS, which this list mirrors).
      // Pino's redact only matches paths it can traverse to, so these are
      // no-ops today and start protecting the moment personalization code
      // begins passing these shapes into logger.error/warn/info.
      '*.traitValue',
      '*.valueJson',
      '*.evidenceJson',
      '*.profileAnswer',
      '*.explanationText',
      '*.rawSnapshot',
    ],
    censor: '[REDACTED]',
  },
  // Automagically inject requestId from context into EVERY log line.
  mixin: () => {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
};

export const logger: AppLogger = isDev
  ? pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service,env',
        },
      },
    })
  : pino(options, createProdStream());

// ─────────────────────────────────────────────────────────────────────────────
// Security audit helpers
// ─────────────────────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'AUTH_NO_TOKEN'
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_USER_NOT_FOUND'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'AUTH_ACCOUNT_INACTIVE'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILURE'
  | 'AUTH_LOGIN_MFA_REQUIRED'
  | 'AUTH_REGISTER_SUCCESS'
  | 'AUTH_EMAIL_VERIFICATION_BYPASSED'
  | 'VAULT_ACCESS_SUCCESS'
  | 'VAULT_ACCESS_FAILURE'
  | 'VAULT_PASSWORD_SET'
  | 'VAULT_SHARE_LINK_CREATED'
  | 'DOCUMENT_UPLOAD_ATTEMPT'
  | 'MFA_SETUP_INITIATED'
  | 'MFA_SETUP_FAILED'
  | 'MFA_SETUP_COMPLETE'
  | 'MFA_CHALLENGE_ATTEMPT'
  | 'MFA_CHALLENGE_FAILED'
  | 'MFA_CHALLENGE_SUCCESS'
  | 'MFA_RECOVERY_CHALLENGE_ATTEMPT'
  | 'MFA_RECOVERY_REGEN_FAILED'
  | 'MFA_RECOVERY_REGENERATED'
  | 'MFA_RECOVERY_CHALLENGE_FAILED'
  | 'MFA_RECOVERY_CHALLENGE_SUCCESS'
  | 'MFA_DISABLE_FAILED'
  | 'MFA_DISABLED'
  | 'PERMISSION_DENIED'
  | 'ADMIN_ACTION'
  | 'PASSWORD_CHANGED'
  | 'SUSPICIOUS_FILE_UPLOAD'
  | 'MFA_ACCOUNT_LOCKED'
  | 'CORS_BLOCKED'
  | 'PROPERTY_ACCESS_DENIED'
  | 'HOME_RECORD_UNREVIEWED_PROMOTION_BLOCKED'
  | 'HOME_RECORD_EVIDENCE_TRASH_BLOCKED'
  | 'SALE_CASE_CREATED'
  | 'SALE_CASE_STATUS_CHANGED';

/**
 * Emit a structured security audit log line.
 * Every line carries { audit: true } for SIEM filtering.
 *
 * @param event  - One of the typed AuditEvent constants
 * @param userId - Authenticated user ID, or null for unauthenticated requests
 * @param meta   - Additional context (ip, propertyId, fileType, etc.)
 */
export function auditLog(
  event: AuditEvent,
  userId: string | null,
  meta: Record<string, unknown> = {}
): void {
  logger.info({ audit: true, event, userId, ...meta });
}

/**
 * Partially redact an email address for audit logs.
 * Preserves enough information for brute-force pattern detection
 * without logging the full address as PII.
 *
 * e.g. "john.doe@example.com" → "j***@example.com"
 */
export function redactEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}
