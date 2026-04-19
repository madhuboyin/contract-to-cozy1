export type DeepHealthCheckStatus = 'ok' | 'error';

export interface DeepHealthResult {
  checks: Record<string, DeepHealthCheckStatus>;
  allOk: boolean;
  status: 'healthy' | 'degraded';
  httpStatus: 200 | 503;
}

interface DeepHealthOptions {
  checkDatabase: () => Promise<unknown>;
  redisConfigured: boolean;
  pingRedis?: () => Promise<unknown>;
  redisTimeoutMs: number;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function runDeepHealthChecks({
  checkDatabase,
  redisConfigured,
  pingRedis,
  redisTimeoutMs,
}: DeepHealthOptions): Promise<DeepHealthResult> {
  const checks: Record<string, DeepHealthCheckStatus> = {};
  let allOk = true;

  try {
    await checkDatabase();
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
    allOk = false;
  }

  if (redisConfigured) {
    try {
      if (!pingRedis) {
        throw new Error('Redis ping function is required when redisConfigured is true');
      }

      const safeTimeoutMs = Number.isFinite(redisTimeoutMs) && redisTimeoutMs > 0 ? redisTimeoutMs : 1500;
      await withTimeout(pingRedis(), safeTimeoutMs, 'Redis ping timeout');
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
      allOk = false;
    }
  }

  return {
    checks,
    allOk,
    status: allOk ? 'healthy' : 'degraded',
    httpStatus: allOk ? 200 : 503,
  };
}
