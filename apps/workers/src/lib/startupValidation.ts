// apps/workers/src/lib/startupValidation.ts
//
// W5 item 6 (worker audit): previously nothing verified that a required
// external dependency (database, Redis, SMTP, S3, the Gemini AI provider)
// was actually reachable/configured before the worker started accepting
// jobs — a missing SMTP_PASS or S3_BUCKET only surfaced hours later, the
// first time some job actually tried to use it, deep inside a job's own
// try/catch, easy to miss in logs. This checks every dependency gated on
// which jobs currently need it (per evaluateWorkerExecution — the exact
// same enablement logic the scheduler itself uses), so:
//   - enabling a job with missing required configuration fails clearly
//     at startup instead of silently at first use;
//   - disabling a capability removes its startup dependency requirement
//     (e.g. no SMTP check at all if every OUTBOUND job is disabled).
//
// mortgage-rate-ingest (FRED_API_KEY) is deliberately NOT hard-checked
// here — it already has a documented, tested graceful degradation chain
// (FRED API -> manual env fallback -> clean skip), so a missing key is
// expected/handled behavior, not a startup-worthy failure.

import Redis from 'ioredis';
import { prisma } from './prisma';
import { logger } from './logger';
import { JOB_REGISTRY, RUNNER_REGISTRY } from '@worker-shared/config/workerJobRegistry';
import { evaluateWorkerExecution, type WorkerTriggerType } from '@worker-shared/config/workerExecutionPolicy';

export interface StartupCheckResult {
  name: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

// Runners known to write to S3 — no registry field marks this explicitly,
// so it's an explicit, documented list here instead.
const S3_DEPENDENT_KEYS = [
  'home-report-export-poller',
  'report-export-cleanup',
  'material-spec-export-poller',
  'material-spec-export-cleanup',
  'generate-permit-disclosure',
];

function isKeyEnabled(key: string, triggerType: WorkerTriggerType): boolean {
  const entry = [...JOB_REGISTRY, ...RUNNER_REGISTRY].find((j) => j.key === key);
  if (!entry) return false;
  return evaluateWorkerExecution(key, triggerType, entry).allowed;
}

function isAnyOutboundJobEnabled(): boolean {
  return JOB_REGISTRY.some((j) => j.impact === 'OUTBOUND' && isKeyEnabled(j.key, 'scheduled'))
    || RUNNER_REGISTRY.some((r) => r.impact === 'OUTBOUND' && isKeyEnabled(r.key, 'poller'));
}

function isAnyS3JobEnabled(): boolean {
  return S3_DEPENDENT_KEYS.some((key) => {
    const isRunner = RUNNER_REGISTRY.some((r) => r.key === key);
    return isKeyEnabled(key, isRunner ? 'poller' : 'manual');
  });
}

function isAiJobEnabled(): boolean {
  return JOB_REGISTRY.some((j) => j.externalProvider === 'Gemini' && isKeyEnabled(j.key, 'manual'));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runCheck(name: string, required: boolean, check: () => Promise<void>, timeoutMs = 5000): Promise<StartupCheckResult> {
  if (!required) {
    return { name, required: false, ok: true, detail: 'not required — capability currently disabled' };
  }
  try {
    await withTimeout(check(), timeoutMs, name);
    return { name, required: true, ok: true, detail: 'ok' };
  } catch (err) {
    return { name, required: true, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export interface StartupValidationDeps {
  checkDatabaseConnectivity?: () => Promise<void>;
  checkRedisConnectivity?: () => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export async function validateStartupDependencies(deps: StartupValidationDeps = {}): Promise<StartupCheckResult[]> {
  const env = deps.env ?? process.env;

  const checkDatabaseConnectivity = deps.checkDatabaseConnectivity ?? (async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  const checkRedisConnectivity = deps.checkRedisConnectivity ?? (async () => {
    // Mirrors worker.ts's own redisConnection resolution exactly (fixed
    // port 6379, same host fallback) so this check can never pass/fail
    // differently than the real BullMQ connection it's meant to validate.
    const redisHost = env.REDIS_HOST && env.REDIS_HOST.trim() !== ''
      ? env.REDIS_HOST
      : 'redis.production.svc.cluster.local';
    const rawDb = env.REDIS_DB || '0';
    const client = new Redis({
      host: redisHost,
      port: 6379,
      db: /^\d+$/.test(rawDb) ? parseInt(rawDb, 10) : 0,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 5000,
      lazyConnect: true,
    });
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  });

  const results = await Promise.all([
    runCheck('database', true, checkDatabaseConnectivity),
    runCheck('redis', true, checkRedisConnectivity),
    runCheck('smtp', isAnyOutboundJobEnabled(), async () => {
      if (!env.SMTP_HOST || !env.SMTP_PASS) {
        throw new Error('SMTP_HOST and SMTP_PASS are required — at least one OUTBOUND-impact job is enabled');
      }
    }),
    runCheck('web-push', env.WEB_PUSH_DELIVERY_ENABLED === 'true', async () => {
      if (
        !env.WEB_PUSH_VAPID_SUBJECT ||
        !env.WEB_PUSH_VAPID_PUBLIC_KEY ||
        !env.WEB_PUSH_VAPID_PRIVATE_KEY
      ) {
        throw new Error(
          'WEB_PUSH_VAPID_SUBJECT, WEB_PUSH_VAPID_PUBLIC_KEY, and WEB_PUSH_VAPID_PRIVATE_KEY are required when Web Push delivery is enabled',
        );
      }
    }),
    runCheck(
      'refinance-alert-rollout',
      env.REFINANCE_EXTERNAL_ALERTS_ENABLED === 'true' ||
        env.REFINANCE_PUSH_ALERTS_ENABLED === 'true',
      async () => {
        const mode = (
          env.REFINANCE_ALERT_ROLLOUT_MODE ?? 'ALLOWLIST'
        ).trim().toUpperCase();
        if (!['DISABLED', 'ALLOWLIST', 'GENERAL'].includes(mode)) {
          throw new Error(
            'REFINANCE_ALERT_ROLLOUT_MODE must be DISABLED, ALLOWLIST, or GENERAL',
          );
        }
        if (
          mode === 'ALLOWLIST' &&
          !(env.REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST ?? '')
            .split(',')
            .some((entry) => entry.trim())
        ) {
          throw new Error(
            'REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST requires at least one recipient in ALLOWLIST mode',
          );
        }
      },
    ),
    runCheck('s3', isAnyS3JobEnabled(), async () => {
      if (!env.S3_BUCKET) {
        throw new Error('S3_BUCKET is required — at least one export/disclosure job that writes to S3 is enabled');
      }
    }),
    runCheck('gemini-ai', isAiJobEnabled(), async () => {
      if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is required — generate-diy-ai-guide is enabled');
      }
    }),
  ]);

  const failures = results.filter((r) => r.required && !r.ok);
  if (failures.length > 0) {
    logger.error(
      { failures },
      `[STARTUP-VALIDATION] ${failures.length} required startup dependenc${failures.length === 1 ? 'y is' : 'ies are'} missing/unreachable`,
    );
    for (const f of failures) {
      logger.error(`[STARTUP-VALIDATION]   ✗ ${f.name}: ${f.detail}`);
    }
    if (env.NODE_ENV === 'production') {
      throw new Error(
        `Refusing to start in production: ${failures.length} startup dependency check(s) failed: ` +
          failures.map((f) => f.name).join(', '),
      );
    }
    logger.warn('[STARTUP-VALIDATION] Continuing despite failures — NODE_ENV is not "production"');
  } else {
    logger.info(`[STARTUP-VALIDATION] All required startup dependencies verified (${results.length} checked)`);
  }

  return results;
}
