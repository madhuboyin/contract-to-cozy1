// apps/backend/src/services/homeHabitCoach/habitRuleEvaluator.ts
//
// Deterministic rule evaluator for HabitTemplate.targetingRulesJson.
//
// Targeting rule fields (all optional; absent = constraint not applied):
//
//   propertyTypes?:          PropertyType[]       - matches if property.propertyType is in list
//   seasons?:                Season[]             - matches if current season is in list
//   months?:                 number[]             - 1–12, matches if current month is in list
//   climateRegions?:         ClimateRegion[]      - matches if property climate region is in list
//   states?:                 string[]             - 2-letter codes (case-insensitive)
//   minHomeAgeYears?:        number               - yearBuilt must be at least this many years ago
//   maxHomeAgeYears?:        number               - yearBuilt must be at most this many years ago
//   requiredFlags?:          PropertyContextFlag[] - property boolean flags that MUST be true
//   excludedFlags?:          PropertyContextFlag[] - property boolean flags that MUST NOT be true
//   requiredHeatingTypes?:   HeatingType[]        - matches if heatingType is in list
//   excludedHeatingTypes?:   HeatingType[]        - fails if heatingType is in list
//   requiredCoolingTypes?:   CoolingType[]        - matches if coolingType is in list
//   requiredWaterHeaterTypes?: WaterHeaterType[]  - matches if waterHeaterType is in list
//   requiredRoofTypes?:      RoofType[]           - matches if roofType is in list
//
// Unknown context (null/undefined) never blocks a match — habits degrade gracefully
// when property metadata is incomplete.

import type {
  ClimateRegion,
  CoolingType,
  HeatingType,
  PropertyType,
  RoofType,
  Season,
  WaterHeaterType,
} from '@prisma/client';

export type PropertyContextFlag =
  | 'hasSumpPump'
  | 'hasFireExtinguisher'
  | 'hasSmokeDetectors'
  | 'hasCoDetectors'
  | 'hasSecuritySystem'
  | 'hasIrrigation'
  | 'hasDrainageIssues';

export interface HabitTargetingRules {
  propertyTypes?: PropertyType[];
  seasons?: Season[];
  months?: number[];
  climateRegions?: ClimateRegion[];
  states?: string[];
  minHomeAgeYears?: number | null;
  maxHomeAgeYears?: number | null;
  requiredFlags?: PropertyContextFlag[];
  excludedFlags?: PropertyContextFlag[];
  requiredHeatingTypes?: HeatingType[];
  excludedHeatingTypes?: HeatingType[];
  requiredCoolingTypes?: CoolingType[];
  requiredWaterHeaterTypes?: WaterHeaterType[];
  requiredRoofTypes?: RoofType[];
}

export interface PropertyEvalContext {
  propertyType?: PropertyType | null;
  yearBuilt?: number | null;
  state?: string | null;
  climateRegion?: ClimateRegion | null;
  currentMonth: number; // 1–12
  currentSeason: Season;
  heatingType?: HeatingType | null;
  coolingType?: CoolingType | null;
  waterHeaterType?: WaterHeaterType | null;
  roofType?: RoofType | null;
  hasSumpPump?: boolean | null;
  hasFireExtinguisher?: boolean | null;
  hasSmokeDetectors?: boolean | null;
  hasCoDetectors?: boolean | null;
  hasSecuritySystem?: boolean | null;
  hasIrrigation?: boolean | null;
  hasDrainageIssues?: boolean | null;
}

export interface EvalResult {
  matches: boolean;
  matchedConditions: string[];
  failedConditions: string[];
  isFallback: boolean; // true when no rules were specified (general-purpose template)
}

export function getCurrentSeason(month: number): Season {
  if (month === 12 || month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

export function getHomeAgeYears(yearBuilt?: number | null): number | null {
  if (!yearBuilt) return null;
  return new Date().getFullYear() - yearBuilt;
}

export function evaluateTargetingRules(
  rules: HabitTargetingRules | null | undefined,
  ctx: PropertyEvalContext,
): EvalResult {
  const matched: string[] = [];
  const failed: string[] = [];

  // No rules → general-purpose, matches everything
  if (!rules || Object.keys(rules).length === 0) {
    return { matches: true, matchedConditions: [], failedConditions: [], isFallback: true };
  }

  // Helper: fail fast
  const fail = (reason: string): EvalResult => {
    failed.push(reason);
    return { matches: false, matchedConditions: matched, failedConditions: failed, isFallback: false };
  };

  // Property type
  if (rules.propertyTypes?.length) {
    if (ctx.propertyType) {
      if (rules.propertyTypes.includes(ctx.propertyType)) {
        matched.push(`propertyType:${ctx.propertyType}`);
      } else {
        return fail(`propertyType:${ctx.propertyType} not in [${rules.propertyTypes.join(',')}]`);
      }
    }
    // null/undefined propertyType → skip constraint silently
  }

  // Season
  if (rules.seasons?.length) {
    if (rules.seasons.includes(ctx.currentSeason)) {
      matched.push(`season:${ctx.currentSeason}`);
    } else {
      return fail(`season:${ctx.currentSeason} not in [${rules.seasons.join(',')}]`);
    }
  }

  // Month
  if (rules.months?.length) {
    if (rules.months.includes(ctx.currentMonth)) {
      matched.push(`month:${ctx.currentMonth}`);
    } else {
      return fail(`month:${ctx.currentMonth} not in [${rules.months.join(',')}]`);
    }
  }

  // Climate region
  if (rules.climateRegions?.length) {
    if (ctx.climateRegion) {
      if (rules.climateRegions.includes(ctx.climateRegion)) {
        matched.push(`climateRegion:${ctx.climateRegion}`);
      } else {
        return fail(`climateRegion:${ctx.climateRegion} not in [${rules.climateRegions.join(',')}]`);
      }
    }
  }

  // State (case-insensitive)
  if (rules.states?.length) {
    if (ctx.state) {
      const upperState = ctx.state.toUpperCase();
      const upperStates = rules.states.map((s) => s.toUpperCase());
      if (upperStates.includes(upperState)) {
        matched.push(`state:${upperState}`);
      } else {
        return fail(`state:${upperState} not in [${upperStates.join(',')}]`);
      }
    }
  }

  // Home age
  const ageYears = getHomeAgeYears(ctx.yearBuilt);
  if (rules.minHomeAgeYears != null && ageYears != null) {
    if (ageYears >= rules.minHomeAgeYears) {
      matched.push(`homeAge:${ageYears}>=${rules.minHomeAgeYears}`);
    } else {
      return fail(`homeAge:${ageYears}<${rules.minHomeAgeYears}`);
    }
  }
  if (rules.maxHomeAgeYears != null && ageYears != null) {
    if (ageYears <= rules.maxHomeAgeYears) {
      matched.push(`homeAge:${ageYears}<=${rules.maxHomeAgeYears}`);
    } else {
      return fail(`homeAge:${ageYears}>${rules.maxHomeAgeYears}`);
    }
  }

  // Required flags (missing/null = skip constraint)
  if (rules.requiredFlags?.length) {
    for (const flag of rules.requiredFlags) {
      const val = ctx[flag as keyof PropertyEvalContext];
      if (val === true) {
        matched.push(`flag:${flag}=true`);
      } else if (val === false) {
        return fail(`flag:${flag} required but is false`);
      }
      // null/undefined → unknown, do not block
    }
  }

  // Excluded flags
  if (rules.excludedFlags?.length) {
    for (const flag of rules.excludedFlags) {
      const val = ctx[flag as keyof PropertyEvalContext];
      if (val === true) {
        return fail(`flag:${flag} must not be present`);
      }
    }
  }

  // Heating type
  if (rules.requiredHeatingTypes?.length) {
    if (ctx.heatingType) {
      if (rules.requiredHeatingTypes.includes(ctx.heatingType)) {
        matched.push(`heatingType:${ctx.heatingType}`);
      } else {
        return fail(`heatingType:${ctx.heatingType} not in required list`);
      }
    }
  }
  if (rules.excludedHeatingTypes?.length && ctx.heatingType) {
    if (rules.excludedHeatingTypes.includes(ctx.heatingType)) {
      return fail(`heatingType:${ctx.heatingType} is excluded`);
    }
  }

  // Cooling type
  if (rules.requiredCoolingTypes?.length) {
    if (ctx.coolingType) {
      if (rules.requiredCoolingTypes.includes(ctx.coolingType)) {
        matched.push(`coolingType:${ctx.coolingType}`);
      } else {
        return fail(`coolingType:${ctx.coolingType} not in required list`);
      }
    }
  }

  // Water heater type
  if (rules.requiredWaterHeaterTypes?.length) {
    if (ctx.waterHeaterType) {
      if (rules.requiredWaterHeaterTypes.includes(ctx.waterHeaterType)) {
        matched.push(`waterHeaterType:${ctx.waterHeaterType}`);
      } else {
        return fail(`waterHeaterType:${ctx.waterHeaterType} not in required list`);
      }
    }
  }

  // Roof type
  if (rules.requiredRoofTypes?.length) {
    if (ctx.roofType) {
      if (rules.requiredRoofTypes.includes(ctx.roofType)) {
        matched.push(`roofType:${ctx.roofType}`);
      } else {
        return fail(`roofType:${ctx.roofType} not in required list`);
      }
    }
  }

  return { matches: true, matchedConditions: matched, failedConditions: [], isFallback: false };
}
