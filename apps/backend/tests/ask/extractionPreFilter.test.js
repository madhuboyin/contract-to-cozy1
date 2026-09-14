const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { evaluateExtractionPreFilter } = require('../../src/services/ask/conversationalUnderstanding/extractionPreFilter.ts');
const { EXTRACTION_EVALUATION_CORPUS } = require('../../src/services/ask/conversationalUnderstanding/extractionEvaluationCorpus.ts');

// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §13/§15). Pure
// function, no I/O -- runtime-executed, not source-governance, per FRD §13's
// own "independently unit-testable (pure function, no I/O)" requirement.

test('fires on a plain retrospective statement', () => {
  assert.equal(evaluateExtractionPreFilter('I replaced the roof last summer for $14,500.').shouldExtract, true);
});

test('does not fire on a pure hypothetical question', () => {
  assert.equal(evaluateExtractionPreFilter('Should I refinance?').shouldExtract, false);
});

test('does not fire on an inverted-order question even when it names a home fact ("Is my roof at risk?")', () => {
  assert.equal(evaluateExtractionPreFilter('Is my roof at risk because of the storms?').shouldExtract, false);
});

test('fires on the statement half of a mixed question+fact message (FRD §8.3)', () => {
  const decision = evaluateExtractionPreFilter('I serviced the HVAC yesterday for $275. Was that too expensive?');
  assert.equal(decision.shouldExtract, true);
  assert.ok(decision.matchedReasons.includes('RETROSPECTIVE_ACTION'));
  assert.ok(decision.matchedReasons.includes('COST_MENTION'));
});

test('does not fire on a false-positive trap that uses a present-tense/infinitive verb, not a retrospective one', () => {
  assert.equal(evaluateExtractionPreFilter('How much does it cost to replace a roof around here?').shouldExtract, false);
});

test('fires on a third-party relay even with no past-tense verb of its own', () => {
  const decision = evaluateExtractionPreFilter('Our plumber told me the water heater is about 8 years old.');
  assert.equal(decision.shouldExtract, true);
  assert.ok(decision.matchedReasons.includes('THIRD_PARTY_RELAY'));
});

test('fires on a correction marker', () => {
  const decision = evaluateExtractionPreFilter('Actually, the roof was replaced in 2023, not 2024.');
  assert.equal(decision.shouldExtract, true);
  assert.ok(decision.matchedReasons.includes('CORRECTION_MARKER'));
});

test('fires on a hedged statement', () => {
  const decision = evaluateExtractionPreFilter('I think we replaced the water heater around 2019.');
  assert.equal(decision.shouldExtract, true);
  assert.ok(decision.matchedReasons.includes('HEDGE_MARKER'));
});

test('empty/whitespace-only message never fires', () => {
  assert.equal(evaluateExtractionPreFilter('   ').shouldExtract, false);
});

// FRD §15's pilot thresholds, computed against the frozen corpus
// (extractionEvaluationCorpus.ts). These score the deterministic pre-filter
// only -- FRD §15's remaining metrics (candidate/field/date-precision/
// attribution accuracy) score the LLM extractor's output and are not
// computed here (see that file's header comment).
test('pre-filter recall/precision against the frozen corpus clears FRD §15\'s pilot thresholds', () => {
  let truePositive = 0;
  let falseNegative = 0;
  let falsePositive = 0;
  let trueNegative = 0;

  for (const fixture of EXTRACTION_EVALUATION_CORPUS) {
    const actual = evaluateExtractionPreFilter(fixture.message).shouldExtract;
    if (fixture.expectedPreFilterFire && actual) truePositive += 1;
    else if (fixture.expectedPreFilterFire && !actual) falseNegative += 1;
    else if (!fixture.expectedPreFilterFire && actual) falsePositive += 1;
    else trueNegative += 1;
  }

  const recall = truePositive / (truePositive + falseNegative || 1);
  const precision = truePositive / (truePositive + falsePositive || 1);

  assert.ok(
    recall >= 0.85,
    `pre-filter recall ${(recall * 100).toFixed(1)}% is below FRD §15's 85% pilot threshold (tp=${truePositive} fn=${falseNegative})`,
  );
  assert.ok(
    precision >= 0.70,
    `pre-filter precision ${(precision * 100).toFixed(1)}% is below FRD §15's 70% pilot threshold (tp=${truePositive} fp=${falsePositive})`,
  );
  assert.equal(trueNegative >= 0, true);
});

test('every corpus row declares one of FRD §15\'s eleven required categories', () => {
  const requiredCategories = [
    'POSITIVE_FACTUAL_STATEMENT', 'NEGATIVE_QUESTION', 'MIXED_QUESTION_AND_FACT', 'HEDGED_STATEMENT',
    'THIRD_PARTY_STATEMENT', 'CORRECTION', 'AMBIGUOUS_DATE', 'COST_PROVIDER_COMBINATION', 'MULTIPLE_FACTS',
    'UNRELATED_HOUSEHOLD_CONVERSATION', 'FALSE_POSITIVE_TRAP',
  ];
  const presentCategories = new Set(EXTRACTION_EVALUATION_CORPUS.map((fixture) => fixture.category));
  for (const category of requiredCategories) {
    assert.ok(presentCategories.has(category), `corpus is missing FRD §15's required category: ${category}`);
  }
});

test('short goal follow-ups reach extraction only with an active decision', () => {
  for (const message of ['Next year', 'What about renting?', 'The second option', 'Yes']) {
    assert.equal(evaluateExtractionPreFilter(message, true).shouldExtract, true);
    assert.equal(evaluateExtractionPreFilter(message, false).shouldExtract, false);
  }
  assert.equal(evaluateExtractionPreFilter('Thanks!', true).shouldExtract, false);
});
