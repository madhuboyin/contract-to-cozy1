// apps/backend/src/homeRenovationAdvisor/engine/summary/summaryBuilder.service.ts
//
// Generates overall summaries, structured warnings, and next actions
// for a completed Home Renovation Risk Advisor evaluation.
//
// Step 5 improvements:
// - Context-aware plain-language summaries (pre-project vs retroactive)
// - Confidence-aware wording (mentions uncertainty when data is limited)
// - Retroactive non-compliance escalation (checklist-aware)
// - Structural renovation type awareness
// - Urgency hints on warnings
// - Smarter next actions (no duplicates, retroactive-specific, top 5 max)
// - Unsupported area differentiation (no data / partial / low-confidence)

import {
  AdvisorConfidenceLevel,
  AdvisorRiskLevel,
  HomeRenovationType,
  PermitRequirementStatus,
  ContractorLicenseRequirementStatus,
  RenovationAdvisorFlowType,
} from '@prisma/client';
import {
  EvaluationContext,
  LicensingEvaluationResult,
  NextActionEntry,
  PermitEvaluationResult,
  TaxImpactEvaluationResult,
  WarningEntry,
} from '../../types/homeRenovationAdvisor.types';

// ============================================================================
// RENOVATION LABELS
// ============================================================================

export const RENOVATION_TYPE_LABELS: Record<HomeRenovationType, string> = {
  ROOM_ADDITION: 'Room Addition',
  BATHROOM_ADDITION: 'Bathroom Addition',
  BATHROOM_FULL_REMODEL: 'Bathroom Full Remodel',
  GARAGE_CONVERSION: 'Garage Conversion',
  BASEMENT_FINISHING: 'Basement Finishing',
  ADU_CONSTRUCTION: 'ADU Construction',
  DECK_ADDITION: 'Deck Addition',
  PATIO_MAJOR_ADDITION: 'Major Patio Addition',
  STRUCTURAL_WALL_REMOVAL: 'Structural Wall Removal',
  STRUCTURAL_WALL_ADDITION: 'Structural Wall Addition',
  ROOF_REPLACEMENT: 'Roof Replacement',
  STRUCTURAL_REPAIR_MAJOR: 'Major Structural Repair',
};

export function getRenovationLabel(renovationType: HomeRenovationType): string {
  return RENOVATION_TYPE_LABELS[renovationType] ?? renovationType;
}

// ============================================================================
// STRUCTURAL RENOVATION DETECTION
// These types involve load-bearing or structural changes and carry higher risk
// when done without permits/licensed contractors.
// ============================================================================

const STRUCTURAL_RENOVATION_TYPES = new Set<HomeRenovationType>([
  'ROOM_ADDITION',
  'BATHROOM_ADDITION',
  'GARAGE_CONVERSION',
  'ADU_CONSTRUCTION',
  'STRUCTURAL_WALL_REMOVAL',
  'STRUCTURAL_WALL_ADDITION',
  'STRUCTURAL_REPAIR_MAJOR',
  'BASEMENT_FINISHING',
]);

function isStructuralRenovation(renovationType: HomeRenovationType): boolean {
  return STRUCTURAL_RENOVATION_TYPES.has(renovationType);
}

// ============================================================================
// OVERALL RISK LEVEL
// ============================================================================

export function computeOverallRiskLevel(
  permit: PermitEvaluationResult,
  licensing: LicensingEvaluationResult,
  tax: TaxImpactEvaluationResult,
  ctx?: EvaluationContext,
  checklistAnswers?: {
    permitObtainedStatus?: string | null;
    licensedContractorUsedStatus?: string | null;
  } | null,
): AdvisorRiskLevel {
  const permitRequired =
    permit.requirementStatus === PermitRequirementStatus.REQUIRED ||
    permit.requirementStatus === PermitRequirementStatus.LIKELY_REQUIRED;

  const licensingRequired =
    licensing.requirementStatus === ContractorLicenseRequirementStatus.REQUIRED;

  const highTaxImpact =
    tax.monthlyTaxIncreaseMax !== null && tax.monthlyTaxIncreaseMax > 300;

  const criticalTaxImpact =
    tax.monthlyTaxIncreaseMax !== null && tax.monthlyTaxIncreaseMax > 700;

  const isRetroactive = ctx?.isRetroactiveCheck === true || ctx?.flowType === 'RETROACTIVE_COMPLIANCE';
  const structural = ctx ? isStructuralRenovation(ctx.renovationType) : false;

  // Retroactive non-compliance escalation
  // If work is already completed and we know permit was NOT obtained for permit-required work → CRITICAL
  if (isRetroactive && checklistAnswers) {
    const permitNotObtained = checklistAnswers.permitObtainedStatus === 'NO';
    const contractorNotLicensed = checklistAnswers.licensedContractorUsedStatus === 'NO';

    if (permitNotObtained && permitRequired && (structural || licensingRequired)) {
      return AdvisorRiskLevel.CRITICAL;
    }
    if (permitNotObtained && permitRequired) return AdvisorRiskLevel.HIGH;
    if (contractorNotLicensed && licensingRequired && structural) return AdvisorRiskLevel.HIGH;
  }

  // Retroactive without checklist: escalate one level for structural renovations
  if (isRetroactive && structural && permitRequired && licensingRequired) {
    return AdvisorRiskLevel.CRITICAL;
  }
  if (isRetroactive && structural && (permitRequired || licensingRequired)) {
    return AdvisorRiskLevel.HIGH;
  }

  // Standard logic
  if (criticalTaxImpact && permitRequired && licensingRequired) return AdvisorRiskLevel.CRITICAL;
  if ((permitRequired && licensingRequired) || criticalTaxImpact) return AdvisorRiskLevel.HIGH;
  if (permitRequired || (highTaxImpact && licensingRequired)) return AdvisorRiskLevel.MODERATE;
  return AdvisorRiskLevel.LOW;
}

// ============================================================================
// OVERALL SUMMARY — plain language, homeowner-friendly
// ============================================================================

export function buildOverallSummary(
  ctx: EvaluationContext,
  permit: PermitEvaluationResult,
  tax: TaxImpactEvaluationResult,
  licensing: LicensingEvaluationResult,
  overallRiskLevel: AdvisorRiskLevel,
  overallConfidence?: AdvisorConfidenceLevel,
): string {
  const label = getRenovationLabel(ctx.renovationType);
  const isRetroactive = ctx.isRetroactiveCheck || ctx.flowType === 'RETROACTIVE_COMPLIANCE';
  const isLowConfidence =
    overallConfidence === 'LOW' || overallConfidence === 'UNAVAILABLE';
  const unsupportedJurisdiction = !ctx.jurisdiction.state;

  // Lead-in sentence: retroactive vs pre-project
  const parts: string[] = [];

  if (isRetroactive) {
    parts.push(
      `This is a retroactive compliance review for your completed ${label}. CtC is helping you identify any permit, tax, or licensing gaps that could matter for resale, insurance, or future risk reviews.`,
    );
  } else if (unsupportedJurisdiction) {
    parts.push(
      `Here is a directional estimate for your ${label}. Your property address is incomplete, so estimates are based on national defaults — verify requirements locally before relying on them.`,
    );
  } else if (isLowConfidence) {
    parts.push(
      `Here is a directional estimate for your ${label}. Some details for your area are limited, so treat these as a starting point and verify locally before making decisions.`,
    );
  } else {
    parts.push(`Here is what to expect for your ${label}.`);
  }

  // Permit
  if (!isRetroactive) {
    switch (permit.requirementStatus) {
      case 'REQUIRED':
        parts.push('A permit will likely be required — check with your local building department before starting work.');
        break;
      case 'LIKELY_REQUIRED':
        parts.push('A permit is probably required, though requirements vary by city and county. Confirm locally before starting.');
        break;
      case 'NOT_REQUIRED':
        parts.push('A permit is typically not required for this type of project.');
        break;
      case 'DATA_UNAVAILABLE':
        parts.push('Permit data was not available for your area — check with your local building department.');
        break;
      default:
        // UNKNOWN — skip rather than add noise
        break;
    }
  } else {
    // Retroactive permit framing
    switch (permit.requirementStatus) {
      case 'REQUIRED':
      case 'LIKELY_REQUIRED':
        parts.push('This type of project typically requires a permit. If one was not obtained, that may be worth resolving before a future sale or inspection.');
        break;
      default:
        break;
    }
  }

  // Tax (show even for retroactive — reassessment may still occur)
  if (tax.dataAvailable && tax.monthlyTaxIncreaseMax && tax.monthlyTaxIncreaseMax > 0) {
    const minFmt = tax.monthlyTaxIncreaseMin !== null ? `$${Math.round(tax.monthlyTaxIncreaseMin)}` : null;
    const maxFmt = `$${Math.round(tax.monthlyTaxIncreaseMax)}`;
    const range = minFmt && minFmt !== maxFmt ? `${minFmt}–${maxFmt}` : maxFmt;

    if (isRetroactive) {
      parts.push(`Your property tax may have increased by roughly ${range}/month following this renovation — watch for reassessment notices if you haven't seen one yet.`);
    } else {
      parts.push(`This project could raise your monthly property tax by roughly ${range} after completion.`);
    }
  }

  // Licensing
  if (!isRetroactive) {
    if (licensing.requirementStatus === 'REQUIRED') {
      parts.push('A licensed contractor is required for this work — verify credentials before hiring.');
    } else if (licensing.requirementStatus === 'MAY_BE_REQUIRED') {
      parts.push('A licensed contractor may be required depending on scope and your state\'s rules.');
    }
  } else {
    if (licensing.requirementStatus === 'REQUIRED' || licensing.requirementStatus === 'MAY_BE_REQUIRED') {
      parts.push('Confirm that a licensed contractor was used — especially if the work involved structural, electrical, or plumbing changes.');
    }
  }

  // Risk-level footer (only for non-obvious HIGH/CRITICAL cases)
  if ((overallRiskLevel === 'CRITICAL' || overallRiskLevel === 'HIGH') && !isRetroactive) {
    parts.push('Review all items below and confirm requirements locally before proceeding.');
  }

  return parts.join(' ');
}

// ============================================================================
// WARNINGS SUMMARY
// ============================================================================

export function buildWarningsSummary(warnings: WarningEntry[]): string {
  const critical = warnings.filter((w) => w.severity === 'CRITICAL');
  const warning = warnings.filter((w) => w.severity === 'WARNING');

  if (critical.length === 0 && warning.length === 0) {
    return 'No critical warnings for this renovation scenario.';
  }

  const parts: string[] = [];
  if (critical.length > 0) {
    parts.push(`${critical.length} critical item${critical.length > 1 ? 's' : ''} require${critical.length === 1 ? 's' : ''} your attention.`);
  }
  if (warning.length > 0) {
    parts.push(`${warning.length} notice${warning.length > 1 ? 's' : ''} to review.`);
  }
  return parts.join(' ');
}

// ============================================================================
// NEXT STEPS SUMMARY
// ============================================================================

export function buildNextStepsSummary(nextActions: NextActionEntry[]): string {
  const topActions = nextActions.slice(0, 3).map((a) => a.label);
  if (topActions.length === 0) return 'Review the details above and consult local authorities as needed.';
  return `Recommended next steps: ${topActions.join('; ')}.`;
}

// ============================================================================
// WARNINGS GENERATION
// ============================================================================

export function buildWarnings(
  ctx: EvaluationContext,
  permit: PermitEvaluationResult,
  tax: TaxImpactEvaluationResult,
  licensing: LicensingEvaluationResult,
  checklistAnswers?: {
    permitObtainedStatus?: string | null;
    licensedContractorUsedStatus?: string | null;
    reassessmentReceivedStatus?: string | null;
  } | null,
): WarningEntry[] {
  const warnings: WarningEntry[] = [];
  const isRetroactive = ctx.isRetroactiveCheck || ctx.flowType === 'RETROACTIVE_COMPLIANCE';
  const structural = isStructuralRenovation(ctx.renovationType);

  // ── Retroactive compliance gap warnings (checklist-driven, highest priority) ──
  if (isRetroactive && checklistAnswers) {
    const permitNotObtained = checklistAnswers.permitObtainedStatus === 'NO';
    const contractorNotLicensed = checklistAnswers.licensedContractorUsedStatus === 'NO';
    const reassessmentNotReceived = checklistAnswers.reassessmentReceivedStatus === 'NO';

    const permitRequired =
      permit.requirementStatus === 'REQUIRED' ||
      permit.requirementStatus === 'LIKELY_REQUIRED';
    const licensingRequired =
      licensing.requirementStatus === 'REQUIRED' ||
      licensing.requirementStatus === 'MAY_BE_REQUIRED';

    if (permitNotObtained && permitRequired) {
      warnings.push({
        code: 'RETROACTIVE_NO_PERMIT_OBTAINED',
        title: structural
          ? 'Unpermitted Structural Work — Action Recommended'
          : 'No Permit Obtained for Permitted Work',
        severity: structural ? 'CRITICAL' : 'WARNING',
        urgency: structural ? 'IMMEDIATE' : 'HIGH',
        description: structural
          ? 'This type of structural project typically requires a permit. Unpermitted structural work can affect your ability to sell, void insurance coverage, and create liability. A retroactive permit or disclosure may be needed before your next transaction.'
          : 'This type of project typically requires a permit, but none was obtained. Unpermitted work may require retroactive permits or disclosure at resale and can affect insurance coverage.',
      });
    }

    if (contractorNotLicensed && licensingRequired) {
      warnings.push({
        code: 'RETROACTIVE_UNLICENSED_CONTRACTOR',
        title: structural
          ? 'Unlicensed Contractor — Structural Work Risk'
          : 'Unlicensed Contractor Used',
        severity: structural ? 'CRITICAL' : 'WARNING',
        urgency: structural ? 'HIGH' : 'MEDIUM',
        description: structural
          ? 'Structural work done by an unlicensed contractor may not meet code requirements. This can affect inspections, insurance, and resale. Consider consulting a structural engineer to document the work.'
          : 'Using an unlicensed contractor for this type of work may void warranties and affect compliance. Collect any documentation you have from the contractor.',
      });
    }

    if (reassessmentNotReceived && tax.dataAvailable && (tax.annualTaxIncreaseMax ?? 0) > 500) {
      warnings.push({
        code: 'RETROACTIVE_REASSESSMENT_PENDING',
        title: 'Property Tax Reassessment May Be Pending',
        severity: 'INFO',
        urgency: 'LOW',
        description: 'This renovation may trigger a property tax reassessment that has not yet been reflected in your bill. Watch for a notice from your local assessor, which could increase your annual tax.',
      });
    }
  }

  // ── Retroactive compliance (no checklist answers yet) ──
  if (isRetroactive && !checklistAnswers) {
    warnings.push({
      code: 'RETROACTIVE_COMPLIANCE_REVIEW',
      title: 'Retroactive Compliance Review',
      severity: 'WARNING',
      urgency: structural ? 'HIGH' : 'MEDIUM',
      description: structural
        ? 'This completed renovation involves structural work that typically requires permits and licensed contractors. Use the checklist below to record what was done and identify any gaps.'
        : 'This completed renovation may have required permits or licensed contractors. Use the checklist below to record what was done and surface any compliance gaps.',
    });
  }

  // ── Permit warnings (pre-project) ──
  if (!isRetroactive) {
    if (permit.requirementStatus === 'REQUIRED') {
      warnings.push({
        code: 'PERMIT_REQUIRED',
        title: 'Permit Required',
        severity: 'CRITICAL',
        urgency: 'HIGH',
        description: structural
          ? 'A permit is required for this structural work. Starting without a permit can result in forced removal, significant fines, and problems at resale or during future inspections.'
          : 'A permit is required for this work in most jurisdictions. Starting without a permit can result in fines, forced removal of completed work, and difficulty selling your home.',
      });
    } else if (permit.requirementStatus === 'LIKELY_REQUIRED') {
      warnings.push({
        code: 'PERMIT_LIKELY_REQUIRED',
        title: 'Permit Likely Required',
        severity: 'WARNING',
        urgency: 'MEDIUM',
        description: 'A permit is likely required for this type of work. Requirements vary by city and county — verify with your local building department before starting.',
      });
    }
  }

  // ── Jurisdiction confidence warnings ──
  if (!ctx.jurisdiction.state) {
    warnings.push({
      code: 'JURISDICTION_UNRESOLVED',
      title: 'Property Location Incomplete',
      severity: 'WARNING',
      urgency: 'MEDIUM',
      description: 'Your property address is missing state or location details, so jurisdiction-specific rules could not be applied. All estimates use national defaults, which may not reflect your local requirements.',
    });
  } else if (
    ctx.jurisdiction.jurisdictionLevel === 'STATE' ||
    ctx.jurisdiction.jurisdictionLevel === 'UNKNOWN'
  ) {
    warnings.push({
      code: 'JURISDICTION_PARTIAL',
      title: 'Estimates Based on State-Level Data Only',
      severity: 'INFO',
      urgency: 'LOW',
      description: 'Local permit and tax rules vary within the state — city or county rules may differ from the estimates shown. Verify specific requirements with your local building department.',
    });
  }

  // ── Low confidence ──
  if (
    permit.confidenceLevel === 'LOW' ||
    permit.confidenceLevel === 'UNAVAILABLE' ||
    tax.confidenceLevel === 'LOW' ||
    tax.confidenceLevel === 'UNAVAILABLE'
  ) {
    warnings.push({
      code: 'LOW_CONFIDENCE_ESTIMATE',
      title: 'Directional Estimate Only',
      severity: 'WARNING',
      urgency: 'LOW',
      description: 'Some outputs are based on national defaults because detailed local data was unavailable. Use these as a starting point and verify with local authorities before making decisions.',
    });
  }

  // ── Project cost assumed ──
  if (!ctx.projectCostInput) {
    warnings.push({
      code: 'PROJECT_COST_ASSUMED',
      title: 'Project Cost Was Estimated',
      severity: 'INFO',
      urgency: 'LOW',
      description: 'No project cost was entered. Tax impact estimates use a national median for this renovation type. Add your actual project cost for a more accurate tax estimate.',
    });
  }

  // ── Licensing warnings (pre-project) ──
  if (!isRetroactive) {
    if (licensing.requirementStatus === 'REQUIRED') {
      warnings.push({
        code: 'CONTRACTOR_LICENSE_REQUIRED',
        title: 'Licensed Contractor Required',
        severity: 'CRITICAL',
        urgency: 'HIGH',
        description: licensing.consequenceSummary || 'A licensed contractor is required for this work. Using an unlicensed contractor may void your homeowner\'s insurance and create liability.',
      });
    } else if (licensing.requirementStatus === 'MAY_BE_REQUIRED') {
      warnings.push({
        code: 'CONTRACTOR_LICENSE_MAY_BE_REQUIRED',
        title: 'Licensed Contractor May Be Required',
        severity: 'WARNING',
        urgency: 'MEDIUM',
        description: 'Depending on scope and your state\'s rules, a licensed contractor may be required. Verify license requirements before hiring.',
      });
    }
  }

  // ── Material tax increase ──
  if (tax.monthlyTaxIncreaseMax !== null && tax.monthlyTaxIncreaseMax > 300) {
    const minFmt = tax.monthlyTaxIncreaseMin !== null ? `$${Math.round(tax.monthlyTaxIncreaseMin)}` : null;
    const maxFmt = `$${Math.round(tax.monthlyTaxIncreaseMax)}`;
    const range = minFmt && minFmt !== maxFmt ? `${minFmt}–${maxFmt}` : maxFmt;
    warnings.push({
      code: 'MATERIAL_TAX_INCREASE',
      title: 'Property Tax Increase Expected',
      severity: 'WARNING',
      urgency: 'LOW',
      description: `This renovation may increase your monthly property tax by roughly ${range}. Factor this recurring cost into your long-term budget.`,
    });
  }

  return warnings;
}

// ============================================================================
// NEXT ACTIONS GENERATION
// Context-aware: pre-project vs retroactive, structural renovation types,
// linked entity state, tax impact materiality.
// Capped at 5 top actions.
// ============================================================================

export function buildNextActions(
  ctx: EvaluationContext,
  permit: PermitEvaluationResult,
  tax: TaxImpactEvaluationResult,
  licensing: LicensingEvaluationResult,
  overallRiskLevel: AdvisorRiskLevel,
  linkedEntityIds?: {
    digitalTwinEntityId?: string | null;
    timelineEventId?: string | null;
  } | null,
): NextActionEntry[] {
  const actions: NextActionEntry[] = [];
  const isRetroactive = ctx.isRetroactiveCheck || ctx.flowType === 'RETROACTIVE_COMPLIANCE';
  const structural = isStructuralRenovation(ctx.renovationType);

  const permitRequired =
    permit.requirementStatus === 'REQUIRED' ||
    permit.requirementStatus === 'LIKELY_REQUIRED';

  const licensingRequired =
    licensing.requirementStatus === 'REQUIRED' ||
    licensing.requirementStatus === 'MAY_BE_REQUIRED';

  const materialTaxImpact =
    tax.dataAvailable && tax.monthlyTaxIncreaseMax !== null && tax.monthlyTaxIncreaseMax > 150;

  const lowConfidence =
    permit.confidenceLevel === 'LOW' || permit.confidenceLevel === 'UNAVAILABLE';

  if (isRetroactive) {
    // ── RETROACTIVE FLOW ──

    // 1. Complete compliance checklist
    actions.push({
      key: 'complete_compliance_checklist',
      label: 'Record what was done',
      description: 'Use the compliance checklist to record whether a permit was obtained, a licensed contractor was used, and whether reassessment has been received. This helps identify any gaps.',
      destinationType: 'INFO',
      destinationRef: null,
      priority: 1,
    });

    // 2. Permit documentation
    if (permitRequired) {
      actions.push({
        key: 'retroactive_confirm_permit',
        label: 'Confirm your permit status and keep records',
        description: 'Check whether a permit was pulled for this work. If not, a retroactive permit may be an option — contact your local building department to understand your options.',
        destinationType: permit.applicationPortalUrl ? 'EXTERNAL_URL' : 'INFO',
        destinationRef: permit.applicationPortalUrl,
        priority: 2,
      });
    }

    // 3. Contractor documentation
    if (licensingRequired || structural) {
      actions.push({
        key: 'retroactive_collect_contractor_docs',
        label: 'Collect contractor documentation',
        description: 'Gather any invoices, contracts, or license numbers from the contractor(s) who did the work. This protects you at resale and during insurance or risk reviews.',
        destinationType: 'INFO',
        destinationRef: null,
        priority: 3,
      });
    }

    // 4. Tax reassessment
    if (materialTaxImpact) {
      actions.push({
        key: 'retroactive_watch_reassessment',
        label: 'Watch for a property tax reassessment notice',
        description: 'A completed renovation like this may trigger a reassessment. Check if your bill has changed, and factor potential tax increases into your carrying cost review.',
        destinationType: 'MODULE_LINK',
        destinationRef: 'home-tools/tco',
        priority: 4,
      });
    }

    // 5. Digital twin update
    actions.push({
      key: 'update_digital_twin_completed',
      label: 'Review and update your Home Digital Twin',
      description: 'Since this work is completed, update your Digital Twin to reflect any structural, electrical, or system changes — especially if the renovation added space or modified layout.',
      destinationType: 'MODULE_LINK',
      destinationRef: 'home-tools/digital-twin',
      priority: 5,
    });

  } else {
    // ── PRE-PROJECT FLOW ──

    // 1. Permit verification (if required)
    if (permitRequired) {
      actions.push({
        key: 'verify_permit_locally',
        label: 'Confirm permit requirements before starting',
        description: permit.applicationPortalUrl
          ? 'Check exact permit requirements, fees, and timelines with your local building department before work begins.'
          : 'Contact your local building or planning department to confirm permit requirements, costs, and timelines before starting work.',
        destinationType: permit.applicationPortalUrl ? 'EXTERNAL_URL' : 'INFO',
        destinationRef: permit.applicationPortalUrl,
        priority: 1,
      });
    }

    // 2. Contractor license verification (if required)
    if (licensingRequired) {
      actions.push({
        key: 'verify_contractor_license',
        label: 'Verify your contractor\'s license before signing',
        description: 'Check your contractor\'s license status at your state licensing board before signing a contract or paying a deposit.',
        destinationType: licensing.verificationToolUrl ? 'EXTERNAL_URL' : 'INFO',
        destinationRef: licensing.verificationToolUrl,
        priority: 2,
      });
    }

    // 3. Low confidence → local verification
    if (lowConfidence || !ctx.jurisdiction.state) {
      actions.push({
        key: 'verify_locally_low_confidence',
        label: 'Verify requirements locally — estimates are directional',
        description: 'Local data was limited for your area. Use these estimates as a starting point, and confirm specific permit, tax, and contractor requirements with your local building department.',
        destinationType: 'INFO',
        destinationRef: null,
        priority: permitRequired ? 3 : 1,
      });
    }

    // 4. TCO impact — always show if tax is material
    if (materialTaxImpact) {
      actions.push({
        key: 'review_tco_impact',
        label: 'Review the recurring cost impact in your TCO',
        description: 'This renovation may increase your monthly property tax and potentially your insurance. Review the long-term carrying cost before committing.',
        destinationType: 'MODULE_LINK',
        destinationRef: 'home-tools/tco',
        priority: 3,
      });
    }

    // 5. Break-even — only when both permit + material tax, or HIGH/CRITICAL risk
    if ((permitRequired && materialTaxImpact) || overallRiskLevel === 'HIGH' || overallRiskLevel === 'CRITICAL') {
      actions.push({
        key: 'run_break_even_analysis',
        label: 'Compare renovation cost vs long-term value in Break-Even',
        description: 'With permit costs and a recurring tax increase, run a break-even analysis to understand how long before this renovation pays off.',
        destinationType: 'MODULE_LINK',
        destinationRef: 'home-tools/break-even',
        priority: 4,
      });
    }

    // 6. Digital twin — structural projects benefit most
    if (structural) {
      actions.push({
        key: 'update_digital_twin',
        label: 'Plan to update your Digital Twin after completion',
        description: 'After the renovation is complete, update your Home Digital Twin to reflect structural or system changes. This helps with future risk, insurance, and capital planning.',
        destinationType: 'MODULE_LINK',
        destinationRef: 'home-tools/digital-twin',
        priority: 5,
      });
    }

    // 7. TCO fallback (if no material tax impact, still worth showing)
    if (!materialTaxImpact && !lowConfidence && actions.length < 3) {
      actions.push({
        key: 'review_tco_impact',
        label: 'Review total cost of ownership impact',
        description: 'Understand the full long-term carrying cost of this renovation including taxes, insurance, and maintenance.',
        destinationType: 'MODULE_LINK',
        destinationRef: 'home-tools/tco',
        priority: 6,
      });
    }
  }

  // Sort by priority and cap at 5
  return actions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);
}
