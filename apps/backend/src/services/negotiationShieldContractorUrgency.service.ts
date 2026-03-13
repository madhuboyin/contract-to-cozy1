import {
  ContractorUrgencyPressureAnalysisResult,
  NegotiationShieldFinding,
  NegotiationShieldLeveragePoint,
  NegotiationShieldPricingAssessment,
  NegotiationShieldRecommendedAction,
} from './negotiationShield.types';

export type NormalizedContractorUrgencyPressureContext = {
  caseTitle: string;
  caseDescription: string | null;
  contractorName: string | null;
  recommendedWork: string | null;
  urgencyClaimed: boolean | null;
  sameDayPressure: boolean | null;
  replacementRecommended: boolean | null;
  repairOptionMentioned: boolean | null;
  quoteAmount: number | null;
  notes: string | null;
  rawText: string | null;
  hasAnyDocument: boolean;
  recommendationDocumentCount: number;
  estimateDocumentCount: number;
  supportingDocumentCount: number;
  inspectionEvidenceProvided: boolean | null;
  itemizedExplanationProvided: boolean | null;
};

const MODEL_VERSION = 'contractor-urgency-pressure-rules-v1';

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
  ctx: NormalizedContractorUrgencyPressureContext
): NegotiationShieldPricingAssessment {
  const rationale: string[] = [];
  if (ctx.urgencyClaimed === true) {
    rationale.push('The recommendation appears to frame the work as urgent or immediate.');
  }
  if (ctx.sameDayPressure === true) {
    rationale.push('The recommendation appears to include same-day or immediate approval pressure.');
  }
  if (ctx.inspectionEvidenceProvided !== true) {
    rationale.push('Written inspection evidence or photos are not clearly documented.');
  }
  if (ctx.itemizedExplanationProvided !== true) {
    rationale.push('A clear itemized explanation is not yet documented.');
  }

  if (!hasText(ctx.recommendedWork, 12) && ctx.quoteAmount === null && ctx.urgencyClaimed === null) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'There is not enough contractor recommendation detail yet to judge whether the urgency pressure appears well supported.',
      rationale,
      confidenceLabel: 'LOW',
      currency: 'USD',
      quoteAmount: ctx.quoteAmount,
    };
  }

  if ((ctx.urgencyClaimed === true || ctx.sameDayPressure === true) && ctx.inspectionEvidenceProvided !== true) {
    return {
      status: 'URGENCY_PRESSURE_PRESENT',
      summary: 'The recommendation appears to apply urgency pressure without enough documented support, which makes clarification especially important before approval.',
      rationale,
      confidenceLabel: 'MEDIUM',
      currency: 'USD',
      quoteAmount: ctx.quoteAmount,
    };
  }

  if (ctx.urgencyClaimed === true || ctx.sameDayPressure === true) {
    return {
      status: 'NEEDS_REVIEW',
      summary: 'The urgency claim may be legitimate, but the homeowner should still ask for clear evidence and scope detail before approving quickly.',
      rationale,
      confidenceLabel: 'MEDIUM',
      currency: 'USD',
      quoteAmount: ctx.quoteAmount,
    };
  }

  return {
    status: 'EXPLANATION_UNCLEAR',
    summary: 'There is not a strong urgency signal in the case yet, but the recommendation still needs clearer written support before the homeowner should feel comfortable proceeding.',
    rationale,
    confidenceLabel: 'LOW',
    currency: 'USD',
    quoteAmount: ctx.quoteAmount,
  };
}

function buildSummary(
  ctx: NormalizedContractorUrgencyPressureContext,
  assessment: NegotiationShieldPricingAssessment
) {
  if (assessment.status === 'INSUFFICIENT_DATA') {
    return 'There is not enough recommendation detail yet to judge the urgency, so the next step should be getting the written recommendation, scope, and any supporting evidence into the case.';
  }

  if (assessment.status === 'URGENCY_PRESSURE_PRESENT') {
    return 'The contractor appears to be pressing for quick approval without enough written support. The homeowner should slow the decision down and ask for evidence before agreeing to replacement work.';
  }

  if (ctx.urgencyClaimed === true || ctx.sameDayPressure === true) {
    return 'The recommendation may point to a real issue, but the urgency framing makes it important to request written findings, photos, and repair-versus-replace reasoning before approving the work.';
  }

  return 'The recommendation still needs clearer written support before the homeowner should commit, even if the urgency framing is not especially aggressive yet.';
}

function buildDraft(
  ctx: NormalizedContractorUrgencyPressureContext,
  actions: NegotiationShieldRecommendedAction[]
) {
  const greeting = hasText(ctx.contractorName) ? `Hi ${ctx.contractorName},` : 'Hi,';
  const subject = hasText(ctx.recommendedWork)
    ? `Questions before approving the recommended ${ctx.recommendedWork}`
    : 'Questions before approving the recommended work';

  return {
    draftType: 'EMAIL' as const,
    subject,
    body: [
      greeting,
      '',
      'Thank you for sending over your recommendation.',
      'Before I make a decision, I’d like a little more written detail so I can understand the urgency, the scope, and whether replacement is truly necessary.',
      '',
      ...actions.slice(0, 4).map((action) => `- ${action.title}: ${action.detail}`),
      '',
      'Once I have that information, I’ll be in a better position to respond quickly.',
      '',
      'Thank you,',
      '[Your Name]',
    ].join('\n'),
    tone: 'POLITE_SKEPTICAL',
  };
}

export function generateContractorUrgencyPressureAnalysis(
  ctx: NormalizedContractorUrgencyPressureContext
): ContractorUrgencyPressureAnalysisResult {
  const findings: NegotiationShieldFinding[] = [];
  const leverage: NegotiationShieldLeveragePoint[] = [];
  const actions: NegotiationShieldRecommendedAction[] = [];

  addFinding(
    findings,
    ctx.urgencyClaimed === true || ctx.sameDayPressure === true
      ? {
          key: 'urgency_present',
          title: 'Urgency pressure is present',
          detail: 'The current recommendation suggests immediate or same-day pressure to approve the work.',
          status: 'CAUTION',
        }
      : ctx.urgencyClaimed === false
        ? {
            key: 'urgency_not_present',
            title: 'No strong urgency pressure noted',
            detail: 'The current case does not clearly suggest the contractor is applying urgency pressure.',
            status: 'POSITIVE',
          }
        : {
            key: 'urgency_unclear',
            title: 'Urgency pressure is unclear',
            detail: 'The current case does not make the urgency level clear yet.',
            status: 'INFO',
          }
  );

  addFinding(
    findings,
    ctx.inspectionEvidenceProvided === true
      ? {
          key: 'evidence_present',
          title: 'Written evidence or photos are noted',
          detail: 'The case suggests there is at least some inspection evidence behind the recommendation.',
          status: 'POSITIVE',
        }
      : {
          key: 'evidence_missing',
          title: 'Written evidence is limited',
          detail: 'The recommendation does not yet appear to be backed by clear written findings or supporting photos.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.itemizedExplanationProvided === true
      ? {
          key: 'itemization_present',
          title: 'Itemized explanation is available',
          detail: 'The case includes at least some scope or pricing detail behind the recommendation.',
          status: 'INFO',
        }
      : {
          key: 'itemization_missing',
          title: 'Itemized explanation is missing',
          detail: 'The recommendation does not yet clearly explain the scope or pricing in an itemized way.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.repairOptionMentioned === true
      ? {
          key: 'repair_option_present',
          title: 'Repair option was mentioned',
          detail: 'The recommendation at least references whether repair is possible.',
          status: 'POSITIVE',
        }
      : {
          key: 'repair_option_missing',
          title: 'Repair option not clearly addressed',
          detail: 'The case does not clearly explain whether repair was considered before pushing replacement.',
          status: 'CAUTION',
        }
  );

  addFinding(
    findings,
    ctx.quoteAmount !== null
      ? {
          key: 'quote_amount_present',
          title: 'Quote amount provided',
          detail: `A quote amount of ${formatCurrency(ctx.quoteAmount)} is included in the recommendation context.`,
          status: 'INFO',
        }
      : {
          key: 'quote_amount_missing',
          title: 'Quote amount missing',
          detail: 'No clear quote amount is captured in the current case.',
          status: 'INFO',
        }
  );

  addLeverage(leverage, {
    key: 'request_photos',
    title: 'Ask for written findings or photos',
    detail: 'The homeowner can ask the contractor to show the evidence supporting any urgent replacement recommendation.',
    strength: 'HIGH',
  });

  addLeverage(
    leverage,
    ctx.repairOptionMentioned === true
      ? null
      : {
          key: 'ask_about_repair',
          title: 'Ask why repair is not viable',
          detail: 'If replacement is recommended, the homeowner can ask what rules out a repair option first.',
          strength: 'HIGH',
        }
  );

  addLeverage(
    leverage,
    ctx.sameDayPressure === true || ctx.urgencyClaimed === true
      ? {
          key: 'slow_same_day_pressure',
          title: 'Slow the same-day decision down',
          detail: 'Urgency pressure does not remove the need for written support, especially when replacement is expensive or irreversible.',
          strength: 'MEDIUM',
        }
      : null
  );

  addAction(actions, {
    key: 'request_written_findings',
    title: 'Request written findings or photos',
    detail: 'Ask for inspection notes, photos, or other written evidence supporting the recommendation.',
    priority: 'HIGH',
  });

  addAction(actions, {
    key: 'ask_if_repair_possible',
    title: 'Ask whether repair is possible',
    detail: 'Have the contractor explain whether repair was evaluated and why replacement is being recommended instead.',
    priority: 'HIGH',
  });

  addAction(actions, {
    key: 'request_itemized_estimate',
    title: 'Request an itemized estimate',
    detail: 'Ask for a scope and price breakdown before approving work, especially if urgency is being emphasized.',
    priority: 'MEDIUM',
  });

  addAction(actions, {
    key: 'get_second_opinion',
    title: 'Get a second opinion if urgency feels unsupported',
    detail: 'If the evidence remains weak, get another professional view before committing to replacement.',
    priority: 'MEDIUM',
  });

  const assessment = buildAssessment(ctx);
  const signalScore =
    (ctx.urgencyClaimed !== null ? 1 : 0) +
    (ctx.sameDayPressure !== null ? 1 : 0) +
    (ctx.quoteAmount !== null ? 1 : 0) +
    (ctx.hasAnyDocument ? 1 : 0);
  const confidence = clamp(0.32 + signalScore * 0.11 + (ctx.inspectionEvidenceProvided === true ? 0.1 : 0), 0.24, 0.83);

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
