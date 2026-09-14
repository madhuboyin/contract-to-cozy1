const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ExtractionCandidateSchema,
  ExtractionResultSchema,
  MAX_EXTRACTION_CANDIDATES_PER_TURN,
  filterCandidatesPreservingWarrantyLinks,
  splitGoalCandidates,
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

// Code review finding (2026-09-13): correctedFields is the sparse-patch
// field list a correction candidate must name -- validated at the schema
// level for shape (referential validity against the bounded context is
// runStructuredExtraction's job, tested in extractionContract.test.js).
test('accepts a correction EVENT candidate with a valid correctedFields list', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'Roof replacement', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that roof replacement cost $15,000.',
    correctingEventId: 'event-1', correctedFields: ['amount'], amount: 15000,
  });
  assert.equal(result.success, true);
});

test('rejects a correctedFields entry that is not one of the recognized field groups', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'Roof replacement', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant',
    correctingEventId: 'event-1', correctedFields: ['notARealField'],
  });
  assert.equal(result.success, false);
});

test('correctedFields is optional and defaults to absent for a brand-new event candidate', () => {
  const result = ExtractionCandidateSchema.safeParse({
    category: 'EVENT', eventType: 'REPAIR', title: 'HVAC service', datePrecision: 'EXACT_DATE',
    occurredAt: '2026-09-12T00:00:00.000Z', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant',
  });
  assert.equal(result.success, true);
});

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan
// §9/§22).

function warrantyCandidate(overrides = {}) {
  return {
    category: 'WARRANTY', providerName: 'Carrier', warrantyCategory: 'HVAC',
    extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant',
    linkedEventCandidateIndex: 0, durationMonths: 120,
    ...overrides,
  };
}

test('accepts a well-formed WARRANTY candidate with durationMonths (no explicit expiryDate)', () => {
  const result = ExtractionCandidateSchema.safeParse(warrantyCandidate());
  assert.equal(result.success, true);
});

test('accepts a well-formed WARRANTY candidate with an explicit expiryDate (no durationMonths)', () => {
  const result = ExtractionCandidateSchema.safeParse(warrantyCandidate({ durationMonths: undefined, expiryDate: '2036-09-01T00:00:00.000Z' }));
  assert.equal(result.success, true);
});

test('rejects a WARRANTY candidate with neither expiryDate nor durationMonths -- no derivable expiry', () => {
  const result = ExtractionCandidateSchema.safeParse(warrantyCandidate({ durationMonths: undefined }));
  assert.equal(result.success, false);
});

test('rejects a WARRANTY candidate with an unrecognized warrantyCategory', () => {
  const result = ExtractionCandidateSchema.safeParse(warrantyCandidate({ warrantyCategory: 'NOT_A_REAL_CATEGORY' }));
  assert.equal(result.success, false);
});

test('filterCandidatesPreservingWarrantyLinks: dropping an earlier candidate remaps a later WARRANTY\'s linkedEventCandidateIndex to its EVENT\'s new position', () => {
  const badFact = { category: 'FACT', factKey: 'core.yearBuilt', value: 'garbage', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' };
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Furnace replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 1, sourceSentence: 'z' });
  // Original positions: badFact@0, event@1, warranty@2 (linkedEventCandidateIndex points at 1).
  const result = filterCandidatesPreservingWarrantyLinks([badFact, event, warranty], (c) => c !== badFact);
  assert.equal(result.length, 2);
  assert.equal(result[0].category, 'EVENT');
  assert.equal(result[1].category, 'WARRANTY');
  // event moved from index 1 to index 0 -- the surviving warranty's index must follow it.
  assert.equal(result[1].linkedEventCandidateIndex, 0);
});

test('filterCandidatesPreservingWarrantyLinks: drops a WARRANTY outright if its paired EVENT did not survive the filter', () => {
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Furnace replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 0 });
  const result = filterCandidatesPreservingWarrantyLinks([event, warranty], (c) => c !== event);
  assert.equal(result.length, 0);
});

test('filterCandidatesPreservingWarrantyLinks: a no-op filter (nothing removed) leaves indices untouched', () => {
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Furnace replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 0 });
  const result = filterCandidatesPreservingWarrantyLinks([event, warranty], () => true);
  assert.deepEqual(result, [event, warranty]);
});

// Ask Cozy Stage 3, Phase 2 external review (implementation plan §8/§4.2;
// FRD §23's UPLOAD_EVIDENCE resolution).

function evidenceCandidate(overrides = {}) {
  return {
    category: 'EVIDENCE', documentId: 'doc-1',
    extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'irrelevant',
    linkedEventCandidateIndex: 0,
    ...overrides,
  };
}

test('accepts a well-formed EVIDENCE candidate', () => {
  const result = ExtractionCandidateSchema.safeParse(evidenceCandidate());
  assert.equal(result.success, true);
});

test('rejects an EVIDENCE candidate with an empty documentId', () => {
  const result = ExtractionCandidateSchema.safeParse(evidenceCandidate({ documentId: '' }));
  assert.equal(result.success, false);
});

test('filterCandidatesPreservingWarrantyLinks: dropping an earlier candidate remaps a later EVIDENCE\'s linkedEventCandidateIndex to its EVENT\'s new position (same remap guarantee as WARRANTY)', () => {
  const badFact = { category: 'FACT', factKey: 'core.yearBuilt', value: 'garbage', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' };
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Roof replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const evidence = evidenceCandidate({ linkedEventCandidateIndex: 1, sourceSentence: 'z' });
  // Original positions: badFact@0, event@1, evidence@2 (linkedEventCandidateIndex points at 1).
  const result = filterCandidatesPreservingWarrantyLinks([badFact, event, evidence], (c) => c !== badFact);
  assert.equal(result.length, 2);
  assert.equal(result[0].category, 'EVENT');
  assert.equal(result[1].category, 'EVIDENCE');
  assert.equal(result[1].linkedEventCandidateIndex, 0);
});

test('filterCandidatesPreservingWarrantyLinks: drops an EVIDENCE candidate outright if its paired EVENT did not survive the filter', () => {
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Roof replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const evidence = evidenceCandidate({ linkedEventCandidateIndex: 0 });
  const result = filterCandidatesPreservingWarrantyLinks([event, evidence], (c) => c !== event);
  assert.equal(result.length, 0);
});

test('filterCandidatesPreservingWarrantyLinks: a WARRANTY and an EVIDENCE candidate in the same batch each keep their own independent linkedEventCandidateIndex remap', () => {
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Water heater install', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 1, sourceSentence: 'w' });
  const evidence = evidenceCandidate({ linkedEventCandidateIndex: 1, sourceSentence: 'e' });
  const badFact = { category: 'FACT', factKey: 'core.yearBuilt', value: 'garbage', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' };
  // Original positions: badFact@0, event@1, warranty@2, evidence@3.
  const result = filterCandidatesPreservingWarrantyLinks([badFact, event, warranty, evidence], (c) => c !== badFact);
  assert.equal(result.length, 3);
  assert.equal(result[0].category, 'EVENT');
  assert.equal(result[1].category, 'WARRANTY');
  assert.equal(result[1].linkedEventCandidateIndex, 0);
  assert.equal(result[2].category, 'EVIDENCE');
  assert.equal(result[2].linkedEventCandidateIndex, 0);
});

// Ask Cozy Stage 3, Phase 6 (implementation plan §12; FRD §21 "Goal Capture").
function goalCandidate(overrides = {}) {
  return {
    category: 'GOAL',
    decisionDefinitionId: 'SELL_HOLD_RENT',
    extractionConfidence: 0.85,
    attribution: 'FIRSTHAND',
    sourceSentence: "I'm thinking about selling next year",
    timeframeLabel: 'next year',
    ...overrides,
  };
}

test('accepts a well-formed GOAL candidate scoped to SELL_HOLD_RENT', () => {
  const result = ExtractionCandidateSchema.safeParse(goalCandidate());
  assert.equal(result.success, true);
});

test('accepts a GOAL candidate with no timeframeLabel stated (presentational only, optional)', () => {
  const result = ExtractionCandidateSchema.safeParse(goalCandidate({ timeframeLabel: undefined }));
  assert.equal(result.success, true);
});

test('rejects a GOAL candidate for any decisionDefinitionId other than SELL_HOLD_RENT -- this vertical slice is deliberately scoped, not every life-event goal at once', () => {
  const result = ExtractionCandidateSchema.safeParse(goalCandidate({ decisionDefinitionId: 'REFINANCE_OPPORTUNITY' }));
  assert.equal(result.success, false);
});

test('splitGoalCandidates: separates GOAL from FACT/EVENT/WARRANTY and remaps a surviving WARRANTY link when a GOAL candidate sits between it and its paired EVENT', () => {
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Furnace replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const goal = goalCandidate();
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 0, sourceSentence: 'z' });
  // Original positions: event@0, goal@1, warranty@2 (linkedEventCandidateIndex points at 0, still correct pre-split).
  const { nonGoalCandidates, goalCandidates } = splitGoalCandidates([event, goal, warranty]);
  assert.equal(goalCandidates.length, 1);
  assert.equal(goalCandidates[0], goal);
  assert.equal(nonGoalCandidates.length, 2);
  assert.equal(nonGoalCandidates[0].category, 'EVENT');
  assert.equal(nonGoalCandidates[1].category, 'WARRANTY');
  // event stayed at index 0 in the non-GOAL array (goal's removal was after
  // it), so the warranty's own linkedEventCandidateIndex is unchanged.
  assert.equal(nonGoalCandidates[1].linkedEventCandidateIndex, 0);
});

test('splitGoalCandidates: remaps a WARRANTY link correctly when the GOAL candidate sits BEFORE the EVENT it does not reference', () => {
  const goal = goalCandidate();
  const event = { category: 'EVENT', eventType: 'REPAIR', title: 'Furnace replacement', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const warranty = warrantyCandidate({ linkedEventCandidateIndex: 1, sourceSentence: 'z' });
  // Original positions: goal@0, event@1, warranty@2 (linkedEventCandidateIndex points at 1).
  const { nonGoalCandidates, goalCandidates } = splitGoalCandidates([goal, event, warranty]);
  assert.equal(goalCandidates.length, 1);
  assert.equal(nonGoalCandidates.length, 2);
  assert.equal(nonGoalCandidates[0].category, 'EVENT');
  assert.equal(nonGoalCandidates[1].category, 'WARRANTY');
  // event moved from index 1 to index 0 once the GOAL candidate ahead of it
  // was removed -- the surviving warranty's index must follow it, exactly
  // the same class of bug this program already fixed once for a dropped
  // invalid FACT candidate.
  assert.equal(nonGoalCandidates[1].linkedEventCandidateIndex, 0);
});

test('splitGoalCandidates: an all-GOAL batch produces an empty non-GOAL array, not an error', () => {
  const { nonGoalCandidates, goalCandidates } = splitGoalCandidates([goalCandidate(), goalCandidate({ sourceSentence: 'other' })]);
  assert.equal(nonGoalCandidates.length, 0);
  assert.equal(goalCandidates.length, 2);
});
