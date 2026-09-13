const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ExtractionCandidateSchema,
  ExtractionResultSchema,
  MAX_EXTRACTION_CANDIDATES_PER_TURN,
} = require('../../src/services/ask/conversationalUnderstanding/extractionCandidateSchema.ts');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §14). Pure schema
// validation -- no LLM call. The live extraction call (extractionContract.ts)
// is exercised only when GEMINI_API_KEY is configured (see
// extractionContract.manual.test.js), matching this codebase's existing
// convention of not asserting live-model accuracy in the default test run.

test('accepts a well-formed FACT candidate', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'FACT',
    factKey: 'financial.currentMortgage',
    value: 6.75,
    extractionConfidence: 0.9,
    attribution: 'FIRSTHAND',
    sourceSentence: 'My mortgage rate is 6.75%.',
  });
  assert.equal(result.success, true);
});

test('rejects a FACT candidate whose factKey is not in the supported capture set', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'FACT',
    factKey: 'not.a.real.fact.key',
    value: 'anything',
    extractionConfidence: 0.9,
    attribution: 'FIRSTHAND',
    sourceSentence: 'irrelevant',
  });
  assert.equal(result.success, false);
});

test('accepts a well-formed EVENT candidate with EXACT_DATE precision', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT',
    eventType: 'REPAIR',
    title: 'HVAC service',
    summary: null,
    datePrecision: 'EXACT_DATE',
    occurredAt: '2026-09-11T00:00:00.000Z',
    dateRangeStart: null,
    dateRangeEnd: null,
    amount: 275,
    currency: 'USD',
    providerName: null,
    extractionConfidence: 0.85,
    attribution: 'FIRSTHAND',
    sourceSentence: 'I serviced the HVAC yesterday for $275.',
  });
  assert.equal(result.success, true);
});

test('rejects an EVENT candidate claiming EXACT_DATE precision with no occurredAt (never fabricate precision)', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT',
    eventType: 'REPAIR',
    title: 'Roof replacement',
    datePrecision: 'EXACT_DATE',
    occurredAt: null,
    extractionConfidence: 0.7,
    attribution: 'FIRSTHAND',
    sourceSentence: 'I replaced the roof last summer.',
  });
  assert.equal(result.success, false);
});

test('accepts an EVENT candidate with RANGE precision backed by dateRangeStart/End, no occurredAt required', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT',
    eventType: 'IMPROVEMENT',
    title: 'Roof replacement',
    datePrecision: 'RANGE',
    occurredAt: null,
    dateRangeStart: '2025-06-01T00:00:00.000Z',
    dateRangeEnd: '2025-08-31T00:00:00.000Z',
    amount: 14500,
    currency: 'USD',
    extractionConfidence: 0.8,
    attribution: 'FIRSTHAND',
    sourceSentence: 'I replaced the roof last summer for $14,500.',
  });
  assert.equal(result.success, true);
});

test('rejects a RANGE-precision EVENT candidate missing dateRangeStart/End', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT',
    eventType: 'IMPROVEMENT',
    title: 'Roof replacement',
    datePrecision: 'RANGE',
    extractionConfidence: 0.8,
    attribution: 'FIRSTHAND',
    sourceSentence: 'irrelevant',
  });
  assert.equal(result.success, false);
});

test('accepts an UNKNOWN-precision EVENT candidate with no date fields at all', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT',
    eventType: 'REPAIR',
    title: 'Furnace replacement',
    datePrecision: 'UNKNOWN',
    extractionConfidence: 0.6,
    attribution: 'FIRSTHAND',
    sourceSentence: 'The furnace was replaced sometime before we moved in.',
  });
  assert.equal(result.success, true);
});

test('rejects extractionConfidence outside 0-1', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'FACT',
    factKey: 'core.yearBuilt',
    value: 1998,
    extractionConfidence: 1.5,
    attribution: 'FIRSTHAND',
    sourceSentence: 'irrelevant',
  });
  assert.equal(result.success, false);
});

test('ExtractionResultSchema caps candidates at MAX_EXTRACTION_CANDIDATES_PER_TURN', () => {
  const oneCandidate = {
    category: 'FACT',
    factKey: 'core.yearBuilt',
    value: 1998,
    extractionConfidence: 0.9,
    attribution: 'FIRSTHAND',
    sourceSentence: 'irrelevant',
  };
  const tooMany = { candidates: Array.from({ length: MAX_EXTRACTION_CANDIDATES_PER_TURN + 1 }, () => oneCandidate) };
  assert.equal(ExtractionResultSchema.safeParse(tooMany).success, false);
  const atLimit = { candidates: Array.from({ length: MAX_EXTRACTION_CANDIDATES_PER_TURN }, () => oneCandidate) };
  assert.equal(ExtractionResultSchema.safeParse(atLimit).success, true);
});

test('ExtractionResultSchema accepts an empty candidate list (the common case: nothing to capture)', () => {
  assert.equal(ExtractionResultSchema.safeParse({ candidates: [] }).success, true);
});
