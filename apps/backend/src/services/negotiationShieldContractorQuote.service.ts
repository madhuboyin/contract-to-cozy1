import {
  ContractorQuoteAnalysisResult,
  NegotiationShieldFinding,
  NegotiationShieldLeveragePoint,
  NegotiationShieldPricingAssessment,
  NegotiationShieldRecommendedAction,
} from './negotiationShield.types';

type NormalizedContractorQuoteContext = {
  caseTitle: string;
  caseDescription: string | null;
  contractorName: string | null;
  quoteAmount: number | null;
  currency: string | null;
  quoteDate: string | null;
  serviceCategory: string | null;
  systemCategory: string | null;
  urgencyClaimed: boolean | null;
  notes: string | null;
  rawText: string | null;
  supportingDocumentCount: number;
  quoteDocumentCount: number;
  hasAnyDocument: boolean;
  laborBreakdownProvided: boolean;
  materialsBreakdownProvided: boolean;
  lineItemBreakdownProvided: boolean;
  scopeClarityProvided: boolean;
  comparisonQuotesAvailable: boolean;
  comparisonQuoteCount: number | null;
  repairOptionDiscussed: boolean | null;
  replacementRecommended: boolean | null;
  warrantyMentioned: boolean | null;
  inspectionEvidenceProvided: boolean | null;
};

const CONTRACTOR_QUOTE_MODEL_VERSION = 'contractor-quote-rules-v1';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasText(value: string | null | undefined, minLength = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCurrency(amount: number | null, currency: string | null): string | null {
  if (amount === null || !Number.isFinite(amount)) return null;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

function inferConfidenceLabel(confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function addFinding(
  findings: NegotiationShieldFinding[],
  finding: NegotiationShieldFinding | null
) {
  if (finding) findings.push(finding);
}

function addLeverage(
  leverage: NegotiationShieldLeveragePoint[],
  item: NegotiationShieldLeveragePoint | null
) {
  if (item) leverage.push(item);
}

function addAction(
  actions: NegotiationShieldRecommendedAction[],
  item: NegotiationShieldRecommendedAction | null
) {
  if (item) actions.push(item);
}

function buildPricingAssessment(
  ctx: NormalizedContractorQuoteContext,
  findings: NegotiationShieldFinding[]
): NegotiationShieldPricingAssessment {
  const amountLabel = formatCurrency(ctx.quoteAmount, ctx.currency);
  const rationale: string[] = [];

  if (ctx.quoteAmount === null) {
    rationale.push('No quote amount was provided, so pricing cannot be evaluated.');
    return {
      status: 'INSUFFICIENT_DATA',
      summary: 'There is not enough pricing detail to judge whether this quote is high or reasonable.',
      rationale,
      confidenceLabel: 'LOW',
      quoteAmount: null,
      currency: ctx.currency,
    };
  }

  if (!ctx.comparisonQuotesAvailable) {
    rationale.push('There are no comparison quotes in the case data.');
  }
  if (!ctx.lineItemBreakdownProvided) {
    rationale.push('The estimate does not include a clear itemized breakdown.');
  }
  if (ctx.urgencyClaimed === true) {
    rationale.push('Urgency is being emphasized, which can reduce negotiating leverage if not supported.');
  }

  const missingCriticalDetail =
    !ctx.lineItemBreakdownProvided || !ctx.scopeClarityProvided || !ctx.comparisonQuotesAvailable;

  if (
    ctx.quoteAmount !== null &&
    ctx.urgencyClaimed === true &&
    !ctx.lineItemBreakdownProvided &&
    !ctx.comparisonQuotesAvailable
  ) {
    return {
      status: 'APPEARS_HIGH',
      summary:
        `The quote ${amountLabel ? `at ${amountLabel} ` : ''}leans high relative to the support provided because it combines urgency with limited pricing detail.`,
      rationale,
      confidenceLabel: 'LOW',
      quoteAmount: ctx.quoteAmount,
      currency: ctx.currency,
    };
  }

  if (
    ctx.quoteAmount !== null &&
    ctx.lineItemBreakdownProvided &&
    ctx.scopeClarityProvided &&
    (ctx.comparisonQuotesAvailable || ctx.quoteDocumentCount > 0)
  ) {
    return {
      status: 'APPEARS_REASONABLE',
      summary:
        `The quote ${amountLabel ? `at ${amountLabel} ` : ''}appears reasonably supported by the detail currently provided, although it is still worth comparing if the job is large.`,
      rationale,
      confidenceLabel: 'MEDIUM',
      quoteAmount: ctx.quoteAmount,
      currency: ctx.currency,
    };
  }

  if (missingCriticalDetail) {
    return {
      status: 'NEEDS_COMPARISON',
      summary:
        `The quote ${amountLabel ? `at ${amountLabel} ` : ''}needs more context before it can be judged with confidence.`,
      rationale,
      confidenceLabel: findings.some((item) => item.status === 'MISSING') ? 'LOW' : 'MEDIUM',
      quoteAmount: ctx.quoteAmount,
      currency: ctx.currency,
    };
  }

  return {
    status: 'NEEDS_COMPARISON',
    summary:
      `The quote ${amountLabel ? `at ${amountLabel} ` : ''}may be workable, but a comparison quote is still the safest next step.`,
    rationale,
    confidenceLabel: 'MEDIUM',
    quoteAmount: ctx.quoteAmount,
    currency: ctx.currency,
  };
}

function buildSummary(
  ctx: NormalizedContractorQuoteContext,
  pricing: NegotiationShieldPricingAssessment
): string {
  if (pricing.status === 'INSUFFICIENT_DATA') {
    return 'There is not enough quote detail yet to judge pricing, so the best next move is to ask for a written estimate with scope and pricing detail before agreeing to the work.';
  }

  if (pricing.status === 'APPEARS_HIGH') {
    return 'This quote needs pushback before approval. The current information suggests pricing pressure without enough support, so the homeowner should ask for itemization, justification, and alternatives.';
  }

  if (pricing.status === 'APPEARS_REASONABLE') {
    return 'The quote is better supported than a typical rough estimate, but the homeowner still has room to negotiate scope clarity, warranty terms, and any missing comparison context.';
  }

  if (ctx.urgencyClaimed === true) {
    return 'The quote may be legitimate, but the urgency framing makes it important to slow the decision down and request written justification before approving work.';
  }

  return 'The quote needs more context before the homeowner can judge whether it is fairly priced, so the immediate goal should be gathering itemization, scope clarity, and at least one comparison point.';
}

function buildDraft(
  ctx: NormalizedContractorQuoteContext,
  actions: NegotiationShieldRecommendedAction[]
) {
  const contractorGreeting = hasText(ctx.contractorName)
    ? `Hi ${ctx.contractorName},`
    : 'Hi,';
  const workReference =
    ctx.serviceCategory || ctx.systemCategory
      ? `the ${ctx.serviceCategory || ctx.systemCategory} work`
      : 'the proposed work';
  const subject = `Questions about your quote for ${workReference}`;

  const topRequests = actions.slice(0, 4).map((action) => `- ${action.title}: ${action.detail}`);
  const amountLine = formatCurrency(ctx.quoteAmount, ctx.currency)
    ? `I reviewed the quote${ctx.quoteDate ? ` dated ${ctx.quoteDate}` : ''} for ${formatCurrency(
        ctx.quoteAmount,
        ctx.currency
      )}.`
    : `I reviewed the quote${ctx.quoteDate ? ` dated ${ctx.quoteDate}` : ''}.`;

  const body = [
    contractorGreeting,
    '',
    amountLine,
    `Before I make a decision on ${workReference}, I’d like a bit more detail so I can compare the scope and pricing fairly.`,
    '',
    ...topRequests,
    '',
    'Once I have that information, I’ll be in a better position to move forward quickly.',
    '',
    'Thank you,',
    '[Your Name]',
  ].join('\n');

  return {
    draftType: 'EMAIL' as const,
    subject,
    body,
    tone: 'POLITE_FIRM',
  };
}

export function generateContractorQuoteAnalysis(
  ctx: NormalizedContractorQuoteContext
): ContractorQuoteAnalysisResult {
  const findings: NegotiationShieldFinding[] = [];
  const leverage: NegotiationShieldLeveragePoint[] = [];
  const actions: NegotiationShieldRecommendedAction[] = [];
  const amountLabel = formatCurrency(ctx.quoteAmount, ctx.currency);

  addFinding(
    findings,
    ctx.quoteAmount !== null
      ? {
          key: 'quote_amount',
          title: 'Quote amount provided',
          detail: amountLabel
            ? `A quoted amount of ${amountLabel} was provided.`
            : 'A quoted amount was provided.',
          status: 'INFO',
        }
      : {
          key: 'quote_amount_missing',
          title: 'Quote amount missing',
          detail: 'No clear quote amount was provided in the manual input.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.serviceCategory) || hasText(ctx.systemCategory)
      ? {
          key: 'service_scope_present',
          title: 'Service category identified',
          detail: `The quote appears to relate to ${titleCase(
            (ctx.serviceCategory || ctx.systemCategory || '').trim()
          )}.`,
          status: 'INFO',
        }
      : {
          key: 'service_scope_missing',
          title: 'Service category unclear',
          detail: 'The estimate does not clearly identify the service or system category.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.urgencyClaimed === true
      ? {
          key: 'urgency_claimed',
          title: 'Urgency was emphasized',
          detail: 'The current case information suggests the contractor is framing the work as urgent or immediate.',
          status: 'CAUTION',
        }
      : ctx.urgencyClaimed === false
        ? {
            key: 'urgency_not_claimed',
            title: 'No urgency pressure noted',
            detail: 'There is no clear urgency claim in the current quote context.',
            status: 'POSITIVE',
          }
        : {
            key: 'urgency_unclear',
            title: 'Urgency is unclear',
            detail: 'It is not clear whether the contractor is treating this as urgent.',
            status: 'INFO',
          }
  );

  addFinding(
    findings,
    ctx.hasAnyDocument
      ? {
          key: 'supporting_docs_present',
          title: 'Supporting document attached',
          detail:
            ctx.quoteDocumentCount > 0
              ? `A written quote document is attached${ctx.supportingDocumentCount > 0 ? ' along with supporting files' : ''}.`
              : 'Supporting files are attached, but they have not been parsed in this step.',
          status: 'POSITIVE',
        }
      : {
          key: 'supporting_docs_missing',
          title: 'No supporting document attached',
          detail: 'No written quote or supporting document is attached to the case.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.lineItemBreakdownProvided
      ? {
          key: 'breakdown_present',
          title: 'Pricing breakdown present',
          detail: 'The case includes some itemization or labor/material pricing detail.',
          status: 'POSITIVE',
        }
      : {
          key: 'breakdown_missing',
          title: 'Pricing breakdown missing',
          detail: 'The estimate does not clearly separate labor, materials, or line items.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.comparisonQuotesAvailable
      ? {
          key: 'comparison_available',
          title: 'Comparison quote context available',
          detail:
            ctx.comparisonQuoteCount && ctx.comparisonQuoteCount > 1
              ? `${ctx.comparisonQuoteCount} quotes or comparison points are available.`
              : 'At least one comparison quote or pricing comparison is available.',
          status: 'POSITIVE',
        }
      : {
          key: 'comparison_missing',
          title: 'No comparison quote available',
          detail: 'There is no second quote or other comparison point in the current case.',
          status: 'MISSING',
        }
  );

  addLeverage(
    leverage,
    !ctx.lineItemBreakdownProvided
      ? {
          key: 'request_itemization',
          title: 'Ask for itemized pricing',
          detail: 'A homeowner can reasonably request a labor, materials, and scope breakdown before approving work.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.urgencyClaimed === true
      ? {
          key: 'question_urgency',
          title: 'Ask for urgency evidence',
          detail: 'If the contractor says the work is urgent, ask for photos, inspection notes, or a clear explanation of the risk of waiting.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.replacementRecommended === true
      ? {
          key: 'repair_vs_replace',
          title: 'Ask whether repair is viable',
          detail: 'When replacement is recommended, it is fair to ask whether a repair option exists and what tradeoffs apply.',
          strength: 'MEDIUM',
        }
      : null
  );

  addLeverage(
    leverage,
    !ctx.comparisonQuotesAvailable
      ? {
          key: 'comparison_quote',
          title: 'Use a competing quote as leverage',
          detail: 'Even one additional estimate can create room to negotiate scope, timing, or pricing.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    !ctx.warrantyMentioned
      ? {
          key: 'warranty_terms',
          title: 'Clarify warranty and materials',
          detail: 'Warranty terms, materials, and exclusions are legitimate negotiation topics when quote detail is thin.',
          strength: 'MEDIUM',
        }
      : null
  );

  addAction(
    actions,
    !ctx.lineItemBreakdownProvided
      ? {
          key: 'ask_itemized_breakdown',
          title: 'Request an itemized labor and materials breakdown',
          detail: 'Ask the contractor to separate labor, materials, permits, disposal, and any markup.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    !ctx.scopeClarityProvided
      ? {
          key: 'confirm_scope',
          title: 'Ask for scope clarification in writing',
          detail: 'Request a written explanation of exactly what is included, excluded, and assumed in the estimate.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    ctx.urgencyClaimed === true
      ? {
          key: 'verify_urgency',
          title: 'Verify the urgency claim',
          detail: 'Ask for inspection evidence, photos, or a short explanation of what happens if the work is delayed.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    !ctx.comparisonQuotesAvailable
      ? {
          key: 'get_second_quote',
          title: 'Obtain at least one additional estimate',
          detail: 'A second quote gives you a better negotiating position even if you prefer the current contractor.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    ctx.replacementRecommended === true
      ? {
          key: 'ask_repair_option',
          title: 'Ask whether repair is possible instead of full replacement',
          detail: 'If replacement is being recommended, ask whether a shorter-term repair option exists and why it was ruled out.',
          priority: 'MEDIUM',
        }
      : null
  );

  addAction(
    actions,
    !ctx.warrantyMentioned
      ? {
          key: 'clarify_warranty',
          title: 'Clarify warranty, materials, and workmanship terms',
          detail: 'Ask what products will be used, what warranty applies, and whether workmanship coverage is included.',
          priority: 'MEDIUM',
        }
      : null
  );

  if (actions.length === 0) {
    addAction(actions, {
      key: 'compare_scope_and_timeline',
      title: 'Compare scope, schedule, and payment terms before approving',
      detail: 'Even if the quote looks organized, confirm timing, milestones, and payment expectations before moving forward.',
      priority: 'MEDIUM',
    });
  }

  const pricingAssessment = buildPricingAssessment(ctx, findings);
  const summary = buildSummary(ctx, pricingAssessment);

  let confidence = 0.3;
  const confidenceFactors: string[] = [];

  if (ctx.quoteAmount !== null) { confidence += 0.15; confidenceFactors.push('quote amount present (+15%)'); }
  else { confidence -= 0.1; confidenceFactors.push('quote amount missing (-10%)'); }

  if (hasText(ctx.serviceCategory) || hasText(ctx.systemCategory)) { confidence += 0.1; confidenceFactors.push('service category identified (+10%)'); }
  else { confidence -= 0.05; confidenceFactors.push('service category unclear (-5%)'); }

  if (hasText(ctx.rawText, 25)) { confidence += 0.1; confidenceFactors.push('meaningful raw text provided (+10%)'); }
  if (hasText(ctx.notes, 20)) { confidence += 0.05; confidenceFactors.push('notes provided (+5%)'); }
  if (ctx.hasAnyDocument) { confidence += 0.05; confidenceFactors.push('supporting document attached (+5%)'); }

  if (ctx.lineItemBreakdownProvided) { confidence += 0.1; confidenceFactors.push('itemized breakdown present (+10%)'); }
  else { confidence -= 0.05; confidenceFactors.push('no itemized breakdown (-5%)'); }

  if (ctx.scopeClarityProvided) { confidence += 0.05; confidenceFactors.push('scope is clear (+5%)'); }
  if (ctx.comparisonQuotesAvailable) { confidence += 0.1; confidenceFactors.push('comparison quotes available (+10%)'); }
  if (ctx.repairOptionDiscussed !== null) { confidence += 0.05; confidenceFactors.push('repair vs. replace discussed (+5%)'); }

  confidence = clamp(Number(confidence.toFixed(2)), 0.2, 0.9);

  const confidenceLabel = inferConfidenceLabel(confidence);
  const confidenceExplanation =
    `Confidence scored at ${Math.round(confidence * 100)}% (${confidenceLabel}). ` +
    `Key factors: ${confidenceFactors.slice(0, 4).join('; ')}.` +
    (confidenceFactors.length > 4 ? ` (+${confidenceFactors.length - 4} more)` : '');

  const draft = buildDraft(ctx, actions);

  return {
    summary,
    findings,
    negotiationLeverage: leverage,
    recommendedActions: actions,
    pricingAssessment: {
      ...pricingAssessment,
      confidenceLabel,
      confidenceExplanation,
    },
    confidence,
    modelVersion: CONTRACTOR_QUOTE_MODEL_VERSION,
    draft,
  };
}
