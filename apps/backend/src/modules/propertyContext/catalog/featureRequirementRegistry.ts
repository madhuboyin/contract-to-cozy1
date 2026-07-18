import type { ContextRequirementClassification } from '../domain/contracts';
import { getCaptureDefinition, validateCaptureRegistry } from './captureRegistry';
import { getFactDefinition } from './factCatalog';

export interface DeclarativeCondition {
  factKey: string;
  operator: 'EQUALS' | 'NOT_EQUALS';
  value: string | number | boolean;
}

export interface FactRequirementDefinition {
  factKey: string;
  classification: ContextRequirementClassification;
  when?: DeclarativeCondition;
  reasonCode: string;
  priority: number;
  acceptableStates: Array<'KNOWN' | 'VERIFIED' | 'FRESH'>;
  captureKey: string;
  /** Collection facts below this size are treated as missing for this operation. */
  minimumItems?: number;
  collectionPredicate?: 'ACTIVE_DATE_RANGE';
  operationInputWhen?: {
    key: string;
    operator: 'EQUALS' | 'IN' | 'CONTAINS_ANY';
    value: string | number | boolean | Array<string | number | boolean>;
  };
}

export interface FeatureContextRequirementDefinition {
  featureKey: string;
  operationKey: string;
  policyVersion: string;
  required: FactRequirementDefinition[];
  enhancements: FactRequirementDefinition[];
  promptStrategy: 'ONE_AT_A_TIME' | 'GROUP_RELATED' | 'MINIMUM_PATH';
  notApplicableWhen?: DeclarativeCondition;
  notApplicableReasonCode?: string;
}

export const FEATURE_CONTEXT_REQUIREMENTS: readonly FeatureContextRequirementDefinition[] = [
  {
    featureKey: 'SELLER_PREP',
    operationKey: 'OPEN_PLAN',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'core.propertyUse',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_PROPERTY_USE_FOR_SELLER_PLAN',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'CORE_PROPERTY_USE',
      },
      {
        factKey: 'location.state',
        classification: 'REQUIRED_CALCULATION',
        reasonCode: 'CONFIRM_STATE_FOR_SELLER_PLAN',
        priority: 20,
        acceptableStates: ['KNOWN'],
        captureKey: 'LOCATION_STATE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'HOA_COMPLIANCE',
    operationKey: 'CREATE_APPROVAL_RECORD',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'responsibility.buildingExterior', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_EXTERIOR_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_BUILDING_EXTERIOR',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['EXTERIOR_PAINT', 'FENCE', 'ROOM_ADDITION', 'WINDOWS_DOORS', 'SHED_OUTBUILDING', 'SATELLITE_ANTENNA'] },
      },
      {
        factKey: 'responsibility.roof', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_ROOF_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_ROOF',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['ROOFING', 'SOLAR'] },
      },
      {
        factKey: 'responsibility.sharedSystems', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_SHARED_SYSTEM_HOA_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_SHARED_SYSTEMS',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['ROOM_ADDITION'] },
      },
      {
        factKey: 'responsibility.deckPatioBalcony', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_DECK_PATIO_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_DECK_PATIO_BALCONY',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['DECK_PATIO'] },
      },
      {
        factKey: 'responsibility.landscaping', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_LANDSCAPING_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_LANDSCAPING',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['LANDSCAPING'] },
      },
      {
        factKey: 'responsibility.drivewayWalkways', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_DRIVEWAY_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_DRIVEWAY_WALKWAYS',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['DRIVEWAY'] },
      },
      {
        factKey: 'responsibility.commonSafety', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_POOL_HOA_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_COMMON_SAFETY',
        operationInputWhen: { key: 'workType', operator: 'IN', value: ['POOL'] },
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'PERMITS',
    operationKey: 'CREATE_MANUAL_PERMIT',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'responsibility.roof', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_ROOF_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_ROOF',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['ROOF_REPLACEMENT', 'ROOF_REPAIR', 'SOLAR'] },
      },
      {
        factKey: 'responsibility.hvac', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_HVAC_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_HVAC',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['HVAC_NEW', 'HVAC_REPLACEMENT'] },
      },
      {
        factKey: 'responsibility.plumbing', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_PLUMBING_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_PLUMBING',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['PLUMBING_NEW', 'PLUMBING_REPAIR', 'SEWER_WATER_LINE'] },
      },
      {
        factKey: 'responsibility.sharedSystems', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_SHARED_SYSTEM_PERMIT_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_SHARED_SYSTEMS',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['ELECTRICAL_PANEL', 'ELECTRICAL_WIRING', 'ROOM_ADDITION', 'GARAGE_CONVERSION', 'ADU', 'BASEMENT_FINISH', 'FIREPLACE', 'STRUCTURAL_REPAIR', 'INTERIOR_REMODEL', 'DEMOLITION'] },
      },
      {
        factKey: 'responsibility.buildingExterior', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_EXTERIOR_PERMIT_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_BUILDING_EXTERIOR',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['ROOM_ADDITION', 'ADU', 'FENCE', 'WINDOWS_DOORS', 'EXTERIOR_REMODEL'] },
      },
      {
        factKey: 'responsibility.deckPatioBalcony', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_DECK_PATIO_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_DECK_PATIO_BALCONY',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['DECK_PATIO'] },
      },
      {
        factKey: 'responsibility.commonSafety', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_POOL_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_COMMON_SAFETY',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['SWIMMING_POOL'] },
      },
      {
        factKey: 'responsibility.landscaping', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_GRADING_PERMIT_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_LANDSCAPING',
        operationInputWhen: { key: 'workTypes', operator: 'CONTAINS_ANY', value: ['GRADING_DRAINAGE'] },
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'PROJECTS',
    operationKey: 'CREATE_PROJECT',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'responsibility.roof', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_ROOF_WORK_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_ROOF',
        operationInputWhen: { key: 'projectType', operator: 'IN', value: ['ROOF_REPLACEMENT', 'SOLAR_INSTALLATION'] },
      },
      {
        factKey: 'responsibility.hvac', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_HVAC_WORK_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_HVAC',
        operationInputWhen: { key: 'projectType', operator: 'IN', value: ['HVAC_REPLACEMENT', 'HVAC_REPAIR'] },
      },
      {
        factKey: 'responsibility.plumbing', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_PLUMBING_WORK_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_PLUMBING',
        operationInputWhen: { key: 'projectType', operator: 'IN', value: ['KITCHEN_REMODEL', 'BATHROOM_REMODEL', 'PLUMBING_REPIPING', 'WATER_HEATER', 'SEWER_LINE'] },
      },
      {
        factKey: 'responsibility.sharedSystems', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_SHARED_SYSTEM_WORK_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_SHARED_SYSTEMS',
        operationInputWhen: { key: 'projectType', operator: 'IN', value: ['KITCHEN_REMODEL', 'BATHROOM_REMODEL', 'ELECTRICAL_PANEL', 'FOUNDATION_WORK', 'FLOORING', 'PAINTING_INTERIOR', 'ADDITION', 'GENERAL_REPAIR'] },
      },
      {
        factKey: 'responsibility.buildingExterior', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_EXTERIOR_WORK_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_BUILDING_EXTERIOR',
        operationInputWhen: { key: 'projectType', operator: 'IN', value: ['WINDOW_REPLACEMENT', 'PAINTING_EXTERIOR', 'ADDITION'] },
      },
      {
        factKey: 'responsibility.deckPatioBalcony', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_DECK_PATIO_WORK_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_DECK_PATIO_BALCONY',
        operationInputWhen: { key: 'projectType', operator: 'EQUALS', value: 'DECK_PATIO' },
      },
      {
        factKey: 'responsibility.landscaping', classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_LANDSCAPING_WORK_RESPONSIBILITY', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_LANDSCAPING',
        operationInputWhen: { key: 'projectType', operator: 'EQUALS', value: 'LANDSCAPING_MAJOR' },
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'CLAIMS',
    operationKey: 'FILE_INSURANCE_CLAIM',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'coverage.insurancePolicies',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'SELECT_ACTIVE_INSURANCE_POLICY',
        priority: 1,
        acceptableStates: ['KNOWN'],
        captureKey: 'INSURANCE_POLICY_SELECT_OR_CREATE',
        minimumItems: 1,
        collectionPredicate: 'ACTIVE_DATE_RANGE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'CLAIMS',
    operationKey: 'FILE_WARRANTY_CLAIM',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'coverage.warranties',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'SELECT_ACTIVE_WARRANTY',
        priority: 1,
        acceptableStates: ['KNOWN'],
        captureKey: 'WARRANTY_SELECT_OR_CREATE',
        minimumItems: 1,
        collectionPredicate: 'ACTIVE_DATE_RANGE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'COVERAGE_INTELLIGENCE',
    operationKey: 'ASSESS_PROPERTY_COVERAGE',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [],
    enhancements: [
      {
        factKey: 'coverage.insurancePolicies',
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: 'ADD_POLICY_FOR_COVERAGE_SPECIFIC_ASSESSMENT',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INSURANCE_POLICY_SELECT_OR_CREATE',
        minimumItems: 1,
        collectionPredicate: 'ACTIVE_DATE_RANGE',
      },
    ],
  },
  {
    featureKey: 'MAINTENANCE',
    operationKey: 'SET_UP_INSTALLED_SYSTEMS',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'systems.installedItemTypes',
        classification: 'REQUIRED_CALCULATION',
        reasonCode: 'SELECT_INSTALLED_SYSTEM_FOR_MAINTENANCE',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE',
        minimumItems: 1,
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'PLANT_ADVISOR',
    operationKey: 'GENERATE_OUTDOOR_RECOMMENDATIONS',
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    notApplicableWhen: { factKey: 'exterior.hasPrivateOutdoorSpace', operator: 'EQUALS', value: false },
    notApplicableReasonCode: 'NO_PRIVATE_OUTDOOR_SPACE',
    required: [
      {
        factKey: 'exterior.hasPrivateOutdoorSpace',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'DETERMINE_AVAILABLE_GROWING_SPACE',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'OUTDOOR_SPACE_PROFILE',
      },
      {
        factKey: 'responsibility.landscaping',
        classification: 'REQUIRED_APPLICABILITY',
        when: { factKey: 'exterior.hasPrivateOutdoorSpace', operator: 'EQUALS', value: true },
        reasonCode: 'DETERMINE_LANDSCAPING_RESPONSIBILITY',
        priority: 20,
        acceptableStates: ['KNOWN'],
        captureKey: 'RESPONSIBILITY_LANDSCAPING',
      },
    ],
    enhancements: [
      {
        factKey: 'exterior.hasIrrigation',
        classification: 'ENHANCEMENT_ACCURACY',
        when: { factKey: 'exterior.hasPrivateOutdoorSpace', operator: 'EQUALS', value: true },
        reasonCode: 'IMPROVE_WATERING_GUIDANCE',
        priority: 30,
        acceptableStates: ['KNOWN'],
        captureKey: 'EXTERIOR_HAS_IRRIGATION',
      },
    ],
  },
  {
    featureKey: 'MAINTENANCE',
    operationKey: 'GENERATE_SAFETY_TASKS',
    policyVersion: '1.0',
    promptStrategy: 'GROUP_RELATED',
    required: [
      {
        factKey: 'safety.hasSmokeDetectors',
        classification: 'REQUIRED_SAFETY',
        reasonCode: 'DETERMINE_SMOKE_DETECTOR_TASKS',
        priority: 1,
        acceptableStates: ['FRESH'],
        captureKey: 'SAFETY_DETECTOR_PROFILE',
      },
      {
        factKey: 'safety.hasCoDetectors',
        classification: 'REQUIRED_SAFETY',
        reasonCode: 'DETERMINE_CO_DETECTOR_TASKS',
        priority: 2,
        acceptableStates: ['FRESH'],
        captureKey: 'SAFETY_DETECTOR_PROFILE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'ENERGY',
    operationKey: 'GENERATE_HVAC_RECOMMENDATIONS',
    policyVersion: '1.0',
    promptStrategy: 'GROUP_RELATED',
    required: [
      {
        factKey: 'systems.heatingType',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'DETERMINE_HVAC_CONFIGURATION',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'HVAC_SYSTEM_PROFILE',
      },
      {
        factKey: 'responsibility.hvac',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'DETERMINE_HVAC_RESPONSIBILITY',
        priority: 20,
        acceptableStates: ['KNOWN'],
        captureKey: 'HVAC_SYSTEM_PROFILE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'PROTECTION',
    operationKey: 'ASSESS_ROOF_RISK',
    policyVersion: '1.0',
    promptStrategy: 'GROUP_RELATED',
    required: [
      {
        factKey: 'structure.roofType',
        classification: 'REQUIRED_SAFETY',
        reasonCode: 'DETERMINE_ROOF_RISK',
        priority: 1,
        acceptableStates: ['FRESH'],
        captureKey: 'ROOF_STRUCTURE_PROFILE',
      },
      {
        factKey: 'responsibility.roof',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'DETERMINE_ROOF_RESPONSIBILITY',
        priority: 2,
        acceptableStates: ['KNOWN'],
        captureKey: 'ROOF_STRUCTURE_PROFILE',
      },
    ],
    enhancements: [],
  },
] as const;

const contractByKey = new Map(
  FEATURE_CONTEXT_REQUIREMENTS.map((contract) => [`${contract.featureKey}:${contract.operationKey}`, contract]),
);

export function getFeatureContextRequirement(featureKey: string, operationKey: string): FeatureContextRequirementDefinition {
  const contract = contractByKey.get(`${featureKey}:${operationKey}`);
  if (!contract) throw new Error(`Property Context feature operation is not registered: ${featureKey}/${operationKey}`);
  return contract;
}

export function validateFeatureRequirementRegistry(): void {
  validateCaptureRegistry();
  const problems: string[] = [];
  for (const contract of FEATURE_CONTEXT_REQUIREMENTS) {
    const requirements = [...contract.required, ...contract.enhancements];
    for (const requirement of requirements) {
      try {
        getFactDefinition(requirement.factKey);
        const capture = getCaptureDefinition(requirement.captureKey);
        if (!capture.factKeys.includes(requirement.factKey)) problems.push(`${requirement.captureKey}: fact mismatch`);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
      if (requirement.when) {
        try { getFactDefinition(requirement.when.factKey); } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }
  if (problems.length) throw new Error(`Invalid Property Context feature registry:\n${problems.join('\n')}`);
}

validateFeatureRequirementRegistry();
