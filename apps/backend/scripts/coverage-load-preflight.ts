import {
  runCoverageLoadPreflight,
  type CoverageLoadPreflightConfig,
} from '../src/services/coverageLoadPreflight.service';

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integerEnvironment(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

function numberEnvironment(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
  return value;
}

async function main() {
  const baseUrl = requiredEnvironment('COVERAGE_LOAD_BASE_URL').replace(/\/+$/, '');
  const accessToken = requiredEnvironment('COVERAGE_LOAD_ACCESS_TOKEN');
  const targetClass = requiredEnvironment('COVERAGE_LOAD_TARGET_CLASS');
  if (targetClass !== 'LOCAL' && targetClass !== 'STAGING') {
    throw new Error('COVERAGE_LOAD_TARGET_CLASS must be LOCAL or STAGING.');
  }
  const config: CoverageLoadPreflightConfig = {
    baseUrl,
    allowedHost: requiredEnvironment('COVERAGE_LOAD_ALLOWED_HOST'),
    targetClass,
    propertyId: requiredEnvironment('COVERAGE_LOAD_PROPERTY_ID'),
    totalRequests: integerEnvironment('COVERAGE_LOAD_REQUESTS', 300),
    concurrency: integerEnvironment('COVERAGE_LOAD_CONCURRENCY', 10),
    timeoutMs: integerEnvironment('COVERAGE_LOAD_TIMEOUT_MS', 5_000),
    maxP95Ms: integerEnvironment('COVERAGE_LOAD_MAX_P95_MS', 1_500),
    maxErrorRate: numberEnvironment('COVERAGE_LOAD_MAX_ERROR_RATE', 0),
  };
  const report = await runCoverageLoadPreflight(
    config,
    async (path, signal) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        signal,
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { status: response.status, body };
    },
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Coverage load preflight failed: ${message}\n`);
  process.exitCode = 1;
});
