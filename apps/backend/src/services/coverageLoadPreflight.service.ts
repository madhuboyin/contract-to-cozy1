import { performance } from 'node:perf_hooks';

export const COVERAGE_LOAD_PREFLIGHT_VERSION =
  'coverage-load-preflight-v1' as const;

const PRODUCTION_HOSTS = new Set([
  'contracttocozy.com',
  'www.contracttocozy.com',
  'api.contracttocozy.com',
]);

const ENDPOINTS = [
  {
    key: 'INSURANCE_HISTORY',
    path: (propertyId: string) =>
      `/api/properties/${encodeURIComponent(propertyId)}/insurance-history`,
    valid: (body: unknown) => isObject(body) && isObject(body.data),
  },
  {
    key: 'MARKET_CONTEXT',
    path: (propertyId: string) =>
      `/api/properties/${encodeURIComponent(propertyId)}/insurance-market-context`,
    valid: (body: unknown) =>
      isObject(body) &&
      isObject(body.data) &&
      typeof body.data.state === 'string',
  },
  {
    key: 'HANDOFF_READINESS',
    path: (propertyId: string) =>
      `/api/properties/${encodeURIComponent(propertyId)}/insurance-handoff/readiness`,
    valid: (body: unknown) =>
      isObject(body) &&
      isObject(body.data) &&
      typeof body.data.available === 'boolean',
  },
] as const;

type EndpointKey = typeof ENDPOINTS[number]['key'];

type RequestResult = {
  status: number;
  body: unknown;
};

export type CoverageLoadRequester = (
  path: string,
  signal: AbortSignal,
) => Promise<RequestResult>;

export type CoverageLoadPreflightConfig = {
  baseUrl: string;
  allowedHost: string;
  targetClass: 'LOCAL' | 'STAGING';
  propertyId: string;
  totalRequests: number;
  concurrency: number;
  timeoutMs: number;
  maxP95Ms: number;
  maxErrorRate: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

export function validateCoverageLoadTarget(config: CoverageLoadPreflightConfig) {
  const url = new URL(config.baseUrl);
  const hostname = url.hostname.toLowerCase();
  const allowedHost = config.allowedHost.trim().toLowerCase();
  if (!allowedHost || hostname !== allowedHost) {
    throw new Error('COVERAGE_LOAD_ALLOWED_HOST must exactly match the target hostname.');
  }
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error('Production coverage load targets are prohibited.');
  }
  if (config.targetClass === 'LOCAL') {
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
      throw new Error('LOCAL coverage load targets must use a loopback hostname.');
    }
  } else if (url.protocol !== 'https:') {
    throw new Error('STAGING coverage load targets must use HTTPS.');
  }
  if (!config.propertyId.trim()) throw new Error('COVERAGE_LOAD_PROPERTY_ID is required.');
  if (
    !Number.isInteger(config.totalRequests) ||
    config.totalRequests < 3 ||
    config.totalRequests > 10_000
  ) {
    throw new Error('COVERAGE_LOAD_REQUESTS must be between 3 and 10000.');
  }
  if (
    !Number.isInteger(config.concurrency) ||
    config.concurrency < 1 ||
    config.concurrency > 50 ||
    config.concurrency > config.totalRequests
  ) {
    throw new Error('COVERAGE_LOAD_CONCURRENCY must be between 1 and 50 and not exceed requests.');
  }
  if (config.timeoutMs < 100 || config.timeoutMs > 30_000) {
    throw new Error('COVERAGE_LOAD_TIMEOUT_MS must be between 100 and 30000.');
  }
  if (config.maxP95Ms < 1 || config.maxP95Ms > config.timeoutMs) {
    throw new Error('COVERAGE_LOAD_MAX_P95_MS must be positive and not exceed the timeout.');
  }
  if (config.maxErrorRate < 0 || config.maxErrorRate > 1) {
    throw new Error('COVERAGE_LOAD_MAX_ERROR_RATE must be between 0 and 1.');
  }
  return { url, hostname };
}

export async function runCoverageLoadPreflight(
  config: CoverageLoadPreflightConfig,
  requester: CoverageLoadRequester,
  now = new Date(),
) {
  const { hostname } = validateCoverageLoadTarget(config);
  const results: Array<{
    endpoint: EndpointKey;
    latencyMs: number;
    outcome: 'OK' | 'TIMEOUT' | 'HTTP_ERROR' | 'CONTRACT_ERROR' | 'NETWORK_ERROR';
    status: number | null;
  }> = [];
  let nextIndex = 0;
  let activeRequests = 0;
  let peakConcurrency = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= config.totalRequests) return;
      const endpoint = ENDPOINTS[index % ENDPOINTS.length];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const startedAt = performance.now();
      activeRequests += 1;
      peakConcurrency = Math.max(peakConcurrency, activeRequests);
      try {
        const response = await requester(
          endpoint.path(config.propertyId),
          controller.signal,
        );
        const latencyMs = performance.now() - startedAt;
        results.push({
          endpoint: endpoint.key,
          latencyMs,
          outcome:
            response.status < 200 || response.status >= 300
              ? 'HTTP_ERROR'
              : endpoint.valid(response.body)
                ? 'OK'
                : 'CONTRACT_ERROR',
          status: response.status,
        });
      } catch (error) {
        results.push({
          endpoint: endpoint.key,
          latencyMs: performance.now() - startedAt,
          outcome:
            controller.signal.aborted ||
            (error instanceof Error && error.name === 'AbortError')
              ? 'TIMEOUT'
              : 'NETWORK_ERROR',
          status: null,
        });
      } finally {
        activeRequests -= 1;
        clearTimeout(timeout);
      }
    }
  }

  await Promise.all(
    Array.from({ length: config.concurrency }, () => worker()),
  );

  const successfulLatencies = results
    .filter(({ outcome }) => outcome === 'OK')
    .map(({ latencyMs }) => latencyMs);
  const errorCount = results.length - successfulLatencies.length;
  const errorRate = results.length === 0 ? 1 : errorCount / results.length;
  const p95Ms = percentile(successfulLatencies, 0.95);
  const byEndpoint = Object.fromEntries(ENDPOINTS.map(({ key }) => {
    const endpointResults = results.filter(({ endpoint }) => endpoint === key);
    return [key, {
      requests: endpointResults.length,
      succeeded: endpointResults.filter(({ outcome }) => outcome === 'OK').length,
      failed: endpointResults.filter(({ outcome }) => outcome !== 'OK').length,
      p95Ms: percentile(
        endpointResults
          .filter(({ outcome }) => outcome === 'OK')
          .map(({ latencyMs }) => latencyMs),
        0.95,
      ),
    }];
  }));
  const outcomeCounts = Object.fromEntries(
    ['OK', 'TIMEOUT', 'HTTP_ERROR', 'CONTRACT_ERROR', 'NETWORK_ERROR'].map(
      (outcome) => [
        outcome,
        results.filter((result) => result.outcome === outcome).length,
      ],
    ),
  );
  const passed =
    results.length === config.totalRequests &&
    peakConcurrency <= config.concurrency &&
    errorRate <= config.maxErrorRate &&
    p95Ms !== null &&
    p95Ms <= config.maxP95Ms;

  return {
    contractVersion: COVERAGE_LOAD_PREFLIGHT_VERSION,
    checkedAt: now.toISOString(),
    passed,
    target: {
      class: config.targetClass,
      hostname,
      productionTarget: false,
    },
    profile: {
      totalRequests: config.totalRequests,
      concurrency: config.concurrency,
      timeoutMs: config.timeoutMs,
      maxP95Ms: config.maxP95Ms,
      maxErrorRate: config.maxErrorRate,
    },
    results: {
      completedRequests: results.length,
      peakConcurrency,
      concurrencyBoundRespected: peakConcurrency <= config.concurrency,
      succeeded: successfulLatencies.length,
      failed: errorCount,
      errorRate: Math.round(errorRate * 10_000) / 10_000,
      p50Ms: percentile(successfulLatencies, 0.5),
      p95Ms,
      p99Ms: percentile(successfulLatencies, 0.99),
      outcomes: outcomeCounts,
      byEndpoint,
    },
    privacy: {
      authorizationValueLogged: false,
      responseBodiesLogged: false,
      propertyIdLogged: false,
    },
  };
}
