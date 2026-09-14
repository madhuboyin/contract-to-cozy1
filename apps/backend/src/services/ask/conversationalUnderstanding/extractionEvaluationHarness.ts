// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §15).
//
// Code review finding (2026-09-13): FRD §15 names eight metrics; only two
// (pre-filter recall/precision, extractionPreFilter.test.js) were ever
// scored. The remaining six score the LLM extractor's actual OUTPUT, which
// this codebase's own established convention (see extractionCandidateSchema
// .test.js's header comment) deliberately does not assert as passing in the
// default test run -- extraction genuinely calls a live model, unlike
// routing (100% deterministic, hence askRoutingQualityEvaluator.ts can be a
// real CI-blocking test). This harness mirrors that file's own shape
// (fixtures in, a typed report out) but is meant to be run on demand against
// a live GEMINI_API_KEY (see extractionEvaluationHarness.manual.test.js),
// not wired into `npm test`.
//
// `extract` is injectable so this harness's own SCORING LOGIC (matching,
// aggregation) has a real, always-run, zero-I/O unit test independent of
// model accuracy -- the same "test the plumbing separately from the model"
// lesson this program already learned once (extractionContract.ts's
// AI_SOURCE_UNREGISTERED gap: a schema-only test suite gave false confidence
// that the call could even run).

import {
  EXTRACTION_EVALUATION_CORPUS,
  type ExpectedExtractionCandidate,
  type ExtractionCorpusFixture,
} from './extractionEvaluationCorpus';
import { runStructuredExtraction, type RunStructuredExtractionResult } from './extractionContract';
import type { ExtractionCandidate } from './extractionCandidateSchema';

export type ExtractFn = (message: string) => Promise<RunStructuredExtractionResult>;

export interface ExtractionEvaluationReport {
  schemaVersion: '1.0';
  generatedAt: string;
  sampleCount: number;
  // FRD §15's own eight metrics -- null when the corpus has zero rows with a
  // scorable expectation for that metric (never a fabricated 0/1).
  candidateCategoryAccuracy: number | null;
  fieldAccuracy: number | null;
  datePrecisionAccuracy: number | null;
  attributionAccuracy: number | null;
  duplicateRate: number | null;
  falsePersistenceProposalRate: number | null;
  perFixture: ReadonlyArray<{
    fixtureId: string;
    expectedCount: number;
    actualCount: number;
    unmatchedExpectedCount: number;
    unmatchedActualCount: number;
  }>;
}

interface MatchedPair {
  expected: ExpectedExtractionCandidate;
  actual: ExtractionCandidate;
}

// External review, 2026-09-13: when an expected candidate declares an
// identity hint (FACT's factKey, EVENT's titleKeyword), that hint must also
// match, not just the category -- without this, a fixture with two expected
// EVENT candidates (multi-1: "water heater replacement" + "sump pump
// backup") could have both satisfied by two DUPLICATED "water heater"
// actual candidates, scoring 0% duplicates and 0% false persistence for a
// response that got the count right but the content wrong. A row with no
// identity hint keeps matching on category alone, unchanged -- this is not
// a full-title equality check (this file's own header comment already
// rejects that as too brittle against a model's genuine phrasing variance),
// only a loose, case-insensitive substring check.
function candidateMatchesIdentity(expected: ExpectedExtractionCandidate, candidate: ExtractionCandidate): boolean {
  if (candidate.category !== expected.category) return false;
  if (expected.category === 'FACT' && expected.factKey !== undefined) {
    return candidate.category === 'FACT' && candidate.factKey === expected.factKey;
  }
  if (expected.category === 'EVENT' && expected.titleKeyword !== undefined) {
    return candidate.category === 'EVENT' && candidate.title.toLowerCase().includes(expected.titleKeyword.toLowerCase());
  }
  return true;
}

// Greedy bipartite match, in corpus order -- identity-aware whenever an
// expected candidate declares a hint (see candidateMatchesIdentity above),
// category-only otherwise, matching this file's original behavior for the
// common single-candidate-per-category fixture.
function matchCandidates(
  expected: ReadonlyArray<ExpectedExtractionCandidate>,
  actual: ReadonlyArray<ExtractionCandidate>,
): { pairs: MatchedPair[]; unmatchedExpected: ExpectedExtractionCandidate[]; unmatchedActual: ExtractionCandidate[] } {
  const remainingActual = [...actual];
  const pairs: MatchedPair[] = [];
  const unmatchedExpected: ExpectedExtractionCandidate[] = [];
  for (const expectedCandidate of expected) {
    const index = remainingActual.findIndex((candidate) => candidateMatchesIdentity(expectedCandidate, candidate));
    if (index === -1) {
      unmatchedExpected.push(expectedCandidate);
      continue;
    }
    const [actualCandidate] = remainingActual.splice(index, 1);
    pairs.push({ expected: expectedCandidate, actual: actualCandidate });
  }
  return { pairs, unmatchedExpected, unmatchedActual: remainingActual };
}

// External review, 2026-09-13: type-aware equality for expectedValue/
// expectedAmount/expectedProviderName -- numbers within a tiny float-
// rounding epsilon, strings/booleans exact after trim/lowercasing for
// strings. Directly stated values (a rate, a dollar amount, a provider
// name) are expected to be reproduced faithfully, not approximated.
function valuesMatch(actual: unknown, expected: string | number | boolean): boolean {
  if (typeof expected === 'number') return typeof actual === 'number' && Math.abs(actual - expected) < 0.0001;
  if (typeof expected === 'boolean') return actual === expected;
  return typeof actual === 'string' && actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function rate(correct: number, total: number): number | null {
  return total === 0 ? null : Number((correct / total).toFixed(4));
}

export async function evaluateExtractionQuality(
  extract: ExtractFn = (message) => runStructuredExtraction(message, []),
  corpus: ReadonlyArray<ExtractionCorpusFixture> = EXTRACTION_EVALUATION_CORPUS,
): Promise<ExtractionEvaluationReport> {
  let categoryCorrect = 0;
  let categoryTotal = 0;
  let fieldCorrect = 0;
  let fieldTotal = 0;
  let datePrecisionCorrect = 0;
  let datePrecisionTotal = 0;
  let attributionCorrect = 0;
  let attributionTotal = 0;
  let rowsWithDuplicate = 0;
  let unmatchedActualTotal = 0;
  let actualTotal = 0;
  const perFixture: Array<ExtractionEvaluationReport['perFixture'][number]> = [];

  for (const fixture of corpus) {
    const { candidates } = await extract(fixture.message);
    const { pairs, unmatchedExpected, unmatchedActual } = matchCandidates(fixture.expectedCandidates, candidates);

    categoryTotal += fixture.expectedCandidates.length;
    categoryCorrect += pairs.length; // a pair only forms when categories already match

    for (const { expected, actual } of pairs) {
      if (expected.factKey !== undefined) {
        fieldTotal += 1;
        const factKeyCorrect = actual.category === 'FACT' && actual.factKey === expected.factKey;
        // External review, 2026-09-13: previously only checked factKey,
        // never the actual VALUE -- a candidate with the right factKey but a
        // fabricated value (99% instead of a stated 6.75%) scored correct.
        const valueCorrect = expected.expectedValue === undefined
          || (actual.category === 'FACT' && valuesMatch(actual.value, expected.expectedValue));
        if (factKeyCorrect && valueCorrect) fieldCorrect += 1;
      }
      if (expected.hasAmount !== undefined) {
        fieldTotal += 1;
        const hasAmount = actual.category === 'EVENT' && actual.amount != null;
        // External review, 2026-09-13: same value-blindness bug as above --
        // $99,999 previously satisfied "hasAmount: true" for a $450 message.
        const amountCorrect = expected.expectedAmount === undefined
          || (actual.category === 'EVENT' && actual.amount === expected.expectedAmount);
        if (hasAmount === expected.hasAmount && amountCorrect) fieldCorrect += 1;
      }
      if (expected.hasProviderName !== undefined) {
        fieldTotal += 1;
        const hasProviderName = actual.category === 'EVENT' && Boolean(actual.providerName);
        // External review, 2026-09-13: "Wrong Company" previously satisfied
        // "hasProviderName: true" for a message naming a specific provider.
        const providerCorrect = expected.expectedProviderName === undefined
          || (actual.category === 'EVENT' && typeof actual.providerName === 'string'
            && valuesMatch(actual.providerName, expected.expectedProviderName));
        if (hasProviderName === expected.hasProviderName && providerCorrect) fieldCorrect += 1;
      }
      if (expected.isCorrection !== undefined) {
        fieldTotal += 1;
        const isCorrection = actual.category === 'EVENT' && Boolean(actual.correctingEventId);
        if (isCorrection === expected.isCorrection) fieldCorrect += 1;
      }
      if (expected.datePrecision !== undefined) {
        datePrecisionTotal += 1;
        if (actual.category === 'EVENT' && actual.datePrecision === expected.datePrecision) datePrecisionCorrect += 1;
      }
      if (expected.attribution !== undefined) {
        attributionTotal += 1;
        if (actual.attribution === expected.attribution) attributionCorrect += 1;
      }
    }

    // External review, 2026-09-13: this used to compare raw category COUNTS
    // (expected 2 EVENTs, got 2 EVENTs -> no duplicate), which couldn't
    // detect a response that got the count right but the content wrong --
    // two DUPLICATED "water heater" candidates satisfying an expectation for
    // a distinct "sump pump" candidate scored 0% duplicates. Derived from
    // matchCandidates's own identity-aware pairs/unmatchedActual instead: a
    // duplicate is an unmatched actual candidate that shares a category with
    // something ALREADY genuinely matched in this row -- the model correctly
    // identified that category once, then proposed an extra for it, distinct
    // from an unmatched actual whose category was never matched at all (that
    // is false persistence of entirely invented/misidentified content,
    // scored below via unmatchedActual/candidates.length, unchanged).
    const hasDuplicate = unmatchedActual.some((candidate) =>
      pairs.some((pair) => pair.actual.category === candidate.category));
    if (hasDuplicate) rowsWithDuplicate += 1;

    actualTotal += candidates.length;
    unmatchedActualTotal += unmatchedActual.length;

    perFixture.push({
      fixtureId: fixture.fixtureId,
      expectedCount: fixture.expectedCandidates.length,
      actualCount: candidates.length,
      unmatchedExpectedCount: unmatchedExpected.length,
      unmatchedActualCount: unmatchedActual.length,
    });
  }

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sampleCount: corpus.length,
    candidateCategoryAccuracy: rate(categoryCorrect, categoryTotal),
    fieldAccuracy: rate(fieldCorrect, fieldTotal),
    datePrecisionAccuracy: rate(datePrecisionCorrect, datePrecisionTotal),
    attributionAccuracy: rate(attributionCorrect, attributionTotal),
    duplicateRate: rate(rowsWithDuplicate, corpus.length),
    falsePersistenceProposalRate: rate(unmatchedActualTotal, actualTotal || 1),
    perFixture,
  };
}
