const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { evaluateExtractionQuality } = require('../../src/services/ask/conversationalUnderstanding/extractionEvaluationHarness.ts');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §15). Zero-I/O test
// of the harness's own matching/aggregation logic, independent of any real
// model call -- extractionEvaluationHarness.manual.test.js exercises the
// live model against this exact scoring code. Mirrors this program's own
// established lesson (extractionContract.test.js's AI_SOURCE_UNREGISTERED
// regression): a harness that is only ever exercised against real, variable
// model output has no way to prove its OWN math is correct independent of
// that output.

function candidate(overrides) {
  return {
    category: 'EVENT',
    extractionConfidence: 0.9,
    attribution: 'FIRSTHAND',
    sourceSentence: 'test sentence',
    eventType: 'MAINTENANCE',
    title: 'Test event',
    datePrecision: 'EXACT_DATE',
    occurredAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const oneRowCorpus = (expectedCandidates) => [{
  fixtureId: 'synthetic-1',
  message: 'irrelevant for this test',
  category: 'POSITIVE_FACTUAL_STATEMENT',
  expectedPreFilterFire: true,
  expectedCandidateSummary: 'synthetic',
  expectedCandidates,
  provenance: 'ASK_COZY_STAGE3_PHASE3_V1',
}];

test('a perfect match scores every metric at 1.0 (or null where nothing was asserted)', async () => {
  const corpus = oneRowCorpus([{ category: 'EVENT', datePrecision: 'EXACT_DATE', attribution: 'FIRSTHAND', hasAmount: true }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate({ amount: 250 })], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.candidateCategoryAccuracy, 1);
  assert.equal(report.fieldAccuracy, 1);
  assert.equal(report.datePrecisionAccuracy, 1);
  assert.equal(report.attributionAccuracy, 1);
  assert.equal(report.duplicateRate, 0);
  assert.equal(report.falsePersistenceProposalRate, 0);
});

test('a wrong category counts as an unmatched expectation, not a miscategorized field', async () => {
  const corpus = oneRowCorpus([{ category: 'FACT', factKey: 'core.yearBuilt' }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate({ category: 'EVENT' })], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.candidateCategoryAccuracy, 0);
  // No FACT candidate exists to score fieldAccuracy against -- correctly null, not a fabricated 0.
  assert.equal(report.fieldAccuracy, null);
});

test('an extra candidate beyond a none-expected row counts as false persistence, not a duplicate', async () => {
  const corpus = oneRowCorpus([]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate()], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.falsePersistenceProposalRate, 1);
  assert.equal(report.duplicateRate, 0);
});

test('a same-category candidate beyond what was expected counts as a duplicate, and is also an unconfirmed extra proposal', async () => {
  const corpus = oneRowCorpus([{ category: 'EVENT' }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate(), candidate()], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.duplicateRate, 1);
  // One of the two EVENT candidates matched the expectation; the other is
  // unmatched-actual -- half of what was proposed for this row was never confirmed real.
  assert.equal(report.falsePersistenceProposalRate, 0.5);
});

test('an unset expected field is never scored (no fabricated accuracy)', async () => {
  const corpus = oneRowCorpus([{ category: 'EVENT' }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate({ datePrecision: 'RANGE', attribution: 'THIRD_PARTY_RELAYED' })], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.datePrecisionAccuracy, null);
  assert.equal(report.attributionAccuracy, null);
  assert.equal(report.fieldAccuracy, null);
  assert.equal(report.candidateCategoryAccuracy, 1);
});

test('multiple same-category expectations (e.g. two EVENT candidates in one turn) each get an independent match', async () => {
  const corpus = oneRowCorpus([
    { category: 'EVENT', hasProviderName: true },
    { category: 'EVENT', hasProviderName: false },
  ]);
  const report = await evaluateExtractionQuality(
    async () => ({
      candidates: [candidate({ providerName: 'Joe\'s Plumbing' }), candidate({ providerName: null })],
      droppedCount: 0,
    }),
    corpus,
  );
  assert.equal(report.candidateCategoryAccuracy, 1);
  assert.equal(report.fieldAccuracy, 1);
  assert.equal(report.duplicateRate, 0);
});

test('runs the real frozen corpus end-to-end against an injected extractor without throwing', async () => {
  const report = await evaluateExtractionQuality(async () => ({ candidates: [], droppedCount: 0 }));
  assert.equal(report.sampleCount, 24);
  assert.equal(report.perFixture.length, 24);
});

// External review, 2026-09-13: three adversarial reproductions demonstrating
// the harness scored a wrong VALUE (not just presence/category) as correct,
// and couldn't tell two duplicated candidates from two genuinely distinct
// ones. Each test below is the exact shape of one of those reproductions.

test('a FACT with the right factKey but a fabricated value does NOT score full field accuracy', async () => {
  const corpus = oneRowCorpus([{ category: 'FACT', factKey: 'financial.currentMortgage', expectedValue: 6.75 }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [{ category: 'FACT', factKey: 'financial.currentMortgage', value: 99, extractionConfidence: 0.9, attribution: 'FIRSTHAND', sourceSentence: 'test' }], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.candidateCategoryAccuracy, 1, 'the right fact was identified');
  assert.equal(report.fieldAccuracy, 0, 'but the value was wrong');
});

test('an EVENT with a fabricated amount/providerName does NOT score full field accuracy', async () => {
  const corpus = oneRowCorpus([{ category: 'EVENT', titleKeyword: 'leak', hasAmount: true, expectedAmount: 450, hasProviderName: true, expectedProviderName: "Joe's Plumbing" }]);
  const report = await evaluateExtractionQuality(
    async () => ({ candidates: [candidate({ title: 'Plumbing leak repair', amount: 99999, providerName: 'Wrong Company' })], droppedCount: 0 }),
    corpus,
  );
  assert.equal(report.candidateCategoryAccuracy, 1, 'the right event was identified (titleKeyword matched)');
  assert.equal(report.fieldAccuracy, 0, 'but the amount and provider name were both wrong');
});

test('two duplicated candidates satisfying only one of two distinct expected identities score as a real duplicate and real false persistence, not zero', async () => {
  const corpus = oneRowCorpus([
    { category: 'EVENT', titleKeyword: 'water heater' },
    { category: 'EVENT', titleKeyword: 'sump pump' },
  ]);
  const report = await evaluateExtractionQuality(
    async () => ({
      candidates: [candidate({ title: 'Water heater replacement' }), candidate({ title: 'Water heater replacement' })],
      droppedCount: 0,
    }),
    corpus,
  );
  // One expected identity (water heater) was genuinely matched; the other
  // (sump pump) never appeared -- the second, duplicated water-heater
  // candidate is an extra proposal for an identity already satisfied.
  assert.equal(report.candidateCategoryAccuracy, 0.5, 'only one of the two distinct expected candidates was actually produced');
  assert.equal(report.duplicateRate, 1, 'the second identical candidate is a duplicate of the first');
  assert.equal(report.falsePersistenceProposalRate, 0.5, 'one of the two proposed candidates never matched a real expectation');
});

// External review, 2026-09-14: the harness's own default extractor always
// called runStructuredExtraction(message, []) -- an empty prior-events list
// regardless of what a fixture needed -- so the CORRECTION category's own
// fixtures (which require a real event id to reference) could never
// exercise real correction behavior; the model's own attempted
// correctingEventId would always be dropped as unverifiable against an
// empty list. This is the plumbing-level test for the fix: a fixture's own
// `priorHomeEvents` must actually reach the injected extractor.
test('evaluateExtractionQuality passes each fixture\'s own priorHomeEvents through to extract, defaulting to an empty array when unset', async () => {
  const priorEvent = { id: 'prior-1', title: 'Roof replacement', occurredAt: '2024-06-01T00:00:00.000Z', amount: null };
  const corpus = [
    { fixtureId: 'with-context', message: 'a', category: 'CORRECTION', expectedPreFilterFire: true, expectedCandidateSummary: 's', expectedCandidates: [], priorHomeEvents: [priorEvent], provenance: 'ASK_COZY_STAGE3_PHASE3_V1' },
    { fixtureId: 'without-context', message: 'b', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 's', expectedCandidates: [], provenance: 'ASK_COZY_STAGE3_PHASE3_V1' },
  ];
  const received = [];
  await evaluateExtractionQuality(async (message, priorHomeEvents) => {
    received.push({ message, priorHomeEvents });
    return { candidates: [], droppedCount: 0 };
  }, corpus);
  assert.deepEqual(received[0], { message: 'a', priorHomeEvents: [priorEvent] });
  assert.deepEqual(received[1], { message: 'b', priorHomeEvents: [] });
});

test('the default extractor forwards priorHomeEvents into runStructuredExtraction\'s own recentHomeEvents parameter', () => {
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const source = readFileSync(resolve(__dirname, '../../src/services/ask/conversationalUnderstanding/extractionEvaluationHarness.ts'), 'utf8');
  assert.match(source, /\(message, priorHomeEvents\) => runStructuredExtraction\(message, \[\.\.\.priorHomeEvents\]\)/);
});
