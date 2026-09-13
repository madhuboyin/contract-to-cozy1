const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const {
  runConversationalCaptureForTurn,
  isValidFactCandidateValue,
  isValidGoalCandidate,
  MIN_GOAL_EXTRACTION_CONFIDENCE,
  filterValidCandidates,
  buildChildExecutionData,
  buildEventContentParameters,
  resolveWarrantyDates,
  editCaptureFactCandidate,
  editCaptureEventCandidate,
  editCaptureWarrantyCandidate,
  GoalCandidateAttachPayloadSchema,
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
  // Ask Cozy Stage 3, Phase 6: no longer a bare `return prisma.$transaction(...)`
  // -- the transaction's result is destructured into `{ created, goalAttachEvents }`.
  // The invariant this test actually checks (claim verification happens
  // before marking PROCESSED, inside the same transaction) is unchanged.
  const txIdx = body.indexOf('await prisma.$transaction(async (tx) => {');
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

// External review, Phase 6 [P2] (FRD §21): goal-candidate attachment lost
// the goal entirely on a crash/DB error, because the triggering
// ASK_EXTRACTION_REQUESTED event was already marked PROCESSED (its own
// payload already overwritten) by the time processGoalCandidate ran,
// outside the transaction, with no retry path. Fixed with a durable,
// retryable ASK_GOAL_CANDIDATE_ATTACH_REQUESTED DomainEvent per candidate,
// created atomically inside the SAME transaction as the FACT/EVENT/WARRANTY
// rows and the PROCESSED marking above -- these tests cover that ordering
// and the new event's own claim/complete/fail lifecycle.
test('requestGoalCandidateAttachment is called inside the transaction, before the PROCESSED marking, for each goal candidate', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  const txIdx = body.indexOf('await prisma.$transaction(async (tx) => {');
  const goalAttachLoopIdx = body.indexOf('await requestGoalCandidateAttachment(tx, candidate, index, input)', txIdx);
  const processedIdx = body.indexOf("status: 'PROCESSED'", txIdx);
  assert.ok(goalAttachLoopIdx > txIdx, 'goal-attach events must be requested inside the transaction');
  assert.ok(processedIdx > goalAttachLoopIdx, 'the triggering event is marked PROCESSED only after goal-attach events are durably requested');
});

test('persistCandidates dispatches goal-attach events via claimAndProcessGoalAttachEvent after the transaction, not the old direct processGoalCandidates call', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /await claimAndProcessGoalAttachEvent\(event\.id\)/);
  assert.doesNotMatch(body, /processGoalCandidates\(/, 'the old batch function should no longer exist as a call site');
});

test('processGoalCandidateAttachEvent parses the durable payload, calls processGoalCandidate, and marks its own event PROCESSED guarded on claimedAttempts', () => {
  const idx = captureSource.indexOf('export async function processGoalCandidateAttachEvent(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /GoalCandidateAttachPayloadSchema\.parse\(event\.payload\)/);
  assert.match(body, /await processGoalCandidate\(candidate, payload\.index, input\)/);
  assert.match(body, /where: \{ id: event\.id, attempts: claimedAttempts \}/);
  assert.match(body, /status: 'PROCESSED'/);
});

test('claimAndProcessGoalAttachEvent claims PENDING -> PROCESSING before processing, and marks FAILED with backoff on failure -- never silently drops the event', () => {
  const idx = captureSource.indexOf('async function claimAndProcessGoalAttachEvent(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /status: 'PENDING', availableAt: \{ lte: now \}/);
  assert.match(body, /status: 'PROCESSING', attempts: \{ increment: 1 \}/);
  assert.match(body, /status: 'FAILED'/);
  assert.match(body, /availableAt: new Date\(Date\.now\(\) \+ 60_000\)/);
});

test('the new ASK_GOAL_CANDIDATE_ATTACH_REQUESTED event is idempotent per (parentExecutionId, index), the same deterministic-identity convention every other candidate-derived row uses', () => {
  const idx = captureSource.indexOf('async function requestGoalCandidateAttachment(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /const idempotencyKey = `ask-goal-attach:\$\{input\.parentExecutionId\}:\$\{index\}`;/);
  assert.match(body, /type: 'ASK_GOAL_CANDIDATE_ATTACH_REQUESTED' as any/);
  assert.match(body, /status: 'PENDING'/);
});

test('GoalCandidateAttachPayloadSchema accepts a well-formed payload and rejects a malformed one, rather than trusting a stored DomainEvent.payload blindly', () => {
  const valid = {
    payloadVersion: 1,
    parentExecutionId: 'execution-1',
    index: 0,
    userId: 'user-1',
    sessionId: 'session-1',
    propertyId: 'property-1',
    contextVersion: 'v1',
    candidate: {
      decisionDefinitionId: 'SELL_HOLD_RENT',
      timeframeLabel: 'next year',
      sourceSentence: 'I am thinking about selling next year.',
      extractionConfidence: 0.9,
      attribution: 'FIRSTHAND',
    },
  };
  assert.deepEqual(GoalCandidateAttachPayloadSchema.parse(valid), valid);
  assert.doesNotThrow(() => GoalCandidateAttachPayloadSchema.parse({ ...valid, contextVersion: null, candidate: { ...valid.candidate, timeframeLabel: null } }));
  assert.throws(() => GoalCandidateAttachPayloadSchema.parse({ ...valid, candidate: { ...valid.candidate, decisionDefinitionId: 'RENOVATION' } }));
  assert.throws(() => GoalCandidateAttachPayloadSchema.parse({ ...valid, candidate: { ...valid.candidate, extractionConfidence: 1.5 } }));
  assert.throws(() => GoalCandidateAttachPayloadSchema.parse({ ...valid, index: -1 }));
});

// External review, Phase 6 [P1] (FRD §21): "a GOAL candidate only
// creates/attaches a thread when the pre-filter+extraction combination
// reaches its normal confidence bar for the GOAL category" -- verified a
// GOAL candidate with extractionConfidence: 0 previously passed schema and
// candidate validation with no gate at all.
test('isValidGoalCandidate enforces MIN_GOAL_EXTRACTION_CONFIDENCE -- a confidence-0 goal is rejected, avoiding a thread from a casual mention', () => {
  const goal = (extractionConfidence) => ({ category: 'GOAL', decisionDefinitionId: 'SELL_HOLD_RENT', timeframeLabel: null, extractionConfidence, attribution: 'FIRSTHAND', sourceSentence: 'x' });
  assert.equal(isValidGoalCandidate(goal(0)), false);
  assert.equal(isValidGoalCandidate(goal(MIN_GOAL_EXTRACTION_CONFIDENCE - 0.01)), false);
  assert.equal(isValidGoalCandidate(goal(MIN_GOAL_EXTRACTION_CONFIDENCE)), true);
  assert.equal(isValidGoalCandidate(goal(1)), true);
});

test('filterValidCandidates drops a low-confidence GOAL candidate but keeps a valid one alongside it, preserving a later WARRANTY\'s linkedEventCandidateIndex', () => {
  const lowConfidenceGoal = { category: 'GOAL', decisionDefinitionId: 'SELL_HOLD_RENT', timeframeLabel: null, extractionConfidence: 0, attribution: 'FIRSTHAND', sourceSentence: 'maybe someday' };
  const validEvent = { category: 'EVENT', eventType: 'REPAIR', title: 'Roof repair', datePrecision: 'UNKNOWN', extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'y', correctingEventId: null };
  const validWarranty = { category: 'WARRANTY', providerName: 'Acme', warrantyCategory: 'ROOFING', extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'z', linkedEventCandidateIndex: 1, durationMonths: 12 };
  const filtered = filterValidCandidates([lowConfidenceGoal, validEvent, validWarranty]);
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].category, 'EVENT');
  assert.equal(filtered[1].category, 'WARRANTY');
  // The EVENT shifted from index 1 to index 0 once the GOAL was dropped --
  // the WARRANTY's own link must have been remapped to follow it, not left
  // pointing at its original (now-wrong) index.
  assert.equal(filtered[1].linkedEventCandidateIndex, 0);
});

test('filterValidCandidates keeps a GOAL candidate at or above the confidence bar', () => {
  const goodGoal = { category: 'GOAL', decisionDefinitionId: 'SELL_HOLD_RENT', timeframeLabel: 'next year', extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'I am thinking about selling next year.' };
  const filtered = filterValidCandidates([goodGoal]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].category, 'GOAL');
});

test('persistCandidates filters candidates through filterValidCandidates before ever building a confirmation card', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /const validCandidates = filterValidCandidates\(rawCandidates\);/);
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

// Ask Cozy Stage 3, Phase 3 warranty capture writer (implementation plan §9/§22).

function warrantyCandidate(overrides = {}) {
  return {
    category: 'WARRANTY', providerName: 'Carrier', warrantyCategory: 'HVAC',
    extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'We installed a new furnace last month, it has a 10 year warranty from Carrier.',
    linkedEventCandidateIndex: 0, durationMonths: 120,
    ...overrides,
  };
}

test('resolveWarrantyDates: an explicit expiryDate is used as-is', () => {
  const { startDate, expiryDate, startDateApproximate } = resolveWarrantyDates(
    warrantyCandidate({ startDate: '2026-08-01T00:00:00.000Z', durationMonths: undefined, expiryDate: '2036-08-01T00:00:00.000Z' }),
    null,
    new Date('2026-09-13T00:00:00.000Z'),
  );
  assert.equal(startDate.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(expiryDate.toISOString(), '2036-08-01T00:00:00.000Z');
  // A homeowner-stated startDate is never a guess.
  assert.equal(startDateApproximate, false);
});

// Code review finding (2026-09-13, [P1]): "last summer" (a RANGE-precision
// event) was silently becoming an exact warranty start date with no
// indication it was ever a guess. These four cases cover every branch of
// the exact-vs-approximate distinction.
test('resolveWarrantyDates: an EXACT_DATE-precision paired event\'s occurredAt is treated as exact, not approximate', () => {
  const linkedEvent = { category: 'EVENT', occurredAt: '2026-08-15T00:00:00.000Z', dateRangeStart: null, datePrecision: 'EXACT_DATE' };
  const { startDateApproximate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), linkedEvent, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDateApproximate, false);
});

test('resolveWarrantyDates: a YEAR/MONTH-precision paired event\'s occurredAt is flagged approximate -- it is only a best-guess anchor within that period, not a stated exact day', () => {
  const linkedEvent = { category: 'EVENT', occurredAt: '2026-06-15T00:00:00.000Z', dateRangeStart: null, datePrecision: 'YEAR' };
  const { startDateApproximate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), linkedEvent, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDateApproximate, true);
});

test('resolveWarrantyDates: a RANGE-precision paired event\'s dateRangeStart is flagged approximate -- the exact reproduction from the finding ("last summer" -> a fabricated exact start)', () => {
  const linkedEvent = { category: 'EVENT', occurredAt: null, dateRangeStart: '2025-06-01T00:00:00.000Z', datePrecision: 'RANGE' };
  const { startDate, startDateApproximate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), linkedEvent, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDate.toISOString(), '2025-06-01T00:00:00.000Z');
  assert.equal(startDateApproximate, true);
});

test('resolveWarrantyDates: the "now" fallback (no date information at all) is flagged approximate', () => {
  const { startDateApproximate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), null, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDateApproximate, true);
});

test('resolveWarrantyDates: durationMonths computes expiryDate from startDate when expiryDate is not stated', () => {
  const { startDate, expiryDate } = resolveWarrantyDates(
    warrantyCandidate({ startDate: '2026-08-01T00:00:00.000Z', durationMonths: 120 }),
    null,
    new Date('2026-09-13T00:00:00.000Z'),
  );
  assert.equal(startDate.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(expiryDate.getUTCFullYear(), 2036);
  assert.equal(expiryDate.getUTCMonth(), startDate.getUTCMonth());
});

test('resolveWarrantyDates: startDate defaults to the paired EVENT candidate\'s occurredAt when the warranty does not separately state one', () => {
  const linkedEvent = { category: 'EVENT', occurredAt: '2026-08-15T00:00:00.000Z', dateRangeStart: null };
  const { startDate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), linkedEvent, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDate.toISOString(), '2026-08-15T00:00:00.000Z');
});

test('resolveWarrantyDates: falls back to the paired EVENT\'s dateRangeStart, then now, when neither the warranty nor the event has an occurredAt', () => {
  const linkedEvent = { category: 'EVENT', occurredAt: null, dateRangeStart: '2026-06-01T00:00:00.000Z' };
  const { startDate } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), linkedEvent, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(startDate.toISOString(), '2026-06-01T00:00:00.000Z');

  const { startDate: fallbackToNow } = resolveWarrantyDates(warrantyCandidate({ startDate: undefined }), null, new Date('2026-09-13T00:00:00.000Z'));
  assert.equal(fallbackToNow.toISOString(), '2026-09-13T00:00:00.000Z');
});

test('buildChildExecutionData: a WARRANTY candidate produces a CAPTURE_WARRANTY_CONFIRM child with the resolved dates in its parameters', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: null, skipDueToRoutedCapture: false };
  const linkedEvent = { category: 'EVENT', occurredAt: '2026-08-15T00:00:00.000Z', dateRangeStart: null };
  const candidate = warrantyCandidate({ startDate: undefined, policyNumber: 'POL-123', cost: 450 });
  const data = buildChildExecutionData(candidate, 1, input, new Date('2026-09-13T00:00:00.000Z'), linkedEvent);
  assert.equal(data.operationId, 'CAPTURE_WARRANTY_CONFIRM');
  assert.equal(data.reasonCode, 'WARRANTY_CAPTURE_CONFIRMATION_REQUIRED');
  assert.equal(data.parametersJson.providerName, 'Carrier');
  assert.equal(data.parametersJson.category, 'HVAC');
  assert.equal(data.parametersJson.policyNumber, 'POL-123');
  assert.equal(data.parametersJson.cost, 450);
  assert.equal(data.parametersJson.startDate, '2026-08-15T00:00:00.000Z');
  assert.equal(new Date(data.parametersJson.expiryDate).getUTCFullYear(), 2036);
  assert.match(data.resultJson.confirmation.title, /warranty/i);
});

// Source-governance test (same class as this file's other persistCandidates
// coverage): persistCandidates has no runtime DB-mock harness, so the
// sibling-linking wiring this warranty writer needs is verified against the
// source directly, matching this file's own established convention.
test('persistCandidates wires a WARRANTY child\'s linkedExecutionId to its paired EVENT child\'s, bidirectionally, inside the same transaction, and only when neither side is already linked', () => {
  const idx = captureSource.indexOf('async function persistCandidates(');
  assert.ok(idx > 0);
  const body = captureSource.slice(idx, captureSource.indexOf('\n}\n', idx));
  assert.match(body, /candidate\.category !== 'WARRANTY'/);
  assert.match(body, /if \(warrantyExecution\.linkedExecutionId \|\| eventExecution\.linkedExecutionId\) continue;/);
  assert.match(body, /data: \{ linkedExecutionId: warrantyExecution\.id \}/);
  assert.match(body, /data: \{ linkedExecutionId: eventExecution\.id \}/);
});

// Ask Cozy Stage 3, Phase 3 edit-before-confirm (FRD §22: "candidate payload
// is editable via the existing captureRequests/suppliedInput mechanism
// before the confirm call, not a separate edit endpoint").

test('buildChildExecutionData: a FACT candidate carries a CAPTURE_FACT_EDIT captureRequest with the current value pre-filled', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: 'ctx-1', skipDueToRoutedCapture: false };
  const candidate = { category: 'FACT', factKey: 'core.yearBuilt', value: 1998, extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'My home was built in 1998.' };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  const requests = data.resultJson.captureRequests;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].captureKey, 'CAPTURE_FACT_EDIT');
  assert.equal(requests[0].requirementId, 'capture-fact-edit');
  assert.equal(requests[0].expectedContextVersion, 'ctx-1');
  assert.deepEqual(requests[0].currentAnswer, { value: 1998 });
  // Regression: 'ENHANCEMENT_ACCURACY' was tried first and reverted --
  // AskWorkspace.tsx renders a wrongly-labeled "Use general estimate"
  // dismiss button for that classification (fitting for a feature-context
  // estimate fallback, nonsensical for editing a capture candidate) and
  // fires a premature `property-context:updated` DOM event on submit (that
  // event is suppressed only for WORKFLOW_INPUT/SCENARIO_INPUT/PREFERENCE_INPUT
  // -- appropriate here since an edit never itself writes to PropertyContext,
  // only an actual confirm does). 'SCENARIO_INPUT' also renders the correct
  // "Save and update answer" submit label.
  assert.equal(requests[0].classification, 'SCENARIO_INPUT');
});

test('buildChildExecutionData: a NEW EVENT candidate\'s captureRequest exposes all five editable fields; a null contextVersion falls back to the shared "unversioned" placeholder', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: null, skipDueToRoutedCapture: false };
  const candidate = {
    category: 'EVENT', eventType: 'REPAIR', title: 'HVAC service', datePrecision: 'EXACT_DATE',
    occurredAt: '2026-09-12T00:00:00.000Z', amount: 275, currency: 'USD', providerName: 'Acme HVAC', summary: 'Annual service',
    extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'I serviced the HVAC yesterday for $275.', correctingEventId: null,
  };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  const request = data.resultJson.captureRequests[0];
  assert.equal(request.captureKey, 'CAPTURE_EVENT_EDIT');
  assert.equal(request.expectedContextVersion, 'unversioned');
  assert.deepEqual(request.inputSchema.fields.map((field) => field.key).sort(), ['amount', 'providerName', 'summary', 'title', 'type']);
  assert.equal(request.currentAnswer.title, 'HVAC service');
  assert.equal(request.currentAnswer.amount, 275);
});

test('buildChildExecutionData: a correction EVENT candidate\'s captureRequest exposes ONLY the corrected field(s), matching the sparse patch itself', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: 'ctx-1', skipDueToRoutedCapture: false };
  const candidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'placeholder', datePrecision: 'UNKNOWN',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that roof replacement cost $15,000.',
    correctingEventId: 'event-1', correctedFields: ['amount'], amount: 15000, currency: 'USD',
  };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  const request = data.resultJson.captureRequests[0];
  assert.deepEqual(request.inputSchema.fields.map((field) => field.key), ['amount']);
  assert.equal(request.currentAnswer.amount, 15000);
});

test('buildChildExecutionData: a correction EVENT candidate whose only corrected field is "date" (outside edit scope) carries NO captureRequest, not an empty-fields one', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: 'ctx-1', skipDueToRoutedCapture: false };
  const candidate = {
    category: 'EVENT', eventType: 'IMPROVEMENT', title: 'placeholder', datePrecision: 'YEAR',
    extractionConfidence: 0.8, attribution: 'FIRSTHAND', sourceSentence: 'Actually, that was in 2023, not 2024.',
    correctingEventId: 'event-1', correctedFields: ['date'], occurredAt: '2023-06-01T00:00:00.000Z',
  };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  assert.deepEqual(data.resultJson.captureRequests, []);
});

test('buildChildExecutionData: a WARRANTY candidate\'s captureRequest exposes provider/category/policyNumber/coverageDetails/cost with current values pre-filled', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: 'ctx-1', skipDueToRoutedCapture: false };
  const candidate = {
    category: 'WARRANTY', providerName: 'Carrier', warrantyCategory: 'HVAC', policyNumber: 'POL-123', coverageDetails: 'Parts and labor', cost: 450,
    extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'We installed a new furnace, it has a 10 year warranty from Carrier.',
    linkedEventCandidateIndex: 0, durationMonths: 120,
  };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'));
  const request = data.resultJson.captureRequests[0];
  assert.equal(request.captureKey, 'CAPTURE_WARRANTY_EDIT');
  // Code review finding (2026-09-13, [P1]): dates are now editable (see
  // resolveWarrantyDates's own header on why a manufactured guess must be
  // correctable, not just labeled).
  assert.deepEqual(request.inputSchema.fields.map((field) => field.key), ['providerName', 'category', 'policyNumber', 'coverageDetails', 'cost', 'startDate', 'expiryDate']);
  assert.equal(request.currentAnswer.providerName, 'Carrier');
  assert.equal(request.currentAnswer.category, 'HVAC');
  assert.equal(request.currentAnswer.policyNumber, 'POL-123');
  assert.equal(request.currentAnswer.coverageDetails, 'Parts and labor');
  assert.equal(request.currentAnswer.cost, 450);
  assert.match(request.currentAnswer.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(request.currentAnswer.expiryDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('buildChildExecutionData: a WARRANTY candidate whose start date was only derivable via fallback (not stated) labels it estimated and flags startDateApproximate in the stored parameters', () => {
  const input = { userId: 'u1', sessionId: 's1', propertyId: 'p1', parentExecutionId: 'e1', message: 'irrelevant', contextVersion: 'ctx-1', skipDueToRoutedCapture: false };
  const linkedEvent = { category: 'EVENT', occurredAt: null, dateRangeStart: '2025-06-01T00:00:00.000Z', datePrecision: 'RANGE' };
  const candidate = {
    category: 'WARRANTY', providerName: 'Carrier', warrantyCategory: 'HVAC', policyNumber: null, coverageDetails: null, cost: null,
    extractionConfidence: 0.85, attribution: 'FIRSTHAND', sourceSentence: 'We installed a new furnace last summer, it has a 10 year warranty from Carrier.',
    linkedEventCandidateIndex: 0, durationMonths: 120, startDate: undefined,
  };
  const data = buildChildExecutionData(candidate, 0, input, new Date('2026-09-13T00:00:00.000Z'), linkedEvent);
  assert.equal(data.parametersJson.startDateApproximate, true);
  const request = data.resultJson.captureRequests[0];
  assert.match(request.question, /estimate/i);
  assert.match(request.inputSchema.fields.find((field) => field.key === 'startDate').label, /estimated/i);
  assert.match(data.resultJson.confirmation.fields.find((field) => /Start date/.test(field.label)).label, /estimated/i);
});

test('editCaptureFactCandidate: a valid edited value produces a fresh NEEDS_CONFIRMATION result with the new value in both parameters and the confirmation card', () => {
  const storedParameters = { factKey: 'core.yearBuilt', value: 1998, sourceType: 'USER_REPORTED', attribution: 'FIRSTHAND', captureChannel: 'ASK_CONVERSATIONAL_CAPTURE', extractionConfidence: 0.9, confirmationVersion: 1, confirmationExpiresAt: '2026-09-13T00:30:00.000Z' };
  const result = editCaptureFactCandidate(storedParameters, 'My home was built in 1998.', 'ctx-1', { value: 2001 }, new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(result);
  assert.equal(result.status, 'NEEDS_CONFIRMATION');
  assert.equal(result.parameters.value, 2001);
  assert.equal(result.parameters.factKey, 'core.yearBuilt');
  assert.match(result.confirmation.fields.find((field) => field.label === 'Value').value, /2001/);
  assert.equal(result.captureRequests[0].currentAnswer.value, 2001);
});

// Code review finding (2026-09-13, [P1]): every edit previously rebuilt the
// confirmation card with a hardcoded version: 1, identical to the version
// already stored before the edit -- confirmAskExecution's only defense
// against a stale confirmation attempt (`expectedVersion !== input.confirmationVersion`)
// was reproducibly a no-op, since both sides trivially matched. An older,
// pre-edit card could therefore authorize the newly edited value the
// homeowner never actually reviewed.
test('editCaptureFactCandidate: increments confirmationVersion past whatever was stored before the edit, in both the stored parameters and the confirmation card itself', () => {
  const storedParameters = { factKey: 'core.yearBuilt', value: 1998, attribution: 'FIRSTHAND', extractionConfidence: 0.9, confirmationVersion: 1 };
  const result = editCaptureFactCandidate(storedParameters, 'My home was built in 1998.', 'ctx-1', { value: 2001 }, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result.parameters.confirmationVersion, 2);
  assert.equal(result.confirmation.version, 2);
  // A second edit on top of the first increments again, not back to 2.
  const secondResult = editCaptureFactCandidate({ ...storedParameters, confirmationVersion: 2, value: 2001 }, 'My home was built in 1998.', 'ctx-1', { value: 2002 }, new Date('2026-09-13T01:05:00.000Z'));
  assert.equal(secondResult.parameters.confirmationVersion, 3);
  assert.equal(secondResult.confirmation.version, 3);
});

test('editCaptureFactCandidate: treats a missing stored confirmationVersion as 0, so the first edit still produces version 1 (never version NaN)', () => {
  const storedParameters = { factKey: 'core.yearBuilt', value: 1998, attribution: 'FIRSTHAND', extractionConfidence: 0.9 };
  const result = editCaptureFactCandidate(storedParameters, 'irrelevant', 'ctx-1', { value: 2001 }, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result.parameters.confirmationVersion, 1);
  assert.equal(result.confirmation.version, 1);
});

test('editCaptureEventCandidate: also increments confirmationVersion past whatever was stored before the edit', () => {
  const storedParameters = { correctingEventId: 'event-1', amount: 15000, currency: 'USD', attribution: 'FIRSTHAND', confirmationVersion: 1 };
  const result = editCaptureEventCandidate(storedParameters, 'irrelevant', 'ctx-1', { amount: 15200 }, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result.parameters.confirmationVersion, 2);
  assert.equal(result.confirmation.version, 2);
});

test('editCaptureFactCandidate: an invalid edited value (fails the same normalizeCaptureValue check used at proposal time) is rejected, not silently accepted', () => {
  const storedParameters = { factKey: 'core.yearBuilt', value: 1998, attribution: 'FIRSTHAND', extractionConfidence: 0.9 };
  const result = editCaptureFactCandidate(storedParameters, 'irrelevant', 'ctx-1', { value: 'not a year' }, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

test('editCaptureFactCandidate: an answer missing the "value" key is rejected', () => {
  const storedParameters = { factKey: 'core.yearBuilt', value: 1998, attribution: 'FIRSTHAND', extractionConfidence: 0.9 };
  const result = editCaptureFactCandidate(storedParameters, 'irrelevant', 'ctx-1', {}, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

test('editCaptureEventCandidate: editing a correction execution whose only stored field is "amount" accepts a new amount and re-derives currency, and its captureRequest still offers only "amount"', () => {
  const storedParameters = { correctingEventId: 'event-1', amount: 15000, currency: 'USD', attribution: 'FIRSTHAND', captureChannel: 'ASK_CONVERSATIONAL_CAPTURE', extractionConfidence: 0.8 };
  const result = editCaptureEventCandidate(storedParameters, 'Actually, that roof replacement cost $15,000.', 'ctx-1', { amount: 15200 }, new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(result);
  assert.equal(result.parameters.amount, 15200);
  assert.equal(result.parameters.currency, 'USD');
  assert.match(result.confirmation.title, /Update/);
  assert.deepEqual(result.captureRequests[0].inputSchema.fields.map((f) => f.key), ['amount']);
});

test('editCaptureEventCandidate: rejects an answer naming a field this execution never had (e.g. "title" on an amount-only correction) -- the edit form only ever offers what the captureRequest itself exposed', () => {
  const storedParameters = { correctingEventId: 'event-1', amount: 15000, currency: 'USD', attribution: 'FIRSTHAND' };
  const result = editCaptureEventCandidate(storedParameters, 'irrelevant', 'ctx-1', { amount: 15200, title: 'Roof replacement' }, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

test('editCaptureEventCandidate: a new (non-correction) event accepts a full edit across all five editable fields', () => {
  const storedParameters = {
    correctingEventId: null, type: 'REPAIR', title: 'HVAC service', summary: 'Annual service', amount: 275, currency: 'USD', providerName: 'Acme HVAC',
    occurredAt: '2026-09-12T00:00:00.000Z', datePrecision: 'EXACT_DATE', dateRangeStart: null, dateRangeEnd: null,
    attribution: 'FIRSTHAND', extractionConfidence: 0.9,
  };
  const answer = { type: 'MAINTENANCE', title: 'HVAC filter change', summary: 'Replaced filter', amount: 90, providerName: 'Acme HVAC' };
  const result = editCaptureEventCandidate(storedParameters, 'irrelevant', 'ctx-1', answer, new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(result);
  assert.equal(result.parameters.type, 'MAINTENANCE');
  assert.equal(result.parameters.title, 'HVAC filter change');
  assert.equal(result.parameters.amount, 90);
  // Untouched fields (dates) survive unchanged.
  assert.equal(result.parameters.occurredAt, '2026-09-12T00:00:00.000Z');
  assert.match(result.confirmation.title, /^Add /);
});

test('editCaptureEventCandidate: returns null when this execution has no editable fields stored at all', () => {
  const storedParameters = { correctingEventId: 'event-1', occurredAt: '2023-06-01T00:00:00.000Z', datePrecision: 'YEAR', attribution: 'FIRSTHAND' };
  const result = editCaptureEventCandidate(storedParameters, 'irrelevant', 'ctx-1', {}, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

test('editCaptureWarrantyCandidate: a valid full edit updates every editable field, including dates the homeowner resubmitted unchanged', () => {
  const storedParameters = {
    providerName: 'Carrier', category: 'HVAC', policyNumber: 'POL-123', coverageDetails: 'Parts and labor', cost: 450,
    startDate: '2026-08-15T00:00:00.000Z', expiryDate: '2036-08-15T00:00:00.000Z', attribution: 'FIRSTHAND', extractionConfidence: 0.85, confirmationVersion: 1,
  };
  const answer = { providerName: 'Carrier Corp', category: 'HVAC', policyNumber: 'POL-456', coverageDetails: 'Parts, labor, and diagnostics', cost: 500, startDate: '2026-08-15', expiryDate: '2036-08-15' };
  const result = editCaptureWarrantyCandidate(storedParameters, 'irrelevant', 'ctx-1', answer, new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(result);
  assert.equal(result.parameters.providerName, 'Carrier Corp');
  assert.equal(result.parameters.policyNumber, 'POL-456');
  assert.equal(result.parameters.cost, 500);
  assert.equal(new Date(result.parameters.startDate).toISOString().slice(0, 10), '2026-08-15');
  assert.equal(new Date(result.parameters.expiryDate).toISOString().slice(0, 10), '2036-08-15');
  assert.equal(result.parameters.startDateApproximate, false);
  assert.ok(result.confirmation.fields.some((field) => field.label === 'Start date'));
});

// Code review finding (2026-09-13, [P1]): resolveWarrantyDates can
// manufacture an inexact guess (a RANGE-precision event's dateRangeStart,
// or `now`) as if it were an exact Warranty.startDate. This is the fix's
// other half -- the homeowner must actually be ABLE to correct it, not
// just see a label. Also covers the P1's "confirmationVersion must
// invalidate the old card" requirement for the warranty path specifically.
test('editCaptureWarrantyCandidate: correcting a manufactured start date clears startDateApproximate and increments confirmationVersion past the stale card', () => {
  const storedParameters = {
    providerName: 'Carrier', category: 'HVAC', policyNumber: null, coverageDetails: null, cost: null,
    startDate: '2025-06-01T00:00:00.000Z', expiryDate: '2035-06-01T00:00:00.000Z', startDateApproximate: true, confirmationVersion: 1,
  };
  const answer = { providerName: 'Carrier', category: 'HVAC', policyNumber: null, coverageDetails: null, cost: null, startDate: '2025-08-20', expiryDate: '2035-08-20' };
  const result = editCaptureWarrantyCandidate(storedParameters, 'irrelevant', 'ctx-1', answer, new Date('2026-09-13T01:00:00.000Z'));
  assert.ok(result);
  assert.equal(new Date(result.parameters.startDate).toISOString().slice(0, 10), '2025-08-20');
  assert.equal(result.parameters.startDateApproximate, false);
  assert.equal(result.parameters.confirmationVersion, 2);
  assert.equal(result.confirmation.version, 2);
  assert.ok(!result.confirmation.fields.some((field) => /estimated/i.test(field.label)), 'expected the "estimated" label to disappear once the homeowner has explicitly supplied the date');
});

test('editCaptureWarrantyCandidate: rejects an expiryDate that is not after startDate', () => {
  const storedParameters = { providerName: 'Carrier', category: 'HVAC', policyNumber: null, coverageDetails: null, cost: null, startDate: '2026-08-15T00:00:00.000Z', expiryDate: '2036-08-15T00:00:00.000Z' };
  const answer = { providerName: 'Carrier', category: 'HVAC', policyNumber: null, coverageDetails: null, cost: null, startDate: '2026-08-15', expiryDate: '2020-01-01' };
  const result = editCaptureWarrantyCandidate(storedParameters, 'irrelevant', 'ctx-1', answer, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

test('editCaptureWarrantyCandidate: rejects an invalid category enum value', () => {
  const storedParameters = { providerName: 'Carrier', category: 'HVAC', policyNumber: null, coverageDetails: null, cost: null, startDate: '2026-08-15T00:00:00.000Z', expiryDate: '2036-08-15T00:00:00.000Z' };
  const answer = { providerName: 'Carrier', category: 'NOT_A_REAL_CATEGORY', policyNumber: null, coverageDetails: null, cost: null, startDate: '2026-08-15', expiryDate: '2036-08-15' };
  const result = editCaptureWarrantyCandidate(storedParameters, 'irrelevant', 'ctx-1', answer, new Date('2026-09-13T01:00:00.000Z'));
  assert.equal(result, null);
});

// Source-governance tests for submitAskCapture's own wiring of the three
// capture-edit operations (submitAskCapture touches the database directly
// and has no runtime-mocked test harness in this codebase for this class of
// function -- same established gap as persistCandidates above).

test('submitAskCapture\'s inline-capture allow-list includes all three capture-confirm operations', () => {
  const idx = orchestratorSource.indexOf('export async function submitAskCapture(');
  assert.ok(idx > 0);
  const allowListLine = orchestratorSource.slice(idx, orchestratorSource.indexOf('\n', orchestratorSource.indexOf(".includes(execution.operationId ?? '')", idx)));
  assert.match(allowListLine, /'CAPTURE_FACT_CONFIRM'/);
  assert.match(allowListLine, /'CAPTURE_EVENT_CONFIRM'/);
  assert.match(allowListLine, /'CAPTURE_WARRANTY_CONFIRM'/);
});

test('submitAskCapture\'s capture-edit branch never calls a domain-writing service -- it only rebuilds the pending card via editCapture*Candidate', () => {
  // Anchored on the `} else if (` branch entry, not the bare condition
  // text -- the idempotency-replay guard above this branch (code review
  // finding, 2026-09-13) legitimately reuses the same condition for a
  // different purpose (never re-routing a capture-edit's own message), so
  // a bare-condition search would find that occurrence first instead.
  const idx = orchestratorSource.indexOf("} else if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM'");
  assert.ok(idx > 0);
  const branchEnd = orchestratorSource.indexOf("} else if (execution.operationId === 'HOME_DEADLINE_MONITOR')", idx);
  assert.ok(branchEnd > idx);
  const branch = orchestratorSource.slice(idx, branchEnd);
  assert.match(branch, /editCaptureFactCandidate\(/);
  assert.match(branch, /editCaptureEventCandidate\(/);
  assert.match(branch, /editCaptureWarrantyCandidate\(/);
  assert.match(branch, /canonicalOwner = 'AskCaptureCandidateEdit'/);
  // No canonical writer of any kind -- capturePropertyFact/capturePropertyFinancingFact/
  // captureWarranty/HomeEventsService/PropertyMaintenanceTaskService/captureFeatureContext
  // must never appear inside this branch; only an actual confirm writes.
  assert.doesNotMatch(branch, /capturePropertyFact\(|capturePropertyFinancingFact\(|captureWarranty\(|homeEventsServiceForCapture\.|PropertyMaintenanceTaskService\.|captureFeatureContext\(/);
});

test('submitAskCapture\'s capture-edit branch checks captureKey and contextVersion freshness before calling the editor, matching every other branch\'s own gating shape', () => {
  const idx = orchestratorSource.indexOf("} else if (execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM'");
  const branchEnd = orchestratorSource.indexOf("} else if (execution.operationId === 'HOME_DEADLINE_MONITOR')", idx);
  const branch = orchestratorSource.slice(idx, branchEnd);
  const captureKeyCheck = branch.indexOf("input.captureKey !== editCaptureKey");
  const versionCheck = branch.indexOf("storedContextVersion !== input.expectedContextVersion");
  const editorCall = branch.indexOf('const edited =');
  assert.ok(captureKeyCheck > 0 && versionCheck > captureKeyCheck && editorCall > versionCheck, 'expected captureKey check, then contextVersion check, then the editor call, in that order');
  assert.match(branch, /'ASK_CAPTURE_NOT_ACTIVE'/);
  assert.match(branch, /'ASK_CONTEXT_VERSION_CONFLICT'/);
  assert.match(branch, /'ASK_CAPTURE_VALIDATION_ERROR'/);
});

// Code review findings (2026-09-13, [P1] x2): the two remaining fixes from
// the same review round live in submitAskCapture's shared plumbing, not the
// capture-edit branch itself -- covered as source-governance tests for the
// same reason (no runtime DB-mock harness in this codebase for this class
// of function).

test('submitAskCapture\'s idempotency-replay branch never reroutes a capture-edit operation through resolveAskOperation/executeOperation -- it returns the already-persisted execution directly', () => {
  const idx = orchestratorSource.indexOf('export async function submitAskCapture(');
  assert.ok(idx > 0);
  const previousCaptureIdx = orchestratorSource.indexOf('if (previousCapture) {', idx);
  assert.ok(previousCaptureIdx > idx);
  const guardIdx = orchestratorSource.indexOf(
    "execution.operationId === 'CAPTURE_FACT_CONFIRM' || execution.operationId === 'CAPTURE_EVENT_CONFIRM' || execution.operationId === 'CAPTURE_WARRANTY_CONFIRM'",
    previousCaptureIdx,
  );
  const resolveIdx = orchestratorSource.indexOf('resolveAskOperation(execution.message)', previousCaptureIdx);
  assert.ok(guardIdx > previousCaptureIdx, 'expected a capture-edit guard inside the previousCapture (idempotency replay) branch');
  assert.ok(guardIdx < resolveIdx, 'expected the capture-edit guard to come BEFORE the resolveAskOperation reroute, so it returns first for these three operations');
  const guardBlock = orchestratorSource.slice(guardIdx, resolveIdx);
  assert.match(guardBlock, /mapPersistedExecution\(execution, await propertySummary\(execution\.propertyId\)\)/);
  assert.doesNotMatch(guardBlock, /executeOperation\(/, 'the capture-edit guard must return before ever calling executeOperation');
});

test('submitAskCapture\'s final save is a compare-and-swap on the execution\'s status as read at the top of the function, not an unconditional update -- a concurrent confirm cannot be silently clobbered', () => {
  const idx = orchestratorSource.indexOf('export async function submitAskCapture(');
  const txIdx = orchestratorSource.indexOf('await prisma.$transaction(async (tx) => {', idx);
  assert.ok(txIdx > idx);
  const txEnd = orchestratorSource.indexOf('askInlineCapturesTotal.inc(', txIdx);
  const txBody = orchestratorSource.slice(txIdx, txEnd);
  assert.match(txBody, /tx\.askExecution\.updateMany\(\{\s*\n\s*where: \{ id: execution\.id, status: execution\.status \}/);
  assert.match(txBody, /if \(updated\.count !== 1\) \{/);
  assert.match(txBody, /'ASK_CAPTURE_NOT_ACTIVE'/);
  // The row is re-read inside the same transaction for the return value,
  // since updateMany itself doesn't return the updated row.
  assert.match(txBody, /return tx\.askExecution\.findUniqueOrThrow\(\{ where: \{ id: execution\.id \} \}\);/);
});
