const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  runConversationalCaptureForTurn,
  isValidFactCandidateValue,
  filterValidCandidates,
  buildChildExecutionData,
  buildEventContentParameters,
} = require('../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9's extraction-trigger call
// site; FRD §10, §13). Runtime tests cover only the early-exit paths that
// return before ever touching the database (flag off, explicit dedup skip,
// pre-filter non-fire) -- these are genuinely pure/no-I/O up to that point,
// same reasoning as extractionPreFilter.test.js. Anything past the first
// DomainEvent write has no DB-mock harness in this codebase (same
// established gap as capturePropertyFact.ts/getPropertyContext.ts -- see
// captureConfirmWriteSafety.test.js's header) and is instead covered by the
// source-governance tests below.

test('returns no children when the feature flag is off, without touching the database', async () => {
  delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  const result = await runConversationalCaptureForTurn({
    userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
    message: 'I replaced the roof last summer for $14,500.', contextVersion: null, skipDueToRoutedCapture: false,
  });
  assert.deepEqual(result, []);
});

test('returns no children when the caller signals the routed operation already captured this turn (dedup), even with the flag on', async () => {
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';
  try {
    const result = await runConversationalCaptureForTurn({
      userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
      message: 'I replaced the roof last summer for $14,500.', contextVersion: null, skipDueToRoutedCapture: true,
    });
    assert.deepEqual(result, []);
  } finally {
    delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  }
});

test('returns no children when the pre-filter does not fire, even with the flag on', async () => {
  process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED = 'true';
  try {
    const result = await runConversationalCaptureForTurn({
      userId: 'user-1', sessionId: 'session-1', propertyId: 'property-1', parentExecutionId: 'execution-1',
      message: 'Should I refinance?', contextVersion: null, skipDueToRoutedCapture: false,
    });
    assert.deepEqual(result, []);
  } finally {
    delete process.env.ASK_CONVERSATIONAL_CAPTURE_ENABLED;
  }
});

const orchestratorSource = readFileSync(resolve(__dirname, '../../src/services/ask/askOrchestrator.service.ts'), 'utf8');

test('the extraction-trigger call site is independent of the routed answer (FRD §10) -- wrapped in its own try/catch so a capture-side failure cannot affect the turn\'s response', () => {
  const idx = orchestratorSource.indexOf('runConversationalCaptureForTurn({');
  assert.ok(idx > 0);
  const before = orchestratorSource.slice(Math.max(0, idx - 400), idx);
  assert.match(before, /try \{/);
  const after = orchestratorSource.slice(idx, idx + 900);
  assert.match(after, /catch \(error\) \{/);
});

// Code review finding (2026-09-13): the call site previously ALSO gated on
// !routingDecision.requiresClarification and result.status !== 'NEEDS_CONFIRMATION'
// -- an invented UX simplification that violated FRD §10's explicit "routing
// succeeding or failing does not gate extraction," silently dropping an
// independent home fact stated alongside an ambiguous or confirmation-
// requiring command. The only remaining gate is executionPropertyId.
test('the extraction-trigger call site is gated ONLY on executionPropertyId -- routing outcome never suppresses it (FRD §10)', () => {
  const idx = orchestratorSource.indexOf('runConversationalCaptureForTurn({');
  const guardStart = orchestratorSource.lastIndexOf('if (', idx);
  const guard = orchestratorSource.slice(guardStart, orchestratorSource.indexOf(') {', guardStart) + 3);
  assert.equal(guard, 'if (executionPropertyId) {');
});

test('skipDueToRoutedCapture is derived from the routed operation completing a material write this same turn, not from operationId alone', () => {
  const idx = orchestratorSource.indexOf('skipDueToRoutedCapture:');
  assert.ok(idx > 0);
  const line = orchestratorSource.slice(idx, orchestratorSource.indexOf('\n', idx));
  assert.match(line, /operationDefinition\.safetyClass === 'MATERIAL_DECISION'/);
  assert.match(line, /result\.status === 'COMPLETED'/);
});

test('mapPersistedExecution threads childExecutions through, defaulting to empty for every other call site', () => {
  const idx = orchestratorSource.indexOf('function mapPersistedExecution(');
  assert.ok(idx > 0);
  const signature = orchestratorSource.slice(idx, orchestratorSource.indexOf('): AskExecutionResponse {', idx));
  assert.match(signature, /childExecutions: AskExecutionResponse\[\] = \[\]/);
});

// Code review findings (2026-09-13): source-governance tests for
// persistCandidates, which touches the database directly and has no
// runtime-mocked test harness in this codebase for this class of function
// (same established gap as capturePropertyFact.ts -- see
// captureConfirmWriteSafety.test.js's header).
const captureSource = readFileSync(resolve(__dirname, '../../src/services/ask/conversationalUnderstanding/conversationalCapture.ts'), 'utf8');

test('persistCandidates always verifies the claim token and marks the DomainEvent PROCESSED inside the SAME transaction that creates the candidates -- no separate, non-atomic completion write', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  // No markProcessed parameter anymore -- both the inline and worker paths
  // go through the exact same unconditional path.
  assert.doesNotMatch(body, /markProcessed/);
  const txIdx = body.indexOf('return prisma.$transaction(async (tx) => {');
  assert.ok(txIdx > 0);
  const verifyIdx = body.indexOf('await verifyClaimStillOwned(tx, domainEventId, claimedAttempts);', txIdx);
  const processedIdx = body.indexOf("status: 'PROCESSED'", txIdx);
  assert.ok(verifyIdx > txIdx, 'claim verification must happen inside the transaction');
  assert.ok(processedIdx > verifyIdx, 'marking PROCESSED must happen inside the same transaction, after verifying the claim');
  // No special-cased early return for zero candidates anymore -- the
  // zero-candidate case now goes through the exact same transaction+verify
  // path as the non-empty case (the review's "empty-result path also needs
  // claim-token verification" finding).
  assert.doesNotMatch(body, /if \(candidates\.length === 0\)/);
});

test('persistCandidates filters candidates through filterValidCandidates before ever building a confirmation card', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /const candidates = filterValidCandidates\(rawCandidates\);/);
});

test('isValidFactCandidateValue: financing rate is validated against its own 0-100 percent bound', () => {
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'financial.currentMortgage', value: 6.75, extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), true);
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'financial.currentMortgage', value: -5, extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), false);
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'financial.currentMortgage', value: 'six point seven five', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), false);
});

test('isValidFactCandidateValue: a general catalog fact is validated with the exact same normalizeCaptureValue the confirm-time writer uses', () => {
  // core.yearBuilt expects a nullable non-negative integer.
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'core.yearBuilt', value: 1998, extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), true);
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'core.yearBuilt', value: 'not a year', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), false);
  // structure.roofType expects a RoofType enum value (schema.prisma: SHINGLE|TILE|FLAT|METAL|UNKNOWN).
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'structure.roofType', value: 'SHINGLE', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), true);
  assert.equal(isValidFactCandidateValue({ category: 'FACT', factKey: 'structure.roofType', value: 'NOT_A_REAL_ROOF_TYPE', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' }), false);
});

test('filterValidCandidates drops an invalid FACT candidate but keeps a valid EVENT candidate alongside it', () => {
  const invalidFact = { category: 'FACT', factKey: 'core.yearBuilt', value: 'garbage', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'x' };
  const validEvent = { category: 'EVENT', eventType: 'REPAIR', title: 'Roof repair', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const filtered = filterValidCandidates([invalidFact, validEvent]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].category, 'EVENT');
});

test('buildChildExecutionData threads correctingEventId into the EVENT parameters, and titles the card as an update rather than an add', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: null, skipDueToRoutedCapture: false };
  const correctingCandidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'Roof replacement', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that roof replacement cost $15,000.',
    correctingEventId: 'event-1', correctedFields: ['amount'], amount: 15000, currency: 'USD',
  };
  const data = buildChildExecutionData(correctingCandidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(data.parametersJson.correctingEventId, 'event-1');
  assert.match(data.resultJson.confirmation.title, /Update/);
  assert.doesNotMatch(data.resultJson.confirmation.title, /^Add /);
});

// Code review finding (2026-09-13): the exact reproduced defect -- a
// cost-only correction previously ALSO set date to "now", precision to
// UNKNOWN, and provider/summary/dateRange to null, which updateHomeEvent's
// patch.X !== undefined ? patch.X : existing.X logic then treats as
// explicit, intentional overwrites of the original event's real values.
test('buildEventContentParameters: a correction naming only ["amount"] includes ONLY amount -- title/date/provider/summary/currency are OMITTED, not nulled, so the original record survives untouched', () => {
  const correctingCandidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'placeholder title the model had to fill in', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that roof replacement cost $15,000.',
    correctingEventId: 'event-1', correctedFields: ['amount'], amount: 15000, currency: 'USD',
    summary: null, providerName: null, occurredAt: null, dateRangeStart: null, dateRangeEnd: null,
  };
  const params = buildEventContentParameters(correctingCandidate, new Date('2026-09-13T00:00:00.000Z'));
  assert.deepEqual(params, { amount: 15000 });
  assert.equal('title' in params, false);
  assert.equal('occurredAt' in params, false);
  assert.equal('datePrecision' in params, false);
  assert.equal('dateRangeStart' in params, false);
  assert.equal('dateRangeEnd' in params, false);
  assert.equal('providerName' in params, false);
  assert.equal('summary' in params, false);
  assert.equal('currency' in params, false, 'currency is a distinct correctable field from amount -- correcting the amount alone must not also touch currency');
  assert.equal('type' in params, false);
});

test('buildEventContentParameters: correctedFields: ["date"] bundles occurredAt/datePrecision/dateRangeStart/dateRangeEnd together, and nothing else', () => {
  const correctingCandidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'placeholder', datePrecision: 'YEAR',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that was in 2023, not 2024.',
    correctingEventId: 'event-1', correctedFields: ['date'], occurredAt: '2023-06-01T00:00:00.000Z',
  };
  const params = buildEventContentParameters(correctingCandidate, new Date('2026-09-13T00:00:00.000Z'));
  assert.deepEqual(Object.keys(params).sort(), ['dateRangeEnd', 'dateRangeStart', 'datePrecision', 'occurredAt'].sort());
  assert.equal(params.occurredAt, '2023-06-01T00:00:00.000Z');
  assert.equal(params.datePrecision, 'YEAR');
});

test('buildEventContentParameters: a NEW event (correctingEventId null) still includes every content field, unchanged from before this fix', () => {
  const newCandidate = {
    category: 'EVENT', eventType: 'REPAIR', title: 'HVAC service', datePrecision: 'EXACT_DATE',
    extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'I serviced the HVAC yesterday for $275.',
    correctingEventId: null, occurredAt: '2026-09-12T00:00:00.000Z', amount: 275, currency: 'USD', providerName: null, summary: null,
  };
  const params = buildEventContentParameters(newCandidate, new Date('2026-09-13T00:00:00.000Z'));
  for (const field of ['type', 'title', 'summary', 'occurredAt', 'datePrecision', 'dateRangeStart', 'dateRangeEnd', 'amount', 'currency', 'providerName']) {
    assert.ok(field in params, `expected new-event parameters to include ${field}`);
  }
});

test('a correction candidate with correctingEventId set but no correctedFields (or an empty array) is dropped by withValidCorrectionReferences, not silently accepted as a no-op patch', () => {
  const { withValidCorrectionReferences } = require('../../src/services/ask/conversationalUnderstanding/extractionContract.ts');
  const noFieldsNamed = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'x', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'x', correctingEventId: 'event-1', correctedFields: [],
  };
  const { candidates, invalidReferenceCount } = withValidCorrectionReferences([noFieldsNamed], new Set(['event-1']));
  assert.equal(candidates.length, 0);
  assert.equal(invalidReferenceCount, 1);
});

test('buildChildExecutionData sets correctingEventId to null (not undefined) for a brand-new EVENT candidate, and titles the card as an add', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: null, skipDueToRoutedCapture: false };
  const newCandidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'Roof replacement', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'I replaced the roof last summer.',
    correctingEventId: null,
  };
  const data = buildChildExecutionData(newCandidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(data.parametersJson.correctingEventId, null);
  assert.match(data.resultJson.confirmation.title, /^Add /);
});
