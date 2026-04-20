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
    target: require.resolve('pino-loki'),
    options: {
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
    },
  };
}

export const logger: AppLogger = pino({
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
  // Automagically inject requestId from context into EVERY log line.
  mixin: () => {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
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
  | 'AUTH_LOGIN_MFA_REQUIRED'
  | 'AUTH_REGISTER_SUCCESS'
  | 'VAULT_ACCESS_SUCCESS'
  | 'VAULT_ACCESS_FAILURE'
  | 'VAULT_PASSWORD_SET'
  | 'DOCUMENT_UPLOAD_ATTEMPT'
  | 'MFA_SETUP_INITIATED'
  | 'MFA_SETUP_FAILED'
  | 'MFA_SETUP_COMPLETE'
  | 'MFA_CHALLENGE_ATTEMPT'
  | 'MFA_CHALLENGE_FAILED'
  | 'MFA_CHALLENGE_SUCCESS'
  | 'MFA_DISABLE_FAILED'
  | 'MFA_DISABLED'
  | 'PERMISSION_DENIED'
  | 'ADMIN_ACTION'
  | 'PASSWORD_CHANGED'
  | 'SUSPICIOUS_FILE_UPLOAD'
  | 'MFA_ACCOUNT_LOCKED'
  | 'CORS_BLOCKED';

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
