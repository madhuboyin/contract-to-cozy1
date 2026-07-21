// apps/workers/tests/unit/propertyIntelligenceJob.test.js
//
// W4 item 4: processRiskCalculation/processFESCalculation/
// processHiddenAssetScan (registry key property-intelligence, the BullMQ
// Worker on property-intelligence-queue) had no dedicated test — the
// functions were previously inline in worker.ts, which has real side
// effects at module load and must never be `require`d directly in a test.
// Extracted verbatim into apps/workers/src/jobs/propertyIntelligence.job.ts
// this session (no logic changes) specifically to make this possible.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({
  propertyForFES = null,
  homeownerProfileId = 'homeowner-1',
  riskCalculateShouldThrow = false,
  fesFinancialResult,
  hiddenAssetScanResult = { programsEvaluated: 0, matchesFound: 0, matchesExpired: 0, matchesInactivated: 0 },
  hiddenAssetScanShouldThrow = false,
  snapshotShouldThrow = false,
} = {}) {
  const calls = { riskCalculateArgs: [], fesUpsertArgs: [], hiddenAssetScanArgs: [], scoreSnapshotArgs: [] };

  const prismaMock = {
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
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const riskServicePath = require.resolve('../../../backend/src/services/RiskAssessment.service.ts');
  require.cache[riskServicePath] = {
    id: riskServicePath,
    filename: riskServicePath,
    loaded: true,
    exports: {
      __esModule: true,
      default: {
        calculateAndSaveReport: async (propertyId) => {
          calls.riskCalculateArgs.push(propertyId);
          if (riskCalculateShouldThrow) throw new Error('risk calculation failed');
          return {};
        },
      },
    },
  };

  const hiddenAssetsPath = require.resolve('../../../backend/src/services/hiddenAssets.service.ts');
  require.cache[hiddenAssetsPath] = {
    id: hiddenAssetsPath,
    filename: hiddenAssetsPath,
    loaded: true,
    exports: {
      HiddenAssetService: class {
        async refreshMatchesInternal(propertyId) {
          calls.hiddenAssetScanArgs.push(propertyId);
          if (hiddenAssetScanShouldThrow) throw new Error('hidden asset scan failed');
          return hiddenAssetScanResult;
        }
      },
    },
  };

  const finCalcPath = require.resolve('../../../backend/src/utils/FinancialCalculator.util.ts');
  require.cache[finCalcPath] = {
    id: finCalcPath,
    filename: finCalcPath,
    loaded: true,
    exports: {
      calculateFinancialEfficiency:
        fesFinancialResult ??
        (() => ({
          score: 80,
          actualInsuranceCost: { plus: () => ({ plus: () => ({ toFixed: () => '0.00' }) }) },
          actualUtilityCost: 0,
          actualWarrantyCost: 0,
          marketAverageTotal: 0,
        })),
    },
  };

  const scoreSnapshotsPath = require.resolve('../../src/jobs/propertyScoreSnapshots.job.ts');
  require.cache[scoreSnapshotsPath] = {
    id: scoreSnapshotsPath,
    filename: scoreSnapshotsPath,
    loaded: true,
    exports: {
      capturePropertyScoreSnapshots: async (propertyId, hpId) => {
        calls.scoreSnapshotArgs.push({ propertyId, hpId });
        if (snapshotShouldThrow) throw new Error('snapshot failed');
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/propertyIntelligence.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('processRiskCalculation calls RiskAssessmentService and then captures score snapshots', async () => {
  const { processRiskCalculation, calls } = loadJob({ homeownerProfileId: 'homeowner-1' });

  await processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' });

  assert.deepEqual(calls.riskCalculateArgs, ['property-1']);
  assert.deepEqual(calls.scoreSnapshotArgs, [{ propertyId: 'property-1', hpId: 'homeowner-1' }]);
});

test('processRiskCalculation rethrows when the risk calculation itself fails', async () => {
  const { processRiskCalculation, calls } = loadJob({ riskCalculateShouldThrow: true });

  await assert.rejects(
    () => processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }),
    /risk calculation failed/,
  );

  assert.equal(calls.scoreSnapshotArgs.length, 0, 'must not attempt a snapshot when the risk calc itself failed');
});

test('processRiskCalculation does not rethrow when only the best-effort score snapshot update fails', async () => {
  const { processRiskCalculation } = loadJob({ snapshotShouldThrow: true });

  await assert.doesNotReject(() =>
    processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' }),
  );
});

test('processRiskCalculation skips the snapshot update when the property has no homeownerProfileId', async () => {
  const { processRiskCalculation, calls } = loadJob({ homeownerProfileId: null });

  await processRiskCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_RISK_REPORT' });

  assert.equal(calls.scoreSnapshotArgs.length, 0);
});

test('processFESCalculation throws when the property does not exist', async () => {
  const { processFESCalculation } = loadJob({ propertyForFES: null });

  await assert.rejects(
    () => processFESCalculation({ propertyId: 'missing-property', jobType: 'CALCULATE_FES' }),
    /Property not found for FES calculation/,
  );
});

test('processFESCalculation saves the result and captures score snapshots when homeownerProfileId is present', async () => {
  const { processFESCalculation, calls } = loadJob({
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

  await processFESCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_FES' });

  assert.equal(calls.fesUpsertArgs.length, 1);
  assert.equal(calls.fesUpsertArgs[0].where.propertyId, 'property-1');
  assert.deepEqual(calls.scoreSnapshotArgs, [{ propertyId: 'property-1', hpId: 'homeowner-1' }]);
});

test('processFESCalculation skips score snapshots when the property has no homeownerProfileId', async () => {
  const { processFESCalculation, calls } = loadJob({
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

  await processFESCalculation({ propertyId: 'property-1', jobType: 'CALCULATE_FES' });

  assert.equal(calls.scoreSnapshotArgs.length, 0);
});

test('processHiddenAssetScan calls refreshMatchesInternal and does not throw on success', async () => {
  const { processHiddenAssetScan, calls } = loadJob({
    hiddenAssetScanResult: { programsEvaluated: 3, matchesFound: 1, matchesExpired: 0, matchesInactivated: 0 },
  });

  await processHiddenAssetScan({ propertyId: 'property-1', jobType: 'CALCULATE_HIDDEN_ASSETS' });

  assert.deepEqual(calls.hiddenAssetScanArgs, ['property-1']);
});

test('processHiddenAssetScan rethrows on failure (so BullMQ retries/reports it as failed)', async () => {
  const { processHiddenAssetScan } = loadJob({ hiddenAssetScanShouldThrow: true });

  await assert.rejects(
    () => processHiddenAssetScan({ propertyId: 'property-1', jobType: 'CALCULATE_HIDDEN_ASSETS' }),
    /hidden asset scan failed/,
  );
});
