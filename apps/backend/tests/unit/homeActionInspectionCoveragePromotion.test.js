const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { getPromotedHomeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-24T12:00:00.000Z');

function baseStubs(overrides = {}) {
  return {
    guidanceJourney: { findMany: async () => [] },
    incident: { findMany: async () => [] },
    recallMatch: { findMany: async () => [] },
    coverageReview: { findMany: async () => [] },
    projectRecord: { findMany: async () => [] },
    seasonalChecklist: { findMany: async () => [] },
    personalizedRecommendation: { findMany: async () => [] },
    orchestrationActionEvent: { findMany: async () => [] },
    orchestrationActionSnooze: { findMany: async () => [] },
    ...overrides,
  };
}

// db.inspectionFinding.findMany also feeds the pre-existing
// loadInspectionFindingActions producer (same aggregation call, same
// query shape), so this stub carries every field that loader reads too,
// not just the ones this rule's loader needs — otherwise both producers
// race over one shared stub. Assertions below filter down to this rule's
// own "inspection-coverage:" actions rather than asserting on the raw
// action list, since a real open finding always produces its own
// INSPECTION_FINDING-kind action too.
function baseFinding(overrides = {}) {
  return {
    id: 'finding-1',
    reportId: 'report-1',
    homeSystem: 'HVAC',
    severity: 'MAJOR',
    inspectorDescription: 'The HVAC condenser unit is beyond its typical service life.',
    inspectorRecommendation: 'REPAIR',
    estimatedCostCentsLow: null,
    estimatedCostCentsHigh: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    report: { id: 'report-1', confirmedAt: new Date('2026-08-01T00:00:00.000Z'), reportType: 'BUYER_PREPURCHASE', inspectorName: 'Jane Inspector' },
    ...overrides,
  };
}

function inspectionCoverageActionsOf(actions) {
  return actions.filter((action) => action.id.startsWith('inspection-coverage:'));
}

function baseWarranty(overrides = {}) {
  return {
    id: 'warranty-1',
    category: 'HVAC',
    providerName: 'CoolAir Warranty Co.',
    expiryDate: new Date('2026-12-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function stubsWith({ findings = [], warranties = [] }) {
  return baseStubs({
    inspectionFinding: { findMany: async () => findings },
    warranty: { findMany: async () => warranties },
  });
}

test('an open HVAC finding matched by an active HVAC warranty produces a SYSTEM Home Action', async () => {
  const db = stubsWith({ findings: [baseFinding()], warranties: [baseWarranty()] });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });

  const coverageActions = inspectionCoverageActionsOf(actions);
  assert.equal(coverageActions.length, 1);
  const [action] = coverageActions;
  assert.equal(action.source.kind, 'SYSTEM');
  assert.equal(action.id, 'inspection-coverage:finding-1');
  assert.equal(action.priority, 'SOON');
  assert.ok(action.signal.includes('HVAC'));
  assert.ok(action.signal.includes('CoolAir Warranty Co.'));
  assert.equal(action.evidence.length, 2, 'the finding itself plus the one matched warranty');
  assert.equal(action.timing.dueAt, '2026-12-01T00:00:00.000Z');
  assert.equal(action.feedbackControls.includes('ACKNOWLEDGE'), true);
  assert.equal(action.feedbackControls.includes('COMPLETE'), false);
});

test('a safety-severity finding maps to NOW priority', async () => {
  const db = stubsWith({
    findings: [baseFinding({ severity: 'SAFETY' })],
    warranties: [baseWarranty()],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(inspectionCoverageActionsOf(actions)[0].priority, 'NOW');
});

test('a HOME_WARRANTY_PLAN warranty (no specific category) covers the conventional multi-system bundle', async () => {
  const db = stubsWith({
    findings: [baseFinding({ homeSystem: 'PLUMBING' })],
    warranties: [baseWarranty({ category: 'HOME_WARRANTY_PLAN', providerName: 'American Home Shield' })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  const coverageActions = inspectionCoverageActionsOf(actions);
  assert.equal(coverageActions.length, 1);
  assert.ok(coverageActions[0].signal.includes('American Home Shield'));
});

test('a mismatched warranty category produces no compound action', async () => {
  const db = stubsWith({
    findings: [baseFinding({ homeSystem: 'ROOF' })],
    warranties: [baseWarranty({ category: 'APPLIANCE' })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(inspectionCoverageActionsOf(actions).length, 0);
});

test('an OTHER-category warranty never matches, even nominally', async () => {
  const db = stubsWith({
    findings: [baseFinding({ homeSystem: 'HVAC' })],
    warranties: [baseWarranty({ category: 'OTHER' })],
  });
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(inspectionCoverageActionsOf(actions).length, 0);
});

test('no findings or no warranties produce no compound action', async () => {
  const noFindings = stubsWith({ findings: [], warranties: [baseWarranty()] });
  const noWarranties = stubsWith({ findings: [baseFinding()], warranties: [] });
  const first = await getPromotedHomeActions('property-1', noFindings, { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', noWarranties, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(inspectionCoverageActionsOf(first.actions).length, 0);
  assert.equal(inspectionCoverageActionsOf(second.actions).length, 0);
});

test('a db stub without inspectionFinding/warranty tables does not throw and yields no compound actions', async () => {
  const db = baseStubs();
  const { actions } = await getPromotedHomeActions('property-1', db, { evaluatedAt: NOW, includePersonalization: false });
  assert.equal(inspectionCoverageActionsOf(actions).length, 0);
});

// HI-ATT-007 stable-version requirement.
test('sourceVersion is deterministic and changes when the matched warranty set changes', async () => {
  const db1 = stubsWith({ findings: [baseFinding()], warranties: [baseWarranty()] });
  const db2 = stubsWith({ findings: [baseFinding()], warranties: [baseWarranty()] });
  const first = await getPromotedHomeActions('property-1', db1, { evaluatedAt: NOW, includePersonalization: false });
  const second = await getPromotedHomeActions('property-1', db2, { evaluatedAt: new Date('2026-09-01T00:00:00.000Z'), includePersonalization: false });
  const firstCoverage = inspectionCoverageActionsOf(first.actions)[0];
  const secondCoverage = inspectionCoverageActionsOf(second.actions)[0];
  assert.equal(firstCoverage.source.version, secondCoverage.source.version);

  const db3 = stubsWith({
    findings: [baseFinding()],
    warranties: [baseWarranty({ providerName: 'A Different Provider' })],
  });
  const third = await getPromotedHomeActions('property-1', db3, { evaluatedAt: NOW, includePersonalization: false });
  const thirdCoverage = inspectionCoverageActionsOf(third.actions)[0];
  assert.notEqual(firstCoverage.source.version, thirdCoverage.source.version);
});
