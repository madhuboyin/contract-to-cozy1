import {
  InsuranceClaimSettlementAnalysisResult,
  NegotiationShieldFinding,
  NegotiationShieldLeveragePoint,
  NegotiationShieldPricingAssessment,
  NegotiationShieldRecommendedAction,
} from './negotiationShield.types';

type ClaimSettlementPropertySignals = {
  roofReplacementYear: number | null;
  roofAgeYears: number | null;
  completedMaintenanceCount: number;
  recentImprovementCount: number;
  claimCount: number;
  claimFreeRecorded: boolean;
};

export type NormalizedInsuranceClaimSettlementContext = {
  caseTitle: string;
  caseDescription: string | null;
  insurerName: string | null;
  claimType: string | null;
  settlementAmount: number | null;
  estimateAmount: number | null;
  gapAmount: number | null;
  gapPercentage: number | null;
  claimDate: string | null;
  reasonProvided: string | null;
  notes: string | null;
  rawText: string | null;
  hasAnyDocument: boolean;
  settlementNoticeDocumentCount: number;
  estimateDocumentCount: number;
  supportingDocumentCount: number;
  propertySignals: ClaimSettlementPropertySignals;
};

const MODEL_VERSION = 'insurance-claim-settlement-rules-v1';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasText(value: string | null | undefined, minLength = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function formatCurrency(amount: number | null): string | null {
  if (amount === null || !Number.isFinite(amount)) return null;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function inferConfidenceLabel(confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function addFinding(target: NegotiationShieldFinding[], item: NegotiationShieldFinding | null) {
  if (item) target.push(item);
}

function addLeverage(
  target: NegotiationShieldLeveragePoint[],
  item: NegotiationShieldLeveragePoint | null
) {
  if (item) target.push(item);
}

function addAction(
  target: NegotiationShieldRecommendedAction[],
  item: NegotiationShieldRecommendedAction | null
) {
  if (item) target.push(item);
}

function buildAssessment(
  ctx: NormalizedInsuranceClaimSettlementContext
): NegotiationShieldPricingAssessment {
  const rationale: string[] = [];

  if (ctx.settlementAmount === null) {
    rationale.push('No insurer settlement amount was captured.');
  }
  if (ctx.estimateAmount === null) {
    rationale.push('No repair or contractor estimate was captured.');
  }
  if (!hasText(ctx.reasonProvided, 20)) {
    rationale.push('The insurer rationale is missing or weak in the supplied input.');
  }
  if (ctx.estimateDocumentCount > 0) {
    rationale.push('A repair estimate document is attached and can support reconsideration.');
  }
  if (ctx.propertySignals.completedMaintenanceCount > 0 || ctx.propertySignals.recentImprovementCount > 0) {
    rationale.push('Property documentation history may help support the claim discussion.');
  }

  if (ctx.settlementAmount === null || ctx.estimateAmount === null) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'There is not enough settlement detail yet to judge whether the amount appears supportable.',
      rationale,
      confidenceLabel: 'LOW',
      currency: 'USD',
      settlementAmount: ctx.settlementAmount,
      estimateAmount: ctx.estimateAmount,
      gapAmount: ctx.gapAmount,
      gapPercentage: ctx.gapPercentage,
    };
  }

  if (ctx.gapAmount !== null && ctx.gapAmount > 0) {
    return {
      status: 'SETTLEMENT_GAP_PRESENT',
      summary:
        'The current case suggests the insurer settlement may not fully cover the documented repair estimate, which supports asking for review or supplemental consideration.',
      rationale,
      confidenceLabel: hasText(ctx.reasonProvided, 20) ? 'MEDIUM' : 'HIGH',
      currency: 'USD',
      settlementAmount: ctx.settlementAmount,
      estimateAmount: ctx.estimateAmount,
      gapAmount: ctx.gapAmount,
      gapPercentage: ctx.gapPercentage,
    };
  }

  if (!hasText(ctx.reasonProvided, 20)) {
    return {
      status: 'EXPLANATION_UNCLEAR',
      summary:
        'The settlement amount may or may not be workable, but the explanation behind it is not clear enough from the current input.',
      rationale,
      confidenceLabel: 'MEDIUM',
      currency: 'USD',
      settlementAmount: ctx.settlementAmount,
      estimateAmount: ctx.estimateAmount,
      gapAmount: ctx.gapAmount,
      gapPercentage: ctx.gapPercentage,
    };
  }

  return {
    status: 'NEEDS_REVIEW',
    summary:
      'The settlement is documented, but it still makes sense to ask how the amount was calculated and whether any supplemental review is available.',
    rationale,
    confidenceLabel: 'MEDIUM',
    currency: 'USD',
    settlementAmount: ctx.settlementAmount,
    estimateAmount: ctx.estimateAmount,
    gapAmount: ctx.gapAmount,
    gapPercentage: ctx.gapPercentage,
  };
}

function buildSummary(
  ctx: NormalizedInsuranceClaimSettlementContext,
  assessment: NegotiationShieldPricingAssessment
) {
  if (assessment.status === 'INSUFFICIENT_DATA') {
    return 'There is not enough settlement detail yet to judge the amount, so the next step should be gathering the insurer amount, any repair estimate, and a written explanation.';
  }

  if (assessment.status === 'SETTLEMENT_GAP_PRESENT') {
    return 'This claim appears worth challenging. The current information suggests the insurer settlement may fall short of the repair estimate, which gives the homeowner evidence-backed leverage.';
  }

  if (!hasText(ctx.reasonProvided, 20)) {
    return 'The settlement may be legitimate, but the homeowner does not yet have a clear explanation of how the insurer arrived at the amount, which is the first issue to press on.';
  }

  return 'The settlement is more documented than a bare number, but the homeowner still has room to ask for methodology, supporting detail, and any supplemental review path.';
}

function buildDraft(
  ctx: NormalizedInsuranceClaimSettlementContext,
  actions: NegotiationShieldRecommendedAction[]
) {
  const greeting = hasText(ctx.insurerName) ? `Hello ${ctx.insurerName} claims team,` : 'Hello,';
  const subject = hasText(ctx.claimType)
    ? `Request for review of ${ctx.claimType} claim settlement`
    : 'Request for review of claim settlement';
  const topRequests = actions.slice(0, 4).map((action) => `- ${action.title}: ${action.detail}`);

  const settlementLine = (() => {
    const settlementLabel = formatCurrency(ctx.settlementAmount);
    const estimateLabel = formatCurrency(ctx.estimateAmount);

    if (settlementLabel && estimateLabel) {
      return `I’m reviewing the current settlement amount of ${settlementLabel} alongside a repair estimate of ${estimateLabel}.`;
    }
    if (settlementLabel) {
      return `I’m reviewing the current settlement amount of ${settlementLabel}.`;
    }
    return 'I’m reviewing the current claim settlement decision.';
  })();

  return {
    draftType: 'EMAIL' as const,
    subject,
    body: [
      greeting,
      '',
      settlementLine,
      'Based on the information I have so far, I would like a clearer explanation of how the settlement was calculated and whether additional review is available.',
      '',
      ...topRequests,
      '',
      'If there is any additional documentation that would help with reconsideration or supplemental review, please let me know.',
      '',
      'Thank you,',
      '[Your Name]',
    ].join('\n'),
    tone: 'POLITE_FIRM',
  };
}

export function generateInsuranceClaimSettlementAnalysis(
  ctx: NormalizedInsuranceClaimSettlementContext
): InsuranceClaimSettlementAnalysisResult {
  const findings: NegotiationShieldFinding[] = [];
  const leverage: NegotiationShieldLeveragePoint[] = [];
  const actions: NegotiationShieldRecommendedAction[] = [];

  addFinding(
    findings,
    ctx.settlementAmount !== null
      ? {
          key: 'settlement_amount_present',
          title: 'Settlement amount provided',
          detail: `The insurer settlement amount is recorded as ${formatCurrency(ctx.settlementAmount)}.`,
          status: 'INFO',
        }
      : {
          key: 'settlement_amount_missing',
          title: 'Settlement amount missing',
          detail: 'The case does not clearly capture the insurer settlement amount.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.estimateAmount !== null
      ? {
          key: 'estimate_amount_present',
          title: 'Repair estimate provided',
          detail: `A repair or contractor estimate of ${formatCurrency(ctx.estimateAmount)} is available.`,
          status: 'INFO',
        }
      : {
          key: 'estimate_amount_missing',
          title: 'Repair estimate missing',
          detail: 'The case does not clearly capture a repair estimate to compare against the settlement.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.gapAmount !== null
      ? {
          key: 'settlement_gap_computed',
          title: 'Settlement gap can be calculated',
          detail:
            ctx.gapAmount > 0
              ? `The repair estimate appears to exceed the settlement by about ${formatCurrency(ctx.gapAmount)}${ctx.gapPercentage !== null ? ` (${ctx.gapPercentage.toFixed(1)}%)` : ''}.`
              : 'The settlement does not appear lower than the repair estimate based on the current amounts.',
          status: ctx.gapAmount > 0 ? 'CAUTION' : 'POSITIVE',
        }
      : {
          key: 'settlement_gap_missing',
          title: 'Settlement gap unclear',
          detail: 'There is not enough amount data to calculate the gap between settlement and repair cost.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.reasonProvided, 20)
      ? {
          key: 'rationale_present',
          title: 'Insurer rationale provided',
          detail: 'The case includes at least some explanation of the settlement decision.',
          status: 'INFO',
        }
      : {
          key: 'rationale_missing',
          title: 'Insurer rationale missing or weak',
          detail: 'The current input does not clearly explain how the insurer arrived at the settlement amount.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.hasAnyDocument
      ? {
          key: 'supporting_docs_present',
          title: 'Supporting claim documents attached',
          detail: `The case includes ${ctx.settlementNoticeDocumentCount + ctx.estimateDocumentCount + ctx.supportingDocumentCount} attached document${ctx.settlementNoticeDocumentCount + ctx.estimateDocumentCount + ctx.supportingDocumentCount === 1 ? '' : 's'}.`,
          status: 'POSITIVE',
        }
      : {
          key: 'supporting_docs_missing',
          title: 'No supporting documents attached',
          detail: 'No settlement letter, estimate, or supporting document is attached yet.',
          status: 'INFO',
        }
  );

  addLeverage(
    leverage,
    ctx.gapAmount !== null && ctx.gapAmount > 0
      ? {
          key: 'estimate_exceeds_settlement',
          title: 'Estimate exceeds settlement',
          detail: 'The repair estimate appears higher than the insurer settlement, which gives the homeowner a concrete basis for review.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    hasText(ctx.reasonProvided, 20)
      ? null
      : {
          key: 'request_methodology',
          title: 'Ask how the settlement was calculated',
          detail: 'If the methodology is unclear, the homeowner can request a written explanation of the scope, pricing assumptions, and omitted items.',
          strength: 'MEDIUM',
        }
  );

  addLeverage(
    leverage,
    ctx.estimateDocumentCount > 0 || ctx.supportingDocumentCount > 0
      ? {
          key: 'documentation_backed_review',
          title: 'Documentation can support reconsideration',
          detail: 'Attached estimates or supporting files strengthen a request for supplemental or reconsidered review.',
          strength: 'MEDIUM',
        }
      : null
  );

  addAction(actions, {
    key: 'request_written_explanation',
    title: 'Request a written settlement explanation',
    detail: 'Ask the insurer to explain how the settlement amount was calculated and what scope it includes.',
    priority: 'HIGH',
  });

  addAction(
    actions,
    ctx.estimateAmount !== null
      ? {
          key: 'reference_estimate',
          title: 'Submit or reference the repair estimate',
          detail: 'Point to the estimate amount directly and ask the insurer to address any difference in scope or pricing.',
          priority: 'HIGH',
        }
      : {
          key: 'obtain_estimate',
          title: 'Get a documented repair estimate',
          detail: 'Obtain at least one written estimate so the settlement can be compared against a documented repair cost.',
          priority: 'HIGH',
        }
  );

  addAction(actions, {
    key: 'ask_about_supplemental_review',
    title: 'Ask whether supplemental review is available',
    detail: 'If the current amount seems incomplete, ask what additional documentation would support a revised review.',
    priority: 'MEDIUM',
  });

  addAction(
    actions,
    ctx.hasAnyDocument
      ? {
          key: 'organize_supporting_docs',
          title: 'Organize attached documentation',
          detail: 'Keep the settlement notice, estimate, and any photos or scope notes together so the request stays specific and easy to review.',
          priority: 'MEDIUM',
        }
      : null
  );

  const assessment = buildAssessment(ctx);
  const missingCount = findings.filter((item) => item.status === 'MISSING').length;
  const supportScore =
    (ctx.settlementAmount !== null ? 1 : 0) +
    (ctx.estimateAmount !== null ? 1 : 0) +
    (hasText(ctx.reasonProvided, 20) ? 1 : 0) +
    (ctx.hasAnyDocument ? 1 : 0);
  const confidence = clamp(0.35 + supportScore * 0.12 - missingCount * 0.05, 0.25, 0.88);

  return {
    summary: buildSummary(ctx, assessment),
    findings,
    negotiationLeverage: leverage,
    recommendedActions: actions,
    pricingAssessment: {
      ...assessment,
      confidenceLabel: inferConfidenceLabel(confidence),
    },
    confidence,
    modelVersion: MODEL_VERSION,
    draft: buildDraft(ctx, actions),
  };
}
