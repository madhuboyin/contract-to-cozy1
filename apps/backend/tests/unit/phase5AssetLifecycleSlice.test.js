const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateFinancialContext } = require('../../src/services/financialContext/applicabilityPolicy.ts');
const { reconcileFinancialOutput } = require('../../src/services/financialContext/reconciliation.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

function snapshot(values) {
  return {
    propertyId: 'property-1',
    contextVersion: 'phase-5-assets',
    generatedAt: NOW.toISOString(),
    scopes: ['INVENTORY', 'FINANCIAL'],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      createPropertyFact(key, value, undefined, NOW),
    ])),
    warnings: [],
  };
}

test('repair or replace is scoped to a canonical property inventory item', () => {
  const context = snapshot({
    'inventory.items': [{ id: 'item-1', condition: 'FAIR' }],
  });
  assert.equal(
    evaluateFinancialContext(context, { inventoryItemId: 'item-1' }).repairReplace.status,
    'APPLICABLE',
  );
  assert.equal(
    evaluateFinancialContext(context, { inventoryItemId: 'other-item' }).repairReplace.status,
    'NOT_APPLICABLE',
  );
});

test('capital and reserve planning depend on canonical inventory and capital exposure', () => {
  const available = evaluateFinancialContext(snapshot({
    'inventory.items': [],
    'financial.upcomingCapitalExposure': [],
  }));
  assert.equal(available.capitalPlanning.status, 'APPLICABLE');
  assert.equal(available.reservePlanning.status, 'APPLICABLE');

  const missing = evaluateFinancialContext(snapshot({}));
  assert.equal(missing.capitalPlanning.status, 'UNKNOWN');
  assert.equal(missing.reservePlanning.status, 'UNKNOWN');
});

test('financial outputs reconcile when inputs change or provenance is missing', () => {
  const decision = evaluateFinancialContext(snapshot({ 'inventory.items': [] })).capitalPlanning;
  assert.equal(reconcileFinancialOutput('v1', 'v1', decision).status, 'CURRENT');
  assert.deepEqual(
    reconcileFinancialOutput('v2', 'v1', decision).reasonCodes,
    ['FINANCIAL_OUTPUT_CONTEXT_CHANGED'],
  );
  assert.deepEqual(
    reconcileFinancialOutput('v2', null, decision).reasonCodes,
    ['FINANCIAL_OUTPUT_CONTEXT_VERSION_MISSING'],
  );
});

test('asset lifecycle controllers enforce context and stamp generated outputs', () => {
  const repairController = read('../../src/controllers/replaceRepairAnalysis.controller.ts');
  assert.match(repairController, /assertFinancialContextApplicable/);
  assert.match(repairController, /currentContext\.contextVersion/);

  const repairService = read('../../src/services/replaceRepairAnalysis.service.ts');
  assert.match(repairService, /_propertyContextVersion: propertyContextVersion/);

  const timelineController = read('../../src/controllers/homeCapitalTimeline.controller.ts');
  assert.match(timelineController, /'CAPITAL_TIMELINE'/);
  assert.match(timelineController, /getFinancialContextEnvelope/);

  const timelineService = read('../../src/services/homeCapitalTimeline.service.ts');
  assert.match(timelineService, /_propertyContextVersion/);
  assert.match(timelineService, /getFinancialContextDecisions/);
});

test('reserve workers recheck context before recalculation and notification', () => {
  const recalculate = read('../../../workers/src/jobs/recalculateReserveFunds.job.ts');
  assert.ok(
    recalculate.indexOf('await checkReserveFundWorkerContext') <
      recalculate.indexOf('homeReserveFundCalculationService.recalculate'),
  );

  const reminder = read('../../../workers/src/jobs/reserveFundBalanceReminder.job.ts');
  assert.ok(
    reminder.indexOf('await checkReserveFundWorkerContext') <
      reminder.indexOf('await NotificationService.create'),
  );

  const reconciliation = read('../../../workers/src/jobs/reserveFundReconciliation.job.ts');
  assert.ok(
    reconciliation.indexOf('await checkReserveFundWorkerContext') <
      reconciliation.indexOf('await NotificationService.create'),
  );
});

test('worker image packages the Phase 5 financial policy dependency chain', () => {
  const dockerfile = read('../../../../infrastructure/docker/workers/Dockerfile');
  assert.match(dockerfile, /services\/financialContext\/context\.ts/);
  assert.match(dockerfile, /reserveFundWorkerContext\.service\.ts/);

  // W5 replaced ~70 hand-maintained `sed -i` import-rewrite rules (the
  // mechanism this test originally checked a literal fragment of) with a
  // @worker-shared/* tsconfig path alias — see this Dockerfile's own
  // comments and check-worker-import-boundary.js, which now generically
  // guards that every @worker-shared/* import has a matching COPY
  // destination for all worker source files, not just these. What still
  // matters specifically for "Phase 5 financial workers": all three reserve
  // job files actually depend on the shared reserve-fund policy via that
  // supported alias (not a stale relative path the Docker build can't
  // resolve). recalculateReserveFunds.job.ts is a third dependent this test
  // never covered even under the old mechanism.
  const expectedImport = "from '@worker-shared/services/financialContext/reserveFundWorkerContext.service'";
  for (const jobFile of [
    'recalculateReserveFunds.job.ts',
    'reserveFundBalanceReminder.job.ts',
    'reserveFundReconciliation.job.ts',
  ]) {
    const source = read(`../../../workers/src/jobs/${jobFile}`);
    assert.ok(
      source.includes(expectedImport),
      `${jobFile} must import the shared reserve-fund policy via the @worker-shared alias`,
    );
  }
});

test('reserve fund persists context provenance in the Prisma model', () => {
  const schema = read('../../prisma/schema.prisma');
  assert.match(schema, /model HomeReserveFund[\s\S]*propertyContextVersion String\?/);
});
