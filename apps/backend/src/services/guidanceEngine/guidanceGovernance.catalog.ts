import {
  parseRecommendationGovernance,
  type RecommendationGovernance,
  type RecommendationSafetyTier,
} from '../../productFramework/recommendationGovernance.contract';
import type {
  GuidanceJourneyTemplate,
  GuidanceJourneyTemplateDefinition,
  GuidanceStepTemplate,
} from './guidanceTypes';

export const GUIDANCE_GOVERNANCE_POLICY_VERSION = 'phase4-v1';

const SAFETY_TIER_BY_TEMPLATE: Record<string, RecommendationSafetyTier> = {
  asset_lifecycle_resolution: 'MATERIAL_FINANCIAL',
  replacement_purchase_now: 'MATERIAL_FINANCIAL',
  replacement_plan_later: 'MATERIAL_FINANCIAL',
  replacement_shop_now: 'MATERIAL_FINANCIAL',
  coverage_gap_resolution: 'REGULATED_COVERAGE',
  recall_safety_resolution: 'SAFETY_EMERGENCY',
  weather_risk_resolution: 'SAFETY_EMERGENCY',
  tax_reassessment_resolution: 'MATERIAL_FINANCIAL',
  inspection_followup_resolution: 'MATERIAL_FINANCIAL',
  financial_exposure_resolution: 'MATERIAL_FINANCIAL',
  financial_inaction_resolution: 'MATERIAL_FINANCIAL',
  compliance_resolution: 'REGULATED_COVERAGE',
  energy_efficiency_resolution: 'MATERIAL_FINANCIAL',
  warranty_purchase_journey: 'REGULATED_COVERAGE',
  insurance_purchase_journey: 'REGULATED_COVERAGE',
  warranty_quote_comparison_journey: 'REGULATED_COVERAGE',
  warranty_renewal_journey: 'REGULATED_COVERAGE',
  insurance_quote_comparison_journey: 'REGULATED_COVERAGE',
  insurance_renewal_journey: 'REGULATED_COVERAGE',
  general_inspection_journey: 'MATERIAL_FINANCIAL',
  inspection_quote_journey: 'MATERIAL_FINANCIAL',
  pre_purchase_inspection_journey: 'MATERIAL_FINANCIAL',
  annual_maintenance_inspection_journey: 'MATERIAL_FINANCIAL',
  post_repair_inspection_journey: 'MATERIAL_FINANCIAL',
  cleaning_service_journey: 'LOW_CONSEQUENCE',
  generic_guidance_resolution: 'LOW_CONSEQUENCE',
};

function governanceForTier(safetyTier: RecommendationSafetyTier): RecommendationGovernance {
  const regulated = safetyTier === 'REGULATED_COVERAGE';
  const safety = safetyTier === 'SAFETY_EMERGENCY';
  const professionalBoundary = safetyTier === 'LOW_CONSEQUENCE'
    ? null
    : regulated
      ? 'Coverage, warranty, compliance, and eligibility terms vary by contract and jurisdiction. Verify the controlling document and a licensed local professional before relying on this guidance.'
      : safety
        ? 'This journey supports preparation and recordkeeping; it does not replace emergency services, a qualified inspector, or a licensed trade professional.'
        : 'Cost and repair guidance is decision support, not a quote or professional diagnosis. Verify scope, price, and condition with a qualified local professional.';

  return parseRecommendationGovernance({
    safetyTier,
    professionalBoundary,
    jurisdictionCheck: regulated
      ? {
          status: 'VERIFIED',
          jurisdiction: 'United States product-policy boundary; local verification still required',
          checkedAt: '2026-07-18T00:00:00.000Z',
          source: 'ContractToCozy Phase 4 guidance governance review',
        }
      : { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
    conservativeFallback: safety
      ? 'Stop work, avoid the affected area or equipment, and do not attempt a repair when conditions may be unsafe.'
      : null,
    emergencyEscalation: safety
      ? 'For immediate danger, fire, gas, carbon monoxide, flooding near electricity, or personal risk, leave the area and contact emergency services or the appropriate utility.'
      : null,
    commercialDisclosure: {
      involvesCommercialAction: false,
      relationshipType: 'NONE',
      compensationMayOccur: false,
      rankingInfluenced: false,
      summary: 'The guidance template does not rank a provider or paid offer.',
      selectionCriteria: [],
      nonCommercialAlternatives: [],
    },
    reviewedBy: [],
    policyVersion: GUIDANCE_GOVERNANCE_POLICY_VERSION,
  });
}

export function applyGuidanceGovernance(
  definition: GuidanceJourneyTemplateDefinition,
): GuidanceJourneyTemplate {
  const safetyTier = SAFETY_TIER_BY_TEMPLATE[definition.journeyTypeKey];
  if (!safetyTier) {
    throw new Error(`Missing Phase 4 governance classification for guidance template: ${definition.journeyTypeKey}`);
  }
  return { ...definition, governance: governanceForTier(safetyTier) };
}

export function resolveGuidanceStepGovernance(
  templateGovernance: RecommendationGovernance,
  step: GuidanceStepTemplate,
): RecommendationGovernance {
  return step.governance ? parseRecommendationGovernance(step.governance) : templateGovernance;
}

export function listGuidanceSafetyClassifications() {
  return { ...SAFETY_TIER_BY_TEMPLATE };
}
