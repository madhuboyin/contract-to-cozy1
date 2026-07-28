import {
  runCoverageMutationPreflight,
  type CoverageMutationPreflightConfig,
} from '../src/services/coverageMutationPreflight.service';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integer(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

async function main() {
  const baseUrl = required('COVERAGE_MUTATION_BASE_URL').replace(/\/+$/, '');
  const accessToken = required('COVERAGE_MUTATION_ACCESS_TOKEN');
  const targetClass = required('COVERAGE_MUTATION_TARGET_CLASS');
  if (targetClass !== 'LOCAL' && targetClass !== 'STAGING') {
    throw new Error('COVERAGE_MUTATION_TARGET_CLASS must be LOCAL or STAGING.');
  }
  const timeoutMs = integer('COVERAGE_MUTATION_TIMEOUT_MS', 10_000);
  if (timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('COVERAGE_MUTATION_TIMEOUT_MS must be between 100 and 30000.');
  }
  const config: CoverageMutationPreflightConfig = {
    baseUrl,
    allowedHost: required('COVERAGE_MUTATION_ALLOWED_HOST'),
    targetClass,
    propertyId: required('COVERAGE_MUTATION_PROPERTY_ID'),
    unauthorizedPropertyId: required('COVERAGE_MUTATION_UNAUTHORIZED_PROPERTY_ID'),
    comparisonId: required('COVERAGE_MUTATION_COMPARISON_ID'),
    handoffRequestId: required('COVERAGE_MUTATION_HANDOFF_REQUEST_ID'),
    recipientId: required('COVERAGE_MUTATION_RECIPIENT_ID'),
    disclosureVersion: required('COVERAGE_MUTATION_DISCLOSURE_VERSION'),
    contactEmail: required('COVERAGE_MUTATION_CONTACT_EMAIL'),
    concurrency: integer('COVERAGE_MUTATION_CONCURRENCY', 5),
  };
  const report = await runCoverageMutationPreflight(
    config,
    async (method, path, body) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        let responseBody: unknown = null;
        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
        return { status: response.status, body: responseBody };
      } finally {
        clearTimeout(timeout);
      }
    },
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Coverage mutation preflight failed: ${message}\n`);
  process.exitCode = 1;
});
