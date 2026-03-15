import { HiddenAssetCategory, HiddenAssetConfidenceLevel, HiddenAssetRuleOperator } from '@prisma/client';
import {
  applyConfidenceCaps,
  applyFreshnessPenalty,
} from './categoryConfig';
import {
  EvalContext,
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
 *
 * Rules stored in the DB use these string names. Any unrecognized attribute
 * fails gracefully (attributeMissing = true) rather than crashing or allowing
 * arbitrary property access.
 *
 * Aliases allow rule authors to use multiple naming conventions for the same
 * logical attribute (e.g. "hvacType", "heatingType", "property.hvacType").
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
  ownerOccupied: 'isPrimaryResidence',
  yearBuilt: 'yearBuilt',
  'property.yearBuilt': 'yearBuilt',
  squareFootage: 'squareFootage',
  'property.squareFootage': 'squareFootage',
  propertySize: 'squareFootage',
  assessedValue: 'assessedValue',
  'property.assessedValue': 'assessedValue',
  appraisedValue: 'assessedValue',

  // Systems
  hvacType: 'hvacType',
  heatingType: 'hvacType',
  'property.hvacType': 'hvacType',
  'property.heatingType': 'hvacType',
  waterHeaterType: 'waterHeaterType',
  'property.waterHeaterType': 'waterHeaterType',
  roofType: 'roofType',
  'property.roofType': 'roofType',
  roofMaterial: 'roofMaterial',
  'property.roofMaterial': 'roofMaterial',
  roofAge: 'roofAge',
  'property.roofAge': 'roofAge',

  // Derived / inferred systems
  heatPumpInstalled: 'heatPumpInstalled',
  'property.heatPumpInstalled': 'heatPumpInstalled',
  heatPump: 'heatPumpInstalled',
  heatPumpWaterHeaterInstalled: 'heatPumpWaterHeaterInstalled',
  'property.heatPumpWaterHeaterInstalled': 'heatPumpWaterHeaterInstalled',
  sumpPumpInstalled: 'sumpPumpInstalled',
  'property.sumpPumpInstalled': 'sumpPumpInstalled',

  // Safety / smart home
  hasSecuritySystem: 'hasSecuritySystem',
  securitySystem: 'hasSecuritySystem',
  'property.hasSecuritySystem': 'hasSecuritySystem',
  hasSolarInstalled: 'hasSolarInstalled',
  solarInstalled: 'hasSolarInstalled',
  'property.hasSolarInstalled': 'hasSolarInstalled',
  hasEvCharger: 'hasEvCharger',
  evChargerInstalled: 'hasEvCharger',
  'property.hasEvCharger': 'hasEvCharger',
  hasLeakSensors: 'hasLeakSensors',
  leakSensors: 'hasLeakSensors',
  'property.hasLeakSensors': 'hasLeakSensors',
  sprinklerSystem: 'sprinklerSystem',
  'property.sprinklerSystem': 'sprinklerSystem',
  fireAlarm: 'fireAlarm',
  smokeDetector: 'fireAlarm',
  hasSmokeDetectors: 'fireAlarm',
  'property.fireAlarm': 'fireAlarm',
  hasIrrigation: 'hasIrrigation',
  'property.hasIrrigation': 'hasIrrigation',
  hasSumpPumpBackup: 'hasSumpPumpBackup',
  'property.hasSumpPumpBackup': 'hasSumpPumpBackup',

  // Storm / resilience features
  impactWindows: 'impactWindows',
  'property.impactWindows': 'impactWindows',
  shutters: 'shutters',
  stormShutters: 'shutters',
  'property.shutters': 'shutters',
  roofStraps: 'roofStraps',
  roofReinforcement: 'roofStraps',
  'property.roofStraps': 'roofStraps',

  // Energy / upgrade signals
  insulationUpgrade: 'insulationUpgrade',
  'property.insulationUpgrade': 'insulationUpgrade',
  windowUpgrade: 'windowUpgrade',
  'property.windowUpgrade': 'windowUpgrade',

  // Utility
  utilityProvider: 'utilityProvider',
  'property.utilityProvider': 'utilityProvider',
  electricProvider: 'utilityProvider',
  gasProvider: 'gasProvider',
  'property.gasProvider': 'gasProvider',
  primaryHeatingFuel: 'primaryHeatingFuel',
  heatingFuel: 'primaryHeatingFuel',
  'property.primaryHeatingFuel': 'primaryHeatingFuel',

  // Special zones / registries
  inHistoricDistrict: 'inHistoricDistrict',
  historicDistrict: 'inHistoricDistrict',
  'property.inHistoricDistrict': 'inHistoricDistrict',
  historicRegistryStatus: 'historicRegistryStatus',
  'property.historicRegistryStatus': 'historicRegistryStatus',
  inHurricaneZone: 'inHurricaneZone',
  hurricaneZone: 'inHurricaneZone',
  'property.inHurricaneZone': 'inHurricaneZone',
  inFloodZone: 'inFloodZone',
  floodZone: 'inFloodZone',
  'property.inFloodZone': 'inFloodZone',
  inWildfireZone: 'inWildfireZone',
  wildfireZone: 'inWildfireZone',
  'property.inWildfireZone': 'inWildfireZone',
};

/**
 * Resolves a rule's attribute string to the corresponding value from the
 * property attribute map. Returns { value, exists } — never throws.
 */
function resolveAttribute(
  attrs: PropertyAttributeMap,
  rawAttribute: string,
): { value: unknown; exists: boolean; mappedKey: keyof PropertyAttributeMap | null } {
  const mappedKey = ATTRIBUTE_MAP[rawAttribute] ?? null;
  if (!mappedKey) {
    return { value: undefined, exists: false, mappedKey: null };
  }
  const value = attrs[mappedKey];
  const exists = value !== null && value !== undefined;
  return { value, exists, mappedKey };
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
      return { matched: false, attributeMissing: false };
  }
}

// ============================================================================
// BASE CONFIDENCE COMPUTATION
// ============================================================================

/**
 * Computes a base confidence level purely from rule evaluation counts.
 *
 * This is the raw signal before category caps and freshness penalties are
 * applied. The calling code applies those downstream.
 */
function computeBaseConfidence(
  totalRules: number,
  matchedCount: number,
  missingCount: number,
): HiddenAssetConfidenceLevel | null {
  // No rules → geographic pre-filter already matched → LOW
  if (totalRules === 0) return HiddenAssetConfidenceLevel.LOW;

  const failedCount = totalRules - matchedCount - missingCount;

  // Clear disqualification: rules were evaluable but all failed
  if (matchedCount === 0 && failedCount > 0) return null;

  // All attributes missing, nothing failed → possible but unverifiable
  if (matchedCount === 0 && failedCount === 0) return HiddenAssetConfidenceLevel.LOW;

  // Compute ratio over evaluable (non-missing) rules
  const availableRules = totalRules - missingCount;
  const matchRatio = availableRules > 0 ? matchedCount / availableRules : 0;
  const missingRatio = missingCount / totalRules;

  // High data-missing rate caps at LOW regardless of ratio
  if (missingRatio >= 0.5) return HiddenAssetConfidenceLevel.LOW;

  if (matchRatio >= 0.9) return HiddenAssetConfidenceLevel.HIGH;
  if (matchRatio >= 0.6) return HiddenAssetConfidenceLevel.MEDIUM;
  return HiddenAssetConfidenceLevel.LOW;
}

// ============================================================================
// HUMAN-READABLE MATCH REASON GENERATION
// ============================================================================

/** Full US state/territory name lookup for friendly reason text. */
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

function stateName(abbr: string): string {
  return STATE_NAMES[abbr.toUpperCase()] ?? abbr;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generates a homeowner-friendly reason string for a matched rule.
 *
 * Design goals:
 * - Use real property values (e.g. actual state name) rather than raw rule values
 * - Be cautious — never imply guaranteed approval
 * - Be short enough to render as a badge or bullet point
 * - Avoid exposing raw DB rule syntax to end users
 */
function generateMatchReason(
  mappedKey: keyof PropertyAttributeMap,
  operator: HiddenAssetRuleOperator,
  ruleValue: string,
  propValue: unknown,
  _category: HiddenAssetCategory,
): string {
  const isNegating =
    operator === HiddenAssetRuleOperator.NOT_EQUALS ||
    operator === HiddenAssetRuleOperator.NOT_IN ||
    operator === HiddenAssetRuleOperator.NOT_EXISTS;

  switch (mappedKey) {
    // ── Geography ──────────────────────────────────────────────────────────
    case 'state': {
      if (operator === HiddenAssetRuleOperator.IN) {
        const stateNames = toStringList(ruleValue)
          .map((s) => stateName(s.toUpperCase()))
          .join(' or ');
        return `Located in a qualifying state (${stateNames})`;
      }
      const sName =
        typeof propValue === 'string' ? stateName(propValue.toUpperCase()) : ruleValue;
      return `Located in ${sName}, where this program applies`;
    }

    case 'city': {
      const cName = typeof propValue === 'string' ? propValue : ruleValue;
      return `Property is in ${cName}, a participating city for this program`;
    }

    case 'county': {
      const ctyName = typeof propValue === 'string' ? propValue : ruleValue;
      return `Property is in ${ctyName} county, which this program covers`;
    }

    case 'zipCode':
      return operator === HiddenAssetRuleOperator.IN
        ? 'Property ZIP code falls within the eligible region'
        : 'Property ZIP code matches program requirements';

    case 'country':
      return 'Program is available nationwide';

    // ── Ownership / classification ─────────────────────────────────────────
    case 'isPrimaryResidence':
      if (propValue === true) return 'Property is classified as a primary residence';
      if (propValue === false && isNegating)
        return 'Property occupancy type meets program criteria';
      return 'Property residence status aligns with program requirements';

    case 'propertyType': {
      const ptLabel =
        typeof propValue === 'string'
          ? titleCase(propValue)
          : titleCase(ruleValue);
      return `Program applies to ${ptLabel} properties`;
    }

    case 'yearBuilt': {
      const year = typeof propValue === 'number' ? propValue : null;
      if (
        (operator === HiddenAssetRuleOperator.LESS_THAN ||
          operator === HiddenAssetRuleOperator.LESS_THAN_OR_EQUAL) &&
        year !== null
      ) {
        return `Home built in ${year} — property age aligns with this program's eligibility`;
      }
      if (
        (operator === HiddenAssetRuleOperator.GREATER_THAN ||
          operator === HiddenAssetRuleOperator.GREATER_THAN_OR_EQUAL) &&
        year !== null
      ) {
        return `Property construction date (${year}) meets program requirements`;
      }
      return 'Property age aligns with program eligibility criteria';
    }

    case 'squareFootage':
      return 'Property size meets program requirements';

    case 'assessedValue':
      return 'Property value aligns with program eligibility criteria';

    // ── HVAC / heating ─────────────────────────────────────────────────────
    case 'hvacType': {
      const hvacVal = (typeof propValue === 'string' ? propValue : ruleValue).toLowerCase();
      if (hvacVal.includes('heat_pump') || hvacVal.includes('heat pump')) {
        return 'Property has a heat pump system, which this program targets';
      }
      return `Heating system type (${titleCase(typeof propValue === 'string' ? propValue : ruleValue)}) matches program criteria`;
    }

    case 'heatPumpInstalled':
      if (propValue === true) return 'Property has a heat pump system';
      if (propValue === false)
        return 'No heat pump detected — program may support heat pump upgrades';
      return 'Heat pump status aligns with program criteria';

    // ── Water heater ───────────────────────────────────────────────────────
    case 'waterHeaterType': {
      const whVal = (typeof propValue === 'string' ? propValue : ruleValue).toLowerCase();
      if (whVal.includes('heat_pump') || whVal.includes('heat pump')) {
        return 'Property has a heat pump water heater, which this program targets';
      }
      if (whVal.includes('tankless')) {
        return 'Tankless water heater detected — matches program criteria';
      }
      return `Water heater type (${titleCase(typeof propValue === 'string' ? propValue : ruleValue)}) matches program requirements`;
    }

    case 'heatPumpWaterHeaterInstalled':
      if (propValue === true) return 'Property has a heat pump water heater';
      if (propValue === false)
        return 'No heat pump water heater detected — program may support upgrades';
      return 'Water heater configuration aligns with program criteria';

    // ── Roof ───────────────────────────────────────────────────────────────
    case 'roofType':
    case 'roofMaterial': {
      const matLabel = titleCase(typeof propValue === 'string' ? propValue : ruleValue);
      return `Roof material (${matLabel}) matches program criteria`;
    }

    case 'roofAge': {
      const age = typeof propValue === 'number' ? propValue : null;
      if (
        (operator === HiddenAssetRuleOperator.LESS_THAN ||
          operator === HiddenAssetRuleOperator.LESS_THAN_OR_EQUAL) &&
        age !== null
      ) {
        return `Relatively new roof (${age} years old) may qualify for roof-related discounts`;
      }
      if (
        (operator === HiddenAssetRuleOperator.GREATER_THAN ||
          operator === HiddenAssetRuleOperator.GREATER_THAN_OR_EQUAL) &&
        age !== null
      ) {
        return `Roof age (${age} years) indicates a potential upgrade opportunity`;
      }
      return 'Roof age aligns with program eligibility criteria';
    }

    // ── Safety / security ─────────────────────────────────────────────────
    case 'hasSecuritySystem':
    case 'sprinklerSystem':
    case 'fireAlarm': {
      const featureNames: Partial<Record<keyof PropertyAttributeMap, string>> = {
        hasSecuritySystem: 'security system',
        sprinklerSystem: 'sprinkler system',
        fireAlarm: 'fire detection equipment',
      };
      const name = featureNames[mappedKey] ?? 'safety feature';
      if (propValue === true) return `Property has a ${name}`;
      if (propValue === false) return `No ${name} detected — program may support installation`;
      return `${titleCase(name)} status meets program criteria`;
    }

    case 'hasLeakSensors':
      if (propValue === true) return 'Property has water leak detection devices';
      if (propValue === false)
        return 'No leak sensors detected — program may support water-loss prevention';
      return 'Leak detection status aligns with program criteria';

    // ── Sump / drainage ────────────────────────────────────────────────────
    case 'hasSumpPumpBackup':
    case 'sumpPumpInstalled':
      if (propValue === true) return 'Property has a sump pump backup system';
      if (propValue === false)
        return 'No sump pump detected — program may support flood-mitigation installation';
      return 'Sump pump status aligns with program criteria';

    // ── Storm resilience ──────────────────────────────────────────────────
    case 'impactWindows':
      if (propValue === true) return 'Property has impact-resistant windows installed';
      if (propValue === false)
        return 'Impact windows not detected — program may support storm-hardening upgrades';
      return 'Window type aligns with program criteria';

    case 'shutters':
      if (propValue === true) return 'Property has storm shutters installed';
      if (propValue === false)
        return 'Storm shutters not detected — program may cover shutter installation';
      return 'Storm protection feature status aligns with program criteria';

    case 'roofStraps':
      if (propValue === true) return 'Property has roof reinforcement straps installed';
      if (propValue === false)
        return 'Roof straps not detected — program may support wind-mitigation upgrades';
      return 'Roof reinforcement status aligns with program criteria';

    // ── Solar / EV / energy ────────────────────────────────────────────────
    case 'hasSolarInstalled':
      if (propValue === true) return 'Property appears to include a solar installation';
      if (propValue === false)
        return 'No solar installation detected — program may support solar adoption';
      return 'Solar status aligns with program requirements';

    case 'hasEvCharger':
      if (propValue === true) return 'Property has an EV charger installed';
      if (propValue === false)
        return 'No EV charger detected — program may support EV charging installation';
      return 'EV charger status aligns with program criteria';

    case 'insulationUpgrade':
      if (propValue === true) return 'Property has received an insulation upgrade';
      if (propValue === false)
        return 'Insulation upgrade not detected — program may support energy-efficiency improvements';
      return 'Insulation status aligns with program requirements';

    case 'windowUpgrade':
      if (propValue === true) return 'Property has received window upgrades';
      if (propValue === false)
        return 'Window upgrades not detected — program may support energy-efficiency improvements';
      return 'Window upgrade status aligns with program requirements';

    // ── Utility ────────────────────────────────────────────────────────────
    case 'utilityProvider': {
      const providerName = typeof propValue === 'string' ? propValue : ruleValue;
      return `Utility provider (${providerName}) matches program coverage area`;
    }

    case 'gasProvider':
      return 'Gas provider matches program coverage area';

    case 'primaryHeatingFuel': {
      const fuelLabel =
        typeof propValue === 'string' ? propValue.toLowerCase() : ruleValue.toLowerCase();
      return `Property uses ${fuelLabel} heating, which this program targets`;
    }

    case 'hasIrrigation':
      return 'Irrigation system status aligns with program criteria';

    // ── Historic ──────────────────────────────────────────────────────────
    case 'inHistoricDistrict':
      if (propValue === true) return 'Property is located in a designated historic district';
      return 'Historic district status aligns with program criteria';

    case 'historicRegistryStatus':
      return 'Property has a historic registry designation';

    // ── Hazard zones ──────────────────────────────────────────────────────
    case 'inHurricaneZone':
      if (propValue === true)
        return 'Property is in a hurricane-prone area — eligible for wind/storm mitigation programs';
      return 'Property hazard zone classification aligns with program scope';

    case 'inFloodZone':
      if (propValue === true) return 'Property is in a designated flood zone';
      return 'Property flood risk designation aligns with program scope';

    case 'inWildfireZone':
      if (propValue === true) return 'Property is in a wildfire risk area';
      return 'Property wildfire risk designation aligns with program scope';

    // ── Fallback ──────────────────────────────────────────────────────────
    default:
      return 'Property details match program requirements';
  }
}

// ============================================================================
// PROGRAM EVALUATION — PUBLIC API
// ============================================================================

/**
 * Evaluates a single program against a property's attribute map.
 *
 * Returns a structured result with:
 * - match/no-match decision
 * - confidence level (after category caps + freshness penalty)
 * - matched rule count and total for transparency
 * - human-readable match reasons
 * - estimated value range from program registry
 *
 * The confidence level is computed in three stages:
 *   1. Base confidence from rule evaluation ratios
 *   2. Category-specific caps (e.g. missing hazard zone → STORM_RESILIENCE capped)
 *   3. Freshness penalty (stale lastVerifiedAt → confidence reduced)
 */
export function evaluateProgram(
  attrs: PropertyAttributeMap,
  program: RuleEngineProgramInput,
  context: EvalContext,
): ProgramEvalResult {
  const rules = program.rules;

  // No rules → geographic region already pre-matched → LOW confidence
  if (rules.length === 0) {
    const baseLevel = HiddenAssetConfidenceLevel.LOW;
    const cappedLevel = applyConfidenceCaps(baseLevel, context.category, attrs);
    const finalLevel = applyFreshnessPenalty(cappedLevel, context.lastVerifiedAt);

    return {
      programId: program.id,
      matched: true,
      confidenceLevel: finalLevel,
      matchedRuleCount: 0,
      totalRuleCount: 0,
      matchReasons: ['Program is available in your region'],
      estimatedValue: null,
      estimatedValueMin: program.benefitEstimateMin,
      estimatedValueMax: program.benefitEstimateMax,
    };
  }

  let matchedCount = 0;
  let missingCount = 0;
  const reasons: string[] = [];

  for (const rule of rules) {
    const { value: propValue, mappedKey } = resolveAttribute(attrs, rule.attribute);
    const result = evaluateRule(attrs, rule);

    if (result.attributeMissing) {
      missingCount++;
    } else if (result.matched) {
      matchedCount++;
      const key = mappedKey ?? (rule.attribute as keyof PropertyAttributeMap);
      reasons.push(generateMatchReason(key, rule.operator, rule.value, propValue, context.category));
    }
  }

  // Stage 1: base confidence from rule counts
  const baseLevel = computeBaseConfidence(rules.length, matchedCount, missingCount);
  const matched = baseLevel !== null;

  if (!matched) {
    return {
      programId: program.id,
      matched: false,
      confidenceLevel: null,
      matchedRuleCount: matchedCount,
      totalRuleCount: rules.length,
      matchReasons: [],
      estimatedValue: null,
      estimatedValueMin: program.benefitEstimateMin,
      estimatedValueMax: program.benefitEstimateMax,
    };
  }

  // Stage 2: category-specific attribute caps
  const cappedLevel = applyConfidenceCaps(baseLevel, context.category, attrs);

  // Stage 3: freshness penalty
  const finalLevel = applyFreshnessPenalty(cappedLevel, context.lastVerifiedAt);

  return {
    programId: program.id,
    matched: true,
    confidenceLevel: finalLevel,
    matchedRuleCount: matchedCount,
    totalRuleCount: rules.length,
    matchReasons: reasons,
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
 *
 * Fields not yet present in the Property schema default to null and are
 * documented inline. Derived fields (heatPumpInstalled, roofAge, etc.) are
 * computed here so the rule engine stays pure.
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
    lastAppraisedValue?: number | null;
    hasSmokeDetectors?: boolean | null;
    hasCoDetectors?: boolean | null;
    hasFireExtinguisher?: boolean | null;
    hasDrainageIssues?: boolean | null;
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

  // Derive heat pump presence from hvac/water heater type
  const heatPumpInstalled =
    property.heatingType === 'HEAT_PUMP' ? true : property.heatingType != null ? false : null;

  const heatPumpWaterHeaterInstalled =
    property.waterHeaterType === 'HEAT_PUMP'
      ? true
      : property.waterHeaterType != null
        ? false
        : null;

  // Fire alarm proxy: hasSmokeDetectors is the closest existing field
  const fireAlarm =
    property.hasSmokeDetectors != null ? property.hasSmokeDetectors : null;

  return {
    // Geography
    state: property.state ?? null,
    city: property.city ?? null,
    zipCode: property.zipCode ?? null,
    county: null,                         // not yet in Property schema
    country: 'USA',

    // Ownership / classification
    propertyType: property.propertyType ?? null,
    isPrimaryResidence,
    yearBuilt: property.yearBuilt ?? null,
    squareFootage: property.propertySize ?? null,
    assessedValue: property.lastAppraisedValue ?? null,

    // Systems
    hvacType: property.heatingType ?? null,
    waterHeaterType: property.waterHeaterType ?? null,
    roofType: property.roofType ?? null,
    roofMaterial: property.roofType ?? null,   // same data, friendlier alias
    roofAge,

    // Derived systems
    heatPumpInstalled,
    heatPumpWaterHeaterInstalled,
    sumpPumpInstalled: property.hasSumpPumpBackup ?? null,

    // Safety / smart home
    hasSecuritySystem: property.hasSecuritySystem ?? null,
    hasSolarInstalled: null,              // not yet in Property schema
    hasEvCharger: null,                   // not yet in Property schema
    hasLeakSensors: null,                 // not yet in Property schema
    sprinklerSystem: null,                // not yet in Property schema
    fireAlarm,
    hasIrrigation: property.hasIrrigation ?? null,
    hasSumpPumpBackup: property.hasSumpPumpBackup ?? null,

    // Storm / resilience (not yet in Property schema)
    impactWindows: null,
    shutters: null,
    roofStraps: null,

    // Energy / upgrade (not yet in Property schema)
    insulationUpgrade: null,
    windowUpgrade: null,

    // Utility (not yet in Property schema)
    utilityProvider: null,
    gasProvider: null,
    primaryHeatingFuel: property.primaryHeatingFuel ?? null,

    // Special zones / registries (not yet in Property schema)
    inHistoricDistrict: null,
    historicRegistryStatus: null,
    inHurricaneZone: null,
    inFloodZone: null,
    inWildfireZone: null,
  };
}

// ============================================================================
// RE-EXPORT CATEGORY HELPERS (convenience for callers)
// ============================================================================

export { getFreshnessNote, getEligibilityLabel } from './categoryConfig';
