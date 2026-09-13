const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Code review findings (2026-09-13):
// 1. [P1] ai:ask-conversational-capture-extraction was called by
//    extractionContract.ts with no entry in AI_SOURCE_REGISTRY, so every
//    extraction attempt threw AI_SOURCE_UNREGISTERED before the model was
//    ever invoked -- reproduced below with a genuine, unmocked call through
//    executeGovernedAIRequest (not just checking the registry list).
// 4. correctingEventId must be validated against the bounded context the
//    call was actually given, not accepted at face value -- schema-level
//    validation only proves it's a well-formed string.

const { sourceRegistryEntry, validateIntelligenceSourceRegistry, AI_SOURCE_REGISTRY } = require('../../src/services/intelligence/sourceRegistry.ts');
const { executeGovernedAIRequest } = require('../../src/services/ai/aiRequestGovernance.service.ts');
const { withValidCorrectionReferences } = require('../../src/services/ask/conversationalUnderstanding/extractionContract.ts');

test('ai:ask-conversational-capture-extraction is registered in AI_SOURCE_REGISTRY', () => {
  const entry = sourceRegistryEntry('ai:ask-conversational-capture-extraction');
  assert.ok(entry, 'expected ai:ask-conversational-capture-extraction to be registered -- without this, every extraction attempt throws AI_SOURCE_UNREGISTERED before the model is ever called');
  assert.equal(entry.kind, 'AI');
});

test('the full AI_SOURCE_REGISTRY (including the new entry) passes its own validation with zero issues', () => {
  const issues = validateIntelligenceSourceRegistry();
  assert.deepEqual(issues, []);
});

test('regression: a real executeGovernedAIRequest call for this exact routeId actually invokes work(), instead of throwing AI_SOURCE_UNREGISTERED before it runs', async () => {
  let workWasCalled = false;
  const result = await executeGovernedAIRequest({
    routeId: 'ai:ask-conversational-capture-extraction',
    model: 'test-model',
    structuredOutputRequired: true,
    structuredOutputConfigured: true,
    work: async () => {
      workWasCalled = true;
      return { text: '{"candidates":[]}' };
    },
  });
  assert.equal(workWasCalled, true, 'work() was never invoked -- the route is not actually registered/allowed');
  assert.deepEqual(result, { text: '{"candidates":[]}' });
});

test('sanity: an UNregistered routeId still throws AI_SOURCE_UNREGISTERED without invoking work() -- proves the regression test above is actually meaningful, not vacuously passing', async () => {
  let workWasCalled = false;
  await assert.rejects(
    executeGovernedAIRequest({
      routeId: 'ai:this-route-does-not-exist',
      model: 'test-model',
      work: async () => {
        workWasCalled = true;
        return {};
      },
    }),
    (error) => error.code === 'AI_SOURCE_UNREGISTERED',
  );
  assert.equal(workWasCalled, false);
});

function factCandidate(overrides = {}) {
  return {
    category: 'FACT', factKey: 'core.yearBuilt', value: 1998,
    extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant',
    ...overrides,
  };
}

function eventCandidate(overrides = {}) {
  return {
    category: 'EVENT', eventType: 'REPAIR', title: 'Roof replacement', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant', correctingEventId: null,
    ...overrides,
  };
}

test('withValidCorrectionReferences keeps a FACT candidate unconditionally (correctingEventId is EVENT-only)', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences([factCandidate()], new Set());
  assert.equal(candidates.length, 1);
  assert.equal(invalidReferenceCount, 0);
});

test('withValidCorrectionReferences keeps an EVENT candidate with correctingEventId: null', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences([eventCandidate({ correctingEventId: null })], new Set());
  assert.equal(candidates.length, 1);
  assert.equal(invalidReferenceCount, 0);
});

test('withValidCorrectionReferences keeps an EVENT candidate whose correctingEventId is in the allowed set and names at least one corrected field', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences(
    [eventCandidate({ correctingEventId: 'event-1', correctedFields: ['amount'] })],
    new Set(['event-1', 'event-2']),
  );
  assert.equal(candidates.length, 1);
  assert.equal(invalidReferenceCount, 0);
});

test('withValidCorrectionReferences DROPS an EVENT candidate whose correctingEventId is valid but correctedFields is empty (a correction naming nothing to change is meaningless)', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences(
    [eventCandidate({ correctingEventId: 'event-1', correctedFields: [] })],
    new Set(['event-1']),
  );
  assert.equal(candidates.length, 0);
  assert.equal(invalidReferenceCount, 1);
});

test('withValidCorrectionReferences DROPS an EVENT candidate whose correctingEventId is not in the allowed set (the model must not invent an id it was never shown)', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences(
    [eventCandidate({ correctingEventId: 'hallucinated-id' })],
    new Set(['event-1', 'event-2']),
  );
  assert.equal(candidates.length, 0);
  assert.equal(invalidReferenceCount, 1);
});

test('withValidCorrectionReferences only drops the offending candidate, not the whole batch', () => {
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences(
    [eventCandidate({ correctingEventId: 'hallucinated-id' }), factCandidate()],
    new Set(['event-1']),
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].category, 'FACT');
  assert.equal(invalidReferenceCount, 1);
});
