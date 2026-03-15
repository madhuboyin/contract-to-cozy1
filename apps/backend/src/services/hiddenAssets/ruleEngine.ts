import { HiddenAssetConfidenceLevel, HiddenAssetRuleOperator } from '@prisma/client';
import {
  ProgramEvalResult,
  PropertyAttributeMap,
  RuleEngineProgramInput,
  SingleRuleEvalResult,
} from './types';

// ============================================================================
// ATTRIBUTE RESOLVER
// ============================================================================

/**
 * Safe mapping from rule attribute strings → PropertyAttributeMap keys.
 * Rules in the DB use these string names. Any unrecognized attribute
 * fails gracefully (attributeMissing = true) rather than crashing.
 */
const ATTRIBUTE_MAP: Record<string, keyof PropertyAttributeMap> = {
  // Geography
  state: 'state',
  'property.state': 'state',
  city: 'city',
  'property.city': 'city',
  zipCode: 'zipCode',
  'property.zipCode': 'zipCode',
  zip: 'zipCode',
  county: 'county',
  'property.county': 'county',
  country: 'country',
  'property.country': 'country',

  // Ownership / classification
  propertyType: 'propertyType',
  'property.propertyType': 'propertyType',
  isPrimaryResidence: 'isPrimaryResidence',
  'property.isPrimaryResidence': 'isPrimaryResidence',
  yearBuilt: 'yearBuilt',
  'property.yearBuilt': 'yearBuilt',
  squareFootage: 'squareFootage',
  'property.squareFootage': 'squareFootage',
  propertySize: 'squareFootage',

  // Systems
  hvacType: 'hvacType',
  heatingType: 'hvacType',
  'property.hvacType': 'hvacType',
  'property.heatingType': 'hvacType',
  waterHeaterType: 'waterHeaterType',
  'property.waterHeaterType': 'waterHeaterType',
  roofType: 'roofType',
  'property.roofType': 'roofType',
  roofAge: 'roofAge',
  'property.roofAge': 'roofAge',

  // Safety / smart home
  hasSecuritySystem: 'hasSecuritySystem',
  'property.hasSecuritySystem': 'hasSecuritySystem',
  hasSolarInstalled: 'hasSolarInstalled',
  'property.hasSolarInstalled': 'hasSolarInstalled',
  hasEvCharger: 'hasEvCharger',
  'property.hasEvCharger': 'hasEvCharger',
  hasLeakSensors: 'hasLeakSensors',
  'property.hasLeakSensors': 'hasLeakSensors',
  hasIrrigation: 'hasIrrigation',
  'property.hasIrrigation': 'hasIrrigation',
  hasSumpPumpBackup: 'hasSumpPumpBackup',
  'property.hasSumpPumpBackup': 'hasSumpPumpBackup',

  // Utility
  utilityProvider: 'utilityProvider',
  'property.utilityProvider': 'utilityProvider',
  primaryHeatingFuel: 'primaryHeatingFuel',
  'property.primaryHeatingFuel': 'primaryHeatingFuel',

  // Special zones
  inHistoricDistrict: 'inHistoricDistrict',
  'property.inHistoricDistrict': 'inHistoricDistrict',
  inHurricaneZone: 'inHurricaneZone',
  'property.inHurricaneZone': 'inHurricaneZone',
  inFloodZone: 'inFloodZone',
  'property.inFloodZone': 'inFloodZone',
};

/**
 * Resolves a rule's attribute string to the corresponding value from the
 * property attribute map. Returns { value, exists } — never throws.
 */
function resolveAttribute(
  attrs: PropertyAttributeMap,
  rawAttribute: string,
): { value: unknown; exists: boolean } {
  const mappedKey = ATTRIBUTE_MAP[rawAttribute];
  if (!mappedKey) {
    return { value: undefined, exists: false };
  }
  const value = attrs[mappedKey];
  const exists = value !== null && value !== undefined;
  return { value, exists };
}

// ============================================================================
// TYPE COERCIONS
// ============================================================================

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function toBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function toStringList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ============================================================================
// SINGLE RULE EVALUATION
// ============================================================================

function evaluateRule(
  attrs: PropertyAttributeMap,
  rule: RuleEngineProgramInput['rules'][number],
): SingleRuleEvalResult {
  const { value: propValue, exists } = resolveAttribute(attrs, rule.attribute);

  // EXISTS / NOT_EXISTS don't need the property value itself
  if (rule.operator === HiddenAssetRuleOperator.EXISTS) {
    return { matched: exists, attributeMissing: false };
  }
  if (rule.operator === HiddenAssetRuleOperator.NOT_EXISTS) {
    return { matched: !exists, attributeMissing: false };
  }

  // All remaining operators require the attribute to be present
  if (!exists || propValue === null || propValue === undefined) {
    return { matched: false, attributeMissing: true };
  }

  const ruleVal = rule.value;
  const propStr = String(propValue).toLowerCase().trim();

  switch (rule.operator) {
    case HiddenAssetRuleOperator.EQUALS:
      return { matched: propStr === ruleVal.toLowerCase().trim(), attributeMissing: false };

    case HiddenAssetRuleOperator.NOT_EQUALS:
      return { matched: propStr !== ruleVal.toLowerCase().trim(), attributeMissing: false };

    case HiddenAssetRuleOperator.IN: {
      const list = toStringList(ruleVal);
      return { matched: list.includes(propStr), attributeMissing: false };
    }

    case HiddenAssetRuleOperator.NOT_IN: {
      const list = toStringList(ruleVal);
      return { matched: !list.includes(propStr), attributeMissing: false };
    }

    case HiddenAssetRuleOperator.CONTAINS:
      return {
        matched: propStr.includes(ruleVal.toLowerCase().trim()),
        attributeMissing: false,
      };

    case HiddenAssetRuleOperator.GREATER_THAN: {
      const n = toNumeric(propValue);
      const threshold = toNumeric(ruleVal);
      if (n === null || threshold === null) return { matched: false, attributeMissing: true };
      return { matched: n > threshold, attributeMissing: false };
    }

    case HiddenAssetRuleOperator.GREATER_THAN_OR_EQUAL: {
      const n = toNumeric(propValue);
      const threshold = toNumeric(ruleVal);
      if (n === null || threshold === null) return { matched: false, attributeMissing: true };
      return { matched: n >= threshold, attributeMissing: false };
    }

    case HiddenAssetRuleOperator.LESS_THAN: {
      const n = toNumeric(propValue);
      const threshold = toNumeric(ruleVal);
      if (n === null || threshold === null) return { matched: false, attributeMissing: true };
      return { matched: n < threshold, attributeMissing: false };
    }

    case HiddenAssetRuleOperator.LESS_THAN_OR_EQUAL: {
      const n = toNumeric(propValue);
      const threshold = toNumeric(ruleVal);
      if (n === null || threshold === null) return { matched: false, attributeMissing: true };
      return { matched: n <= threshold, attributeMissing: false };
    }

    case HiddenAssetRuleOperator.BOOLEAN_IS: {
      const boolProp = toBoolean(propValue);
      const boolTarget = toBoolean(ruleVal);
      if (boolProp === null) return { matched: false, attributeMissing: true };
      if (boolTarget === null) return { matched: false, attributeMissing: false };
      return { matched: boolProp === boolTarget, attributeMissing: false };
    }

    default:
      // Unknown operator — treat as non-match rather than crash
      return { matched: false, attributeMissing: false };
  }
}

// ============================================================================
// CONFIDENCE COMPUTATION
// ============================================================================

/**
 * Determines confidence level given rule evaluation counts.
 *
 * Returns null when there is a clear disqualification (rules explicitly failed
 * with no offsetting matches). Returns LOW when data is missing but nothing
 * actively disqualified the property.
 */
function computeConfidence(
  totalRules: number,
  matchedCount: number,
  missingCount: number,
): HiddenAssetConfidenceLevel | null {
  // No rules → geographic match only → LOW
  if (totalRules === 0) return HiddenAssetConfidenceLevel.LOW;

  const failedCount = totalRules - matchedCount - missingCount;

  // Clear disqualification: rules were evaluable but all failed → no match
  if (matchedCount === 0 && failedCount > 0) return null;

  // All attributes missing and nothing failed → LOW (possible but unverifiable)
  if (matchedCount === 0 && failedCount === 0) return HiddenAssetConfidenceLevel.LOW;

  // Have at least one match — compute ratio over evaluable rules
  const availableRules = totalRules - missingCount;
  const matchRatio = availableRules > 0 ? matchedCount / availableRules : 0;
  const missingRatio = missingCount / totalRules;

  // High data-missing rate caps confidence at LOW
  if (missingRatio >= 0.5) return HiddenAssetConfidenceLevel.LOW;

  if (matchRatio >= 0.9) return HiddenAssetConfidenceLevel.HIGH;
  if (matchRatio >= 0.6) return HiddenAssetConfidenceLevel.MEDIUM;
  return HiddenAssetConfidenceLevel.LOW;
}

// ============================================================================
// PROGRAM EVALUATION — PUBLIC API
// ============================================================================

/**
 * Evaluates a single program against a property's attribute map.
 * Returns a structured result with confidence, match counts, and reasons.
 */
export function evaluateProgram(
  attrs: PropertyAttributeMap,
  program: RuleEngineProgramInput,
): ProgramEvalResult {
  const rules = program.rules;

  // No rules → geographic region already pre-matched → LOW confidence match
  if (rules.length === 0) {
    return {
      programId: program.id,
      matched: true,
      confidenceLevel: HiddenAssetConfidenceLevel.LOW,
      matchedRuleCount: 0,
      totalRuleCount: 0,
      matchReasons: ['Program available in your region'],
      estimatedValue: null,
      estimatedValueMin: program.benefitEstimateMin,
      estimatedValueMax: program.benefitEstimateMax,
    };
  }

  let matchedCount = 0;
  let missingCount = 0;
  const reasons: string[] = [];

  for (const rule of rules) {
    const result = evaluateRule(attrs, rule);
    if (result.attributeMissing) {
      missingCount++;
    } else if (result.matched) {
      matchedCount++;
      reasons.push(formatMatchReason(rule));
    }
  }

  const confidence = computeConfidence(rules.length, matchedCount, missingCount);
  const matched = confidence !== null;

  return {
    programId: program.id,
    matched,
    confidenceLevel: confidence,
    matchedRuleCount: matchedCount,
    totalRuleCount: rules.length,
    matchReasons: matched ? reasons : [],
    estimatedValue: null,
    estimatedValueMin: program.benefitEstimateMin,
    estimatedValueMax: program.benefitEstimateMax,
  };
}

// ============================================================================
// PROPERTY ATTRIBUTE MAP BUILDER — PUBLIC API
// ============================================================================

/**
 * Constructs a PropertyAttributeMap from a raw Prisma property record.
 * Fields not yet in the schema default to null.
 */
export function buildPropertyAttributeMap(
  property: {
    state: string;
    city: string;
    zipCode: string;
    yearBuilt?: number | null;
    propertySize?: number | null;
    propertyType?: string | null;
    ownershipType?: string | null;
    heatingType?: string | null;
    waterHeaterType?: string | null;
    roofType?: string | null;
    roofReplacementYear?: number | null;
    hasSecuritySystem?: boolean | null;
    hasIrrigation?: boolean | null;
    hasSumpPumpBackup?: boolean | null;
    primaryHeatingFuel?: string | null;
  },
  currentYear: number = new Date().getFullYear(),
): PropertyAttributeMap {
  const roofAge =
    property.roofReplacementYear != null
      ? currentYear - property.roofReplacementYear
      : null;

  const isPrimaryResidence =
    property.ownershipType === 'OWNER_OCCUPIED'
      ? true
      : property.ownershipType === 'RENTED_OUT'
        ? false
        : null;

  return {
    state: property.state ?? null,
    city: property.city ?? null,
    zipCode: property.zipCode ?? null,
    county: null,
    country: 'USA',
    propertyType: property.propertyType ?? null,
    isPrimaryResidence,
    yearBuilt: property.yearBuilt ?? null,
    squareFootage: property.propertySize ?? null,
    hvacType: property.heatingType ?? null,
    waterHeaterType: property.waterHeaterType ?? null,
    roofType: property.roofType ?? null,
    roofAge,
    hasSecuritySystem: property.hasSecuritySystem ?? null,
    hasSolarInstalled: null,
    hasEvCharger: null,
    hasLeakSensors: null,
    hasIrrigation: property.hasIrrigation ?? null,
    hasSumpPumpBackup: property.hasSumpPumpBackup ?? null,
    utilityProvider: null,
    primaryHeatingFuel: property.primaryHeatingFuel ?? null,
    inHistoricDistrict: null,
    inHurricaneZone: null,
    inFloodZone: null,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMatchReason(rule: RuleEngineProgramInput['rules'][number]): string {
  const opLabel = rule.operator.toLowerCase().replace(/_/g, ' ');
  return `${rule.attribute} ${opLabel} ${rule.value}`;
}
