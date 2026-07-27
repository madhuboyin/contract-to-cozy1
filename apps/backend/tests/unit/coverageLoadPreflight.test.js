const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  COVERAGE_LOAD_PREFLIGHT_VERSION,
  runCoverageLoadPreflight,
  validateCoverageLoadTarget,
} = require('../../src/services/coverageLoadPreflight.service');

function config(overrides = {}) {
  return {
    baseUrl: 'https://coverage.staging.example.com',
    allowedHost: 'coverage.staging.example.com',
    targetClass: 'STAGING',
    propertyId: 'property-fixture',
    totalRequests: 30,
    concurrency: 5,
    timeoutMs: 500,
    maxP95Ms: 250,
    maxErrorRate: 0,
    ...overrides,
  };
}

function validBody(path) {
  if (path.endsWith('/insurance-history')) {
    return { success: true, data: { historyState: 'ONE_CONFIRMED_TERM' } };
  }
  if (path.endsWith('/insurance-market-context')) {
    return { success: true, data: { state: 'SOURCE_UNAVAILABLE' } };
  }
  return { success: true, data: { available: false } };
}

test('bounded staging preflight reports latency without credentials, bodies, or property id', async () => {
  const accessToken = 'secret-token-that-must-not-appear';
  const propertyId = 'sensitive-property-id';
  const report = await runCoverageLoadPreflight(
    config({ propertyId }),
    async (path) => ({
      status: 200,
      body: validBody(path),
      accessToken,
    }),
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(report.contractVersion, COVERAGE_LOAD_PREFLIGHT_VERSION);
  assert.equal(report.passed, true);
  assert.equal(report.results.completedRequests, 30);
  assert.equal(report.results.peakConcurrency <= 5, true);
  assert.equal(report.results.concurrencyBoundRespected, true);
  assert.equal(report.results.failed, 0);
  assert.equal(report.target.hostname, 'coverage.staging.example.com');
  assert.deepEqual(report.privacy, {
    authorizationValueLogged: false,
    responseBodiesLogged: false,
    propertyIdLogged: false,
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(accessToken), false);
  assert.equal(serialized.includes(propertyId), false);
});

test('production, host mismatch, non-TLS staging, and unsafe concurrency are rejected', () => {
  assert.throws(
    () => validateCoverageLoadTarget(config({
      baseUrl: 'https://api.contracttocozy.com',
      allowedHost: 'api.contracttocozy.com',
    })),
    /Production coverage load targets are prohibited/,
  );
  assert.throws(
    () => validateCoverageLoadTarget(config({ allowedHost: 'other.example.com' })),
    /exactly match/,
  );
  assert.throws(
    () => validateCoverageLoadTarget(config({
      baseUrl: 'http://coverage.staging.example.com',
    })),
    /must use HTTPS/,
  );
  assert.throws(
    () => validateCoverageLoadTarget(config({ concurrency: 51 })),
    /between 1 and 50/,
  );
});

test('timeouts, HTTP failures, and invalid contracts fail with bounded categories', async () => {
  let request = 0;
  const report = await runCoverageLoadPreflight(
    config({
      totalRequests: 6,
      concurrency: 2,
      timeoutMs: 100,
      maxP95Ms: 100,
      maxErrorRate: 0,
    }),
    async (path, signal) => {
      request += 1;
      if (request === 1) return { status: 503, body: {} };
      if (request === 2) return { status: 200, body: {} };
      if (request === 3) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }
      return { status: 200, body: validBody(path) };
    },
  );
  assert.equal(report.passed, false);
  assert.equal(report.results.outcomes.HTTP_ERROR, 1);
  assert.equal(report.results.outcomes.CONTRACT_ERROR, 1);
  assert.equal(report.results.outcomes.TIMEOUT, 1);
  assert.equal(report.results.failed, 3);
});
