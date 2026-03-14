import { HomeRiskEventSeverity, HomeRiskEventType, HomeRiskReplayWindowType } from '@prisma/client';

export const HOME_RISK_REPLAY_ENGINE_VERSION = 'home-risk-replay-mvp-v1';

type JsonRecord = Record<string, unknown>;

type DriverEffect = 'increase' | 'decrease' | 'neutral';
type ActionPriority = 'high' | 'medium' | 'low';
type SystemRelevance = 'high' | 'medium' | 'low';

export interface ReplayWindow {
  windowType: HomeRiskReplayWindowType;
  windowStart: Date;
  windowEnd: Date;
  usedYearBuiltFallback: boolean;
}

export interface ReplayImpactDriver {
  code: string;
  effect: DriverEffect;
  description: string;
}

export interface ReplayRecommendedAction {
  code: string;
  label: string;
  priority: ActionPriority;
}

export interface ReplayMatchedSystem {
  type: string;
  id: string | null;
  label: string;
  relevance: SystemRelevance;
}

export interface ReplayPropertySystemContext {
  type: string;
  id: string | null;
  label: string;
  installationYear: number | null;
}

export interface ReplayPropertyContext {
  propertyId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string | null;
  propertyType: string | null;
  squareFootage: number | null;
  yearBuilt: number | null;
  foundationType: string | null;
  hasIrrigation: boolean | null;
  hasDrainageIssues: boolean | null;
  hasSumpPumpBackup: boolean | null;
  hasSecondaryHeat: boolean | null;
  electricalPanelAge: number | null;
  primaryHeatingFuel: string | null;
  heatingType: string | null;
  coolingType: string | null;
  waterHeaterType: string | null;
  roofType: string | null;
  hvacInstallYear: number | null;
  waterHeaterInstallYear: number | null;
  roofReplacementYear: number | null;
  systems: {
    roof: ReplayPropertySystemContext | null;
    hvac: ReplayPropertySystemContext | null;
    plumbing: ReplayPropertySystemContext | null;
    electrical: ReplayPropertySystemContext | null;
    basement: ReplayPropertySystemContext | null;
    drainage: ReplayPropertySystemContext | null;
  };
}

export interface ReplayCandidateEvent {
  id: string;
  eventType: HomeRiskEventType;
  eventSubType: string | null;
  title: string;
  summary: string | null;
  severity: HomeRiskEventSeverity;
  startAt: Date;
  endAt: Date | null;
  locationType: string;
  locationKey: string;
  geoJson: unknown;
  payloadJson: unknown;
}

export interface ReplayLocationMatch {
  applies: boolean;
  score: number;
  basis: string;
}

export interface ReplayEventMatchResult {
  matchScore: number;
  impactLevel: HomeRiskEventSeverity;
  impactSummary: string;
  impactFactorsJson: JsonRecord;
  recommendedActionsJson: JsonRecord;
  matchedSystemsJson: JsonRecord;
}

const SEVERITY_BASE_SCORE: Record<HomeRiskEventSeverity, number> = {
  info: 0.16,
  low: 0.3,
  moderate: 0.52,
  high: 0.72,
  severe: 0.88,
};

const PRIORITY_WEIGHT: Record<ActionPriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const RELEVANCE_WEIGHT: Record<SystemRelevance, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function clamp(value: number, min = 0.05, max = 0.99): number {
  return Math.min(Math.max(value, min), max);
}

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toDays(startAt: Date, endAt: Date | null): number {
  const end = endAt ?? startAt;
  const diffMs = Math.max(0, end.getTime() - startAt.getTime());
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function ageFromYears(installYear: number | null, fallbackYear: number | null, currentYear: number): number | null {
  if (installYear) return Math.max(0, currentYear - installYear);
  if (fallbackYear) return Math.max(0, currentYear - fallbackYear);
  return null;
}

function roofAge(context: ReplayPropertyContext, currentYear: number): number | null {
  return ageFromYears(context.roofReplacementYear, context.yearBuilt, currentYear);
}

function hvacAge(context: ReplayPropertyContext, currentYear: number): number | null {
  return ageFromYears(context.hvacInstallYear, context.yearBuilt, currentYear);
}

function plumbingAge(context: ReplayPropertyContext, currentYear: number): number | null {
  return ageFromYears(context.waterHeaterInstallYear, context.yearBuilt, currentYear);
}

function electricalAge(context: ReplayPropertyContext, currentYear: number): number | null {
  if (context.electricalPanelAge !== null && context.electricalPanelAge !== undefined) {
    return Math.max(0, context.electricalPanelAge);
  }
  return ageFromYears(null, context.yearBuilt, currentYear);
}

function dedupeActions(actions: ReplayRecommendedAction[]): ReplayRecommendedAction[] {
  const map = new Map<string, ReplayRecommendedAction>();
  for (const action of actions) {
    const existing = map.get(action.code);
    if (!existing || PRIORITY_WEIGHT[action.priority] > PRIORITY_WEIGHT[existing.priority]) {
      map.set(action.code, action);
    }
  }

  return Array.from(map.values()).sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
}

function dedupeSystems(systems: ReplayMatchedSystem[]): ReplayMatchedSystem[] {
  const map = new Map<string, ReplayMatchedSystem>();
  for (const system of systems) {
    const key = `${system.type}:${system.id ?? 'none'}`;
    const existing = map.get(key);
    if (!existing || RELEVANCE_WEIGHT[system.relevance] > RELEVANCE_WEIGHT[existing.relevance]) {
      map.set(key, system);
    }
  }

  return Array.from(map.values()).sort((a, b) => RELEVANCE_WEIGHT[b.relevance] - RELEVANCE_WEIGHT[a.relevance]);
}

function makeSystem(
  context: ReplayPropertyContext,
  type: keyof ReplayPropertyContext['systems'],
  relevance: SystemRelevance,
  fallbackLabel: string,
): ReplayMatchedSystem {
  const existing = context.systems[type];
  return {
    type,
    id: existing?.id ?? null,
    label: existing?.label ?? fallbackLabel,
    relevance,
  };
}

function scoreToImpactLevel(score: number): HomeRiskEventSeverity {
  if (score < 0.26) return HomeRiskEventSeverity.info;
  if (score < 0.46) return HomeRiskEventSeverity.low;
  if (score < 0.68) return HomeRiskEventSeverity.moderate;
  if (score < 0.86) return HomeRiskEventSeverity.high;
  return HomeRiskEventSeverity.severe;
}

function baseDrivers(event: ReplayCandidateEvent, locationMatch: ReplayLocationMatch): ReplayImpactDriver[] {
  return [
    {
      code: `LOCATION_${locationMatch.basis.toUpperCase()}`,
      effect: 'neutral',
      description: `Matched using ${locationMatch.basis.replace(/_/g, ' ')} location context.`,
    },
    {
      code: `EVENT_SEVERITY_${event.severity.toUpperCase()}`,
      effect: 'neutral',
      description: `Historical event severity recorded as ${event.severity}.`,
    },
  ];
}

function severitySummary(level: HomeRiskEventSeverity): string {
  if (level === HomeRiskEventSeverity.severe) return 'severe';
  if (level === HomeRiskEventSeverity.high) return 'high';
  if (level === HomeRiskEventSeverity.moderate) return 'moderate';
  if (level === HomeRiskEventSeverity.low) return 'low';
  return 'light';
}

function computeHailImpact(
  context: ReplayPropertyContext,
  baseScore: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'INSPECT_ROOF', label: 'Inspect roof shingles, flashing, and vents for hail damage', priority: 'high' },
    { code: 'CHECK_GUTTERS', label: 'Clear gutters and downspouts of hail debris', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'roof', 'high', 'Roof system')];

  const age = roofAge(context, currentYear);
  if (age !== null && age >= 15) {
    score += 0.16;
    drivers.push({
      code: 'OLDER_ROOF',
      effect: 'increase',
      description: `Roof is approximately ${age} years old, which increases hail vulnerability.`,
    });
  } else if (age !== null && age >= 8) {
    score += 0.06;
    drivers.push({
      code: 'MIDLIFE_ROOF',
      effect: 'increase',
      description: `Roof age around ${age} years suggests a moderate sensitivity to hail impact.`,
    });
  }

  if (normalize(context.propertyType).includes('manufactured') || normalize(context.propertyType).includes('mobile')) {
    score += 0.05;
    drivers.push({
      code: 'LIGHTWEIGHT_ENVELOPE',
      effect: 'increase',
      description: 'Lightweight exterior systems can increase sensitivity to repeated hail strikes.',
    });
  }

  const summary = age !== null && age >= 15
    ? 'Historical hail exposure likely stressed the roof because the roof age at replay time suggests a more fragile shingle surface.'
    : 'Historical hail exposure likely centered on the roof, gutters, and other exterior surfaces.';

  return { score, summary, drivers, actions, systems };
}

function computeFreezeImpact(
  context: ReplayPropertyContext,
  baseScore: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'PROTECT_PIPES', label: 'Insulate exposed pipes and winterize outdoor hose bibs', priority: 'high' },
    { code: 'CHECK_SHUTOFFS', label: 'Confirm water shutoff valves are accessible and working', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'plumbing', 'high', 'Plumbing system')];

  const age = plumbingAge(context, currentYear);
  if (age !== null && age >= 20) {
    score += 0.12;
    drivers.push({
      code: 'OLDER_PLUMBING_CONTEXT',
      effect: 'increase',
      description: `Water-related systems appear older (${age} years context), which raises freeze sensitivity.`,
    });
  }

  if (context.hasIrrigation) {
    score += 0.08;
    drivers.push({
      code: 'IRRIGATION_PRESENT',
      effect: 'increase',
      description: 'Irrigation and other exterior water lines can increase freeze exposure.',
    });
    actions.push({ code: 'WINTERIZE_IRRIGATION', label: 'Drain and winterize irrigation or exterior plumbing', priority: 'high' });
  }

  if (context.hasSecondaryHeat === false) {
    score += 0.07;
    drivers.push({
      code: 'NO_SECONDARY_HEAT',
      effect: 'increase',
      description: 'No secondary heat source recorded, so cold-weather outages would be harder to absorb.',
    });
  }

  if (context.foundationType && normalize(context.foundationType).includes('crawl')) {
    score += 0.05;
    drivers.push({
      code: 'CRAWLSPACE_EXPOSURE',
      effect: 'increase',
      description: 'Crawlspace conditions can leave more pipes exposed during deep freezes.',
    });
  }

  const hvacYears = hvacAge(context, currentYear);
  if (hvacYears !== null && hvacYears >= 15) {
    score += 0.07;
    drivers.push({
      code: 'AGING_HEAT_SYSTEM',
      effect: 'increase',
      description: `Heating/cooling equipment age around ${hvacYears} years suggests lower freeze resilience.`,
    });
    systems.push(makeSystem(context, 'hvac', 'medium', 'HVAC system'));
    actions.push({ code: 'SERVICE_HEATING', label: 'Service the heating system before deep cold returns', priority: 'medium' });
  }

  return {
    score,
    summary: 'Historical freeze exposure likely stressed plumbing, exterior water lines, and any cold-sensitive mechanical systems.',
    drivers,
    actions,
    systems,
  };
}

function computeWaterImpact(
  event: ReplayCandidateEvent,
  context: ReplayPropertyContext,
  baseScore: number,
  durationDays: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'CLEAR_DRAINS', label: 'Clear drains, gutters, and downspouts ahead of similar storms', priority: 'high' },
    { code: 'CHECK_LOW_SPOTS', label: 'Inspect basement or low-lying areas for signs of water entry', priority: 'high' },
  ];
  const systems: ReplayMatchedSystem[] = [
    makeSystem(context, 'drainage', 'high', 'Drainage system'),
    makeSystem(context, 'basement', 'medium', 'Below-grade spaces'),
  ];

  if (context.hasDrainageIssues) {
    score += 0.16;
    drivers.push({
      code: 'KNOWN_DRAINAGE_ISSUES',
      effect: 'increase',
      description: 'Known drainage issues make heavy rain and flood events more meaningful for this property.',
    });
  }

  if (context.hasSumpPumpBackup === false) {
    score += 0.1;
    drivers.push({
      code: 'NO_SUMP_BACKUP',
      effect: 'increase',
      description: 'No sump pump backup is recorded, which raises risk during water events and outages.',
    });
    actions.push({ code: 'TEST_SUMP_BACKUP', label: 'Test the sump pump and consider adding battery backup', priority: 'high' });
  }

  if (context.foundationType) {
    const foundation = normalize(context.foundationType);
    if (foundation.includes('basement') || foundation.includes('crawl')) {
      score += 0.08;
      drivers.push({
        code: 'BELOW_GRADE_FOUNDATION',
        effect: 'increase',
        description: 'Below-grade living or utility space can increase sensitivity to water intrusion.',
      });
      systems.push(makeSystem(context, 'plumbing', 'medium', 'Water systems'));
    }
  }

  if (durationDays >= 3) {
    score += 0.05;
    drivers.push({
      code: 'MULTI_DAY_PRECIP',
      effect: 'increase',
      description: `Event lasted about ${durationDays} day(s), increasing cumulative water pressure on the property.`,
    });
  }

  if (context.yearBuilt !== null && currentYear - context.yearBuilt >= 40) {
    score += 0.05;
    drivers.push({
      code: 'OLDER_BUILDING_ENVELOPE',
      effect: 'increase',
      description: 'Older construction can make repeated water-stress events more meaningful.',
    });
  }

  const summary = event.eventType === HomeRiskEventType.flood_risk
    ? 'Historical flood-risk conditions likely mattered most around drainage, basement, and foundation-sensitive areas.'
    : 'Historical heavy-rain exposure likely stressed drainage paths, gutters, and other water-sensitive areas.';

  return { score, summary, drivers, actions, systems };
}

function computeHeatImpact(
  context: ReplayPropertyContext,
  baseScore: number,
  durationDays: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'SERVICE_HVAC', label: 'Service HVAC and replace filters before the next heat wave', priority: 'high' },
    { code: 'CHECK_ATTIC_HEAT', label: 'Inspect attic insulation and ventilation to reduce heat load', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'hvac', 'high', 'HVAC system')];

  const age = hvacAge(context, currentYear);
  if (!context.coolingType) {
    score += 0.14;
    drivers.push({
      code: 'NO_COOLING_CONTEXT',
      effect: 'increase',
      description: 'No cooling system is recorded, increasing discomfort and equipment strain during heat events.',
    });
  } else if (age !== null && age >= 12) {
    score += 0.11;
    drivers.push({
      code: 'AGING_HVAC',
      effect: 'increase',
      description: `Cooling equipment age around ${age} years suggests lower resilience in prolonged heat.`,
    });
  }

  if (durationDays >= 4) {
    score += 0.06;
    drivers.push({
      code: 'LONG_DURATION_HEAT',
      effect: 'increase',
      description: `Heat event lasted about ${durationDays} day(s), increasing sustained strain on cooling systems.`,
    });
  }

  if (context.squareFootage !== null && context.squareFootage >= 3000) {
    score += 0.03;
    drivers.push({
      code: 'LARGER_COOLING_LOAD',
      effect: 'increase',
      description: 'Larger homes can place more load on cooling systems during extended heat waves.',
    });
  }

  return {
    score,
    summary: 'Historical heat exposure likely centered on cooling-system strain, filtration load, and indoor comfort resilience.',
    drivers,
    actions,
    systems,
  };
}

function computeWindImpact(
  context: ReplayPropertyContext,
  baseScore: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'CHECK_SHINGLES', label: 'Inspect shingles, flashing, and roof edges after strong wind events', priority: 'high' },
    { code: 'SECURE_OUTDOOR_ITEMS', label: 'Secure fencing, furniture, and loose exterior items', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'roof', 'high', 'Roof system')];

  const age = roofAge(context, currentYear);
  if (age !== null && age >= 15) {
    score += 0.12;
    drivers.push({
      code: 'OLDER_ROOF',
      effect: 'increase',
      description: `Roof age around ${age} years can increase wind uplift and shingle-loss sensitivity.`,
    });
  }

  return {
    score,
    summary: 'Historical wind exposure likely mattered most for the roof, exterior envelope, and loose exterior elements.',
    drivers,
    actions,
    systems,
  };
}

function computeSmokeImpact(
  event: ReplayCandidateEvent,
  context: ReplayPropertyContext,
  baseScore: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = Math.max(0.18, baseScore - 0.08);
  const drivers: ReplayImpactDriver[] = [
    {
      code: 'AIR_QUALITY_EXPOSURE',
      effect: 'neutral',
      description: 'Smoke and air-quality events are usually lower structural risk but still meaningful for filtration load and interior conditions.',
    },
  ];
  const actions: ReplayRecommendedAction[] = [
    { code: 'REPLACE_FILTERS', label: 'Replace HVAC filters after smoke-heavy periods', priority: 'high' },
    { code: 'USE_RECIRCULATE', label: 'Use recirculate mode and keep windows closed during smoke events', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'hvac', 'medium', 'HVAC filtration')];

  if (!context.coolingType && !context.heatingType) {
    score -= 0.02;
    drivers.push({
      code: 'LIMITED_MECHANICAL_CONTEXT',
      effect: 'decrease',
      description: 'Mechanical system context is sparse, so replay keeps smoke impacts measured and conservative.',
    });
  }

  const summary = event.eventType === HomeRiskEventType.wildfire_smoke
    ? 'Historical wildfire-smoke exposure was likely more about filtration load and indoor air management than direct structural damage.'
    : 'Historical air-quality exposure likely mattered most for HVAC filtration and indoor air handling.';

  return { score, summary, drivers, actions, systems };
}

function computePowerImpact(
  event: ReplayCandidateEvent,
  context: ReplayPropertyContext,
  baseScore: number,
  currentYear: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = baseScore;
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'SURGE_PROTECTION', label: 'Use surge protection for sensitive electronics and appliances', priority: 'high' },
    { code: 'CHECK_BACKUP_POWER', label: 'Review backup power for critical systems like sump pumps and refrigeration', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'electrical', 'high', 'Electrical system')];

  const age = electricalAge(context, currentYear);
  if (age !== null && age >= 25) {
    score += 0.08;
    drivers.push({
      code: 'OLDER_ELECTRICAL_CONTEXT',
      effect: 'increase',
      description: `Electrical panel age around ${age} years suggests more sensitivity to outage and surge history.`,
    });
  }

  if (context.hasSumpPumpBackup === false) {
    score += 0.07;
    drivers.push({
      code: 'CRITICAL_PUMP_DEPENDENCY',
      effect: 'increase',
      description: 'No sump pump backup is recorded, so outage history can have broader water-risk implications.',
    });
    systems.push(makeSystem(context, 'drainage', 'medium', 'Drainage and sump systems'));
  }

  if (event.eventType === HomeRiskEventType.power_outage && context.hasSecondaryHeat === false) {
    score += 0.05;
    drivers.push({
      code: 'NO_SECONDARY_HEAT',
      effect: 'increase',
      description: 'No secondary heat source is recorded, which can magnify the impact of outage history.',
    });
  }

  return {
    score,
    summary: 'Historical utility interruptions likely mattered most for electrical resilience and any systems that depend on steady power.',
    drivers,
    actions,
    systems,
  };
}

function computeDroughtImpact(
  context: ReplayPropertyContext,
  baseScore: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  let score = Math.max(0.18, baseScore - 0.05);
  const drivers: ReplayImpactDriver[] = [];
  const actions: ReplayRecommendedAction[] = [
    { code: 'CHECK_IRRIGATION_EFFICIENCY', label: 'Inspect irrigation coverage and repair leaks before drought periods', priority: 'medium' },
    { code: 'MONITOR_FOUNDATION', label: 'Monitor foundation and exterior soils for movement or cracking', priority: 'medium' },
  ];
  const systems: ReplayMatchedSystem[] = [makeSystem(context, 'drainage', 'medium', 'Drainage and irrigation context')];

  if (context.hasIrrigation) {
    score += 0.06;
    drivers.push({
      code: 'IRRIGATION_DEPENDENCY',
      effect: 'increase',
      description: 'Irrigation systems can make drought history more relevant for operating cost and landscape stress.',
    });
  }

  return {
    score,
    summary: 'Historical drought exposure is tracked conservatively in MVP and mainly reflects irrigation and soil-stress context.',
    drivers,
    actions,
    systems,
  };
}

function computeGenericImpact(
  event: ReplayCandidateEvent,
  context: ReplayPropertyContext,
  baseScore: number,
): { score: number; summary: string; drivers: ReplayImpactDriver[]; actions: ReplayRecommendedAction[]; systems: ReplayMatchedSystem[] } {
  const systems: ReplayMatchedSystem[] = [
    makeSystem(context, 'roof', 'medium', 'Roof system'),
    makeSystem(context, 'hvac', 'low', 'HVAC system'),
  ];
  const actions: ReplayRecommendedAction[] = [
    { code: 'DOCUMENT_CONDITION', label: 'Document condition of major systems after notable weather events', priority: 'medium' },
  ];

  return {
    score: baseScore,
    summary: `${titleCase(event.eventType)} history was matched to this property using available location and system context.`,
    drivers: [],
    actions,
    systems,
  };
}

function readStringArray(source: unknown, key: string): string[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  const raw = (source as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveReplayWindow(
  windowType: HomeRiskReplayWindowType,
  propertyYearBuilt: number | null,
  rawWindowStart?: Date | null,
  rawWindowEnd?: Date | null,
  referenceDate: Date = new Date(),
): ReplayWindow {
  if (windowType === HomeRiskReplayWindowType.custom_range) {
    if (!rawWindowStart || !rawWindowEnd) {
      throw new Error('Custom range replay requires both windowStart and windowEnd.');
    }

    return {
      windowType,
      windowStart: rawWindowStart,
      windowEnd: rawWindowEnd,
      usedYearBuiltFallback: false,
    };
  }

  const endOfDay = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
    23,
    59,
    59,
    999,
  ));

  if (windowType === HomeRiskReplayWindowType.last_5_years) {
    return {
      windowType,
      windowStart: new Date(Date.UTC(endOfDay.getUTCFullYear() - 5, endOfDay.getUTCMonth(), endOfDay.getUTCDate(), 0, 0, 0, 0)),
      windowEnd: endOfDay,
      usedYearBuiltFallback: false,
    };
  }

  const fallbackYear = endOfDay.getUTCFullYear() - 20;
  const startYear = propertyYearBuilt && propertyYearBuilt >= 1850 ? propertyYearBuilt : fallbackYear;

  return {
    windowType,
    windowStart: new Date(Date.UTC(startYear, 0, 1, 0, 0, 0, 0)),
    windowEnd: endOfDay,
    usedYearBuiltFallback: propertyYearBuilt == null,
  };
}

export function evaluateLocationMatch(event: ReplayCandidateEvent, context: ReplayPropertyContext): ReplayLocationMatch {
  const locationType = normalize(event.locationType);
  const locationKey = normalize(event.locationKey);
  const city = normalize(context.city);
  const state = normalize(context.state);
  const zipCode = normalize(context.zipCode);
  const county = normalize(context.county);
  const cityStateVariants = new Set([
    city,
    normalize(`${context.city}, ${context.state}`),
    normalize(`${context.city} ${context.state}`),
  ]);

  if (locationType === 'property' && locationKey === normalize(context.propertyId)) {
    return { applies: true, score: 1, basis: 'property' };
  }

  if (locationType === 'zip' && locationKey === zipCode) {
    return { applies: true, score: 0.92, basis: 'zip' };
  }

  if (locationType === 'city' && cityStateVariants.has(locationKey)) {
    return { applies: true, score: 0.82, basis: 'city' };
  }

  if (locationType === 'county' && county && locationKey === county) {
    return { applies: true, score: 0.72, basis: 'county' };
  }

  if (locationType === 'state' && locationKey === state) {
    return { applies: true, score: 0.62, basis: 'state' };
  }

  if (locationType === 'polygon') {
    const zipMatchesPayload = [
      ...readStringArray(event.payloadJson, 'zipCodes'),
      ...readStringArray(event.payloadJson, 'zips'),
    ].some((zip) => normalize(zip) === zipCode);

    if (zipMatchesPayload) {
      return { applies: true, score: 0.88, basis: 'polygon_zip' };
    }

    const stateMatchesPayload = readStringArray(event.payloadJson, 'states').some((item) => normalize(item) === state);
    if (stateMatchesPayload) {
      return { applies: true, score: 0.58, basis: 'polygon_state' };
    }
  }

  return { applies: false, score: 0, basis: 'none' };
}

export function evaluateReplayEvent(event: ReplayCandidateEvent, context: ReplayPropertyContext): ReplayEventMatchResult | null {
  const locationMatch = evaluateLocationMatch(event, context);
  if (!locationMatch.applies) return null;

  const currentYear = new Date().getUTCFullYear();
  const durationDays = toDays(event.startAt, event.endAt);

  let score = SEVERITY_BASE_SCORE[event.severity];
  score += (locationMatch.score - 0.6) * 0.12;
  if (durationDays >= 3) score += 0.02;
  if (durationDays >= 7) score += 0.03;

  let drivers = baseDrivers(event, locationMatch);
  let actions: ReplayRecommendedAction[] = [];
  let systems: ReplayMatchedSystem[] = [];
  let summary = event.summary ?? `${titleCase(event.eventType)} history matched this property.`;

  if (event.eventType === HomeRiskEventType.hail) {
    const result = computeHailImpact(context, score, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.freeze) {
    const result = computeFreezeImpact(context, score, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.heavy_rain || event.eventType === HomeRiskEventType.flood_risk) {
    const result = computeWaterImpact(event, context, score, durationDays, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.heat_wave) {
    const result = computeHeatImpact(context, score, durationDays, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.wind) {
    const result = computeWindImpact(context, score, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.wildfire_smoke || event.eventType === HomeRiskEventType.air_quality) {
    const result = computeSmokeImpact(event, context, score);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.power_outage || event.eventType === HomeRiskEventType.power_surge_risk) {
    const result = computePowerImpact(event, context, score, currentYear);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else if (event.eventType === HomeRiskEventType.drought) {
    const result = computeDroughtImpact(context, score);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  } else {
    const result = computeGenericImpact(event, context, score);
    score = result.score;
    summary = result.summary;
    drivers = drivers.concat(result.drivers);
    actions = actions.concat(result.actions);
    systems = systems.concat(result.systems);
  }

  score = clamp(score);
  const impactLevel = scoreToImpactLevel(score);
  const dedupedActions = dedupeActions(actions);
  const dedupedSystems = dedupeSystems(systems);

  return {
    matchScore: Number(score.toFixed(4)),
    impactLevel,
    impactSummary: `${severitySummary(impactLevel)} impact replay: ${summary}`,
    impactFactorsJson: {
      event: {
        type: event.eventType,
        subType: event.eventSubType,
        severity: event.severity,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt ? event.endAt.toISOString() : null,
        durationDays,
      },
      property: {
        yearBuilt: context.yearBuilt,
        squareFootage: context.squareFootage,
        propertyType: context.propertyType,
      },
      locationMatch: {
        basis: locationMatch.basis,
        score: Number(locationMatch.score.toFixed(2)),
      },
      drivers,
    },
    recommendedActionsJson: {
      actions: dedupedActions,
    },
    matchedSystemsJson: {
      systems: dedupedSystems,
    },
  };
}
