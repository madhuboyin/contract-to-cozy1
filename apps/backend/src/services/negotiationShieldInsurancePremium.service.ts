import {
  InsurancePremiumIncreaseAnalysisResult,
  NegotiationShieldFinding,
  NegotiationShieldLeveragePoint,
  NegotiationShieldPricingAssessment,
  NegotiationShieldRecommendedAction,
} from './negotiationShield.types';

type InsurancePremiumPropertySignals = {
  roofReplacementYear: number | null;
  roofAgeYears: number | null;
  hasSecuritySystem: boolean | null;
  hasSmokeDetectors: boolean | null;
  hasCoDetectors: boolean | null;
  hasSumpPumpBackup: boolean | null;
  completedMaintenanceCount: number;
  recentImprovementCount: number;
  claimCount: number;
  claimFreeRecorded: boolean;
  policyOnFile: {
    carrierName: string | null;
    isVerified: boolean;
    premiumAmount: number | null;
    coverageType: string | null;
    expiryDate: string | null;
  } | null;
};

export type NormalizedInsurancePremiumIncreaseContext = {
  caseTitle: string;
  caseDescription: string | null;
  insurerName: string | null;
  priorPremium: number | null;
  newPremium: number | null;
  increaseAmount: number | null;
  increasePercentage: number | null;
  renewalDate: string | null;
  reasonProvided: string | null;
  notes: string | null;
  rawText: string | null;
  hasAnyDocument: boolean;
  premiumNoticeDocumentCount: number;
  supportingDocumentCount: number;
  propertySignals: InsurancePremiumPropertySignals;
};

const INSURANCE_PREMIUM_MODEL_VERSION = 'insurance-premium-rules-v1';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasText(value: string | null | undefined, minLength = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
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

function buildIncreaseRationale(ctx: NormalizedInsurancePremiumIncreaseContext): string[] {
  const rationale: string[] = [];
  if (ctx.priorPremium === null || ctx.newPremium === null) {
    rationale.push('Both the prior premium and new premium were not available.');
  }
  if (!hasText(ctx.reasonProvided, 20)) {
    rationale.push('The increase is not clearly explained in the provided input.');
  }
  if (ctx.propertySignals.roofReplacementYear) {
    rationale.push('Recent roof information exists in the property record and may be relevant to underwriting review.');
  }
  if (ctx.propertySignals.completedMaintenanceCount > 0) {
    rationale.push('The property record includes completed maintenance history that may support a review request.');
  }
  if (ctx.propertySignals.claimFreeRecorded) {
    rationale.push('No property-linked claims are recorded in Contract-to-Cozy.');
  }
  return rationale;
}

function buildPricingAssessment(
  ctx: NormalizedInsurancePremiumIncreaseContext
): NegotiationShieldPricingAssessment {
  const rationale = buildIncreaseRationale(ctx);
  const explanationStrong = hasText(ctx.reasonProvided, 25);
  const hasComputedIncrease = ctx.increaseAmount !== null || ctx.increasePercentage !== null;
  const hasLeverageSignals =
    ctx.propertySignals.roofReplacementYear !== null ||
    ctx.propertySignals.completedMaintenanceCount > 0 ||
    ctx.propertySignals.recentImprovementCount > 0 ||
    ctx.propertySignals.claimFreeRecorded ||
    ctx.propertySignals.hasSecuritySystem === true ||
    ctx.propertySignals.hasSmokeDetectors === true ||
    ctx.propertySignals.hasCoDetectors === true ||
    ctx.propertySignals.hasSumpPumpBackup === true;

  if (ctx.priorPremium === null || ctx.newPremium === null) {
    return {
      status: 'INSUFFICIENT_DATA',
      summary:
        'There is not enough premium information to judge the increase, so the immediate goal should be getting the renewal numbers and a written explanation.',
      rationale,
      confidenceLabel: 'LOW',
      currency: 'USD',
      priorPremium: ctx.priorPremium,
      newPremium: ctx.newPremium,
      increaseAmount: ctx.increaseAmount,
      increasePercentage: ctx.increasePercentage,
    };
  }

  if (!explanationStrong && hasLeverageSignals) {
    return {
      status: 'LEVERAGE_PRESENT',
      summary:
        'The premium increase deserves a review because the explanation is weak and the property record includes leverage worth raising with the insurer.',
      rationale,
      confidenceLabel: hasComputedIncrease ? 'MEDIUM' : 'LOW',
      currency: 'USD',
      priorPremium: ctx.priorPremium,
      newPremium: ctx.newPremium,
      increaseAmount: ctx.increaseAmount,
      increasePercentage: ctx.increasePercentage,
    };
  }

  if (!explanationStrong) {
    return {
      status: 'EXPLANATION_UNCLEAR',
      summary:
        'The increase is documented, but the reason for the change is not clear from the information provided.',
      rationale,
      confidenceLabel: hasComputedIncrease ? 'MEDIUM' : 'LOW',
      currency: 'USD',
      priorPremium: ctx.priorPremium,
      newPremium: ctx.newPremium,
      increaseAmount: ctx.increaseAmount,
      increasePercentage: ctx.increasePercentage,
    };
  }

  if (hasLeverageSignals) {
    return {
      status: 'NEEDS_REVIEW',
      summary:
        'The increase appears documented, but the homeowner has property-backed facts that justify asking for an underwriting or discount review.',
      rationale,
      confidenceLabel: 'MEDIUM',
      currency: 'USD',
      priorPremium: ctx.priorPremium,
      newPremium: ctx.newPremium,
      increaseAmount: ctx.increaseAmount,
      increasePercentage: ctx.increasePercentage,
    };
  }

  return {
    status: 'DOCUMENTED_INCREASE',
    summary:
      'The increase is documented in the current input, but it still makes sense to request a review if the insurer has not clearly explained what changed.',
    rationale,
    confidenceLabel: 'MEDIUM',
    currency: 'USD',
    priorPremium: ctx.priorPremium,
    newPremium: ctx.newPremium,
    increaseAmount: ctx.increaseAmount,
    increasePercentage: ctx.increasePercentage,
  };
}

function buildSummary(
  ctx: NormalizedInsurancePremiumIncreaseContext,
  pricingAssessment: NegotiationShieldPricingAssessment
): string {
  if (pricingAssessment.status === 'INSUFFICIENT_DATA') {
    return 'There is not enough premium detail yet to assess the increase, so the next step should be getting the renewal numbers and a written explanation from the insurer or agent.';
  }

  if (pricingAssessment.status === 'LEVERAGE_PRESENT') {
    return 'The premium increase is worth challenging. The explanation is weak, and the property record includes facts that may support a reconsideration request.';
  }

  if (pricingAssessment.status === 'EXPLANATION_UNCLEAR') {
    return 'The premium increase may be legitimate, but the homeowner does not yet have a clear explanation of what changed, which is the main point to press on.';
  }

  if (pricingAssessment.status === 'NEEDS_REVIEW') {
    return 'The increase may have been documented, but the homeowner has property-backed leverage worth raising before accepting the new premium.';
  }

  if (ctx.propertySignals.claimFreeRecorded) {
    return 'The increase appears documented, and the homeowner should still ask whether the insurer considered the property’s recorded maintenance and lack of property-linked claims.';
  }

  return 'The increase is better documented than a bare notice, but the homeowner should still ask the insurer to explain the drivers and confirm that the property profile was reviewed accurately.';
}

function buildDraft(
  ctx: NormalizedInsurancePremiumIncreaseContext,
  actions: NegotiationShieldRecommendedAction[],
  leverage: NegotiationShieldLeveragePoint[]
) {
  const greeting = hasText(ctx.insurerName) ? `Hi ${ctx.insurerName} team,` : 'Hello,';
  const subject = hasText(ctx.renewalDate)
    ? `Request for review of premium increase before ${ctx.renewalDate} renewal`
    : 'Request for review of premium increase';

  const topRequests = actions.slice(0, 4).map((action) => `- ${action.title}: ${action.detail}`);
  const leverageLines = leverage
    .slice(0, 3)
    .map((item) => `- ${item.title}: ${item.detail}`);

  const increaseSentence = (() => {
    const newPremium = formatCurrency(ctx.newPremium, 'USD');
    const priorPremium = formatCurrency(ctx.priorPremium, 'USD');
    if (newPremium && priorPremium) {
      return `I’m reaching out about my renewal premium increasing from ${priorPremium} to ${newPremium}.`;
    }
    if (newPremium) {
      return `I’m reaching out about the renewal premium now listed at ${newPremium}.`;
    }
    return 'I’m reaching out about a recent premium increase on my policy.';
  })();

  const body = [
    greeting,
    '',
    increaseSentence,
    'Before I make a renewal decision, I’d like a clearer explanation of what is driving the change and whether the property details on file have been fully considered.',
    '',
    ...topRequests,
    ...(leverageLines.length > 0
      ? ['', 'For context, here are property details I would like included in the review:', ...leverageLines]
      : []),
    '',
    'If additional documentation would help, please let me know what would be most useful for underwriting review.',
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

export function generateInsurancePremiumIncreaseAnalysis(
  ctx: NormalizedInsurancePremiumIncreaseContext
): InsurancePremiumIncreaseAnalysisResult {
  const findings: NegotiationShieldFinding[] = [];
  const leverage: NegotiationShieldLeveragePoint[] = [];
  const actions: NegotiationShieldRecommendedAction[] = [];

  const priorPremiumLabel = formatCurrency(ctx.priorPremium, 'USD');
  const newPremiumLabel = formatCurrency(ctx.newPremium, 'USD');

  addFinding(
    findings,
    ctx.priorPremium !== null
      ? {
          key: 'prior_premium_present',
          title: 'Prior premium provided',
          detail: priorPremiumLabel
            ? `The prior premium is recorded as ${priorPremiumLabel}.`
            : 'A prior premium amount was provided.',
          status: 'INFO',
        }
      : {
          key: 'prior_premium_missing',
          title: 'Prior premium missing',
          detail: 'The previous premium amount is not clearly captured in the case input.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.newPremium !== null
      ? {
          key: 'new_premium_present',
          title: 'New premium provided',
          detail: newPremiumLabel
            ? `The new premium is recorded as ${newPremiumLabel}.`
            : 'A new premium amount was provided.',
          status: 'INFO',
        }
      : {
          key: 'new_premium_missing',
          title: 'New premium missing',
          detail: 'The new premium amount is not clearly captured in the case input.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    ctx.increaseAmount !== null || ctx.increasePercentage !== null
      ? {
          key: 'increase_computed',
          title: 'Increase can be calculated',
          detail:
            ctx.increaseAmount !== null && ctx.increasePercentage !== null
              ? `The increase is approximately ${formatCurrency(ctx.increaseAmount, 'USD')} (${ctx.increasePercentage.toFixed(1)}%).`
              : ctx.increaseAmount !== null
                ? `The increase amount is approximately ${formatCurrency(ctx.increaseAmount, 'USD')}.`
                : `The increase percentage is approximately ${ctx.increasePercentage?.toFixed(1)}%.`,
          status: 'INFO',
        }
      : {
          key: 'increase_not_computed',
          title: 'Increase cannot be calculated',
          detail: 'There is not enough premium data to calculate the increase cleanly.',
          status: 'MISSING',
        }
  );

  addFinding(
    findings,
    hasText(ctx.renewalDate)
      ? {
          key: 'renewal_date_present',
          title: 'Renewal date provided',
          detail: `The renewal timing is noted as ${ctx.renewalDate}.`,
          status: 'INFO',
        }
      : {
          key: 'renewal_date_missing',
          title: 'Renewal date missing',
          detail: 'The renewal date is not clearly captured in the case data.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    hasText(ctx.reasonProvided, 20)
      ? {
          key: 'reason_present',
          title: 'Insurer rationale provided',
          detail: 'A reason or explanation for the increase was included in the case input.',
          status: 'POSITIVE',
        }
      : {
          key: 'reason_missing',
          title: 'Insurer rationale missing or weak',
          detail: 'The case does not contain a clear explanation of what is driving the premium increase.',
          status: 'CAUTION',
        }
  );

  addFinding(
    findings,
    ctx.hasAnyDocument
      ? {
          key: 'premium_notice_attached',
          title: 'Premium notice or supporting document attached',
          detail:
            ctx.premiumNoticeDocumentCount > 0
              ? `A premium notice document is attached${ctx.supportingDocumentCount > 0 ? ' along with supporting files' : ''}.`
              : 'Supporting documents are attached, but they have not been parsed in this step.',
          status: 'POSITIVE',
        }
      : {
          key: 'premium_notice_missing',
          title: 'No premium notice attached',
          detail: 'There is no premium notice or supporting document attached to the case.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.propertySignals.roofReplacementYear !== null
      ? {
          key: 'roof_signal_present',
          title: 'Roof replacement signal available',
          detail:
            ctx.propertySignals.roofAgeYears !== null
              ? `The property record shows a roof replacement year of ${ctx.propertySignals.roofReplacementYear}, which suggests a roof age of about ${ctx.propertySignals.roofAgeYears} years.`
              : `The property record shows a roof replacement year of ${ctx.propertySignals.roofReplacementYear}.`,
          status: 'POSITIVE',
        }
      : {
          key: 'roof_signal_missing',
          title: 'No roof replacement signal found',
          detail: 'No roof replacement year is available in the property record.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.propertySignals.policyOnFile
      ? {
          key: 'policy_record_present',
          title: 'Insurance policy record found in property data',
          detail: ctx.propertySignals.policyOnFile.carrierName
            ? `The property record includes an insurance policy entry for ${ctx.propertySignals.policyOnFile.carrierName}${ctx.propertySignals.policyOnFile.isVerified ? ', and it is marked verified.' : '.'}`
            : `The property record includes an insurance policy entry${ctx.propertySignals.policyOnFile.isVerified ? ' that is marked verified.' : '.'}`,
          status: 'POSITIVE',
        }
      : {
          key: 'policy_record_missing',
          title: 'No insurance policy record found in property data',
          detail: 'There is no insurance policy record on the property that adds extra leverage from app data alone.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.propertySignals.completedMaintenanceCount > 0 || ctx.propertySignals.recentImprovementCount > 0
      ? {
          key: 'maintenance_signal_present',
          title: 'Property documentation signal present',
          detail: `The property record includes ${ctx.propertySignals.completedMaintenanceCount} completed maintenance task(s) and ${ctx.propertySignals.recentImprovementCount} recent maintenance, repair, or improvement event(s).`,
          status: 'POSITIVE',
        }
      : {
          key: 'maintenance_signal_limited',
          title: 'Limited maintenance-backed leverage',
          detail: 'There is limited maintenance or upgrade history available in the property record.',
          status: 'INFO',
        }
  );

  addFinding(
    findings,
    ctx.propertySignals.claimFreeRecorded
      ? {
          key: 'claim_free_recorded',
          title: 'No property-linked claims recorded',
          detail: 'No claims are linked to this property in Contract-to-Cozy.',
          status: 'POSITIVE',
        }
      : {
          key: 'claim_signal_unavailable',
          title: 'Claim-free leverage unavailable',
          detail:
            ctx.propertySignals.claimCount > 0
              ? `${ctx.propertySignals.claimCount} property-linked claim record(s) exist, so a claim-free argument is not available from current data.`
              : 'Claim history leverage could not be confirmed from current data.',
          status: 'INFO',
        }
  );

  addLeverage(
    leverage,
    !hasText(ctx.reasonProvided, 20)
      ? {
          key: 'ask_for_written_explanation',
          title: 'Ask for the drivers behind the increase',
          detail: 'A homeowner can reasonably request a written explanation of the rating, underwriting, or discount changes that produced the new premium.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.propertySignals.roofReplacementYear !== null
      ? {
          key: 'recent_roof',
          title: 'Recent roof information may support review',
          detail:
            ctx.propertySignals.roofAgeYears !== null && ctx.propertySignals.roofAgeYears <= 12
              ? 'The property record shows a relatively recent roof replacement, which may be worth raising during underwriting review.'
              : 'The property record includes roof replacement information that may be useful to confirm with the insurer.',
          strength: 'HIGH',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.propertySignals.completedMaintenanceCount > 0 || ctx.propertySignals.recentImprovementCount > 0
      ? {
          key: 'maintenance_history',
          title: 'Documented maintenance may strengthen the request',
          detail: 'Completed maintenance and recorded improvements can help support a request for a policy or underwriting review.',
          strength: 'MEDIUM',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.propertySignals.claimFreeRecorded
      ? {
          key: 'claim_free',
          title: 'Recorded claim-free history may be useful',
          detail: 'If the insurer’s records match the app record, the lack of property-linked claims may be worth mentioning during review.',
          strength: 'MEDIUM',
        }
      : null
  );

  addLeverage(
    leverage,
    ctx.propertySignals.hasSecuritySystem === true ||
      ctx.propertySignals.hasSmokeDetectors === true ||
      ctx.propertySignals.hasCoDetectors === true ||
      ctx.propertySignals.hasSumpPumpBackup === true
      ? {
          key: 'risk_mitigation_features',
          title: 'Risk-reducing features are recorded for the property',
          detail: 'Safety and mitigation features in the property record may be worth confirming with the insurer if they are not already reflected.',
          strength: 'MEDIUM',
        }
      : null
  );

  addAction(
    actions,
    {
      key: 'request_review_explanation',
      title: 'Ask for a written explanation of the premium increase',
      detail: 'Request a short written explanation of the factors, discounts, or underwriting changes that drove the increase.',
      priority: 'HIGH',
    }
  );

  addAction(
    actions,
    !hasText(ctx.reasonProvided, 20)
      ? {
          key: 'request_underwriting_review',
          title: 'Ask for underwriting review before renewal',
          detail: 'Ask whether the policy can be reviewed again before renewal is finalized.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    leverage.some((item) => item.key === 'recent_roof') || leverage.some((item) => item.key === 'maintenance_history')
      ? {
          key: 'submit_property_updates',
          title: 'Provide property upgrade or maintenance documentation',
          detail: 'Offer roof, maintenance, inspection, or improvement records that may help the insurer reassess the property profile.',
          priority: 'HIGH',
        }
      : null
  );

  addAction(
    actions,
    leverage.some((item) => item.key === 'risk_mitigation_features')
      ? {
          key: 'confirm_discount_consideration',
          title: 'Ask whether mitigation features were considered',
          detail: 'Confirm whether safety devices or mitigation features were reflected in the premium calculation.',
          priority: 'MEDIUM',
        }
      : null
  );

  addAction(
    actions,
    {
      key: 'compare_alternatives',
      title: 'Compare alternatives if the explanation remains weak',
      detail: 'If the insurer cannot explain the increase clearly, compare renewal options before accepting the new premium.',
      priority: hasText(ctx.reasonProvided, 20) ? 'MEDIUM' : 'HIGH',
    }
  );

  const pricingAssessment = buildPricingAssessment(ctx);
  const summary = buildSummary(ctx, pricingAssessment);

  let confidence = 0.3;
  if (ctx.priorPremium !== null) confidence += 0.12;
  if (ctx.newPremium !== null) confidence += 0.12;
  if (ctx.increaseAmount !== null || ctx.increasePercentage !== null) confidence += 0.1;
  if (hasText(ctx.reasonProvided, 20)) confidence += 0.1;
  if (hasText(ctx.rawText, 25)) confidence += 0.08;
  if (hasText(ctx.notes, 20)) confidence += 0.05;
  if (ctx.hasAnyDocument) confidence += 0.05;
  if (ctx.propertySignals.roofReplacementYear !== null) confidence += 0.05;
  if (ctx.propertySignals.completedMaintenanceCount > 0 || ctx.propertySignals.recentImprovementCount > 0) confidence += 0.05;
  if (ctx.propertySignals.claimFreeRecorded) confidence += 0.04;
  if (ctx.propertySignals.policyOnFile?.isVerified) confidence += 0.04;
  if (!hasText(ctx.reasonProvided, 20)) confidence -= 0.05;
  if (ctx.priorPremium === null || ctx.newPremium === null) confidence -= 0.08;
  confidence = clamp(Number(confidence.toFixed(2)), 0.2, 0.92);

  const draft = buildDraft(ctx, actions, leverage);

  return {
    summary,
    findings,
    negotiationLeverage: leverage,
    recommendedActions: actions,
    pricingAssessment: {
      ...pricingAssessment,
      confidenceLabel: inferConfidenceLabel(confidence),
    },
    confidence,
    modelVersion: INSURANCE_PREMIUM_MODEL_VERSION,
    draft,
  };
}
