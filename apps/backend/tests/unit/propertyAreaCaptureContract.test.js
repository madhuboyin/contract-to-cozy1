const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// The per-area capture contract (PROPERTY_RECORD_SUMMARY:CAPTURE_AREA 1.0) is evaluated through the real evaluator with
// only the two data dependencies replaced (property access and the property-context snapshot), so scope selection,
// skip handling and applicability run for real.

const getPropertyContextModule = require('../../src/modules/propertyContext/application/getPropertyContext.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { evaluateFeatureContext } = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { FEATURE_CONTEXT_REQUIREMENTS, getFeatureContextRequirement, PROPERTY_AREA_CAPTURE_SCOPES } = require('../../src/modules/propertyContext/catalog/featureRequirementRegistry.ts');
const { PROPERTY_FACT_CATALOG } = require('../../src/modules/propertyContext/catalog/factCatalog.ts');
const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');

const originals = { getPropertyContext: getPropertyContextModule.getPropertyContext, resolveAccess: propertyAccess.resolvePropertyAccess };
let facts;
test.beforeEach(() => {
  facts = {};
  getPropertyContextModule.getPropertyContext = async (propertyId) => ({ propertyId, contextVersion: 'ctx-1', generatedAt: '2026-09-21T00:00:00.000Z', scopes: [], facts, warnings: [] });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'CONTRIBUTOR', userId: 'u1', propertyId: 'p1' });
});
test.afterEach(() => {
  getPropertyContextModule.getPropertyContext = originals.getPropertyContext;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
});

const known = (key, value = 'x') => ({ key, value, state: 'KNOWN', source: 'USER_REPORTED', verified: true, confidence: 1, observedAt: null, validUntil: null, correctionPath: null });
const evaluate = (scope, skipFactKeys) => evaluateFeatureContext('p1', 'u1', {
  featureKey: 'PROPERTY_RECORD_SUMMARY', operationKey: 'CAPTURE_AREA', operationInput: { scope, ...(skipFactKeys ? { skipFactKeys } : {}) },
});

test('the area contract is registered, versioned, capture-only, and covers exactly the writable facts of the seven areas', () => {
  const contract = getFeatureContextRequirement('PROPERTY_RECORD_SUMMARY', 'CAPTURE_AREA');
  assert.equal(contract.policyVersion, '1.0');
  assert.equal(contract.areaCapture, true);
  assert.equal(contract.adoption.executionDisposition, 'CAPTURE_ONLY');
  assert.deepEqual(contract.required, []);
  const expected = PROPERTY_FACT_CATALOG.filter((fact) => PROPERTY_AREA_CAPTURE_SCOPES.includes(fact.scope) && fact.writable).map((fact) => fact.key).sort();
  assert.deepEqual(contract.enhancements.map((entry) => entry.factKey).sort(), expected, 'a newly added writable fact must appear in the area contract');
  for (const entry of contract.enhancements) {
    const capture = getCaptureDefinition(entry.captureKey);
    assert.notEqual(capture.mode, 'RELATIONAL', `${entry.factKey} must not use a relational capture`);
    assert.ok(capture.factKeys.includes(entry.factKey));
    assert.equal(entry.operationInputWhen.key, 'scope');
  }
});

test('the existing VIEW_SUMMARY contract is unchanged and no other contract is area-capture', () => {
  assert.equal(getFeatureContextRequirement('PROPERTY_RECORD_SUMMARY', 'VIEW_SUMMARY').areaCapture, undefined);
  assert.deepEqual(FEATURE_CONTEXT_REQUIREMENTS.filter((contract) => contract.areaCapture).map((contract) => `${contract.featureKey}:${contract.operationKey}`), ['PROPERTY_RECORD_SUMMARY:CAPTURE_AREA']);
});

test('only questions for the requested scope are selected, structured profiles first', async () => {
  const structure = await evaluate('STRUCTURE');
  assert.equal(structure.requirements.length, 1);
  assert.equal(structure.requirements[0].capture.captureKey, 'ROOF_STRUCTURE_PROFILE');
  const safety = await evaluate('SAFETY');
  assert.equal(safety.requirements[0].capture.captureKey, 'SAFETY_DETECTOR_PROFILE');
  const systems = await evaluate('SYSTEMS');
  assert.equal(systems.requirements[0].capture.captureKey, 'HVAC_SYSTEM_PROFILE');
});

test('a skipped fact is only left out of question selection: the next question appears, and the skipped fact is never reported as known', async () => {
  const first = await evaluate('STRUCTURE');
  const skipKeys = first.requirements[0].capture.factKeys;
  const next = await evaluate('STRUCTURE', skipKeys);
  assert.notEqual(next.requirements[0].requirementId, first.requirements[0].requirementId);
  assert.ok(!next.requirements[0].factKeys.some((key) => skipKeys.includes(key)));
  assert.ok(!next.usedFactKeys.some((key) => skipKeys.includes(key)), 'a skipped fact is not used/known');
  // Skipping everything leaves no question, still without marking anything known.
  const all = PROPERTY_FACT_CATALOG.filter((fact) => fact.scope === 'STRUCTURE' && fact.writable).map((fact) => fact.key);
  const none = await evaluate('STRUCTURE', all);
  assert.equal(none.requirements.length, 0);
  assert.deepEqual(none.usedFactKeys, []);
});

test('requirement ids stay stable as questions are skipped (skips only steer selection)', async () => {
  const before = await evaluate('SYSTEMS');
  // Skipping a fact that is NOT the current question must not change the current question or its id.
  const after = await evaluate('SYSTEMS', ['systems.waterSource', 'systems.sewerSystem']);
  assert.equal(after.requirements[0].requirementId, before.requirements[0].requirementId);
  assert.equal(after.requirements[0].capture.captureKey, before.requirements[0].capture.captureKey);
});

test('an answered fact stops being asked, and skipFactKeys is ignored by every other contract', async () => {
  const before = await evaluate('SYSTEMS');
  assert.equal(before.requirements[0].capture.captureKey, 'HVAC_SYSTEM_PROFILE');
  for (const key of getCaptureDefinition('HVAC_SYSTEM_PROFILE').factKeys) facts[key] = known(key);
  const after = await evaluate('SYSTEMS');
  assert.notEqual(after.requirements[0]?.capture.captureKey, 'HVAC_SYSTEM_PROFILE');
  const skipList = ['core.propertyUse', 'core.occupancyStatus', 'core.dwellingType', 'core.yearBuilt', 'location.state', 'location.zipCode'];
  const summary = await evaluateFeatureContext('p1', 'u1', { featureKey: 'PROPERTY_RECORD_SUMMARY', operationKey: 'VIEW_SUMMARY', operationInput: { skipFactKeys: skipList } });
  assert.equal(summary.requirements.length, 1, 'the existing contract still asks its question when its facts are "skipped"');
});

test('facts that do not apply to the property are never asked (attached dwellings have no private fence, pool or lot)', async () => {
  facts['core.dwellingType'] = known('core.dwellingType', 'TOWNHOUSE');
  const skipAllButExterior = [];
  const exteriorKeys = PROPERTY_FACT_CATALOG.filter((fact) => fact.scope === 'EXTERIOR' && fact.writable).map((fact) => fact.key);
  const seen = new Set();
  let skip = skipAllButExterior;
  for (let guard = 0; guard < 30; guard += 1) {
    const evaluation = await evaluate('EXTERIOR', skip);
    if (!evaluation.requirements.length) break;
    for (const key of evaluation.requirements[0].capture.factKeys) seen.add(key);
    skip = [...skip, ...evaluation.requirements[0].capture.factKeys];
  }
  for (const notApplicable of ['exterior.lotSizeSqFt', 'exterior.hasFence', 'exterior.hasPoolOrSpa', 'exterior.hasOutdoorFaucets']) {
    assert.ok(exteriorKeys.includes(notApplicable));
    assert.ok(!seen.has(notApplicable), `${notApplicable} must not be asked for a townhouse`);
  }
  assert.ok(seen.has('exterior.hasLawn') || seen.has('exterior.hasPrivateOutdoorSpace'));
});

test('a scope outside the seven areas selects nothing', async () => {
  const evaluation = await evaluate('FINANCIAL');
  assert.equal(evaluation.requirements.length, 0);
});
