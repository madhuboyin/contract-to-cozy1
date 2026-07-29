import {
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  HiddenAssetRuleKind,
  HiddenAssetRuleOperator,
  HiddenAssetCriterionResultStatus,
} from '@prisma/client';
import {
  applyConfidenceCaps,
  applyFreshnessPenalty,
} from './categoryConfig';
import {
  EvalContext,
  GroupEvalResult,
  ProgramEvalResult,
  PropertyAttributeMap,
  RuleEngineProgramInput,
  SensitiveAttributeMap,
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
  hasSumpPump: 'sumpPumpInstalled',
  'property.hasSumpPump': 'sumpPumpInstalled',
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

/**
 * Rule attribute strings that reference a sensitive eligibility fact
 * (audit section 9.6) instead of an ordinary PropertyAttributeMap key.
 * Deliberately a SEPARATE dictionary from ATTRIBUTE_MAP — a rule authored
 * with one of these attribute names can never accidentally resolve against
 * the broad property map, and a rule authored with an ordinary attribute
 * name can never accidentally pull from the sensitive overlay.
 */
const SENSITIVE_ATTRIBUTE_MAP: Record<string, keyof SensitiveAttributeMap> = {
  income: 'income',
  annualIncome: 'income',
  householdIncome: 'income',
  disability: 'disability',
  hasDisability: 'disability',
  age: 'age',
  ownerAge: 'age',
  isSenior: 'age',
  veteranStatus: 'veteranStatus',
  isVeteran: 'veteranStatus',
  taxFilingStatus: 'taxFilingStatus',
  householdComposition: 'householdComposition',
  householdSize: 'householdComposition',
  hardshipStatus: 'hardshipStatus',
  hasHardship: 'hardshipStatus',
  mortgageHardship: 'hardshipStatus',
  utilityHardship: 'hardshipStatus',
  immigrationStatus: 'immigrationStatus',
};

/**
 * True when a rule's attribute string references a sensitive fact rather
 * than an ordinary property attribute.
 */
export function isSensitiveAttribute(rawAttribute: string): boolean {
  return rawAttribute in SENSITIVE_ATTRIBUTE_MAP;
}

/**
 * Resolves a rule's attribute string to its SensitiveAttributeMap key, or
 * null if it isn't a recognized sensitive attribute. Used by
 * hiddenAssetSensitiveFacts.service.ts to work out which sensitive facts a
 * program's rules actually reference, without duplicating the alias table.
 */
export function resolveSensitiveAttributeKey(rawAttribute: string): keyof SensitiveAttributeMap | null {
  return SENSITIVE_ATTRIBUTE_MAP[rawAttribute] ?? null;
}

/**
 * Resolves a rule's attribute string against the sensitive-fact overlay
 * ONLY — never against PropertyAttributeMap. When `overlay` is undefined
 * (the default for every broad/initial scan across all programs) every
 * sensitive attribute resolves as missing, which is the correct fail-safe:
 * a program requiring a sensitive fact can never silently match until a
 * homeowner has explicitly consented to and provided that fact for this
 * specific program's match (see hiddenAssetSensitiveFacts.service.ts).
 */
function resolveSensitiveAttribute(
  overlay: SensitiveAttributeMap | undefined,
  rawAttribute: string,
): { value: unknown; exists: boolean; mappedKey: keyof SensitiveAttributeMap | null } {
  const mappedKey = SENSITIVE_ATTRIBUTE_MAP[rawAttribute] ?? null;
  if (!mappedKey || !overlay) {
    return { value: undefined, exists: false, mappedKey };
  }
  const value = overlay[mappedKey];
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
  sensitiveOverlay?: SensitiveAttributeMap,
): SingleRuleEvalResult {
  const { value: propValue, exists } = isSensitiveAttribute(rule.attribute)
    ? resolveSensitiveAttribute(sensitiveOverlay, rule.attribute)
    : resolveAttribute(attrs, rule.attribute);

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
// EXPRESSION GROUP EVALUATION AND MATCH DECISION
// ============================================================================

/**
 * Groups a program's rules by groupKey (rules sharing a non-null groupKey
 * are OR'd together; a null groupKey makes a rule its own singleton group)
 * and reduces each group to a single status:
 *   SATISFIED     — at least one rule in the group matched
 *   UNKNOWN       — none matched, but at least one attribute was missing
 *                    (the group could still resolve true once known)
 *   NOT_SATISFIED — every rule was evaluable and every one failed
 */
function evaluateGroups(
  rules: RuleEngineProgramInput['rules'],
  perRule: SingleRuleEvalResult[],
): GroupEvalResult[] {
  const groups = new Map<
    string,
    { kind: HiddenAssetRuleKind; anyMatched: boolean; anyUnknown: boolean }
  >();

  rules.forEach((rule, i) => {
    const key = rule.groupKey ?? `__singleton_${rule.id}`;
    const result = perRule[i];
    const group = groups.get(key) ?? { kind: rule.kind, anyMatched: false, anyUnknown: false };
    if (result.matched) group.anyMatched = true;
    if (result.attributeMissing) group.anyUnknown = true;
    groups.set(key, group);
  });

  return [...groups.entries()].map(([groupKey, group]) => ({
    groupKey,
    kind: group.kind,
    status: group.anyMatched ? 'SATISFIED' : group.anyUnknown ? 'UNKNOWN' : 'NOT_SATISFIED',
  }));
}

interface MatchDecision {
  included: boolean;
  baseLevel: HiddenAssetConfidenceLevel | null;
  /** Mandatory groups still unresolved — surfaced as an eligibility caveat. */
  unresolvedMandatoryCount: number;
}

/**
 * Decides whether a program matches at all, and if so its base confidence,
 * from expression-group results:
 *   - a satisfied DISQUALIFYING group excludes the program outright;
 *   - a definitively failed MANDATORY group excludes the program;
 *   - remaining MANDATORY groups that are still UNKNOWN keep the program a
 *     candidate but cap confidence at LOW until those facts are known;
 *   - once every MANDATORY group is confirmed SATISFIED, OPTIONAL groups
 *     determine whether confidence reaches MEDIUM or HIGH.
 */
function decideProgramMatch(groups: GroupEvalResult[]): MatchDecision {
  const disqualifying = groups.filter((g) => g.kind === HiddenAssetRuleKind.DISQUALIFYING);
  const mandatory = groups.filter((g) => g.kind === HiddenAssetRuleKind.MANDATORY);
  const optional = groups.filter((g) => g.kind === HiddenAssetRuleKind.OPTIONAL);

  if (disqualifying.some((g) => g.status === 'SATISFIED')) {
    return { included: false, baseLevel: null, unresolvedMandatoryCount: 0 };
  }
  if (mandatory.some((g) => g.status === 'NOT_SATISFIED')) {
    return { included: false, baseLevel: null, unresolvedMandatoryCount: 0 };
  }

  const optionalSatisfiedCount = optional.filter((g) => g.status === 'SATISFIED').length;
  const optionalLevel: HiddenAssetConfidenceLevel =
    optional.length === 0 || optionalSatisfiedCount === optional.length
      ? HiddenAssetConfidenceLevel.HIGH
      : optionalSatisfiedCount > 0
        ? HiddenAssetConfidenceLevel.MEDIUM
        : HiddenAssetConfidenceLevel.LOW;

  // No mandatory criteria at all (e.g. only disqualifiers + optional rules)
  // — confidence rests entirely on optional signal.
  if (mandatory.length === 0) {
    return { included: true, baseLevel: optionalLevel, unresolvedMandatoryCount: 0 };
  }

  const unresolvedMandatoryCount = mandatory.filter((g) => g.status === 'UNKNOWN').length;
  if (unresolvedMandatoryCount > 0) {
    // Can't yet confirm every mandatory criterion — a real candidate, but
    // capped low until those facts are known.
    return { included: true, baseLevel: HiddenAssetConfidenceLevel.LOW, unresolvedMandatoryCount };
  }

  // Every mandatory group confirmed satisfied — optional rules can still
  // pull confidence down from HIGH to MEDIUM, never below.
  const level =
    optionalLevel === HiddenAssetConfidenceLevel.LOW
      ? HiddenAssetConfidenceLevel.MEDIUM
      : optionalLevel;
  return { included: true, baseLevel: level, unresolvedMandatoryCount: 0 };
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
    case 'sumpPumpInstalled':
      if (propValue === true) return 'Property has a sump pump';
      if (propValue === false)
        return 'No sump pump detected — program may support flood-mitigation installation';
      return 'Sump pump status aligns with program criteria';
    case 'hasSumpPumpBackup':
      if (propValue === true) return 'Property has a sump pump backup system';
      if (propValue === false) return 'Sump pump has no backup power recorded';
      return 'Sump pump backup status aligns with program criteria';

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
 *   1. Base confidence from mandatory/optional/disqualifying expression groups
 *   2. Category-specific caps (e.g. missing hazard zone → STORM_RESILIENCE capped)
 *   3. Freshness penalty (stale lastVerifiedAt → confidence reduced)
 */
export function evaluateProgram(
  attrs: PropertyAttributeMap,
  program: RuleEngineProgramInput,
  context: EvalContext,
  sensitiveOverlay?: SensitiveAttributeMap,
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
      criterionResults: [],
    };
  }

  let matchedCount = 0;
  let missingCount = 0;
  const reasons: string[] = [];
  const perRule: SingleRuleEvalResult[] = [];

  for (const rule of rules) {
    const sensitive = isSensitiveAttribute(rule.attribute);
    const evaluated = rule.requiresExternalVerification
      ? { matched: false, attributeMissing: true }
      : evaluateRule(attrs, rule, sensitiveOverlay);
    const result =
      evaluated.attributeMissing && rule.unknownHandling === 'EXCLUDE'
        ? { matched: false, attributeMissing: false }
        : evaluated;
    perRule.push(result);

    if (result.attributeMissing) {
      missingCount++;
    } else if (result.matched) {
      matchedCount++;
      // A matched DISQUALIFYING rule means the exclusion condition was
      // detected, not a supporting reason — and a matched MANDATORY/OPTIONAL
      // rule that ends up excluded (a sibling mandatory group failed) would
      // otherwise leave a misleading reason behind for a program that isn't
      // actually included.
      if (rule.kind !== HiddenAssetRuleKind.DISQUALIFYING) {
        if (sensitive) {
          // Never restate the homeowner's own sensitive value back to them
          // as a "reason" — the fact that it satisfied one of this
          // program's requirements is enough.
          reasons.push('Meets an eligibility requirement based on information you provided');
        } else {
          const { value: propValue, mappedKey } = resolveAttribute(attrs, rule.attribute);
          const key = mappedKey ?? (rule.attribute as keyof PropertyAttributeMap);
          reasons.push(generateMatchReason(key, rule.operator, rule.value, propValue, context.category));
        }
      }
    }
  }

  // Stage 1: base confidence from mandatory/optional/disqualifying groups
  const groups = evaluateGroups(rules, perRule);
  const decision = decideProgramMatch(groups);
  const criterionResults = rules.map((rule, index) => {
    const result = perRule[index];
    let status: HiddenAssetCriterionResultStatus;
    if (rule.requiresExternalVerification || (
      result.attributeMissing && rule.unknownHandling === 'EXTERNAL_VERIFICATION'
    )) {
      status = HiddenAssetCriterionResultStatus.EXTERNAL_VERIFICATION;
    } else if (result.attributeMissing) {
      status = HiddenAssetCriterionResultStatus.UNKNOWN;
    } else {
      status = result.matched
        ? HiddenAssetCriterionResultStatus.MET
        : HiddenAssetCriterionResultStatus.NOT_MET;
    }
    return {
      ruleId: rule.id,
      result: status,
      explanation: rule.homeownerExplanation
        ?? (status === HiddenAssetCriterionResultStatus.MET
          ? 'This criterion matches the current property context.'
          : status === HiddenAssetCriterionResultStatus.NOT_MET
            ? 'This criterion does not match the current property context.'
            : status === HiddenAssetCriterionResultStatus.EXTERNAL_VERIFICATION
              ? 'This criterion must be verified by the program administrator or another official source.'
              : 'More information is needed to evaluate this criterion.'),
    };
  });

  if (!decision.included || decision.baseLevel === null) {
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
      criterionResults,
    };
  }

  // Stage 2: category-specific attribute caps
  const cappedLevel = applyConfidenceCaps(decision.baseLevel, context.category, attrs);

  // Stage 3: freshness penalty
  const finalLevel = applyFreshnessPenalty(cappedLevel, context.lastVerifiedAt);

  if (decision.unresolvedMandatoryCount > 0) {
    const criterion = decision.unresolvedMandatoryCount === 1 ? 'criterion' : 'criteria';
    reasons.push(
      `${decision.unresolvedMandatoryCount} required eligibility ${criterion} still need${decision.unresolvedMandatoryCount === 1 ? 's' : ''} verification`,
    );
  }

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
    criterionResults,
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
    county?: string | null;
    yearBuilt?: number | null;
    propertySize?: number | null;
    dwellingType?: string | null;
    propertyUse?: string | null;
    occupancyStatus?: string | null;
    heatingType?: string | null;
    waterHeaterType?: string | null;
    roofType?: string | null;
    roofReplacementYear?: number | null;
    hasSecuritySystem?: boolean | null;
    hasIrrigation?: boolean | null;
    hasSumpPump?: boolean | null;
    hasSumpPumpBackup?: boolean | null;
    primaryHeatingFuel?: string | null;
    lastAppraisedValue?: number | null;
    hasSmokeDetectors?: boolean | null;
    hasCoDetectors?: boolean | null;
    hasFireExtinguisher?: boolean | null;
    hasDrainageIssues?: boolean | null;
    utilityProvider?: string | null;
    gasProvider?: string | null;
    inHistoricDistrict?: boolean | null;
    historicRegistryStatus?: string | null;
    inHurricaneZone?: boolean | null;
    inFloodZone?: boolean | null;
    inWildfireZone?: boolean | null;
  },
  currentYear: number = new Date().getFullYear(),
): PropertyAttributeMap {
  const roofAge =
    property.roofReplacementYear != null
      ? currentYear - property.roofReplacementYear
      : null;

  const isPrimaryResidence = property.propertyUse && property.propertyUse !== 'UNKNOWN'
    ? property.propertyUse === 'PRIMARY_RESIDENCE'
    : property.occupancyStatus && property.occupancyStatus !== 'UNKNOWN'
      ? property.occupancyStatus === 'OWNER_OCCUPIED'
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
    county: property.county ?? null,
    country: 'USA',

    // Ownership / classification
    propertyType:
      property.dwellingType && property.dwellingType !== 'UNKNOWN'
        ? property.dwellingType
        : null,
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
    sumpPumpInstalled: property.hasSumpPump ?? null,

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

    // Utility
    utilityProvider: property.utilityProvider ?? null,
    gasProvider: property.gasProvider ?? null,
    primaryHeatingFuel: property.primaryHeatingFuel ?? null,

    // Special zones / registries
    inHistoricDistrict: property.inHistoricDistrict ?? null,
    historicRegistryStatus: property.historicRegistryStatus ?? null,
    inHurricaneZone: property.inHurricaneZone ?? null,
    inFloodZone: property.inFloodZone ?? null,
    inWildfireZone: property.inWildfireZone ?? null,
  };
}

// ============================================================================
// RE-EXPORT CATEGORY HELPERS (convenience for callers)
// ============================================================================

export { getFreshnessNote, getEligibilityLabel } from './categoryConfig';
