import type { FeatureDecision, PropertyContextSnapshot, PropertyFact } from '../../modules/propertyContext/domain/contracts';
import type { HabitTargetingRules, PropertyContextFlag, PropertyEvalContext } from './habitRuleEvaluator';
import { getCurrentSeason, matchesDwellingTarget } from './habitRuleEvaluator';

export interface HabitTemplatePolicyInput {
  key: string;
  category: string;
  impactType: string;
  targetingRulesJson: HabitTargetingRules | null;
}

const flagFactKeys: Record<PropertyContextFlag, string> = {
  hasSumpPump: 'safety.hasSumpPumpBackup',
  hasFireExtinguisher: 'safety.hasFireExtinguisher',
  hasSmokeDetectors: 'safety.hasSmokeDetectors',
  hasCoDetectors: 'safety.hasCoDetectors',
  hasSecuritySystem: 'safety.hasSecuritySystem',
  hasIrrigation: 'exterior.hasIrrigation',
  hasDrainageIssues: 'exterior.hasDrainageIssues',
};

const responsibilityByCategory: Record<string, string | undefined> = {
  HVAC: 'responsibility.hvac',
  PLUMBING: 'responsibility.plumbing',
  EXTERIOR: 'responsibility.buildingExterior',
  SAFETY: 'responsibility.commonSafety',
};

class DecisionFacts {
  readonly used = new Set<string>();
  readonly missing = new Set<string>();
  readonly conflicted = new Set<string>();
  readonly validUntil: string[] = [];

  constructor(private readonly context: PropertyContextSnapshot) {}

  read<T>(key: string): T | undefined {
    const fact = this.context.facts[key] as PropertyFact<T> | undefined;
    if (!fact || fact.state === 'UNKNOWN' || fact.state === 'STALE') {
      this.missing.add(key);
      return undefined;
    }
    if (fact.state === 'CONFLICTED') {
      this.conflicted.add(key);
      return undefined;
    }
    this.used.add(key);
    if (fact.validUntil) this.validUntil.push(fact.validUntil);
    return fact.value === null ? undefined : fact.value;
  }

  decision(status: FeatureDecision['status'], reasonCodes: string[]): FeatureDecision {
    return {
      status,
      reasonCodes,
      usedFactKeys: [...this.used],
      missingFactKeys: [...this.missing],
      conflictedFactKeys: [...this.conflicted],
      validUntil: this.validUntil.sort()[0] ?? null,
    };
  }
}

function missingDecision(facts: DecisionFacts, reason: string): FeatureDecision {
  return facts.decision('UNKNOWN', [facts.conflicted.size ? 'CONTEXT_CONFLICT' : reason]);
}

function evaluateBooleanRules(
  facts: DecisionFacts,
  rules: HabitTargetingRules,
): FeatureDecision | null {
  for (const flag of rules.requiredFlags ?? []) {
    const value = facts.read<boolean>(flagFactKeys[flag]);
    if (value === undefined) return missingDecision(facts, 'REQUIRED_PROPERTY_FACT_UNKNOWN');
    if (!value) return facts.decision('NOT_APPLICABLE', ['REQUIRED_PROPERTY_FEATURE_NOT_PRESENT']);
  }
  for (const flag of rules.excludedFlags ?? []) {
    const value = facts.read<boolean>(flagFactKeys[flag]);
    if (value === undefined) return missingDecision(facts, 'EXCLUDED_PROPERTY_FACT_UNKNOWN');
    if (value) return facts.decision('NOT_APPLICABLE', ['EXCLUDED_PROPERTY_FEATURE_PRESENT']);
  }
  return null;
}

function evaluateEnumRule(
  facts: DecisionFacts,
  factKey: string,
  allowed: readonly string[] | undefined,
  reasonPrefix: string,
): FeatureDecision | null {
  if (!allowed?.length) return null;
  const value = facts.read<string>(factKey);
  if (value === undefined) return missingDecision(facts, `${reasonPrefix}_UNKNOWN`);
  return allowed.includes(value)
    ? null
    : facts.decision('NOT_APPLICABLE', [`${reasonPrefix}_MISMATCH`]);
}

function evaluateTemporalAndLocationRules(
  facts: DecisionFacts,
  rules: HabitTargetingRules,
  now: Date,
): FeatureDecision | null {
  const month = now.getMonth() + 1;
  const season = getCurrentSeason(month);
  if (rules.seasons?.length && !rules.seasons.includes(season)) {
    return facts.decision('NOT_APPLICABLE', ['SEASON_MISMATCH']);
  }
  if (rules.months?.length && !rules.months.includes(month)) {
    return facts.decision('NOT_APPLICABLE', ['MONTH_MISMATCH']);
  }
  const climate = evaluateEnumRule(facts, 'location.climateRegion', rules.climateRegions, 'CLIMATE_REGION');
  if (climate) return climate;
  if (rules.states?.length) {
    const state = facts.read<string>('location.state');
    if (state === undefined) return missingDecision(facts, 'STATE_UNKNOWN');
    if (!rules.states.map((value) => value.toUpperCase()).includes(state.toUpperCase())) {
      return facts.decision('NOT_APPLICABLE', ['STATE_MISMATCH']);
    }
  }
  return null;
}

function evaluateAgeAndDwellingRules(
  facts: DecisionFacts,
  rules: HabitTargetingRules,
  now: Date,
): FeatureDecision | null {
  if (rules.propertyTypes?.length || rules.dwellingTypes?.length) {
    const dwellingType = facts.read<string>('core.dwellingType');
    if (dwellingType === undefined) return missingDecision(facts, 'DWELLING_TYPE_UNKNOWN');
    if (!matchesDwellingTarget(dwellingType, rules)) {
      return facts.decision('NOT_APPLICABLE', ['DWELLING_TYPE_MISMATCH']);
    }
  }
  if (rules.minHomeAgeYears != null || rules.maxHomeAgeYears != null) {
    const yearBuilt = facts.read<number>('core.yearBuilt');
    if (yearBuilt === undefined) return missingDecision(facts, 'HOME_AGE_UNKNOWN');
    const age = now.getFullYear() - yearBuilt;
    if (rules.minHomeAgeYears != null && age < rules.minHomeAgeYears) {
      return facts.decision('NOT_APPLICABLE', ['HOME_TOO_NEW']);
    }
    if (rules.maxHomeAgeYears != null && age > rules.maxHomeAgeYears) {
      return facts.decision('NOT_APPLICABLE', ['HOME_TOO_OLD']);
    }
  }
  return null;
}

function evaluateTemplatePresence(
  facts: DecisionFacts,
  template: HabitTemplatePolicyInput,
): FeatureDecision | null {
  const requiredSafety: Array<[RegExp, string]> = [
    [/smoke_detector/i, 'safety.hasSmokeDetectors'],
    [/(^|_)co_detector/i, 'safety.hasCoDetectors'],
    [/fire_extinguisher/i, 'safety.hasFireExtinguisher'],
    [/sump_pump/i, 'safety.hasSumpPumpBackup'],
  ];
  for (const [pattern, key] of requiredSafety) {
    if (!pattern.test(template.key)) continue;
    const present = facts.read<boolean>(key);
    if (present === undefined) return missingDecision(facts, 'SAFETY_EQUIPMENT_PRESENCE_UNKNOWN');
    if (!present) return facts.decision('NOT_APPLICABLE', ['SAFETY_EQUIPMENT_NOT_PRESENT']);
  }

  const requiredItem: Array<[RegExp, string]> = [
    [/dishwasher/i, 'DISHWASHER'],
    [/dryer/i, 'DRYER'],
    [/(refrigerator|fridge)/i, 'REFRIGERATOR'],
  ];
  for (const [pattern, itemType] of requiredItem) {
    if (!pattern.test(template.key)) continue;
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (installed?.includes(itemType)) return null;
    return missingDecision(facts, 'INSTALLED_ITEM_PRESENCE_UNKNOWN');
  }

  if (/^hvac_filter/i.test(template.key)) {
    const heating = facts.read<string>('systems.heatingType');
    const cooling = facts.read<string>('systems.coolingType');
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (heating || cooling || installed?.some((type) => ['HVAC', 'FURNACE', 'AIR_CONDITIONER'].includes(type))) {
      return null;
    }
    return missingDecision(facts, 'HVAC_PRESENCE_UNKNOWN');
  }
  return null;
}

function evaluateResponsibility(
  facts: DecisionFacts,
  template: HabitTemplatePolicyInput,
): FeatureDecision | null {
  const key = responsibilityByCategory[template.category];
  if (!key) return null;
  const party = facts.read<string>(key);
  if (party === undefined || party === 'UNKNOWN') return missingDecision(facts, 'RESPONSIBILITY_UNKNOWN');
  if (party === 'ASSOCIATION') return facts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
  if (party === 'LANDLORD') return facts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
  return null;
}

export function evaluateHabitTemplateApplicability(
  context: PropertyContextSnapshot,
  template: HabitTemplatePolicyInput,
  now: Date = new Date(),
): FeatureDecision {
  const facts = new DecisionFacts(context);
  const rules = template.targetingRulesJson ?? {};
  let decision = evaluateTemporalAndLocationRules(facts, rules, now);
  if (decision) return decision;
  decision = evaluateAgeAndDwellingRules(facts, rules, now);
  if (decision) return decision;
  decision = evaluateBooleanRules(facts, rules);
  if (decision) return decision;
  decision = evaluateEnumRule(facts, 'systems.heatingType', rules.requiredHeatingTypes, 'HEATING_TYPE');
  if (decision) return decision;
  if (rules.excludedHeatingTypes?.length) {
    const value = facts.read<string>('systems.heatingType');
    if (value === undefined) return missingDecision(facts, 'HEATING_TYPE_UNKNOWN');
    if (rules.excludedHeatingTypes.includes(value as never)) {
      return facts.decision('NOT_APPLICABLE', ['HEATING_TYPE_EXCLUDED']);
    }
  }
  decision = evaluateEnumRule(facts, 'systems.coolingType', rules.requiredCoolingTypes, 'COOLING_TYPE');
  if (decision) return decision;
  decision = evaluateEnumRule(facts, 'systems.waterHeaterType', rules.requiredWaterHeaterTypes, 'WATER_HEATER_TYPE');
  if (decision) return decision;
  decision = evaluateEnumRule(facts, 'structure.roofType', rules.requiredRoofTypes, 'ROOF_TYPE');
  if (decision) return decision;
  decision = evaluateTemplatePresence(facts, template);
  if (decision) return decision;
  decision = evaluateResponsibility(facts, template);
  if (decision) return decision;
  return facts.decision('APPLICABLE', ['PROPERTY_CONTEXT_MATCH']);
}

function knownValue<T>(context: PropertyContextSnapshot, key: string): T | null {
  const fact = context.facts[key] as PropertyFact<T> | undefined;
  return fact?.state === 'KNOWN' && fact.value !== null ? fact.value : null;
}

export function buildHabitEvaluationContext(
  context: PropertyContextSnapshot,
  now: Date = new Date(),
): PropertyEvalContext {
  const currentMonth = now.getMonth() + 1;
  return {
    propertyType: knownValue(context, 'core.dwellingType') as PropertyEvalContext['propertyType'],
    yearBuilt: knownValue(context, 'core.yearBuilt'),
    state: knownValue(context, 'location.state'),
    climateRegion: knownValue(context, 'location.climateRegion'),
    currentMonth,
    currentSeason: getCurrentSeason(currentMonth),
    heatingType: knownValue(context, 'systems.heatingType'),
    coolingType: knownValue(context, 'systems.coolingType'),
    waterHeaterType: knownValue(context, 'systems.waterHeaterType'),
    roofType: knownValue(context, 'structure.roofType'),
    hasSumpPump: knownValue(context, 'safety.hasSumpPumpBackup'),
    hasFireExtinguisher: knownValue(context, 'safety.hasFireExtinguisher'),
    hasSmokeDetectors: knownValue(context, 'safety.hasSmokeDetectors'),
    hasCoDetectors: knownValue(context, 'safety.hasCoDetectors'),
    hasSecuritySystem: knownValue(context, 'safety.hasSecuritySystem'),
    hasIrrigation: knownValue(context, 'exterior.hasIrrigation'),
    hasDrainageIssues: knownValue(context, 'exterior.hasDrainageIssues'),
  };
}
