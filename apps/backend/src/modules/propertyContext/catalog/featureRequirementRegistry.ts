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
        factKey: 'inventory.items',
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
