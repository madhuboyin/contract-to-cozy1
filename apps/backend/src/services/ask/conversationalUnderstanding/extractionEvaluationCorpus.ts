// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §15).
//
// A dedicated, hand-labeled, frozen fixture corpus, following
// askTrustCertificationCorpus.ts's own established template (categorized
// rows, a provenance tag, a corpus-integrity test rather than a runtime
// scoring assertion baked into product code). FRD §15 requires all eleven
// categories below; each row's `expectedPreFilterFire` is this pass's own
// hand label of what a correct pre-filter should do, used by
// extractionPreFilter.test.js to compute recall/precision against FRD §15's
// pilot thresholds.
//
// FRD §15's other metrics (candidate category/field/date-precision/
// attribution accuracy, duplicate rate, false-persistence rate) score the
// LLM extractor's OUTPUT, not the deterministic pre-filter -- those require
// a live model call per row and are deliberately NOT asserted as passing
// here (FRD §15: "this document does not claim they are validated against
// production traffic"). `expectedCandidateSummary` is recorded now, on each
// row, so that harness can be pointed at this same corpus once it exists,
// without re-authoring the fixtures.

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

export interface ExtractionCorpusFixture {
  fixtureId: string;
  message: string;
  category: ExtractionCorpusCategory;
  expectedPreFilterFire: boolean;
  expectedCandidateSummary: string;
  provenance: 'ASK_COZY_STAGE3_PHASE3_V1';
}

const ROWS: ReadonlyArray<Omit<ExtractionCorpusFixture, 'provenance'>> = [
  // Positive factual statements
  { fixtureId: 'pos-1', message: 'I replaced the roof last summer for $14,500.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, RANGE precision, amount 14500' },
  { fixtureId: 'pos-2', message: 'My mortgage rate is 6.75%.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: financial.currentMortgage = 6.75' },
  { fixtureId: 'pos-3', message: 'We installed a new water heater in March.', category: 'POSITIVE_FACTUAL_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: water heater install, MONTH precision' },

  // Negative questions -- pure hypothetical/interrogative, no reported fact.
  { fixtureId: 'neg-1', message: 'Should I refinance?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
  { fixtureId: 'neg-2', message: 'Is my roof at risk because of the storms?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
  { fixtureId: 'neg-3', message: 'Do I need to replace my HVAC system soon?', category: 'NEGATIVE_QUESTION', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },

  // Mixed question + fact (FRD §8.3)
  { fixtureId: 'mix-1', message: 'I serviced the HVAC yesterday for $275. Was that too expensive?', category: 'MIXED_QUESTION_AND_FACT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: HVAC service, EXACT_DATE, amount 275' },
  { fixtureId: 'mix-2', message: 'We just repainted the exterior. Does that help with resale value?', category: 'MIXED_QUESTION_AND_FACT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: exterior paint' },

  // Hedged statements
  { fixtureId: 'hedge-1', message: 'I think we replaced the water heater around 2019.', category: 'HEDGED_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: water heater replacement, YEAR precision, low confidence' },
  { fixtureId: 'hedge-2', message: "I'm not totally sure, but I believe the roof is about 10 years old.", category: 'HEDGED_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: structure.roofReplacementYear (approximate), low confidence' },

  // Third-party statements
  { fixtureId: 'third-1', message: 'The inspector said our electrical panel needs to be upgraded.', category: 'THIRD_PARTY_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT/GUIDANCE, attribution THIRD_PARTY_RELAYED' },
  { fixtureId: 'third-2', message: 'Our plumber told me the water heater is about 8 years old.', category: 'THIRD_PARTY_STATEMENT', expectedPreFilterFire: true, expectedCandidateSummary: 'FACT: systems.waterHeaterInstallYear (approximate), attribution THIRD_PARTY_RELAYED' },

  // Corrections (FRD §8.7)
  { fixtureId: 'corr-1', message: 'Actually, the roof was replaced in 2023, not 2024.', category: 'CORRECTION', expectedPreFilterFire: true, expectedCandidateSummary: 'CORRECTION: roof replacement event, year 2023' },
  { fixtureId: 'corr-2', message: 'Correction -- it cost $9,200, not $8,000.', category: 'CORRECTION', expectedPreFilterFire: true, expectedCandidateSummary: 'CORRECTION: amount 9200' },

  // Ambiguous dates -- still a genuine statement, imprecise timing
  { fixtureId: 'amb-1', message: 'We had the roof redone a few years ago.', category: 'AMBIGUOUS_DATE', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, UNKNOWN/RANGE precision' },
  { fixtureId: 'amb-2', message: 'The furnace was replaced sometime before we moved in.', category: 'AMBIGUOUS_DATE', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: furnace replacement, UNKNOWN precision' },

  // Cost/provider combinations
  { fixtureId: 'cost-1', message: "I paid Joe's Plumbing $450 to fix the leak under the sink.", category: 'COST_PROVIDER_COMBINATION', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: plumbing repair, providerName "Joe\'s Plumbing", amount 450' },
  { fixtureId: 'cost-2', message: 'Hired ABC Roofing for $12,000 to redo the whole roof.', category: 'COST_PROVIDER_COMBINATION', expectedPreFilterFire: true, expectedCandidateSummary: 'EVENT: roof replacement, providerName "ABC Roofing", amount 12000' },

  // Multiple facts in one turn
  { fixtureId: 'multi-1', message: 'I replaced the water heater last year and also added a sump pump backup in the basement.', category: 'MULTIPLE_FACTS', expectedPreFilterFire: true, expectedCandidateSummary: 'two EVENT candidates: water heater replacement, sump pump backup install' },

  // Unrelated household conversation -- should never fire
  { fixtureId: 'unrelated-1', message: 'Can you recommend a good recipe for dinner tonight?', category: 'UNRELATED_HOUSEHOLD_CONVERSATION', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
  { fixtureId: 'unrelated-2', message: 'What time is it in Tokyo right now?', category: 'UNRELATED_HOUSEHOLD_CONVERSATION', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },

  // False-positive traps -- surface words that could look like a report but aren't
  { fixtureId: 'trap-1', message: 'How much does it cost to replace a roof around here?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
  { fixtureId: 'trap-2', message: 'Should I have the water heater serviced this year?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
  { fixtureId: 'trap-3', message: 'What is a fair price to pay a contractor for a roof repair?', category: 'FALSE_POSITIVE_TRAP', expectedPreFilterFire: false, expectedCandidateSummary: 'none' },
];

export const EXTRACTION_EVALUATION_CORPUS: ReadonlyArray<ExtractionCorpusFixture> = ROWS.map((row) => ({
  ...row,
  provenance: 'ASK_COZY_STAGE3_PHASE3_V1',
}));
