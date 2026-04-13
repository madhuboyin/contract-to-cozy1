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

const isDev = process.env.NODE_ENV !== 'production';

function getTransport() {
  if (isDev) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,service,env',
      },
    };
  }

  return {
    target: 'pino-loki',
    options: {
      host: process.env.LOKI_HOST || 'http://loki-gateway.monitoring.svc.cluster.local',
      basicAuth: {
        username: process.env.LOKI_USERNAME || '',
        password: process.env.LOKI_PASSWORD || '',
      },
      headers: {
        'X-Scope-OrgID': 'production',
      },
      labels: {
        app: 'backend',
        env: process.env.NODE_ENV || 'production',
      },
      batching: true,
      interval: 5,
    },
  };
}

export const logger = pino({
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
    ],
    censor: '[REDACTED]',
  },
  transport: getTransport(),
});

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
  | 'AUTH_REGISTER_SUCCESS'
  | 'VAULT_ACCESS_SUCCESS'
  | 'VAULT_ACCESS_FAILURE'
  | 'VAULT_PASSWORD_SET'
  | 'DOCUMENT_UPLOAD_ATTEMPT';

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
