const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  COVERAGE_MUTATION_PREFLIGHT_VERSION,
  runCoverageMutationPreflight,
  validateCoverageMutationConfig,
} = require('../../src/services/coverageMutationPreflight.service');

function config(overrides = {}) {
  return {
    baseUrl: 'https://coverage.staging.example.com',
    allowedHost: 'coverage.staging.example.com',
    targetClass: 'STAGING',
    propertyId: 'property-owned',
    unauthorizedPropertyId: 'property-foreign',
    comparisonId: 'comparison-fixture',
    handoffRequestId: '11111111-1111-4111-8111-111111111111',
    recipientId: '22222222-2222-4222-8222-222222222222',
    disclosureVersion: 'coverage-handoff-v1:fixture',
    contactEmail: 'fixture@example.com',
    concurrency: 5,
    ...overrides,
  };
}

test('mutation preflight verifies authorization and one durable id per concurrent retry', async () => {
  const seenBodies = [];
  const report = await runCoverageMutationPreflight(
    config(),
    async (method, path, body) => {
      if (method === 'GET') return { status: 403, body: { success: false } };
      seenBodies.push(body);
      if (path.endsWith('/withdraw')) {
        return {
          status: 200,
          body: { data: { request: { status: 'WITHDRAWN' } } },
        };
      }
      if (path.endsWith('/decision')) {
        return {
          status: 200,
          body: {
            data: {
              decision: { id: 'decision-one' },
              homeEvent: { id: 'event-one' },
            },
          },
        };
      }
      return {
        status: 200,
        body: {
          data: {
            request: { id: '11111111-1111-4111-8111-111111111111' },
          },
        },
      };
    },
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(report.contractVersion, COVERAGE_MUTATION_PREFLIGHT_VERSION);
  assert.equal(report.passed, true);
  assert.equal(report.checks.unauthorizedPropertyDenied, true);
  assert.equal(report.checks.decision.idempotent, true);
  assert.equal(report.checks.handoff.idempotent, true);
  assert.equal(report.checks.handoff.withdrawnAfterCheck, true);
  assert.equal(seenBodies.length, 11);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('property-owned'), false);
  assert.equal(serialized.includes('fixture@example.com'), false);
});

test('duplicate ids, authorization leakage, and unsafe targets fail closed', async () => {
  const report = await runCoverageMutationPreflight(
    config({ concurrency: 2 }),
    async (method, path) => {
      if (method === 'GET') return { status: 200, body: {} };
      if (path.endsWith('/withdraw')) {
        return {
          status: 200,
          body: { data: { request: { status: 'WITHDRAWN' } } },
        };
      }
      if (path.endsWith('/decision')) {
        return {
          status: 200,
          body: {
            data: {
              decision: { id: Math.random().toString() },
              homeEvent: { id: Math.random().toString() },
            },
          },
        };
      }
      return {
        status: 201,
        body: { data: { request: { id: Math.random().toString() } } },
      };
    },
  );
  assert.equal(report.passed, false);
  assert.equal(report.checks.unauthorizedPropertyDenied, false);
  assert.equal(report.checks.decision.idempotent, false);
  assert.equal(report.checks.handoff.idempotent, false);
  assert.throws(
    () => validateCoverageMutationConfig(config({
      baseUrl: 'https://api.contracttocozy.com',
      allowedHost: 'api.contracttocozy.com',
    })),
    /Production coverage load targets are prohibited/,
  );
  assert.throws(
    () => validateCoverageMutationConfig(config({
      unauthorizedPropertyId: 'property-owned',
    })),
    /must differ/,
  );
});
