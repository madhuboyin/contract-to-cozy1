const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
  BUYER_PHASE_CHECKLIST_TEMPLATES,
  composeBuyerChecklist,
} = require('../../src/services/buyerChecklistComposition.service.ts');

function fact(key, value, state = value === null ? 'UNKNOWN' : 'KNOWN') {
  return {
    key, value, state, source: value === null ? null : 'USER_REPORTED', verified: value !== null,
    confidence: value === null ? null : 1, observedAt: '2026-08-17T12:00:00.000Z', validUntil: null,
    correctionPath: `/api/properties/property-1/context/${key}`,
  };
}

function context(overrides = {}) {
  const values = {
    'core.dwellingType': 'CONDO_UNIT',
    'core.ownershipForm': 'CONDOMINIUM',
    'core.yearBuilt': 1970,
    'location.state': 'MA',
    'responsibility.roof': 'ASSOCIATION',
    'responsibility.buildingExterior': 'ASSOCIATION',
    'exterior.hasPoolOrSpa': true,
    'systems.hvacInstallYear': 2005,
    ...overrides,
  };
  return {
    propertyId: 'property-1', contextVersion: 'context-v1', generatedAt: '2026-08-17T12:00:00.000Z',
    scopes: ['CORE', 'LOCATION', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS'], warnings: [],
    facts: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, fact(key, value)])),
  };
}

test('Slice 4 registry provides one stable versioned entry point for all nine phase checklist sections', () => {
  const sections = new Set(BUYER_PHASE_CHECKLIST_TEMPLATES.map((item) => item.checklistSection));
  assert.equal(BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION, 'buyer-phase-checklists-v1');
  assert.equal(BUYER_PHASE_CHECKLIST_TEMPLATES.length, 9);
  assert.equal(sections.size, 9);
  assert.equal(new Set(BUYER_PHASE_CHECKLIST_TEMPLATES.map((item) => item.actionKey)).size, 9);
  for (const item of BUYER_PHASE_CHECKLIST_TEMPLATES) {
    assert.match(item.actionKey, /^buyer:phase:/);
    assert.ok(item.whyMatters);
    assert.ok(item.completionCriteria);
    assert.ok(item.blockedGuidance);
  }
});

test('known canonical condo, responsibility, pool, age, location, and system facts add explainable modules', () => {
  const result = composeBuyerChecklist(context());
  const applicable = new Map(result.items.filter((item) => item.applicability.result === 'APPLICABLE').map((item) => [item.actionKey, item]));

  assert.equal(result.delta.added, 14);
  assert.equal(result.questions.length, 0);
  assert.deepEqual(applicable.get('buyer:phase:association-records-review').applicability.usedFactKeys, [
    'core.dwellingType', 'core.ownershipForm',
  ]);
  assert.deepEqual(applicable.get('buyer:phase:age-records-questions').applicability.usedFactKeys, [
    'core.yearBuilt', 'location.state',
  ]);
  assert.equal(applicable.get('buyer:phase:hvac-history-questions').applicability.reasonCodes[0], 'SOURCE_QUALIFIED_HVAC_AGE');
});

test('unknown facts stay out of the active delta and produce benefit copy plus correction paths', () => {
  const unknown = context({
    'core.dwellingType': null,
    'core.ownershipForm': null,
    'core.yearBuilt': null,
    'location.state': null,
    'responsibility.roof': null,
    'responsibility.buildingExterior': null,
    'exterior.hasPoolOrSpa': null,
    'systems.hvacInstallYear': null,
  });
  const result = composeBuyerChecklist(unknown);

  assert.equal(result.delta.added, 9);
  assert.ok(result.questions.length >= 6);
  assert.ok(result.questions.every((question) => question.whyWeAsk && question.correctionPath));
  assert.equal(result.items.find((item) => item.actionKey === 'buyer:phase:pool-specialist-review').applicability.result, 'UNKNOWN');
});

test('composition is idempotent and reports managed items that leave applicability without deleting history', () => {
  const initial = composeBuyerChecklist(context());
  const existing = initial.items.filter((item) => item.applicability.result === 'APPLICABLE').map((item) => ({
    actionKey: item.actionKey,
    applicability: 'APPLICABLE',
    generationVersion: BUYER_PHASE_CHECKLIST_TEMPLATE_VERSION,
  }));
  const unchanged = composeBuyerChecklist(context(), existing);
  assert.deepEqual(unchanged.delta, { added: 0, removed: 0, unchanged: 14, addedItems: [], removedItems: [] });

  const noPool = composeBuyerChecklist(context({ 'exterior.hasPoolOrSpa': false }), existing);
  assert.equal(noPool.delta.removed, 1);
  assert.equal(noPool.delta.removedItems[0].actionKey, 'buyer:phase:pool-specialist-review');
});

test('preview/apply routes are explicit and regeneration preserves user work and edited dates', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../../src/routes/homeBuyerTask.routes.ts'), 'utf8');
  const service = fs.readFileSync(path.resolve(__dirname, '../../src/services/HomeBuyerTask.service.ts'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/buyer-plan/page.tsx'), 'utf8');

  assert.match(routes, /checklist-composition'/);
  assert.match(routes, /checklist-composition\/apply/);
  assert.match(service, /existing\.userEditedAt/);
  assert.match(service, /existing\.completionEvidenceJson/);
  assert.match(service, /existing\?\.userEditedAt && existing\.applicability === 'NOT_APPLICABLE'/);
  assert.match(service, /status: \{ notIn: \['COMPLETED', 'NOT_NEEDED', 'CANCELLED'\] \},\s+userEditedAt: null/);
  assert.match(service, /userEditedAt: new Date\(\)/);
  assert.match(page, /getBuyerChecklistComposition/);
  assert.match(page, /Apply checklist changes/);
  assert.match(page, /Why we ask:/);
  assert.match(page, /Unknown details stay outside active progress/);
});
