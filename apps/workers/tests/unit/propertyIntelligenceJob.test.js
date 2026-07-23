// apps/workers/tests/unit/propertyIntelligenceJob.test.js
//
// W4 item 4: processRiskCalculation/processFESCalculation/
// processHiddenAssetScan (registry key property-intelligence, the BullMQ
// Worker on property-intelligence-queue) had no dedicated test — the
// functions were previously inline in worker.ts, which has real side
// effects at module load and must never be `require`d directly in a test.
// Extracted verbatim into apps/workers/src/jobs/propertyIntelligence.job.ts
// this session (no logic changes) specifically to make this possible.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  processRiskCalculation,
  processFESCalculation,
  processHiddenAssetScan,
} = require('../../src/jobs/propertyIntelligence.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({
  propertyForFES = null,
  homeownerProfileId = 'homeowner-1',
  riskCalculateShouldThrow = false,
  fesFinancialResult,
  hiddenAssetScanResult = { programsEvaluated: 0, matchesFound: 0, matchesExpired: 0, matchesInactivated: 0 },
  hiddenAssetScanShouldThrow = false,
  snapshotShouldThrow = false,
} = {}) {
  const calls = { riskCalculateArgs: [], fesUpsertArgs: [], hiddenAssetScanArgs: [], scoreSnapshotArgs: [] };

  const deps = {
    prisma: {
      property: {
        findUnique: async (args) => {
          if (args.select?.homeownerProfileId !== undefined) {
            return { homeownerProfileId };
          }
          return propertyForFES;
        },
      },
      financialEfficiencyReport: {
        upsert: async (args) => {
          calls.fesUpsertArgs.push(args);
          return args;
        },
      },
      financialEfficiencyConfig: {
        findUnique: async () => null,
        findFirst: async () => null,
      },
    },
    logger: noopLogger,
    riskAssessmentService: {
      calculateAndSaveReport: async (propertyId) => {
        calls.riskCalculateArgs.push(propertyId);
        if (riskCalculateShouldThrow) throw new Error('risk calculation failed');
        return {};
      },
    },
    hiddenAssetService: {
      refreshMatchesInternal: async (propertyId) => {
        calls.hiddenAssetScanArgs.push(propertyId);
        if (hiddenAssetScanShouldThrow) throw new Error('hidden asset scan failed');
        return hiddenAssetScanResult;
      },
    },
    calculateFinancialEfficiency:
      fesFinancialResult ??
      (() => ({
        score: 80,
        actualInsuranceCost: { plus: () => ({ plus: () => ({ toFixed: () => '0.00' }) }) },
        actualUtilityCost: 0,
        actualWarrantyCost: 0,
        marketAverageTotal: 0,
      })),
    capturePropertyScoreSnapshots: async (propertyId, hpId) => {
      calls.scoreSnapshotArgs.push({ propertyId, hpId });
      if (snapshotShouldThrow) throw new Error('snapshot failed');
    },
  };
  return { deps, calls };
}

test('processRiskCalculation calls RiskAssessmentService and then captures score snapshots', async () => {
  const { deps, calls } = fakeDeps({ homeownerProfileId: 'homeowner-1' });

  await processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }, deps);

  assert.deepEqual(calls.riskCalculateArgs, ['property-1']);
  assert.deepEqual(calls.scoreSnapshotArgs, [{ propertyId: 'property-1', hpId: 'homeowner-1' }]);
});

test('processRiskCalculation rethrows when the risk calculation itself fails', async () => {
  const { deps, calls } = fakeDeps({ riskCalculateShouldThrow: true });

  await assert.rejects(
    () => processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }, deps),
    /risk calculation failed/,
  );

  assert.equal(calls.scoreSnapshotArgs.length, 0, 'must not attempt a snapshot when the risk calc itself failed');
});

test('processRiskCalculation does not rethrow when only the best-effort score snapshot update fails', async () => {
  const { deps } = fakeDeps({ snapshotShouldThrow: true });

  await assert.doesNotReject(() =>
    processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }, deps),
  );
});

test('processRiskCalculation skips the snapshot update when the property has no homeownerProfileId', async () => {
  const { deps, calls } = fakeDeps({ homeownerProfileId: null });

  await processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }, deps);

  assert.equal(calls.scoreSnapshotArgs.length, 0);
});

test('processFESCalculation throws when the property does not exist', async () => {
  const { deps } = fakeDeps({ propertyForFES: null });

  await assert.rejects(
    () => processFESCalculation({ propertyId: 'missing-property', jobType: 'CALCULATE_FES' }, deps),
    /Property not found for FES calculation/,
  );
});

test('processFESCalculation saves the result and captures score snapshots when homeownerProfileId is present', async () => {
  const { deps, calls } = fakeDeps({
    propertyForFES: {
      id: 'property-1',
      homeownerProfileId: 'homeowner-1',
      dwellingType: 'DETACHED_SINGLE_FAMILY',
      zipCode: '10001',
      insurancePolicies: [],
      warranties: [],
      expenses: [],
    },
  });

  await processFESCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_FES' }, deps);

  assert.equal(calls.fesUpsertArgs.length, 1);
  assert.equal(calls.fesUpsertArgs[0].where.propertyId, 'property-1');
  assert.deepEqual(calls.scoreSnapshotArgs, [{ propertyId: 'property-1', hpId: 'homeowner-1' }]);
});

test('processFESCalculation skips score snapshots when the property has no homeownerProfileId', async () => {
  const { deps, calls } = fakeDeps({
    propertyForFES: {
      id: 'property-1',
      homeownerProfileId: null,
      dwellingType: 'UNKNOWN',
      zipCode: '10001',
      insurancePolicies: [],
      warranties: [],
      expenses: [],
    },
  });

  await processFESCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_FES' }, deps);

  assert.equal(calls.scoreSnapshotArgs.length, 0);
});

test('processHiddenAssetScan calls refreshMatchesInternal and does not throw on success', async () => {
  const { deps, calls } = fakeDeps({
    hiddenAssetScanResult: { programsEvaluated: 3, matchesFound: 1, matchesExpired: 0, matchesInactivated: 0 },
  });

  await processHiddenAssetScan({ propertyId: 'property-1', jobType: 'CALCULATE_HIDDEN_ASSETS' }, deps);

  assert.deepEqual(calls.hiddenAssetScanArgs, ['property-1']);
});

test('processHiddenAssetScan rethrows on failure (so BullMQ retries/reports it as failed)', async () => {
  const { deps } = fakeDeps({ hiddenAssetScanShouldThrow: true });

  await assert.rejects(
    () => processHiddenAssetScan({ propertyId: 'property-1', jobType: 'CALCULATE_HIDDEN_ASSETS' }, deps),
    /hidden asset scan failed/,
  );
});
