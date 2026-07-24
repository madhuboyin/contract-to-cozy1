const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { createPropertyFact } = require('../../src/modules/propertyContext/index.ts');
const { evaluateSeasonalTemplateApplicability } = require('../../src/services/seasonal/applicabilityPolicy.ts');

const NOW = new Date('2026-07-16T12:00:00.000Z');

function snapshot(values) {
  const facts = Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key,
    createPropertyFact(key, value, undefined, NOW),
  ]));
  return {
    propertyId: 'property-1',
    contextVersion: 'test',
    generatedAt: NOW.toISOString(),
    scopes: [],
    facts,
    warnings: [],
  };
}

function template(overrides = {}) {
  return {
    taskKey: 'GENERIC_TASK',
    priority: 'RECOMMENDED',
    requiredAssetCheck: null,
    requiredAssetType: null,
    ...overrides,
  };
}

const noMaintenance = { 'maintenance.tasks': [] };

test('does not infer lawn presence from lot size', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({ ...noMaintenance, 'exterior.hasLawn': null, 'exterior.lotSizeSqFt': 8000 }),
    template({ taskKey: 'SPRING_LAWN_CARE_STARTUP', requiredAssetCheck: 'has_lawn' }),
    NOW,
  );
  assert.equal(decision.status, 'UNKNOWN');
  assert.deepEqual(decision.missingFactKeys, ['exterior.hasLawn']);
});

test('explicitly absent lawn suppresses lawn work', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({ ...noMaintenance, 'exterior.hasLawn': false }),
    template({ taskKey: 'FALL_LAWN_FERTILIZE', requiredAssetCheck: 'has_lawn' }),
    NOW,
  );
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['LAWN_NOT_PRESENT']);
});

test('association responsibility suppresses otherwise applicable exterior work', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({
      ...noMaintenance,
      'exterior.hasLawn': true,
      'responsibility.landscaping': 'ASSOCIATION',
    }),
    template({ taskKey: 'SPRING_LAWN_CARE_STARTUP', requiredAssetCheck: 'has_lawn' }),
    NOW,
  );
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ASSOCIATION_RESPONSIBLE']);
});

test('owner responsibility and confirmed cooling make AC work applicable', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({
      ...noMaintenance,
      'systems.hasCooling': true,
      'responsibility.hvac': 'OWNER',
    }),
    template({ taskKey: 'SPRING_HVAC_AC_INSPECTION', priority: 'CRITICAL', requiredAssetCheck: 'has_ac' }),
    NOW,
  );
  assert.equal(decision.status, 'APPLICABLE');
  assert.ok(decision.usedFactKeys.includes('systems.hasCooling'));
  assert.ok(decision.usedFactKeys.includes('responsibility.hvac'));
});

test('unknown coastal exposure never generates a hurricane-prep assumption', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({ ...noMaintenance, 'location.isCoastal': null }),
    template({ taskKey: 'SUMMER_HURRICANE_PREP', priority: 'CRITICAL', requiredAssetCheck: 'is_coastal' }),
    NOW,
  );
  assert.equal(decision.status, 'UNKNOWN');
  assert.deepEqual(decision.reasonCodes, ['COASTAL_EXPOSURE_UNKNOWN']);
});

test('an active matching maintenance task prevents duplicate seasonal generation', () => {
  const decision = evaluateSeasonalTemplateApplicability(
    snapshot({
      'maintenance.tasks': [{
        seasonalTaskKey: 'SPRING_HVAC_AC_INSPECTION',
        status: 'IN_PROGRESS',
        lastCompletedDate: null,
        updatedAt: '2026-07-01T00:00:00.000Z',
      }],
      'systems.hasCooling': true,
      'responsibility.hvac': 'OWNER',
    }),
    template({ taskKey: 'SPRING_HVAC_AC_INSPECTION', requiredAssetCheck: 'has_ac' }),
    NOW,
  );
  assert.equal(decision.status, 'NOT_APPLICABLE');
  assert.deepEqual(decision.reasonCodes, ['ACTIVE_TASK_EXISTS']);
});

test('detector tests distinguish confirmed absence from unknown presence', () => {
  const absent = evaluateSeasonalTemplateApplicability(
    snapshot({ ...noMaintenance, 'safety.hasSmokeDetectors': false, 'safety.hasCoDetectors': false }),
    template({ taskKey: 'SPRING_SMOKE_CO_DETECTOR_TEST', priority: 'CRITICAL' }),
    NOW,
  );
  const unknown = evaluateSeasonalTemplateApplicability(
    snapshot({ ...noMaintenance, 'safety.hasSmokeDetectors': null, 'safety.hasCoDetectors': null }),
    template({ taskKey: 'SPRING_SMOKE_CO_DETECTOR_TEST', priority: 'CRITICAL' }),
    NOW,
  );
  assert.equal(absent.status, 'NOT_APPLICABLE');
  assert.equal(unknown.status, 'UNKNOWN');
});

test('seasonal generation no longer reads nonexistent property applicability fields', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/seasonalChecklist.service.ts'),
    'utf8',
  );
  assert.match(source, /evaluateSeasonalTemplateApplicability/);
  assert.doesNotMatch(source, /property\.(hasPool|hasDeck|hasFireplace|hasDriveway|isCoastal)/);
  assert.doesNotMatch(source, /property\.lotSize\s*>\s*0/);
});

test('current-season generation withholds empty checklists and is reconciled during property cold start', () => {
  const checklistSource = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/seasonalChecklist.service.ts'),
    'utf8',
  );
  const propertySource = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/property.service.ts'),
    'utf8',
  );

  assert.match(checklistSource, /filteredTemplates\.length === 0/);
  assert.match(checklistSource, /Existing checklists are reconciled/);
  assert.match(propertySource, /resolveCurrentSeasonWindow/);
  assert.match(propertySource, /await reconcileCurrentSeasonalChecklist\(property\.id, userId\)/);
});
