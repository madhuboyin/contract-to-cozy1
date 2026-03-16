// apps/backend/src/homeRenovationAdvisor/engine/summary/summaryBuilder.service.ts
//
// Generates overall summaries, structured warnings, and next actions
// for a completed Home Renovation Risk Advisor evaluation.

import {
  AdvisorConfidenceLevel,
  AdvisorRiskLevel,
  HomeRenovationType,
  PermitRequirementStatus,
  ContractorLicenseRequirementStatus,
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
// OVERALL RISK LEVEL
// ============================================================================

export function computeOverallRiskLevel(
  permit: PermitEvaluationResult,
  licensing: LicensingEvaluationResult,
  tax: TaxImpactEvaluationResult,
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

  if (criticalTaxImpact && permitRequired && licensingRequired) return AdvisorRiskLevel.CRITICAL;
  if ((permitRequired && licensingRequired) || criticalTaxImpact) return AdvisorRiskLevel.HIGH;
  if (permitRequired || (highTaxImpact && licensingRequired)) return AdvisorRiskLevel.MODERATE;
  return AdvisorRiskLevel.LOW;
}

// ============================================================================
// OVERALL SUMMARY
// ============================================================================

export function buildOverallSummary(
  ctx: EvaluationContext,
  permit: PermitEvaluationResult,
  tax: TaxImpactEvaluationResult,
  licensing: LicensingEvaluationResult,
  overallRiskLevel: AdvisorRiskLevel,
): string {
  const label = getRenovationLabel(ctx.renovationType);
  const parts: string[] = [];

  parts.push(`Your ${label} assessment is complete.`);

  // Permit
  switch (permit.requirementStatus) {
    case 'REQUIRED':
      parts.push('A permit is required for this work in most jurisdictions.');
      break;
    case 'LIKELY_REQUIRED':
      parts.push('A permit is likely required — confirm with your local building department.');
      break;
    case 'NOT_REQUIRED':
      parts.push('A permit is typically not required for this type of work.');
      break;
    default:
      parts.push('Permit requirements could not be determined — check locally.');
  }

  // Tax
  if (tax.dataAvailable && tax.monthlyTaxIncreaseMax && tax.monthlyTaxIncreaseMax > 0) {
    parts.push(
      `Expect a potential property tax increase of approximately $${tax.monthlyTaxIncreaseMin}–$${tax.monthlyTaxIncreaseMax}/month after completion.`,
    );
  }

  // Licensing
  if (licensing.requirementStatus === 'REQUIRED') {
    parts.push('A licensed contractor is required for this work.');
  } else if (licensing.requirementStatus === 'MAY_BE_REQUIRED') {
    parts.push('A licensed contractor may be required depending on the scope.');
  }

  // Risk footer
  if (overallRiskLevel === 'CRITICAL' || overallRiskLevel === 'HIGH') {
    parts.push('Review all warnings and confirm requirements with local authorities before proceeding.');
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
    parts.push(`${critical.length} critical item${critical.length > 1 ? 's' : ''} require your attention.`);
  }
  if (warning.length > 0) {
    parts.push(`${warning.length} warning${warning.length > 1 ? 's' : ''} to review.`);
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
): WarningEntry[] {
  const warnings: WarningEntry[] = [];

  // Permit warnings
  if (permit.requirementStatus === 'REQUIRED') {
    warnings.push({
      code: 'PERMIT_REQUIRED',
      title: 'Permit Required',
      severity: 'CRITICAL',
      description: 'This renovation requires a permit in most jurisdictions. Starting work without a permit can result in fines, forced removal of work, and difficulty selling your home.',
    });
  } else if (permit.requirementStatus === 'LIKELY_REQUIRED') {
    warnings.push({
      code: 'PERMIT_LIKELY_REQUIRED',
      title: 'Permit Likely Required',
      severity: 'WARNING',
      description: 'A permit is likely required for this type of work. Verify with your local building department before starting.',
    });
  }

  // Low confidence warning
  if (
    permit.confidenceLevel === 'LOW' ||
    permit.confidenceLevel === 'UNAVAILABLE' ||
    tax.confidenceLevel === 'LOW' ||
    tax.confidenceLevel === 'UNAVAILABLE'
  ) {
    warnings.push({
      code: 'LOW_CONFIDENCE_ESTIMATE',
      title: 'Low Confidence Estimate',
      severity: 'WARNING',
      description: 'Some outputs in this assessment are based on national defaults because local data was unavailable. Use these estimates as a starting point, not as definitive guidance.',
    });
  }

  // Jurisdiction incomplete
  if (!ctx.jurisdiction.state) {
    warnings.push({
      code: 'JURISDICTION_UNRESOLVED',
      title: 'Jurisdiction Could Not Be Resolved',
      severity: 'WARNING',
      description: 'Your property address is incomplete, so jurisdiction-specific rules could not be applied. All estimates use national defaults.',
    });
  } else if (
    ctx.jurisdiction.jurisdictionLevel === 'STATE' ||
    ctx.jurisdiction.jurisdictionLevel === 'UNKNOWN'
  ) {
    warnings.push({
      code: 'JURISDICTION_PARTIAL',
      title: 'Jurisdiction Resolved at State Level Only',
      severity: 'INFO',
      description: 'Local permit and tax rules vary within the state. Estimates are based on state-level data. City or county rules may differ.',
    });
  }

  // Project cost assumed
  if (!ctx.projectCostInput) {
    warnings.push({
      code: 'PROJECT_COST_ASSUMED',
      title: 'Project Cost Estimated',
      severity: 'INFO',
      description: 'No project cost was provided. Tax impact estimates are based on a national median project cost for this renovation type. Actual costs vary widely.',
    });
  }

  // Licensing warnings
  if (licensing.requirementStatus === 'REQUIRED') {
    warnings.push({
      code: 'CONTRACTOR_LICENSE_REQUIRED',
      title: 'Licensed Contractor Required',
      severity: 'CRITICAL',
      description: `${licensing.consequenceSummary}`,
    });
  } else if (licensing.requirementStatus === 'MAY_BE_REQUIRED') {
    warnings.push({
      code: 'CONTRACTOR_LICENSE_MAY_BE_REQUIRED',
      title: 'Licensed Contractor May Be Required',
      severity: 'WARNING',
      description: 'Depending on the scope of work and your state\'s rules, a licensed contractor may be required. Verify before hiring.',
    });
  }

  // High monthly tax impact
  if (tax.monthlyTaxIncreaseMax !== null && tax.monthlyTaxIncreaseMax > 300) {
    warnings.push({
      code: 'MATERIAL_TAX_INCREASE',
      title: 'Material Property Tax Increase Expected',
      severity: 'WARNING',
      description: `This renovation may increase your monthly property tax by approximately $${tax.monthlyTaxIncreaseMin}–$${tax.monthlyTaxIncreaseMax}. Factor this into your long-term carrying cost.`,
    });
  }

  // Retroactive compliance
  if (ctx.isRetroactiveCheck) {
    warnings.push({
      code: 'RETROACTIVE_COMPLIANCE_RISK',
      title: 'Retroactive Compliance Review',
      severity: 'WARNING',
      description: 'You indicated this work has already been completed. Unpermitted completed work can affect your ability to sell and may require retroactive permits.',
    });
  }

  return warnings;
}

// ============================================================================
// NEXT ACTIONS GENERATION
// ============================================================================

export function buildNextActions(
  ctx: EvaluationContext,
  permit: PermitEvaluationResult,
  _tax: TaxImpactEvaluationResult,
  licensing: LicensingEvaluationResult,
  overallRiskLevel: AdvisorRiskLevel,
): NextActionEntry[] {
  const actions: NextActionEntry[] = [];

  // Permit verification
  if (
    permit.requirementStatus === 'REQUIRED' ||
    permit.requirementStatus === 'LIKELY_REQUIRED'
  ) {
    actions.push({
      key: 'verify_permit_locally',
      label: 'Verify permit requirements with your local building department',
      description: 'Contact your local building or planning department to confirm exact permit requirements and costs before starting work.',
      destinationType: 'EXTERNAL_URL',
      destinationRef: permit.applicationPortalUrl,
      priority: 1,
    });
  }

  // Contractor license verification
  if (
    licensing.requirementStatus === 'REQUIRED' ||
    licensing.requirementStatus === 'MAY_BE_REQUIRED'
  ) {
    actions.push({
      key: 'verify_contractor_license',
      label: 'Verify contractor license before hiring',
      description: 'Check your contractor\'s license status at your state licensing board before signing any contracts.',
      destinationType: licensing.verificationToolUrl ? 'EXTERNAL_URL' : 'INFO',
      destinationRef: licensing.verificationToolUrl,
      priority: 2,
    });
  }

  // TCO review
  actions.push({
    key: 'review_tco_impact',
    label: 'Review Total Cost of Ownership impact',
    description: 'Understand the long-term carrying costs of this renovation including taxes, insurance, and maintenance.',
    destinationType: 'MODULE_LINK',
    destinationRef: 'home-tools/tco',
    priority: 3,
  });

  // Break-even
  if (overallRiskLevel === 'HIGH' || overallRiskLevel === 'CRITICAL') {
    actions.push({
      key: 'run_break_even_analysis',
      label: 'Run a break-even analysis for this renovation',
      description: 'Understand how long it will take for this renovation to pay off given your holding period.',
      destinationType: 'MODULE_LINK',
      destinationRef: 'home-tools/break-even',
      priority: 4,
    });
  }

  // Timeline logging
  actions.push({
    key: 'log_in_home_timeline',
    label: 'Log this project in your Home Timeline',
    description: 'Add this renovation to your property timeline to track project milestones and future maintenance.',
    destinationType: 'MODULE_LINK',
    destinationRef: 'home-tools/timeline',
    priority: 5,
  });

  // Digital twin
  actions.push({
    key: 'update_digital_twin',
    label: 'Update your Home Digital Twin after completion',
    description: 'After completing the renovation, update your digital twin to reflect the new systems and components.',
    destinationType: 'MODULE_LINK',
    destinationRef: 'home-tools/digital-twin',
    priority: 6,
  });

  // Sort by priority
  return actions.sort((a, b) => a.priority - b.priority);
}
