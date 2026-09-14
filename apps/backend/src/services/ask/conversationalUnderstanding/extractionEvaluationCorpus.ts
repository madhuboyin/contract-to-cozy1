// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §15).
//
// External review, 2026-09-14: the harness's own default extractor called
// runStructuredExtraction(message, []) for every fixture -- always an empty
// prior-events list -- while the CORRECTION category's own fixtures expect
// isCorrection: true, which the extraction prompt can only ever produce by
// referencing a real event id from that same list ("NEVER invent an id that
// is not in the list below"). With no prior events ever supplied, a
// correction reference the model attempted would always be dropped by
// withValidCorrectionReferences (extractionContract.ts) as unverifiable,
// making corr-1/corr-2 structurally incapable of ever exercising real
// correction behavior -- confirmed by reproducing the exact 0%-correction
// result the review reported. Fixed with `priorHomeEvents` below: a
// fixture-specific, hand-authored RecentHomeEventContext list (unset for
// every fixture that doesn't need one), threaded through by the harness
// into the SAME runStructuredExtraction call every other fixture already
// gets, just with real context to correct against this time.
// A dedicated, hand-labeled, frozen fixture corpus, following
// askTrustCertificationCorpus.ts's own established template (categorized
// rows, a provenance tag, a corpus-integrity test rather than a runtime
// scoring assertion baked into product code). FRD §15 requires all eleven
// categories below; each row's `expectedPreFilterFire` is this pass's own
// hand label of what a correct pre-filter should do, used by
// extractionPreFilter.test.js to compute recall/precision against FRD §15's
// pilot thresholds.
//
// Code review finding (2026-09-13): FRD §15's other six metrics (candidate
// category/field/date-precision/attribution accuracy, duplicate rate, false-
// persistence rate) were never scored anywhere -- this file's own header
// used to say only that `expectedCandidateSummary` was "recorded now... so
// that harness can be pointed at this same corpus once it exists," but no
// such harness was ever built. `expectedCandidateSummary` (free text, kept
// for human review) is joined here by `expectedCandidates` -- a structured,
// intentionally partial hand label (only the fields this pass is confident
// enough to assert; an unset field is a genuine "not scored," not a silent
// zero) that `extractionEvaluationHarness.ts` scores real
// runStructuredExtraction() output against. This still requires a live
// Gemini call per row (FRD §15's own text: "this document does not claim
// they are validated against production traffic") -- see
// extractionEvaluationHarness.manual.test.js, gated on GEMINI_API_KEY and
// not part of the default `npm test` run, matching this codebase's existing
// convention for live-model checks.

import type { RecentHomeEventContext } from './extractionContract';

export type ExtractionCorpusCategory =
  | 'POSITIVE_FACTUAL_STATEMENT'
  | 'NEGATIVE_QUESTION'
  | 'MIXED_QUESTION_AND_FACT'
  | 'HEDGED_STATEMENT'
  | 'THIRD_PARTY_STATEMENT'
  | 'CORRECTION'
  | 'AMBIGUOUS_DATE'
  | 'COST_PROVIDER_COMBINATION'
  | 'MULTIPLE_FACTS'
  | 'UNRELATED_HOUSEHOLD_CONVERSATION'
  | 'FALSE_POSITIVE_TRAP';

// Intentionally a small, checkable subset of ExtractionCandidate's real
// shape (extractionCandidateSchema.ts), not a full mirror -- FRD §15's own
// metrics operate at this granularity (was the right category assigned, was
// the field/date-precision/attribution correct), not exact-string title
// matching, which would make the harness brittle against a model's genuine
// phrasing variance rather than measuring what the FRD actually asks for.
export interface ExpectedExtractionCandidate {
  category: 'FACT' | 'EVENT' | 'WARRANTY' | 'GOAL';
  // Set only for FACT candidates whose target factKey this pass is
  // confident about.
  factKey?: string;
  // External review, 2026-09-13: the harness's own factKey check previously
  // never compared the actual VALUE, so a candidate with the right factKey
  // but a fabricated value (e.g. mortgage rate 99% instead of 6.75%) scored
  // 100% field accuracy. Set only when this pass is confident about the
  // exact stated value, not just the target factKey.
  expectedValue?: string | number | boolean;
  // External review, 2026-09-13: an identity hint distinct from an
  // exact-title match (which this file's own header comment already rejects
  // as too brittle against a model's genuine phrasing variance) -- a
  // case-insensitive substring the actual candidate's title must contain.
  // Set only when a fixture has more than one expected EVENT candidate and
  // needs a way to tell them apart (without this, the harness's matcher
  // paired same-category candidates in corpus order regardless of content,
  // so two duplicated "water heater" candidates could silently satisfy an
  // expectation for a distinct "sump pump" candidate). Rows with a single
  // expected EVENT keep matching on category alone, unchanged.
  titleKeyword?: string;
  // Set only for EVENT candidates whose date precision this pass is
  // confident about.
  datePrecision?: 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN';
  // Set only when the message's own wording makes attribution unambiguous.
  attribution?: 'FIRSTHAND' | 'THIRD_PARTY_RELAYED' | 'INFERRED';
  // EVENT-only: true when this candidate should carry a correctingEventId
  // (a CORRECTION-category row's own re-derived target).
  isCorrection?: boolean;
  hasAmount?: boolean;
  // External review, 2026-09-13: same value-blindness bug as expectedValue
  // above, for EVENT's amount -- a $99,999 candidate previously satisfied
  // "hasAmount: true" for a message that stated $450. Set only when this
  // pass is confident about the exact stated amount.
  expectedAmount?: number;
  hasProviderName?: boolean;
  // External review, 2026-09-13: same value-blindness bug for EVENT's
  // providerName -- "Wrong Company" previously satisfied "hasProviderName:
  // true" for a message that named a specific provider. Case-insensitive,
  // trimmed comparison. Set only when this pass is confident about the
  // exact stated provider name.
  expectedProviderName?: string;
}

export interface ExtractionCorpusFixture {
  fixtureId: string;
  message: string;
  category: ExtractionCorpusCategory;
  expectedPreFilterFire: boolean;
  expectedCandidateSummary: string;
  // Empty array means "no candidate should be proposed" -- itself a real,
  // scored expectation (false-persistence-proposal rate's own denominator).
  expectedCandidates: ReadonlyArray<ExpectedExtractionCandidate>;
  // External review, 2026-09-14: bounded, fixture-specific prior-event
  // context, mirroring the exact shape runStructuredExtraction's own
  // `recentHomeEvents` parameter already takes. Unset (undefined, not an
  // empty array -- the harness's own default treats the two identically via
  // `?? []`) for every fixture that isn't specifically testing correction
  // resolution. Only CORRECTION-category rows need this today.
  priorHomeEvents?: ReadonlyArray<RecentHomeEventContext>;
  provenance: 'ASK_COZY_STAGE3_PHASE3_V1';
}

const ROWS: ReadonlyArray<Omit<ExtractionCorpusFixture, 'provenance'>> = [
  // Positive factual statements
  { fixtureId: 'pos-1', message: 'I replaced the roof last summer for $14,500.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, RANGE precision, amount 14500', expectedCandidates: [{ category: 'EVENT', titleKeyword: 'roof', datePrecision: 'RANGE', attribution: 'FIRSTHAND', hasAmount: true, expectedAmount: 14500 }] },
  { fixtureId: 'pos-2', message: 'My mortgage rate is 6.75%.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: financial.currentMortgage = 6.75', expectedCandidates: [{ category: 'FACT', factKey: 'financial.currentMortgage', expectedValue: 6.75, attribution: 'FIRSTHAND' }] },
  { fixtureId: 'pos-3', message: 'We installed a new water heater in March.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: water heater install, MONTH precision', expectedCandidates: [{ category: 'EVENT', datePrecision: 'MONTH', attribution: 'FIRSTHAND' }] },

  // Negative questions -- pure hypothetical/interrogative, no reported fact.
  { fixtureId: 'neg-1', message: 'Should I refinance?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
  { fixtureId: 'neg-2', message: 'Is my roof at risk because of the storms?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
  { fixtureId: 'neg-3', message: 'Do I need to replace my HVAC system soon?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },

  // Mixed question + fact (FRD §8.3)
  { fixtureId: 'mix-1', message: 'I serviced the HVAC yesterday for $275. Was that too expensive?', category: 'MIXED_QUESTION_AND_FACT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: HVAC service, EXACT_DATE, amount 275', expectedCandidates: [{ category: 'EVENT', titleKeyword: 'hvac', datePrecision: 'EXACT_DATE', attribution: 'FIRSTHAND', hasAmount: true, expectedAmount: 275 }] },
  { fixtureId: 'mix-2', message: 'We just repainted the exterior. Does that help with resale value?', category: 'MIXED_QUESTION_AND_FACT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: exterior paint', expectedCandidates: [{ category: 'EVENT', attribution: 'FIRSTHAND' }] },

  // Hedged statements
  { fixtureId: 'hedge-1', message: 'I think we replaced the water heater around 2019.', category: 'HEDGED_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: water heater replacement, YEAR precision, low confidence', expectedCandidates: [{ category: 'EVENT', datePrecision: 'YEAR', attribution: 'FIRSTHAND' }] },
  { fixtureId: 'hedge-2', message: "I'm not totally sure, but I believe the roof is about 10 years old.", category: 'HEDGED_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: structure.roofReplacementYear (approximate), low confidence', expectedCandidates: [{ category: 'FACT', factKey: 'structure.roofReplacementYear', attribution: 'FIRSTHAND' }] },

  // Third-party statements
  { fixtureId: 'third-1', message: 'The inspector said our electrical panel needs to be upgraded.', category: 'THIRD_PARTY_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT/GUIDANCE, attribution THIRD_PARTY_RELAYED', expectedCandidates: [{ category: 'FACT', attribution: 'THIRD_PARTY_RELAYED' }] },
  { fixtureId: 'third-2', message: 'Our plumber told me the water heater is about 8 years old.', category: 'THIRD_PARTY_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: systems.waterHeaterInstallYear (approximate), attribution THIRD_PARTY_RELAYED', expectedCandidates: [{ category: 'FACT', factKey: 'systems.waterHeaterInstallYear', attribution: 'THIRD_PARTY_RELAYED' }] },

  // Corrections (FRD §8.7)
  { fixtureId: 'corr-1', message: 'Actually, the roof was replaced in 2023, not 2024.', category: 'CORRECTION', expectedPreFilterFire: true, expectedCandidateSummary: 'CORRECTION: roof replacement event, year 2023', expectedCandidates: [{ category: 'EVENT', datePrecision: 'YEAR', attribution: 'FIRSTHAND', isCorrection: true }], priorHomeEvents: [{ id: 'prior-roof-2024', title: 'Roof replacement', occurredAt: '2024-06-01T00:00:00.000Z', amount: null }] },
  { fixtureId: 'corr-2', message: 'Correction -- it cost $9,200, not $8,000.', category: 'CORRECTION', expectedPreFilterFire: true, expectedCandidateSummary: 'CORRECTION: amount 9200', expectedCandidates: [{ category: 'EVENT', attribution: 'FIRSTHAND', isCorrection: true, hasAmount: true, expectedAmount: 9200 }], priorHomeEvents: [{ id: 'prior-repair-8000', title: 'Home repair', occurredAt: '2026-06-01T00:00:00.000Z', amount: 8000 }] },

  // Ambiguous dates -- still a genuine statement, imprecise timing
  { fixtureId: 'amb-1', message: 'We had the roof redone a few years ago.', category: 'AMBIGUOUS_DATE', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, UNKNOWN/RANGE precision', expectedCandidates: [{ category: 'EVENT', attribution: 'FIRSTHAND' }] },
  { fixtureId: 'amb-2', message: 'The furnace was replaced sometime before we moved in.', category: 'AMBIGUOUS_DATE', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: furnace replacement, UNKNOWN precision', expectedCandidates: [{ category: 'EVENT', datePrecision: 'UNKNOWN', attribution: 'FIRSTHAND' }] },

  // Cost/provider combinations
  { fixtureId: 'cost-1', message: "I paid Joe's Plumbing $450 to fix the leak under the sink.", category: 'COST_PROVIDER_COMBINATION', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: plumbing repair, providerName "Joe\'s Plumbing", amount 450', expectedCandidates: [{ category: 'EVENT', titleKeyword: 'leak', attribution: 'FIRSTHAND', hasAmount: true, expectedAmount: 450, hasProviderName: true, expectedProviderName: "Joe's Plumbing" }] },
  { fixtureId: 'cost-2', message: 'Hired ABC Roofing for $12,000 to redo the whole roof.', category: 'COST_PROVIDER_COMBINATION', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, providerName "ABC Roofing", amount 12000', expectedCandidates: [{ category: 'EVENT', titleKeyword: 'roof', attribution: 'FIRSTHAND', hasAmount: true, expectedAmount: 12000, hasProviderName: true, expectedProviderName: 'ABC Roofing' }] },

  // Multiple facts in one turn
  { fixtureId: 'multi-1', message: 'I replaced the water heater last year and also added a sump pump backup in the basement.', category: 'MULTIPLE_FACTS', expectedPreFilterFire: true, expectedCandidateSummary: 'two EVENT candidates: water heater replacement, sump pump backup install', expectedCandidates: [{ category: 'EVENT', titleKeyword: 'water heater', attribution: 'FIRSTHAND' }, { category: 'EVENT', titleKeyword: 'sump pump', attribution: 'FIRSTHAND' }] },

  // Unrelated household conversation -- should never fire
  { fixtureId: 'unrelated-1', message: 'Can you recommend a good recipe for dinner tonight?', category: 'UNRELATED_HOUSEHOLD_CONVERSATION', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
  { fixtureId: 'unrelated-2', message: 'What time is it in Tokyo right now?', category: 'UNRELATED_HOUSEHOLD_CONVERSATION', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },

  // False-positive traps -- surface words that could look like a report but aren't
  { fixtureId: 'trap-1', message: 'How much does it cost to replace a roof around here?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
  { fixtureId: 'trap-2', message: 'Should I have the water heater serviced this year?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
  { fixtureId: 'trap-3', message: 'What is a fair price to pay a contractor for a roof repair?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none', expectedCandidates: [] },
];

export const EXTRACTION_EVALUATION_CORPUS: ReadonlyArray<ExtractionCorpusFixture> = ROWS.map((row) => ({
  ...row,
  provenance: 'ASK_COZY_STAGE3_PHASE3_V1',
}));
