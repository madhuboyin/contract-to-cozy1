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

// Greedy bipartite match by category, in corpus order -- the corpus never
// asserts a specific ordering among same-category candidates (e.g. multi-1's
// two EVENT rows), only that each expected candidate's category is present
// somewhere in the actual output.
function matchCandidates(
  expected: ReadonlyArray<ExpectedExtractionCandidate>,
  actual: ReadonlyArray<ExtractionCandidate>,
): { pairs: MatchedPair[]; unmatchedExpected: ExpectedExtractionCandidate[]; unmatchedActual: ExtractionCandidate[] } {
  const remainingActual = [...actual];
  const pairs: MatchedPair[] = [];
  const unmatchedExpected: ExpectedExtractionCandidate[] = [];
  for (const expectedCandidate of expected) {
    const index = remainingActual.findIndex((candidate) => candidate.category === expectedCandidate.category);
    if (index === -1) {
      unmatchedExpected.push(expectedCandidate);
      continue;
    }
    const [actualCandidate] = remainingActual.splice(index, 1);
    pairs.push({ expected: expectedCandidate, actual: actualCandidate });
  }
  return { pairs, unmatchedExpected, unmatchedActual: remainingActual };
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
        if (actual.category === 'FACT' && actual.factKey === expected.factKey) fieldCorrect += 1;
      }
      if (expected.hasAmount !== undefined) {
        fieldTotal += 1;
        const hasAmount = actual.category === 'EVENT' && actual.amount != null;
        if (hasAmount === expected.hasAmount) fieldCorrect += 1;
      }
      if (expected.hasProviderName !== undefined) {
        fieldTotal += 1;
        const hasProviderName = actual.category === 'EVENT' && Boolean(actual.providerName);
        if (hasProviderName === expected.hasProviderName) fieldCorrect += 1;
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

    // A duplicate is a same-category actual candidate beyond what this row
    // ever expected, distinct from an invented, unrelated category (that is
    // false persistence, scored below) -- e.g. two EVENT candidates proposed
    // for a message this corpus says should produce exactly one.
    const expectedCategoryCounts = new Map<string, number>();
    for (const expected of fixture.expectedCandidates) {
      expectedCategoryCounts.set(expected.category, (expectedCategoryCounts.get(expected.category) ?? 0) + 1);
    }
    const actualCategoryCounts = new Map<string, number>();
    for (const actual of candidates) {
      actualCategoryCounts.set(actual.category, (actualCategoryCounts.get(actual.category) ?? 0) + 1);
    }
    const hasDuplicate = [...actualCategoryCounts.entries()].some(([category, count]) => {
      const expectedForCategory = expectedCategoryCounts.get(category) ?? 0;
      // A category never expected at all isn't a "duplicate" of anything --
      // that's an invented candidate, scored as false persistence below.
      return expectedForCategory > 0 && count > expectedForCategory;
    });
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
