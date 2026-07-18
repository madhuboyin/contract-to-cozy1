const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { getCaptureDefinition } = require('../../src/modules/propertyContext/catalog/captureRegistry.ts');
const { normalizeAnswers } = require('../../src/modules/propertyContext/application/captureFeatureContext.ts');
const { createPropertyFact } = require('../../src/modules/propertyContext/domain/facts.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('structured registry covers outdoor, systems, safety, responsibility, and structure groups', () => {
  for (const captureKey of [
    'OUTDOOR_SPACE_PROFILE',
    'HVAC_SYSTEM_PROFILE',
    'SAFETY_DETECTOR_PROFILE',
    'ROOF_STRUCTURE_PROFILE',
  ]) {
    const definition = getCaptureDefinition(captureKey);
    assert.equal(definition.mode, 'STRUCTURED');
    assert.equal(definition.inputSchema.type, 'GROUP');
    assert.ok(definition.factKeys.length >= 3);
    assert.deepEqual(new Set(Object.values(definition.answerBindings)), new Set(definition.factKeys));
  }
});

test('outdoor structured capture applies conditional fields and clears types atomically when absent', () => {
  const definition = getCaptureDefinition('OUTDOOR_SPACE_PROFILE');
  assert.deepEqual(normalizeAnswers(definition, { hasPrivateOutdoorSpace: false }), [
    { factKey: 'exterior.hasPrivateOutdoorSpace', value: false },
    { factKey: 'exterior.outdoorSpaceTypes', value: [] },
  ]);
  assert.throws(
    () => normalizeAnswers(definition, { hasPrivateOutdoorSpace: true }),
    /missing required field: outdoorSpaceTypes/,
  );
  assert.deepEqual(normalizeAnswers(definition, {
    hasPrivateOutdoorSpace: true,
    outdoorSpaceTypes: ['PATIO'],
    landscapingResponsibility: 'OWNER',
  }), [
    { factKey: 'exterior.hasPrivateOutdoorSpace', value: true },
    { factKey: 'exterior.outdoorSpaceTypes', value: ['PATIO'] },
    { factKey: 'responsibility.landscaping', value: 'OWNER' },
  ]);
});

test('explicit unknown evidence remains distinct from false and canonical values', () => {
  const now = new Date('2026-07-17T12:00:00.000Z');
  const unknown = createPropertyFact('safety.hasSmokeDetectors', true, {
    source: 'USER_REPORTED',
    verified: false,
    confidence: null,
    observedAt: now,
    validUntil: null,
    observationState: 'UNKNOWN',
  }, now);
  assert.equal(unknown.state, 'UNKNOWN');
  assert.equal(unknown.value, null);
  const knownFalse = createPropertyFact('safety.hasSmokeDetectors', false, undefined, now);
  assert.equal(knownFalse.state, 'KNOWN');
  assert.equal(knownFalse.value, false);
});

test('orchestrator retains conflict evidence and records stale confirmations', () => {
  const capture = read('../../src/modules/propertyContext/application/captureFeatureContext.ts');
  assert.match(capture, /active\.state !== 'CONFLICTED'/);
  assert.match(capture, /PROPERTY_CONTEXT_CONFLICT_RESOLUTION/);
  assert.match(capture, /PROPERTY_CONTEXT_STALE_CONFIRMATION/);
  assert.match(capture, /observationState: unknownAnswer \? 'UNKNOWN' : 'KNOWN'/);
});

test('frontend renders progressive groups, stale confirmation, conflict resolution, and no-loop unknown state', () => {
  const panel = read('../../../frontend/src/components/property-context/PropertyContextCapturePanel.tsx');
  const hook = read('../../../frontend/src/components/property-context/useFeatureContextCapture.ts');
  assert.match(panel, /schema\.type === 'GROUP'/);
  assert.match(panel, /schema\.fields\.filter\(fieldIsActive\)/);
  assert.match(panel, /Confirm current details/);
  assert.match(panel, /Resolve conflicting details/);
  assert.match(hook, /suppressedRequirementId/);
  assert.match(hook, /containsUnknown/);
});
