import type { RecommendationGovernance, RecommendationSafetyTier } from '../../../productFramework/recommendationGovernance.contract';

export type PersonalizationModule = 'DASHBOARD' | 'MAINTENANCE' | 'HEALTH';

export interface PersonalizationDefinition {
  code: string;
  category: string;
  headline: string;
  body: string;
  reasonCode: string;
  reasonTemplateKey: string;
  defaultScore: number;
  safetyClass: 'ROUTINE' | 'SAFETY_SENSITIVE';
  safetyTier: RecommendationSafetyTier;
  governance: RecommendationGovernance;
  profileRanking?: {
    agingInPlaceBoost?: number;
    budgetSensitiveBoost?: number;
  };
  modules: readonly PersonalizationModule[];
  maintenanceTask: {
    assetType: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

const noCommercialAction: RecommendationGovernance['commercialDisclosure'] = {
  involvesCommercialAction: false,
  relationshipType: 'NONE',
  compensationMayOccur: false,
  rankingInfluenced: false,
  summary: 'This recommendation does not rank a provider, product, financing option, or compensated offer.',
  selectionCriteria: [],
  nonCommercialAlternatives: [],
};

function routineGovernance(safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL'): RecommendationGovernance {
  return {
    safetyTier,
    professionalBoundary: safetyTier === 'MATERIAL_FINANCIAL'
      ? 'This planning prompt is not a quote, inspection, engineering opinion, or financial advice; verify scope and cost with a qualified professional.'
      : null,
    jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
    conservativeFallback: null,
    emergencyEscalation: null,
    commercialDisclosure: noCommercialAction,
    reviewedBy: [],
    policyVersion: 'phase4-v1',
  };
}

function safetyGovernance(): RecommendationGovernance {
  return {
    safetyTier: 'SAFETY_EMERGENCY',
    professionalBoundary: 'This is preventive guidance, not a safety diagnosis. Follow manufacturer instructions and use a qualified professional when the condition or required work is uncertain.',
    jurisdictionCheck: { status: 'NOT_REQUIRED', jurisdiction: null, checkedAt: null, source: null },
    conservativeFallback: 'Do not perform work that requires unsafe access, energized equipment, combustion-system changes, or activity beyond your experience.',
    emergencyEscalation: 'If there is smoke, fire, a gas odor, active sparking, immediate danger, or symptoms of carbon-monoxide exposure, leave the area and contact emergency services or the appropriate utility from a safe location.',
    commercialDisclosure: noCommercialAction,
    reviewedBy: [],
    policyVersion: 'phase4-v1',
  };
}

export const PERSONALIZATION_DEFINITIONS: readonly PersonalizationDefinition[] = [
  {
    code: 'hvac_filter_replacement_check_proof',
    category: 'low_cost_prevention',
    headline: 'Your HVAC filter may be due for a replacement check',
    body: 'Your recorded HVAC maintenance history indicates that the filter replacement interval may have passed.',
    reasonCode: 'HVAC_FILTER_OVERDUE',
    reasonTemplateKey: 'hvac_filter_overdue_reason',
    defaultScore: 60,
    safetyClass: 'ROUTINE',
    safetyTier: 'LOW_CONSEQUENCE',
    governance: routineGovernance('LOW_CONSEQUENCE'),
    profileRanking: { budgetSensitiveBoost: 6 },
    modules: ['DASHBOARD', 'MAINTENANCE', 'HEALTH'],
    maintenanceTask: { assetType: 'HVAC', priority: 'MEDIUM' },
  },
  {
    code: 'smoke_co_detector_battery_check',
    category: 'low_cost_prevention',
    headline: 'Check your smoke and carbon monoxide detector batteries',
    body: 'Your recorded maintenance history indicates that a detector battery check may be due. Test each detector and follow its manufacturer instructions.',
    reasonCode: 'SMOKE_CO_BATTERY_CHECK_DUE',
    reasonTemplateKey: 'smoke_co_battery_check_due_reason',
    defaultScore: 75,
    safetyClass: 'SAFETY_SENSITIVE',
    safetyTier: 'SAFETY_EMERGENCY',
    governance: safetyGovernance(),
    modules: ['DASHBOARD', 'MAINTENANCE', 'HEALTH'],
    maintenanceTask: { assetType: 'SMOKE_CO_DETECTOR', priority: 'HIGH' },
  },
  {
    code: 'dryer_vent_cleaning_reminder',
    category: 'low_cost_prevention',
    headline: 'Your dryer vent may be due for cleaning',
    body: 'Your recorded maintenance history indicates that dryer-vent cleaning may be due. Inspect the vent and use a qualified professional when appropriate.',
    reasonCode: 'DRYER_VENT_CLEANING_DUE',
    reasonTemplateKey: 'dryer_vent_cleaning_due_reason',
    defaultScore: 70,
    safetyClass: 'SAFETY_SENSITIVE',
    safetyTier: 'SAFETY_EMERGENCY',
    governance: safetyGovernance(),
    modules: ['DASHBOARD', 'MAINTENANCE', 'HEALTH'],
    maintenanceTask: { assetType: 'DRYER', priority: 'HIGH' },
  },
  {
    code: 'smoke_detector_installation_review',
    category: 'safety_risk_reduction',
    headline: 'Confirm your home’s smoke-detector setup',
    body: 'Your Home Record currently says smoke detectors are not installed. Confirm or correct that detail. If they are not installed, add and test detectors in the locations required for your home.',
    reasonCode: 'SMOKE_DETECTORS_NOT_CONFIRMED',
    reasonTemplateKey: 'smoke_detectors_not_confirmed_reason',
    defaultScore: 90,
    safetyClass: 'SAFETY_SENSITIVE',
    safetyTier: 'SAFETY_EMERGENCY',
    governance: safetyGovernance(),
    modules: ['DASHBOARD', 'MAINTENANCE', 'HEALTH'],
    maintenanceTask: { assetType: 'SMOKE_DETECTOR', priority: 'HIGH' },
  },
  {
    code: 'aging_roof_condition_review',
    category: 'aging_system_planning',
    headline: 'Review your roof\'s age and condition',
    body: 'The recorded roof replacement year is at least 25 years ago. Review the roof condition and service history, and schedule a qualified inspection when appropriate before planning repair or replacement.',
    reasonCode: 'ROOF_AGE_REVIEW_DUE',
    reasonTemplateKey: 'roof_age_review_due_reason',
    defaultScore: 64,
    safetyClass: 'ROUTINE',
    safetyTier: 'MATERIAL_FINANCIAL',
    governance: routineGovernance('MATERIAL_FINANCIAL'),
    profileRanking: { agingInPlaceBoost: 5 },
    modules: ['DASHBOARD', 'MAINTENANCE', 'HEALTH'],
    maintenanceTask: { assetType: 'ROOF', priority: 'MEDIUM' },
  },
] as const;

export function findPersonalizationDefinition(code: string): PersonalizationDefinition | undefined {
  return PERSONALIZATION_DEFINITIONS.find((definition) => definition.code === code);
}
