import {
  BuyerInspectionNegotiationAnalysisResult,
  NegotiationShieldFinding,
  NegotiationShieldLeveragePoint,
  NegotiationShieldPricingAssessment,
  NegotiationShieldRecommendedAction,
} from './negotiationShield.types';

type BuyerInspectionPropertySignals = {
  roofReplacementYear: number | null;
  roofAgeYears: number | null;
  completedMaintenanceCount: number;
  recentImprovementCount: number;
};

export type NormalizedBuyerInspectionNegotiationContext = {
  caseTitle: string;
  caseDescription: string | null;
  requestedConcessionAmount: number | null;
  inspectionIssuesSummary: string | null;
  requestedRepairs: string | null;
  recentUpgradeNotes: string | null;
  reportDate: string | null;
  notes: string | null;
  rawText: string | null;
  hasAnyDocument: boolean;
  inspectionReportDocumentCount: number;
  buyerRequestDocumentCount: number;
  supportingDocumentCount: number;
  propertySignals: BuyerInspectionPropertySignals;
};

const MODEL_VERSION = 'buyer-inspection-negotiation-rules-v1';

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
  ctx: NormalizedBuyerInspectionNegotiationContext
): NegotiationShieldPricingAssessment {
  const rationale: string[] = [];
  const hasUpgradeSignal =
    hasText(ctx.recentUpgradeNotes, 20) ||
    ctx.propertySignals.recentImprovementCount > 0 ||
    ctx.propertySignals.roofReplacementYear !== null;

  if (ctx.requestedConcessionAmount === null) {
    rationale.push('No buyer concession amount is clearly captured yet.');
  }
  if (!hasText(ctx.inspectionIssuesSummary, 20) && !hasText(ctx.requestedRepairs, 20)) {
    rationale.push('The inspection-driven issues are not clearly itemized in the current case.');
  }
  if (hasUpgradeSignal) {
    rationale.push('Recent upgrade or maintenance signals may support narrowing the buyer request.');
  }

  if (ctx.requestedConcessionAmount === null) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'There is not enough buyer request detail yet to judge whether the concession request appears broad or supportable.',
      rationale,
      confidenceLabel: 'LOW',
      currency: 'USD',
      requestedConcessionAmount: null,
    };
  }

  if (!hasText(ctx.inspectionIssuesSummary, 20) && !hasText(ctx.requestedRepairs, 20)) {
    return {
      status: 'REQUEST_BROAD_OR_UNCLEAR',
      summary: 'The buyer appears to be asking for a concession amount without enough specific issue detail to evaluate it confidently.',
      rationale,
      confidenceLabel: 'LOW',
      currency: 'USD',
      requestedConcessionAmount: ctx.requestedConcessionAmount,
    };
  }

  if (hasUpgradeSignal) {
    return {
      status: 'PARTIAL_CONCESSION_POSSIBLE',
      summary: 'Some inspection discussion may be warranted, but the seller appears to have facts that could support a narrower or more targeted response.',
      rationale,
      confidenceLabel: 'MEDIUM',
      currency: 'USD',
      requestedConcessionAmount: ctx.requestedConcessionAmount,
    };
  }

  return {
    status: 'NEEDS_REVIEW',
    summary: 'The buyer request is documented enough to discuss, but it still makes sense to ask for issue-by-issue rationale before conceding broadly.',
    rationale,
    confidenceLabel: 'MEDIUM',
    currency: 'USD',
    requestedConcessionAmount: ctx.requestedConcessionAmount,
  };
}

function buildSummary(
  ctx: NormalizedBuyerInspectionNegotiationContext,
  assessment: NegotiationShieldPricingAssessment
) {
  if (assessment.status === 'INSUFFICIENT_DATA') {
    return 'There is not enough buyer request detail yet to evaluate the concession ask, so the next step should be getting the requested amount and the specific inspection issues driving it.';
  }

  if (assessment.status === 'REQUEST_BROAD_OR_UNCLEAR') {
    return 'The buyer request looks too broad to answer cleanly yet. The seller should ask which findings specifically drive the requested concession before agreeing to a blanket response.';
  }

  if (assessment.status === 'PARTIAL_CONCESSION_POSSIBLE') {
    return 'Some inspection items may deserve discussion, but the seller appears to have leverage to narrow the request rather than conceding broadly.';
  }

  return 'The buyer request is documented enough to discuss, but the seller should still push for itemized reasoning and keep the response tied to specific findings rather than a broad concession.';
}

function buildDraft(
  ctx: NormalizedBuyerInspectionNegotiationContext,
  actions: NegotiationShieldRecommendedAction[]
) {
  const subject = 'Response to inspection-related concession request';
  const concessionLine = formatCurrency(ctx.requestedConcessionAmount)
    ? `Thank you for outlining the inspection-related request, including the proposed concession of ${formatCurrency(ctx.requestedConcessionAmount)}.`
    : 'Thank you for outlining the inspection-related request.';

  return {
    draftType: 'EMAIL' as const,
    subject,
    body: [
      'Hello,',
      '',
      concessionLine,
      'We want to respond thoughtfully and keep the discussion tied to the specific inspection findings at issue.',
      '',
      ...actions.slice(0, 4).map((action) => `- ${action.title}: ${action.detail}`),
      '',
      'Once we have that clarification, we can respond more specifically to the items that truly warrant discussion.',
      '',
      'Thank you,',
      '[Your Name]',
    ].join('\n'),
    tone: 'CALM_SPECIFIC',
  };
}

export function generateBuyerInspectionNegotiationAnalysis(
  ctx: NormalizedBuyerInspectionNegotiationContext
): BuyerInspectionNegotiationAnalysisResult {
  const findings: NegotiationShieldFinding[] = [];
  const leverage: NegotiationShieldLeveragePoint[] = [];
  const actions: NegotiationShieldRecommendedAction[] = [];

  addFinding(
    findings,
    ctx.requestedConcessionAmount !== null
      ? {
          key: 'concession_present',
          title: 'Requested concession provided',
          detail: `The buyer concession request is recorded as ${formatCurrency(ctx.requestedConcessionAmount)}.`,
          status: 'INFO',
        }
      : {
          key: 'concession_missing',
          title: 'Requested concession missing',
          detail: 'The case does not clearly capture the buyer’s requested concession amount.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.inspectionIssuesSummary, 20)
      ? {
          key: 'issues_summary_present',
          title: 'Inspection issue summary provided',
          detail: 'The case includes a summary of the inspection issues driving the request.',
          status: 'INFO',
        }
      : {
          key: 'issues_summary_missing',
          title: 'Inspection issue summary unclear',
          detail: 'The request is not clearly tied to a specific set of inspection findings yet.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.requestedRepairs, 20)
      ? {
          key: 'requested_repairs_present',
          title: 'Requested repairs are described',
          detail: 'The buyer appears to have identified at least some repair items or repair categories.',
          status: 'INFO',
        }
      : {
          key: 'requested_repairs_missing',
          title: 'Requested repairs are unclear',
          detail: 'The case does not clearly capture which repairs or findings the buyer wants addressed.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.recentUpgradeNotes, 20) ||
      ctx.propertySignals.recentImprovementCount > 0 ||
      ctx.propertySignals.roofReplacementYear !== null
      ? {
          key: 'upgrade_signal_present',
          title: 'Recent upgrade signal available',
          detail: 'The seller appears to have upgrade or maintenance facts that may narrow the strength of a broad concession request.',
          status: 'POSITIVE',
        }
      : {
          key: 'upgrade_signal_missing',
          title: 'Recent upgrade signal limited',
          detail: 'No strong recent upgrade or maintenance signal is clearly captured in the case yet.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.hasAnyDocument
      ? {
          key: 'inspection_docs_present',
          title: 'Inspection-related documents attached',
          detail: `The case includes ${ctx.inspectionReportDocumentCount + ctx.buyerRequestDocumentCount + ctx.supportingDocumentCount} attached inspection or request document${ctx.inspectionReportDocumentCount + ctx.buyerRequestDocumentCount + ctx.supportingDocumentCount === 1 ? '' : 's'}.`,
          status: 'POSITIVE',
        }
      : {
          key: 'inspection_docs_missing',
          title: 'No inspection documents attached',
          detail: 'No inspection report or buyer request document is attached yet.',
          status: 'INFO',
        }
  );

  addLeverage(
    leverage,
    hasText(ctx.recentUpgradeNotes, 20) ||
      ctx.propertySignals.recentImprovementCount > 0 ||
      ctx.propertySignals.roofReplacementYear !== null
      ? {
          key: 'recent_upgrades_help',
          title: 'Recent upgrades may narrow the request',
          detail: 'Recent work or maintenance can help the seller push back on broad concessions tied to already-addressed systems.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    hasText(ctx.inspectionIssuesSummary, 20) && !hasText(ctx.requestedRepairs, 20)
      ? {
          key: 'ask_for_itemization',
          title: 'Ask which findings drive the amount',
          detail: 'If the amount is not tied to specific repairs, the seller can ask the buyer to show how the number was calculated.',
          strength: 'MEDIUM',
        }
      : null
  );

  addLeverage(leverage, {
    key: 'not_all_findings_equal',
    title: 'Not every inspection item deserves equal concession',
    detail: 'The seller can separate true repair or safety issues from cosmetic or lower-priority items instead of treating the request as one bundle.',
    strength: 'MEDIUM',
  });

  addAction(actions, {
    key: 'request_itemized_rationale',
    title: 'Request itemized rationale',
    detail: 'Ask the buyer to tie the requested amount to specific inspection items rather than a broad number.',
    priority: 'HIGH',
  });

  addAction(actions, {
    key: 'separate_major_from_minor',
    title: 'Separate major issues from minor findings',
    detail: 'Distinguish true repair or safety items from cosmetic or routine maintenance observations before responding.',
    priority: 'HIGH',
  });

  addAction(
    actions,
    hasText(ctx.recentUpgradeNotes, 20) ||
      ctx.propertySignals.recentImprovementCount > 0 ||
      ctx.propertySignals.roofReplacementYear !== null
      ? {
          key: 'reference_recent_work',
          title: 'Reference recent upgrades or maintenance',
          detail: 'Use recent replacements, upgrades, or maintenance records to narrow the buyer’s request where appropriate.',
          priority: 'MEDIUM',
        }
      : null
  );

  addAction(actions, {
    key: 'counter_narrowly_if_needed',
    title: 'Counter with a narrower response if needed',
    detail: 'If some issues deserve discussion, respond specifically to those instead of conceding to the full request as presented.',
    priority: 'MEDIUM',
  });

  const assessment = buildAssessment(ctx);
  const supportScore =
    (ctx.requestedConcessionAmount !== null ? 1 : 0) +
    (hasText(ctx.inspectionIssuesSummary, 20) ? 1 : 0) +
    (hasText(ctx.requestedRepairs, 20) ? 1 : 0) +
    (ctx.hasAnyDocument ? 1 : 0);
  const confidence = clamp(0.34 + supportScore * 0.11 + (assessment.status === 'PARTIAL_CONCESSION_POSSIBLE' ? 0.08 : 0), 0.25, 0.84);

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
