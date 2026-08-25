export const COVERAGE_REVIEW_RULE_VERSION = 1;
export const MAX_PRIMARY_COVERAGE_QUESTIONS = 3;

export type CoverageReviewScope = 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';
export type CoverageReviewState =
  | 'HEALTHY_SCOPED'
  | 'QUESTIONS'
  | 'NEEDS_EVIDENCE'
  | 'UNSUPPORTED'
  // HI-DOC-004: a newly extracted policy fact disagrees with an already
  // confirmed one on the same policy — this review cannot answer coverage
  // questions with either value until a homeowner resolves which is
  // correct. See coverageReview.service.ts's hasUnresolvedConflict.
  | 'CONFLICTED';

export type ReviewFact = {
  id: string;
  factKey: string;
  confirmationStatus: string;
  valueType: string;
  amountValue?: number | null;
  textValue?: string | null;
  booleanValue?: boolean | null;
  sourceDocumentId?: string | null;
  sourcePage?: number | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

export type ReviewTerm = {
  id: string;
  verificationStatus: string;
  termStart: Date | null;
  termEnd: Date | null;
  facts: ReviewFact[];
};

export type EvaluatedCoverageQuestion = {
  questionKey: string;
  questionType: 'EVIDENCE_BASED' | 'GENERAL';
  category: 'TERM' | 'DEDUCTIBLE' | 'POLICY_FORM' | 'LIMITS' | 'EVIDENCE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  isPrimary: true;
  plainLanguageQuestion: string;
  whyItMatters: string;
  evidence: Array<Record<string, unknown>>;
  missingEvidence: Array<Record<string, unknown>>;
  professionalBoundary: string;
  material: boolean;
};

export type CoverageReviewEvaluation = {
  scopeStatus: CoverageReviewScope;
  overallState: CoverageReviewState;
  supportedFactKeys: string[];
  unsupportedFactKeys: string[];
  questions: EvaluatedCoverageQuestion[];
  healthySummary: string | null;
};

const REVIEWED_FACT_KEYS = [
  'ALL_PERIL_DEDUCTIBLE',
  'DWELLING_LIMIT',
  'LIABILITY_LIMIT',
  'POLICY_FORM',
] as const;

const PROFESSIONAL_BOUNDARY =
  'Use the controlling policy language and a licensed insurance professional for coverage decisions.';

function factEvidence(fact: ReviewFact) {
  return {
    factId: fact.id,
    factKey: fact.factKey,
    confirmationStatus: fact.confirmationStatus,
    sourceDocumentId: fact.sourceDocumentId ?? null,
    sourcePage: fact.sourcePage ?? null,
    effectiveFrom: fact.effectiveFrom?.toISOString() ?? null,
    effectiveTo: fact.effectiveTo?.toISOString() ?? null,
  };
}

function generalQuestion(params: {
  questionKey: string;
  category: EvaluatedCoverageQuestion['category'];
  priority: EvaluatedCoverageQuestion['priority'];
  question: string;
  why: string;
  missingFactKeys: string[];
}): EvaluatedCoverageQuestion {
  return {
    questionKey: params.questionKey,
    questionType: 'GENERAL',
    category: params.category,
    priority: params.priority,
    isPrimary: true,
    plainLanguageQuestion: params.question,
    whyItMatters: params.why,
    evidence: [],
    missingEvidence: params.missingFactKeys.map((factKey) => ({
      factKey,
      reason: 'No homeowner-confirmed value is available for this reviewed field.',
    })),
    professionalBoundary: PROFESSIONAL_BOUNDARY,
    material: false,
  };
}

export function evaluateCoverageReview(
  term: ReviewTerm | null,
  evaluatedAt = new Date(),
  options: { hasUnresolvedConflict?: boolean } = {}
): CoverageReviewEvaluation {
  if (options.hasUnresolvedConflict) {
    return {
      scopeStatus: 'UNSUPPORTED',
      overallState: 'CONFLICTED',
      supportedFactKeys: [],
      unsupportedFactKeys: [],
      questions: [
        generalQuestion({
          questionKey: 'RESOLVE_POLICY_FACT_CONFLICT',
          category: 'EVIDENCE',
          priority: 'HIGH',
          question: 'A newly uploaded policy document disagrees with your confirmed policy details. Which is correct?',
          why: 'This coverage review cannot be trusted until the conflicting policy facts are resolved to one confirmed value.',
          missingFactKeys: [...REVIEWED_FACT_KEYS],
        }),
      ],
      healthySummary: null,
    };
  }
  if (!term) {
    return {
      scopeStatus: 'UNSUPPORTED',
      overallState: 'NEEDS_EVIDENCE',
      supportedFactKeys: [],
      unsupportedFactKeys: [],
      questions: [
        generalQuestion({
          questionKey: 'ADD_POLICY_TERM',
          category: 'EVIDENCE',
          priority: 'HIGH',
          question: 'Can you add or confirm the current declarations page?',
          why: 'A current policy term is needed before ContractToCozy can ask evidence-based coverage questions.',
          missingFactKeys: [...REVIEWED_FACT_KEYS],
        }),
      ],
      healthySummary: null,
    };
  }

  const confirmedFacts = term.facts.filter(
    (fact) => fact.confirmationStatus === 'CONFIRMED'
  );
  const factsByKey = new Map(confirmedFacts.map((fact) => [fact.factKey, fact]));
  const supportedFactKeys = REVIEWED_FACT_KEYS.filter((key) => factsByKey.has(key));
  const unsupportedFactKeys = confirmedFacts
    .map((fact) => fact.factKey)
    .filter((key) => !REVIEWED_FACT_KEYS.includes(key as (typeof REVIEWED_FACT_KEYS)[number]));
  const scopeStatus: CoverageReviewScope =
    supportedFactKeys.length === 0
      ? 'UNSUPPORTED'
      : supportedFactKeys.length === REVIEWED_FACT_KEYS.length &&
          term.verificationStatus === 'VERIFIED'
        ? 'SUPPORTED'
        : 'PARTIAL';
  const questions: EvaluatedCoverageQuestion[] = [];

  if (
    term.verificationStatus === 'VERIFIED' &&
    term.termEnd &&
    term.termEnd.getTime() <= evaluatedAt.getTime()
  ) {
    questions.push({
      questionKey: 'TERM_EXPIRED',
      questionType: 'EVIDENCE_BASED',
      category: 'TERM',
      priority: 'HIGH',
      isPrimary: true,
      plainLanguageQuestion: 'Is there a newer policy term or renewal document to add?',
      whyItMatters: 'The confirmed term end date is in the past, so this review may not describe the current policy.',
      evidence: [
        {
          policyTermId: term.id,
          verificationStatus: term.verificationStatus,
          termEnd: term.termEnd.toISOString(),
        },
      ],
      missingEvidence: [{ factKey: 'CURRENT_POLICY_TERM', reason: 'No later verified term is available.' }],
      professionalBoundary: PROFESSIONAL_BOUNDARY,
      material: true,
    });
  }

  const deductible = factsByKey.get('ALL_PERIL_DEDUCTIBLE');
  if (
    deductible?.valueType === 'AMOUNT' &&
    deductible.amountValue != null &&
    deductible.amountValue >= 5_000
  ) {
    questions.push({
      questionKey: 'HIGH_DEDUCTIBLE_AFFORDABILITY',
      questionType: 'EVIDENCE_BASED',
      category: 'DEDUCTIBLE',
      priority: 'HIGH',
      isPrimary: true,
      plainLanguageQuestion: `Could your household comfortably cover the confirmed ${new Intl.NumberFormat(
        'en-US',
        { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }
      ).format(deductible.amountValue)} deductible after a loss?`,
      whyItMatters: 'A higher retained amount can affect how quickly repairs can begin after a covered loss.',
      evidence: [factEvidence(deductible)],
      missingEvidence: [],
      professionalBoundary: PROFESSIONAL_BOUNDARY,
      material: true,
    });
  }

  if (!factsByKey.has('POLICY_FORM')) {
    questions.push(
      generalQuestion({
        questionKey: 'CONFIRM_POLICY_FORM',
        category: 'POLICY_FORM',
        priority: 'MEDIUM',
        question: 'What policy form or valuation basis appears on the declarations page?',
        why: 'The policy form helps frame which language should be reviewed without inferring coverage from a generic label.',
        missingFactKeys: ['POLICY_FORM'],
      })
    );
  }

  const missingLimits = ['DWELLING_LIMIT', 'LIABILITY_LIMIT'].filter(
    (key) => !factsByKey.has(key)
  );
  if (missingLimits.length > 0) {
    questions.push(
      generalQuestion({
        questionKey: 'CONFIRM_MATERIAL_LIMITS',
        category: 'LIMITS',
        priority: 'MEDIUM',
        question: 'Can you confirm the dwelling and personal-liability limits shown on the policy?',
        why: 'These material limits must be confirmed before the review can describe its supported scope.',
        missingFactKeys: missingLimits,
      })
    );
  }

  const primaryQuestions = questions
    .sort((left, right) => {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return rank[left.priority] - rank[right.priority];
    })
    .slice(0, MAX_PRIMARY_COVERAGE_QUESTIONS);

  if (scopeStatus === 'UNSUPPORTED' && primaryQuestions.length === 0) {
    primaryQuestions.push(
      generalQuestion({
        questionKey: 'CONFIRM_REVIEWED_FIELDS',
        category: 'EVIDENCE',
        priority: 'HIGH',
        question: 'Can you confirm the core fields from the current declarations page?',
        why: 'The available policy language is outside this limited reviewed field set and cannot support a determination.',
        missingFactKeys: [...REVIEWED_FACT_KEYS],
      })
    );
  }

  return {
    scopeStatus,
    overallState:
      scopeStatus === 'UNSUPPORTED'
        ? 'UNSUPPORTED'
        : primaryQuestions.length > 0
          ? 'QUESTIONS'
          : 'HEALTHY_SCOPED',
    supportedFactKeys: [...supportedFactKeys],
    unsupportedFactKeys,
    questions: primaryQuestions,
    healthySummary:
      scopeStatus === 'SUPPORTED' && primaryQuestions.length === 0
        ? 'No question was raised within the limited reviewed fields. This is not a statement that the policy has no gaps.'
        : null,
  };
}
