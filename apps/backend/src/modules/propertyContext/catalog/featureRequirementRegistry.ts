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
  collectionPredicate?:
    | 'ACTIVE_DATE_RANGE'
    | 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE'
    | 'SELECTED_ITEM_CONFIRMATION_INCOMPLETE'
    | 'SELECTED_ITEM_COVERAGE_LIFECYCLE_INCOMPLETE'
    | 'SELECTED_ITEM_VALUE_INCOMPLETE'
    | 'SELECTED_ITEM_COVERAGE_EVIDENCE_INCOMPLETE'
    | 'INCLUDES_OPERATION_INPUT_VALUE';
  collectionOperationInputKey?: string;
  /**
   * Capture-only review operations may intentionally reopen a known answer so
   * the homeowner can confirm or correct it in place.
   */
  alwaysCapture?: boolean;
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
  adoption: {
    surfaceDisposition: 'INLINE_PANEL' | 'RESERVED_NO_INVOKER';
    executionDisposition: 'SHARED_GATE' | 'DOMAIN_POLICY' | 'CAPTURE_ONLY' | 'NOT_INVOKED';
    owner: string;
  };
}

const adopted = (
  owner: string,
  executionDisposition: FeatureContextRequirementDefinition['adoption']['executionDisposition'],
): FeatureContextRequirementDefinition['adoption'] => ({
  surfaceDisposition: 'INLINE_PANEL',
  executionDisposition,
  owner,
});

const reserved = (owner: string): FeatureContextRequirementDefinition['adoption'] => ({
  surfaceDisposition: 'RESERVED_NO_INVOKER',
  executionDisposition: 'NOT_INVOKED',
  owner,
});

const FINANCIAL_ACCURACY_FACTS = {
  propertyUse: ['core.propertyUse', 'CORE_PROPERTY_USE'],
  occupancy: ['core.occupancyStatus', 'CORE_OCCUPANCY_STATUS'],
  dwelling: ['core.dwellingType', 'CORE_DWELLING_TYPE'],
  yearBuilt: ['core.yearBuilt', 'CORE_YEAR_BUILT'],
  size: ['core.propertySizeSqFt', 'CORE_PROPERTY_SIZE_SQ_FT'],
  state: ['location.state', 'LOCATION_STATE'],
  zip: ['location.zipCode', 'LOCATION_ZIP_CODE'],
  inventory: ['inventory.items', 'INVENTORY_ITEM_SELECT_OR_CREATE'],
  installedSystems: ['systems.installedItemTypes', 'INVENTORY_ITEM_SELECT_OR_CREATE'],
} as const;

type FinancialAccuracyFact = keyof typeof FINANCIAL_ACCURACY_FACTS;

function financialAccuracyContract(
  featureKey: string,
  operationKey: string,
  facts: FinancialAccuracyFact[],
): FeatureContextRequirementDefinition {
  return {
    featureKey,
    operationKey,
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [],
    adoption: adopted('Phase 5 financial tool', 'DOMAIN_POLICY'),
    enhancements: facts.map((fact, index) => {
      const [factKey, captureKey] = FINANCIAL_ACCURACY_FACTS[fact];
      return {
        factKey,
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: `IMPROVE_${featureKey}_${fact.toUpperCase()}_ACCURACY`,
        priority: (index + 1) * 10,
        acceptableStates: ['KNOWN'],
        captureKey,
        ...(fact === 'inventory' || fact === 'installedSystems' ? { minimumItems: 1 } : {}),
      };
    }),
  };
}

export const FEATURE_CONTEXT_REQUIREMENTS: readonly FeatureContextRequirementDefinition[] = [
  financialAccuracyContract('DO_NOTHING', 'RUN_SIMULATION', ['propertyUse', 'occupancy', 'inventory']),
  financialAccuracyContract('HOME_SAVINGS', 'RUN_ANALYSIS', ['propertyUse', 'occupancy', 'state', 'zip', 'installedSystems']),
  financialAccuracyContract('BUDGET_PLANNER', 'VIEW_FORECAST', ['propertyUse', 'occupancy', 'dwelling', 'yearBuilt', 'state', 'zip', 'inventory']),
  financialAccuracyContract('OWNERSHIP_COSTS', 'VIEW_ANALYSIS', ['propertyUse', 'occupancy', 'dwelling', 'state', 'zip']),
  financialAccuracyContract('BREAK_EVEN', 'VIEW_ANALYSIS', ['propertyUse', 'occupancy', 'dwelling', 'state', 'zip']),
  financialAccuracyContract('SELL_HOLD_RENT', 'VIEW_ANALYSIS', ['propertyUse', 'occupancy', 'state', 'zip']),
  financialAccuracyContract('PROPERTY_TAX', 'VIEW_ESTIMATE', ['dwelling', 'size', 'state', 'zip']),
  financialAccuracyContract('TAX_APPEAL', 'RUN_ANALYSIS', ['propertyUse', 'occupancy', 'dwelling', 'size', 'state', 'zip']),
  financialAccuracyContract('HIDDEN_ASSETS', 'VIEW_MATCHES', ['propertyUse', 'occupancy', 'dwelling', 'state', 'zip', 'installedSystems']),
  {
    featureKey: 'RESERVE_FUND',
    operationKey: 'RECALCULATE',
    adoption: adopted('Reserve Fund', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'inventory.items',
        classification: 'REQUIRED_CALCULATION',
        reasonCode: 'ADD_CAPITAL_ITEM_FOR_RESERVE_PLAN',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE',
        minimumItems: 1,
      },
    ],
    enhancements: [
      {
        factKey: 'inventory.items',
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: 'CONFIRM_RESERVE_ITEM_LIFECYCLE',
        priority: 20,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_LIFECYCLE_UPDATE',
        collectionPredicate: 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE',
      },
    ],
  },
  {
    featureKey: 'CAPITAL_TIMELINE',
    operationKey: 'RUN_TIMELINE',
    adoption: adopted('Capital Timeline', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [],
    enhancements: [
      {
        factKey: 'inventory.items',
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: 'ADD_CAPITAL_ITEM_FOR_PERSONALIZED_TIMELINE',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE',
        minimumItems: 1,
      },
      {
        factKey: 'inventory.items',
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: 'CONFIRM_CAPITAL_ITEM_LIFECYCLE',
        priority: 20,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_LIFECYCLE_UPDATE',
        collectionPredicate: 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE',
      },
    ],
  },
  {
    featureKey: 'REPAIR_REPLACE',
    operationKey: 'RUN_ANALYSIS',
    adoption: adopted('Repair vs. Replace', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [],
    enhancements: [
      {
        factKey: 'inventory.items',
        classification: 'ENHANCEMENT_ACCURACY',
        reasonCode: 'CONFIRM_SELECTED_ITEM_LIFECYCLE',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_LIFECYCLE_UPDATE',
        collectionPredicate: 'SELECTED_ITEM_LIFECYCLE_INCOMPLETE',
      },
    ],
  },
  {
    featureKey: 'NEIGHBORHOOD_RADAR',
    operationKey: 'VIEW_RADAR',
    adoption: adopted('Neighborhood Radar', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'location.zipCode',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_ZIP_FOR_NEIGHBORHOOD_MATCHING',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'LOCATION_ZIP_CODE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'SELLER_PREP',
    operationKey: 'OPEN_PLAN',
    adoption: adopted('Seller Prep', 'SHARED_GATE'),
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
    adoption: adopted('HOA Compliance', 'SHARED_GATE'),
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
    adoption: adopted('Permit Tracker', 'SHARED_GATE'),
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
    adoption: adopted('Project Tracker', 'SHARED_GATE'),
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
    adoption: adopted('Insurance Claims', 'SHARED_GATE'),
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
    adoption: adopted('Warranty Claims', 'SHARED_GATE'),
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
    adoption: adopted('Coverage Intelligence', 'DOMAIN_POLICY'),
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
    featureKey: 'COVERAGE_INTELLIGENCE',
    operationKey: 'ASSESS_ITEM_COVERAGE',
    adoption: adopted('Inventory item coverage', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      {
        factKey: 'inventory.items',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_INFERRED_HOME_SYSTEM',
        priority: 10,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_CONFIRMATION',
        collectionPredicate: 'SELECTED_ITEM_CONFIRMATION_INCOMPLETE',
      },
      { factKey: 'responsibility.roof', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_ROOF_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_ROOF', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'ROOF' } },
      { factKey: 'responsibility.hvac', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_HVAC_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_HVAC', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'HVAC' } },
      { factKey: 'responsibility.plumbing', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_PLUMBING_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_PLUMBING', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'PLUMBING' } },
      { factKey: 'responsibility.buildingExterior', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_EXTERIOR_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_BUILDING_EXTERIOR', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'BUILDING_EXTERIOR' } },
      { factKey: 'responsibility.commonSafety', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_SAFETY_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_COMMON_SAFETY', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'COMMON_SAFETY' } },
      { factKey: 'responsibility.sharedSystems', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_SHARED_SYSTEM_COVERAGE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_SHARED_SYSTEMS', operationInputWhen: { key: 'responsibilityScope', operator: 'EQUALS', value: 'SHARED_SYSTEMS' } },
      {
        factKey: 'inventory.items',
        classification: 'REQUIRED_CALCULATION',
        reasonCode: 'ADD_ITEM_LIFECYCLE_FOR_COVERAGE',
        priority: 30,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_COVERAGE_LIFECYCLE',
        collectionPredicate: 'SELECTED_ITEM_COVERAGE_LIFECYCLE_INCOMPLETE',
      },
      {
        factKey: 'inventory.items',
        classification: 'REQUIRED_APPLICABILITY',
        reasonCode: 'CONFIRM_ITEM_COVERAGE_EVIDENCE',
        priority: 40,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_COVERAGE_EVIDENCE',
        collectionPredicate: 'SELECTED_ITEM_COVERAGE_EVIDENCE_INCOMPLETE',
      },
      {
        factKey: 'inventory.items',
        classification: 'REQUIRED_CALCULATION',
        reasonCode: 'ADD_ITEM_VALUE_FOR_COVERAGE',
        priority: 50,
        acceptableStates: ['KNOWN'],
        captureKey: 'INVENTORY_ITEM_VALUE',
        collectionPredicate: 'SELECTED_ITEM_VALUE_INCOMPLETE',
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'MAINTENANCE',
    operationKey: 'SET_UP_INSTALLED_SYSTEMS',
    adoption: adopted('Maintenance Setup', 'CAPTURE_ONLY'),
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
    adoption: adopted('Plant Advisor', 'SHARED_GATE'),
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
    adoption: adopted('Maintenance Safety', 'SHARED_GATE'),
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
    featureKey: 'PERSONALIZATION',
    operationKey: 'REVIEW_SAFETY_DETECTOR_PROFILE',
    adoption: adopted('Personalized Guidance', 'CAPTURE_ONLY'),
    policyVersion: '1.0',
    promptStrategy: 'GROUP_RELATED',
    required: [
      {
        factKey: 'safety.hasSmokeDetectors',
        classification: 'REQUIRED_SAFETY',
        reasonCode: 'CONFIRM_SAFETY_DETECTOR_PROFILE',
        priority: 1,
        acceptableStates: ['KNOWN'],
        captureKey: 'SAFETY_DETECTOR_PROFILE',
        alwaysCapture: true,
      },
    ],
    enhancements: [],
  },
  {
    featureKey: 'MAINTENANCE',
    operationKey: 'PREPARE_TEMPLATE',
    adoption: adopted('Maintenance Templates', 'SHARED_GATE'),
    policyVersion: '1.0',
    promptStrategy: 'MINIMUM_PATH',
    required: [
      { factKey: 'systems.heatingType', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_HVAC_CONFIGURATION', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'HVAC_SYSTEM_PROFILE', operationInputWhen: { key: 'category', operator: 'EQUALS', value: 'HVAC' } },
      { factKey: 'systems.waterHeaterType', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_WATER_HEATER_CONFIGURATION', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'SYSTEMS_WATER_HEATER_TYPE', operationInputWhen: { key: 'category', operator: 'EQUALS', value: 'WATER_HEATER' } },
      { factKey: 'systems.installedItemTypes', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_INSTALLED_EQUIPMENT', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE', collectionPredicate: 'INCLUDES_OPERATION_INPUT_VALUE', collectionOperationInputKey: 'requiredInstalledItemType' },
      { factKey: 'exterior.hasLawn', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_LAWN_PRESENCE', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'EXTERIOR_HAS_LAWN', operationInputWhen: { key: 'presenceKind', operator: 'EQUALS', value: 'LAWN' } },
      { factKey: 'exterior.hasTreesOrShrubs', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_TREE_SHRUB_PRESENCE', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'EXTERIOR_HAS_TREES_OR_SHRUBS', operationInputWhen: { key: 'presenceKind', operator: 'EQUALS', value: 'TREES_OR_SHRUBS' } },
      { factKey: 'exterior.hasIrrigation', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_IRRIGATION_PRESENCE', priority: 10, acceptableStates: ['KNOWN'], captureKey: 'EXTERIOR_HAS_IRRIGATION', operationInputWhen: { key: 'presenceKind', operator: 'EQUALS', value: 'IRRIGATION' } },
      { factKey: 'responsibility.hvac', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_HVAC_MAINTENANCE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_HVAC', operationInputWhen: { key: 'category', operator: 'EQUALS', value: 'HVAC' } },
      { factKey: 'responsibility.plumbing', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_PLUMBING_MAINTENANCE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_PLUMBING', operationInputWhen: { key: 'category', operator: 'IN', value: ['PLUMBING', 'WATER_HEATER'] } },
      { factKey: 'responsibility.roof', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_ROOF_MAINTENANCE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_ROOF', operationInputWhen: { key: 'category', operator: 'IN', value: ['ROOFING', 'GUTTERS'] } },
      { factKey: 'responsibility.landscaping', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_LANDSCAPING_MAINTENANCE_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_LANDSCAPING', operationInputWhen: { key: 'category', operator: 'IN', value: ['LANDSCAPING', 'LANDSCAPING_DRAINAGE'] } },
      { factKey: 'responsibility.pestControl', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_PEST_CONTROL_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_PEST_CONTROL', operationInputWhen: { key: 'category', operator: 'EQUALS', value: 'PEST_CONTROL' } },
      { factKey: 'responsibility.commonSafety', classification: 'REQUIRED_APPLICABILITY', reasonCode: 'CONFIRM_COMMON_SAFETY_RESPONSIBILITY', priority: 20, acceptableStates: ['KNOWN'], captureKey: 'RESPONSIBILITY_COMMON_SAFETY', operationInputWhen: { key: 'category', operator: 'EQUALS', value: 'SECURITY_SAFETY' } },
    ],
    enhancements: [],
  },
  {
    featureKey: 'ENERGY',
    operationKey: 'GENERATE_HVAC_RECOMMENDATIONS',
    adoption: reserved('Future HVAC recommendation generator'),
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
    adoption: reserved('Future roof-risk assessment operation'),
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
    const reservedSurface = contract.adoption.surfaceDisposition === 'RESERVED_NO_INVOKER';
    const notInvoked = contract.adoption.executionDisposition === 'NOT_INVOKED';
    if (reservedSurface !== notInvoked) problems.push(`${contract.featureKey}/${contract.operationKey}: reserved adoption mismatch`);
    if (!contract.adoption.owner.trim()) problems.push(`${contract.featureKey}/${contract.operationKey}: adoption owner is required`);
    if (contract.required.length > 0 && contract.adoption.executionDisposition === 'DOMAIN_POLICY') {
      problems.push(`${contract.featureKey}/${contract.operationKey}: required context cannot rely on a nonblocking domain policy`);
    }
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
