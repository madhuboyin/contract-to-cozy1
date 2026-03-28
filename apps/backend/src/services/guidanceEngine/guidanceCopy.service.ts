import { GuidanceIssueDomain } from './guidanceTypes';

type GuidanceActionCopyContext = {
  issueDomain: GuidanceIssueDomain;
  signalIntentFamily?: string | null;
  stepKey?: string | null;
  stepLabel?: string | null;
  priorityBucket?: 'HIGH' | 'MEDIUM' | 'LOW';
  fundingGapFlag?: boolean;
  costOfDelay?: number;
  coverageImpact?: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN';
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
  // Item/asset context for specific copy
  itemName?: string | null;
  assetType?: string | null;
};

const STEP_LABEL_MAP: Record<string, string> = {
  repair_replace_decision: 'Compare Repair vs Replace',
  check_coverage: 'Check Coverage First',
  validate_price: 'Validate Price Before Hiring',
  prepare_negotiation: 'Prepare Negotiation Strategy',
  compare_quotes: 'Compare Quotes Side By Side',
  finalize_price: 'Finalize Price and Terms',
  book_service: 'Book Service When Ready',
  assess_urgency: 'Assess Urgency First',
  estimate_repair_cost: 'Estimate Repair Cost',
  route_specialist: 'Route to the Right Specialist',
  estimate_exposure: 'Estimate Uncovered Exposure',
  compare_coverage_options: 'Compare Coverage Options',
  update_policy_or_documents: 'Update Policy or Upload Documents',
  safety_alert: 'Review Safety Alert',
  review_remedy_instructions: 'Review Remedy Instructions',
  recall_resolution: 'Confirm Recall Resolution',
  compare_action_options: 'Compare Act Now vs Delay',
  evaluate_savings_funding: 'Review Savings and Funding Options',
  estimate_out_of_pocket_cost: 'Estimate Out-of-Pocket Cost',
  route_financial_plan: 'Plan Capital Timeline',
};

function humanizeEnum(value?: string | null) {
  if (!value) return 'Issue';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeShortText(input?: string | null) {
  if (!input) return null;
  const value = input.trim();
  return value.length > 0 ? value : null;
}

function replaceGenericVerb(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (
    lowered === 'view details' ||
    lowered === 'view analysis' ||
    lowered === 'open tool' ||
    lowered === 'open'
  ) {
    return null;
  }
  return trimmed;
}

export class GuidanceCopyService {
  polishStepLabel(args: {
    stepKey?: string | null;
    label?: string | null;
    toolKey?: string | null;
  }) {
    const stepKey = normalizeShortText(args.stepKey)?.toLowerCase();
    if (stepKey && STEP_LABEL_MAP[stepKey]) {
      return STEP_LABEL_MAP[stepKey];
    }

    const nonGeneric = replaceGenericVerb(args.label ?? '');
    if (nonGeneric) return nonGeneric;

    const toolKey = normalizeShortText(args.toolKey)?.toLowerCase();
    if (toolKey === 'replace-repair') return 'Compare Repair vs Replace';
    if (toolKey === 'coverage-intelligence') return 'Check Coverage First';
    if (toolKey === 'service-price-radar') return 'Validate Price Before Hiring';
    if (toolKey === 'quote-comparison') return 'Compare Quotes Side By Side';
    if (toolKey === 'negotiation-shield') return 'Prepare Negotiation Strategy';
    if (toolKey === 'price-finalization') return 'Finalize Price and Terms';
    if (toolKey === 'booking') return 'Book Service When Ready';
    if (toolKey === 'do-nothing-simulator') return 'Compare Act Now vs Delay';
    if (toolKey === 'home-savings') return 'Review Savings and Funding Options';
    if (toolKey === 'true-cost') return 'Estimate Out-of-Pocket Cost';

    return 'Review Next Step';
  }

  buildActionExplanation(context: GuidanceActionCopyContext) {
    const polishedStep = this.polishStepLabel({
      stepKey: context.stepKey ?? null,
      label: context.stepLabel ?? null,
    });

    const familyKey = (context.signalIntentFamily ?? '').toLowerCase();
    const subject = context.itemName
      ? `your ${context.itemName}`
      : context.assetType
        ? `your ${humanizeEnum(context.assetType).toLowerCase()}`
        : null;

    // Build a specific "what" using item/asset context when available
    let what: string;
    if (subject) {
      const FAMILY_WHAT: Record<string, string> = {
        coverage_gap: `${subject} may have a coverage gap`,
        coverage_lapse_detected: `Coverage on ${subject} is lapsing soon`,
        lifecycle_end_or_past_life: `${subject} is nearing or past expected life`,
        maintenance_failure_risk: `${subject} has a maintenance issue that needs attention`,
        recall_detected: `A safety recall was found on ${subject}`,
        cost_of_inaction_risk: `Delaying action on ${subject} is increasing your cost`,
        financial_exposure: `Out-of-pocket exposure detected for ${subject}`,
        inspection_followup_needed: `Follow-up action is needed from ${subject}'s inspection`,
        freeze_risk: `${subject} is at risk from freezing temperatures`,
        heat_risk: `${subject} is at risk from heat stress`,
        flood_risk: `${subject} is at risk from flooding`,
        hurricane_risk: `${subject} is at risk from storm damage`,
        wind_risk: `${subject} is at risk from high winds`,
        wildfire_risk: `${subject} is at risk from wildfire conditions`,
        energy_inefficiency_detected: `${subject} is running inefficiently`,
        high_utility_cost: `${subject} may be driving higher utility costs`,
        permit_required: `${subject} may require a permit before work proceeds`,
        hoa_violation_detected: `${subject} may have an HOA violation`,
        safety_inspection_due: `${subject} is due for a safety inspection`,
      };
      what = FAMILY_WHAT[familyKey] ?? `An issue was detected on ${subject}`;
    } else if (context.signalIntentFamily) {
      what = `${humanizeEnum(context.signalIntentFamily)} detected`;
    } else {
      what = `${humanizeEnum(context.issueDomain)} risk needs attention`;
    }
    // Capitalize first letter
    what = what.charAt(0).toUpperCase() + what.slice(1);

    // Build contextual "why" — reference the specific item when available
    let why: string;
    if (context.issueDomain === 'SAFETY' || context.issueDomain === 'WEATHER') {
      why = subject
        ? `${subject.charAt(0).toUpperCase() + subject.slice(1)} poses a direct safety risk — act before the window closes.`
        : 'This has direct safety impact, so it should be handled first.';
    } else if (context.coverageImpact === 'NOT_COVERED') {
      why = subject
        ? `${subject.charAt(0).toUpperCase() + subject.slice(1)} appears uncovered — full repair costs may come out of pocket.`
        : 'Coverage appears limited, so out-of-pocket exposure may be high.';
    } else if (context.coverageImpact === 'COVERED') {
      why = subject
        ? `${subject.charAt(0).toUpperCase() + subject.slice(1)} may be covered — validate eligibility before spending.`
        : 'Coverage may reduce your cash spend if you validate eligibility first.';
    } else if (context.fundingGapFlag) {
      why = subject
        ? `Repair or replacement cost for ${subject} may exceed available savings.`
        : 'Expected cost may exceed available savings without planning.';
    } else {
      why = subject
        ? `Unresolved issues with ${subject} can affect your home value and budget.`
        : 'This can affect your home risk and cost profile.';
    }

    let risk = 'Delaying this can increase avoidable cost and stress.';
    if ((context.costOfDelay ?? 0) > 0) {
      risk = subject
        ? `Delaying action on ${subject} may increase cost by about $${Math.round(context.costOfDelay ?? 0).toLocaleString()}.`
        : `Delaying may increase cost by about $${Math.round(context.costOfDelay ?? 0).toLocaleString()}.`;
    } else if (context.priorityBucket === 'HIGH') {
      risk = subject
        ? `Delaying action on ${subject} can escalate risk quickly.`
        : 'Delaying can increase risk quickly.';
    }

    if (context.confidenceLabel === 'LOW') {
      risk = 'Data confidence is limited, so confirm key details before execution.';
    }

    return {
      what,
      why,
      risk,
      nextStep: polishedStep,
    };
  }

  polishWarnings(
    warnings: string[],
    options?: { confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW'; fundingGapFlag?: boolean }
  ) {
    const next: string[] = [];
    for (const warning of warnings) {
      const lowered = warning.toLowerCase();
      if (lowered.includes('missing context')) {
        next.push('Add missing home details to improve recommendation quality.');
        continue;
      }
      if (lowered.includes('required earlier steps')) {
        next.push('Complete earlier required steps before execution.');
        continue;
      }
      next.push(warning);
    }

    if (options?.fundingGapFlag) {
      next.push('Review funding options before committing to execution.');
    }

    if (options?.confidenceLabel === 'LOW') {
      next.push('Confidence is low; validate key assumptions before spending.');
    }

    return Array.from(new Set(next));
  }

  polishBlockedReason(
    blockedReason: string | null,
    options?: {
      missingPrerequisites?: Array<{ stepKey: string; label: string }>;
    }
  ) {
    if (options?.missingPrerequisites?.length) {
      const labels = options.missingPrerequisites.map((item) =>
        this.polishStepLabel({
          stepKey: item.stepKey,
          label: item.label,
        })
      );
      return `Complete prerequisite steps first: ${Array.from(new Set(labels)).join(', ')}.`;
    }

    if (!blockedReason) return null;

    const lowered = blockedReason.toLowerCase();
    if (lowered.includes('prerequisite')) {
      return 'Complete prerequisite steps before moving to execution.';
    }
    if (lowered.includes('blocked')) {
      return 'This step is blocked until required context is complete.';
    }

    return blockedReason;
  }

  polishExecutionGuardReasons(
    reasons: string[],
    missingPrerequisites: Array<{ stepKey: string; stepLabel: string }>
  ) {
    const next = [...reasons];
    if (missingPrerequisites.length > 0) {
      const labels = missingPrerequisites.map((step) =>
        this.polishStepLabel({ stepKey: step.stepKey, label: step.stepLabel })
      );
      next.push(`Finish these steps first: ${Array.from(new Set(labels)).join(', ')}.`);
    }
    return Array.from(new Set(next));
  }
}

export const guidanceCopyService = new GuidanceCopyService();
