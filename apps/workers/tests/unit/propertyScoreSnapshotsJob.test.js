// apps/workers/tests/unit/propertyScoreSnapshotsJob.test.js
//
// W4 item 4: captureWeeklyScoreSnapshotsJob (registry key
// weekly-score-snapshots) and its helpers had no dedicated test — they
// were previously inline in worker.ts, which has real side effects at
// module load and must never be `require`d directly in a test. Extracted
// verbatim into apps/workers/src/jobs/propertyScoreSnapshots.job.ts this
// session (no logic changes) specifically to make this possible.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadModule({
  properties = [],
  riskReport = null,
  financialReport = null,
  propertyCore = null,
  existingSnapshot = null,
  snapshotModelMissing = false,
  riskReportShouldFailFor = new Set(),
} = {}) {
  const calls = { creates: [], updates: [], findFirstArgs: [] };

  const snapshotModel = snapshotModelMissing
    ? undefined
    : {
        findFirst: async (args) => {
          calls.findFirstArgs.push(args);
          return existingSnapshot;
        },
        update: async (args) => {
          calls.updates.push(args);
          return args;
        },
        create: async (args) => {
          calls.creates.push(args);
          return args;
        },
      };

  const prismaMock = {
    propertyScoreSnapshot: snapshotModel,
    riskAssessmentReport: {
      findUnique: async ({ where }) => {
        if (riskReportShouldFailFor.has(where.propertyId)) throw new Error(`lookup failed for ${where.propertyId}`);
        return riskReport;
      },
    },
    financialEfficiencyReport: { findUnique: async () => financialReport },
    property: {
      findUnique: async () => propertyCore,
      findMany: async () => properties,
    },
    warranty: { findMany: async () => [] },
    document: { count: async () => 0 },
    booking: { findMany: async () => [] },
    inventoryItem: { findMany: async () => [] },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const modPath = require.resolve('../../src/jobs/propertyScoreSnapshots.job.ts');
  delete require.cache[modPath];
  return { ...require(modPath), calls };
}

// ── getBandForScore ──────────────────────────────────────────────────

test('getBandForScore: RISK bands', () => {
  const { getBandForScore } = loadModule();
  assert.equal(getBandForScore('RISK', 85), 'Low Risk');
  assert.equal(getBandForScore('RISK', 65), 'Moderate Risk');
  assert.equal(getBandForScore('RISK', 45), 'Elevated Risk');
  assert.equal(getBandForScore('RISK', 20), 'High Risk');
});

test('getBandForScore: FINANCIAL bands', () => {
  const { getBandForScore } = loadModule();
  assert.equal(getBandForScore('FINANCIAL', 95), 'Excellent');
  assert.equal(getBandForScore('FINANCIAL', 75), 'Average');
  assert.equal(getBandForScore('FINANCIAL', 50), 'Below Average');
});

test('getBandForScore: HEALTH (default) bands', () => {
  const { getBandForScore } = loadModule();
  assert.equal(getBandForScore('HEALTH', 90), 'Excellent');
  assert.equal(getBandForScore('HEALTH', 75), 'Good');
  assert.equal(getBandForScore('HEALTH', 55), 'Fair');
  assert.equal(getBandForScore('HEALTH', 30), 'Needs Attention');
});

// ── asNumber ──────────────────────────────────────────────────────────

test('asNumber: passes through a finite number', () => {
  const { asNumber } = loadModule();
  assert.equal(asNumber(42.5), 42.5);
});

test('asNumber: unwraps a Prisma Decimal-like object via toNumber()', () => {
  const { asNumber } = loadModule();
  assert.equal(asNumber({ toNumber: () => 12.3 }), 12.3);
});

test('asNumber: coerces a numeric string', () => {
  const { asNumber } = loadModule();
  assert.equal(asNumber('7'), 7);
});

test('asNumber: falls back to 0 for null/undefined/non-numeric input', () => {
  const { asNumber } = loadModule();
  assert.equal(asNumber(null), 0);
  assert.equal(asNumber(undefined), 0);
  assert.equal(asNumber('not a number'), 0);
});

// ── getWeekStartUtc ───────────────────────────────────────────────────

test('getWeekStartUtc: a Wednesday rolls back to that week\'s Monday at UTC midnight', () => {
  const { getWeekStartUtc } = loadModule();
  const wednesday = new Date('2026-07-22T15:30:00Z'); // a Wednesday
  const weekStart = getWeekStartUtc(wednesday);
  assert.equal(weekStart.toISOString(), '2026-07-20T00:00:00.000Z'); // that week's Monday
});

test('getWeekStartUtc: a Monday returns itself at UTC midnight', () => {
  const { getWeekStartUtc } = loadModule();
  const monday = new Date('2026-07-20T09:00:00Z');
  const weekStart = getWeekStartUtc(monday);
  assert.equal(weekStart.toISOString(), '2026-07-20T00:00:00.000Z');
});

test('getWeekStartUtc: a Sunday rolls back to the PREVIOUS Monday, not forward', () => {
  const { getWeekStartUtc } = loadModule();
  const sunday = new Date('2026-07-26T09:00:00Z');
  const weekStart = getWeekStartUtc(sunday);
  assert.equal(weekStart.toISOString(), '2026-07-20T00:00:00.000Z');
});

// ── upsertPropertyScoreSnapshot ──────────────────────────────────────

test('upsertPropertyScoreSnapshot creates a new row when none exists for that property/scoreType/weekStart', async () => {
  const { upsertPropertyScoreSnapshot, calls } = loadModule({ existingSnapshot: null });

  await upsertPropertyScoreSnapshot({
    propertyId: 'property-1',
    homeownerProfileId: 'homeowner-1',
    scoreType: 'RISK',
    score: 72,
  });

  assert.equal(calls.creates.length, 1);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.creates[0].data.sourceVersion, 1);
});

test('upsertPropertyScoreSnapshot updates the existing row instead of creating a duplicate', async () => {
  const { upsertPropertyScoreSnapshot, calls } = loadModule({ existingSnapshot: { id: 'snapshot-1' } });

  await upsertPropertyScoreSnapshot({
    propertyId: 'property-1',
    homeownerProfileId: 'homeowner-1',
    scoreType: 'RISK',
    score: 72,
  });

  assert.equal(calls.creates.length, 0);
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].where.id, 'snapshot-1');
});

test('upsertPropertyScoreSnapshot logs and returns cleanly when the Prisma delegate is missing (client not regenerated yet)', async () => {
  const { upsertPropertyScoreSnapshot, calls } = loadModule({ snapshotModelMissing: true });

  await assert.doesNotReject(() =>
    upsertPropertyScoreSnapshot({ propertyId: 'property-1', homeownerProfileId: 'homeowner-1', scoreType: 'RISK', score: 72 }),
  );
  assert.equal(calls.creates.length, 0);
});

// ── capturePropertyScoreSnapshots ────────────────────────────────────

test('captures a RISK snapshot when a risk report exists', async () => {
  const { capturePropertyScoreSnapshots, calls } = loadModule({
    riskReport: { riskScore: 72.4, financialExposureTotal: 1000, details: [{ riskLevel: 'HIGH' }, { riskLevel: 'LOW' }], lastCalculatedAt: new Date() },
  });

  await capturePropertyScoreSnapshots('property-1', 'homeowner-1');

  const riskCreate = calls.creates.find((c) => c.data.scoreType === 'RISK');
  assert.ok(riskCreate);
  assert.equal(riskCreate.data.score, 72.4);
  assert.equal(riskCreate.data.snapshotJson.highRiskAssets, 1);
});

test('captures a FINANCIAL snapshot when a financial report exists', async () => {
  const { capturePropertyScoreSnapshots, calls } = loadModule({
    financialReport: {
      financialEfficiencyScore: 88,
      actualInsuranceCost: 100,
      actualUtilityCost: 50,
      actualWarrantyCost: 25,
      marketAverageTotal: 200,
      lastCalculatedAt: new Date(),
    },
  });

  await capturePropertyScoreSnapshots('property-1', 'homeowner-1');

  const financialCreate = calls.creates.find((c) => c.data.scoreType === 'FINANCIAL');
  assert.ok(financialCreate);
  assert.equal(financialCreate.data.snapshotJson.annualCost, 175);
});

test('captures a HEALTH snapshot when the property core record exists', async () => {
  const { capturePropertyScoreSnapshots, calls } = loadModule({
    propertyCore: { id: 'property-1', propertySize: 2000, yearBuilt: 2000 },
  });

  await capturePropertyScoreSnapshots('property-1', 'homeowner-1');

  const healthCreate = calls.creates.find((c) => c.data.scoreType === 'HEALTH');
  assert.ok(healthCreate, 'a HEALTH snapshot must be created whenever the property core record exists');
});

test('skips every snapshot type independently when its source data is absent', async () => {
  const { capturePropertyScoreSnapshots, calls } = loadModule({
    riskReport: null,
    financialReport: null,
    propertyCore: null,
  });

  await capturePropertyScoreSnapshots('property-1', 'homeowner-1');

  assert.equal(calls.creates.length, 0);
});

// ── captureWeeklyScoreSnapshotsJob ───────────────────────────────────

test('captureWeeklyScoreSnapshotsJob processes every property', async () => {
  const { captureWeeklyScoreSnapshotsJob, calls } = loadModule({
    properties: [
      { id: 'property-1', homeownerProfileId: 'homeowner-1' },
      { id: 'property-2', homeownerProfileId: 'homeowner-2' },
    ],
    riskReport: { riskScore: 50, financialExposureTotal: 0, details: [], lastCalculatedAt: new Date() },
  });

  await captureWeeklyScoreSnapshotsJob();

  // Both properties share the same mocked riskReport/financialReport/etc.
  // fixtures, so 2 properties x 1 (RISK) snapshot type = 2 creates.
  assert.equal(calls.creates.length, 2);
});

test('captureWeeklyScoreSnapshotsJob: one property failing does not abort the batch for the rest', async () => {
  const { captureWeeklyScoreSnapshotsJob, calls } = loadModule({
    properties: [
      { id: 'property-1', homeownerProfileId: 'homeowner-1' },
      { id: 'property-2', homeownerProfileId: 'homeowner-2' },
    ],
    riskReport: { riskScore: 50, financialExposureTotal: 0, details: [], lastCalculatedAt: new Date() },
    riskReportShouldFailFor: new Set(['property-1']),
  });

  await assert.doesNotReject(() => captureWeeklyScoreSnapshotsJob());

  // property-1's capture throws (risk report lookup fails) and is caught;
  // property-2 must still succeed and produce its RISK snapshot.
  assert.equal(calls.creates.length, 1);
});

test('captureWeeklyScoreSnapshotsJob does not throw even if the initial property query fails (outer catch)', async () => {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: { property: { findMany: async () => { throw new Error('db down'); } } } },
  };
  const modPath = require.resolve('../../src/jobs/propertyScoreSnapshots.job.ts');
  delete require.cache[modPath];
  const { captureWeeklyScoreSnapshotsJob } = require(modPath);

  await assert.doesNotReject(() => captureWeeklyScoreSnapshotsJob());
});
