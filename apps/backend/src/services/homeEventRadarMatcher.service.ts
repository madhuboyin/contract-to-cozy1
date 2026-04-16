// apps/backend/src/services/homeEventRadarMatcher.service.ts
//
// Deterministic rules-based matching + impact engine for Home Event Radar.
// No external provider integrations in this step.

import { prisma } from '../lib/prisma';
import { buildUnifiedEventEnvelope } from './eventSignalProjection.service';
import { signalService } from './signal.service';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertySnapshot {
  id: string;
  yearBuilt: number | null;
  roofType: string | null;
  roofReplacementYear: number | null;
  heatingType: string | null;
  coolingType: string | null;
  hvacInstallYear: number | null;
  waterHeaterType: string | null;
  waterHeaterInstallYear: number | null;
  hasIrrigation: boolean | null;
  hasDrainageIssues: boolean | null;
  hasSumpPumpBackup: boolean | null;
  primaryHeatingFuel: string | null;
  hasSecondaryHeat: boolean | null;
  foundationType: string | null;
  propertySize: number | null;
  propertyType: string | null;
  zipCode: string;
  city: string;
  state: string;
}

interface ImpactDriver {
  code: string;
  effect: 'increase' | 'decrease' | 'neutral';
  description: string;
}

interface RecommendedAction {
  code: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
}

interface MatchedSystem {
  type: string;
  relevance: 'high' | 'medium' | 'low';
}

// Return type for per-event computation helpers — includes raw arrays
// before they are packed into the JSON blob shape.
interface EventImpactPartial {
  matchScore?: number;
  impactSummary?: string;
  drivers?: ImpactDriver[];
  actions?: RecommendedAction[];
  systems?: MatchedSystem[];
}

interface ImpactResult {
  matchScore: number;
  impactLevel: string;
  impactSummary: string;
  impactFactorsJson: Record<string, unknown>;
  recommendedActionsJson: Record<string, unknown>;
  matchedSystemsJson: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_BASE_SCORE: Record<string, number> = {
  info: 0.15,
  low: 0.25,
  medium: 0.45,
  high: 0.65,
  critical: 0.85,
};

const PROPERTY_FIELDS_SELECT = {
  id: true,
  yearBuilt: true,
  roofType: true,
  roofReplacementYear: true,
  heatingType: true,
  coolingType: true,
  hvacInstallYear: true,
  waterHeaterType: true,
  waterHeaterInstallYear: true,
  hasIrrigation: true,
  hasDrainageIssues: true,
  hasSumpPumpBackup: true,
  primaryHeatingFuel: true,
  hasSecondaryHeat: true,
  foundationType: true,
  propertySize: true,
  propertyType: true,
  zipCode: true,
  city: true,
  state: true,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min = 0, max = 1): number {
  return Math.min(Math.max(n, min), max);
}

function scoreToImpactLevel(score: number): string {
  if (score < 0.25) return 'none';
  if (score < 0.45) return 'watch';
  if (score < 0.65) return 'moderate';
  return 'high';
}

function roofAgeFn(p: PropertySnapshot, currentYear: number): number | null {
  if (p.roofReplacementYear) return currentYear - p.roofReplacementYear;
  if (p.yearBuilt) return currentYear - p.yearBuilt;
  return null;
}

function hvacAgeFn(p: PropertySnapshot, currentYear: number): number | null {
  if (p.hvacInstallYear) return currentYear - p.hvacInstallYear;
  if (p.yearBuilt) return currentYear - p.yearBuilt;
  return null;
}

// ---------------------------------------------------------------------------
// Per-event-family impact helpers
// ---------------------------------------------------------------------------

function computeWeatherHail(p: PropertySnapshot, baseScore: number, currentYear: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [];
  const systems: MatchedSystem[] = [{ type: 'roof', relevance: 'high' }];

  const roofAge = roofAgeFn(p, currentYear);
  if (roofAge !== null && roofAge > 15) {
    score += 0.15;
    drivers.push({ code: 'OLDER_ROOF', effect: 'increase', description: `Roof is ~${roofAge} years old — increased hail damage risk.` });
    actions.push({ code: 'INSPECT_ROOF', label: 'Inspect roof shingles and flashing for hail damage', priority: 'high' });
  } else {
    actions.push({ code: 'INSPECT_ROOF', label: 'Check roof for hail damage', priority: 'medium' });
  }

  actions.push({ code: 'CHECK_GUTTERS', label: 'Clear gutters and downspouts of hail debris', priority: 'medium' });

  const impactSummary = roofAge && roofAge > 15
    ? `Hail event detected. Your older roof (~${roofAge} years) increases risk of shingle damage.`
    : 'Hail event detected in your area. Inspect roof and gutters for impact damage.';

  return { matchScore: clamp(score), impactSummary, drivers, actions, systems };
}

function computeWeatherFreeze(p: PropertySnapshot, baseScore: number, currentYear: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [];
  const systems: MatchedSystem[] = [{ type: 'plumbing', relevance: 'high' }];

  if (p.hasIrrigation) {
    score += 0.1;
    drivers.push({ code: 'FREEZE_EXPOSURE_IRRIGATION', effect: 'increase', description: 'Irrigation system may be vulnerable to freeze damage.' });
    actions.push({ code: 'SHUT_OFF_IRRIGATION', label: 'Shut off and drain irrigation system before freeze', priority: 'high' });
  }

  const whAge = p.waterHeaterInstallYear
    ? currentYear - p.waterHeaterInstallYear
    : p.yearBuilt ? currentYear - p.yearBuilt : null;

  if (p.waterHeaterType === 'TANK' && whAge !== null && whAge > 10) {
    score += 0.08;
    drivers.push({ code: 'AGING_TANK_WATER_HEATER', effect: 'increase', description: 'Tank water heater is older and more vulnerable to freeze damage.' });
    systems.push({ type: 'water_heater', relevance: 'medium' });
  }

  if (!p.hasSecondaryHeat) {
    score += 0.1;
    drivers.push({ code: 'NO_SECONDARY_HEAT', effect: 'increase', description: 'No secondary heat source — power outage during freeze is higher risk.' });
    actions.push({ code: 'PREPARE_BACKUP_HEAT', label: 'Prepare a backup heat source (space heater, fireplace)', priority: 'high' });
  }

  const hvacAge = hvacAgeFn(p, currentYear);
  if (hvacAge !== null && hvacAge > 15) {
    score += 0.08;
    drivers.push({ code: 'AGING_HVAC', effect: 'increase', description: `HVAC is ~${hvacAge} years old and may struggle in extreme cold.` });
    systems.push({ type: 'hvac', relevance: 'high' });
    actions.push({ code: 'SERVICE_HVAC', label: 'Have HVAC serviced and inspect heat exchanger', priority: 'medium' });
  } else {
    systems.push({ type: 'hvac', relevance: 'medium' });
  }

  actions.push({ code: 'PROTECT_PIPES', label: 'Insulate exposed pipes and let faucets drip during freeze', priority: 'high' });

  const impactSummary = p.hasIrrigation
    ? `Freeze event in your area. Drain your irrigation system and protect pipes.`
    : 'Freeze event detected. Protect pipes and ensure HVAC is functioning.';

  return { matchScore: clamp(score), impactSummary, drivers, actions, systems };
}

function computeWeatherHeatWave(p: PropertySnapshot, baseScore: number, currentYear: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [];
  const systems: MatchedSystem[] = [];

  const hvacAge = hvacAgeFn(p, currentYear);
  if (!p.coolingType || p.coolingType === 'UNKNOWN') {
    score += 0.15;
    drivers.push({ code: 'NO_COOLING_SYSTEM', effect: 'increase', description: 'No cooling system on record — heat wave poses higher risk.' });
    actions.push({ code: 'GET_COOLING', label: 'Consider portable AC units or fans for extreme heat', priority: 'high' });
  } else if (hvacAge !== null && hvacAge > 12) {
    score += 0.1;
    drivers.push({ code: 'AGING_HVAC', effect: 'increase', description: `HVAC is ~${hvacAge} years old — efficiency may be reduced in extreme heat.` });
    actions.push({ code: 'SERVICE_HVAC', label: 'Service HVAC before heat wave and replace air filters', priority: 'high' });
    systems.push({ type: 'hvac', relevance: 'high' });
  } else {
    systems.push({ type: 'hvac', relevance: 'medium' });
    actions.push({ code: 'CHECK_AIR_FILTERS', label: 'Replace HVAC air filters before heat wave', priority: 'medium' });
  }

  actions.push({ code: 'CHECK_ATTIC_INSULATION', label: 'Check attic insulation to reduce heat transfer', priority: 'low' });

  const impactSummary = hvacAge && hvacAge > 12
    ? `Heat wave alert. Your aging HVAC (~${hvacAge} years) may struggle — service recommended.`
    : 'Heat wave detected in your area. Ensure cooling systems are working and minimize heat gain.';

  return { matchScore: clamp(score), impactSummary, drivers, actions, systems };
}

function computeWeatherWind(p: PropertySnapshot, baseScore: number, currentYear: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [];
  const systems: MatchedSystem[] = [{ type: 'roof', relevance: 'high' }];

  const roofAge = roofAgeFn(p, currentYear);
  if (roofAge !== null && roofAge > 15) {
    score += 0.12;
    drivers.push({ code: 'OLDER_ROOF', effect: 'increase', description: `Roof is ~${roofAge} years old — shingles more prone to wind uplift.` });
    actions.push({ code: 'INSPECT_ROOF', label: 'Inspect roof for lifted or missing shingles after wind event', priority: 'high' });
  } else {
    actions.push({ code: 'INSPECT_ROOF', label: 'Check roof and gutters for wind damage', priority: 'medium' });
  }

  actions.push({ code: 'SECURE_OUTDOOR_ITEMS', label: 'Secure or bring in outdoor furniture and decorations', priority: 'high' });
  actions.push({ code: 'CHECK_FENCING', label: 'Inspect fencing and gates for wind damage', priority: 'low' });

  return {
    matchScore: clamp(score),
    impactSummary: 'High wind event detected. Secure outdoor items and inspect roof for damage.',
    drivers,
    actions,
    systems,
  };
}

function computeWeatherFloodRain(p: PropertySnapshot, baseScore: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [];
  const systems: MatchedSystem[] = [];

  if (p.hasDrainageIssues) {
    score += 0.15;
    drivers.push({ code: 'KNOWN_DRAINAGE_ISSUES', effect: 'increase', description: 'Property has known drainage issues — flood risk elevated.' });
    actions.push({ code: 'CLEAR_DRAINS', label: 'Clear all drains, gutters, and downspouts immediately', priority: 'high' });
    systems.push({ type: 'drainage', relevance: 'high' });
  }

  if (p.hasSumpPumpBackup === false) {
    score += 0.1;
    drivers.push({ code: 'NO_SUMP_BACKUP', effect: 'increase', description: 'No sump pump backup recorded — basement flood risk higher if power fails.' });
    actions.push({ code: 'INSPECT_SUMP_PUMP', label: 'Test sump pump and consider a battery backup', priority: 'high' });
    systems.push({ type: 'sump_pump', relevance: 'high' });
  }

  const ft = (p.foundationType ?? '').toUpperCase();
  if (ft.includes('BASEMENT') || ft.includes('CRAWL')) {
    score += 0.08;
    drivers.push({ code: 'BELOW_GRADE_FOUNDATION', effect: 'increase', description: 'Below-grade foundation increases flood water intrusion risk.' });
    systems.push({ type: 'foundation', relevance: 'medium' });
  }

  actions.push({ code: 'CHECK_GUTTERS', label: 'Clear gutters and extend downspouts away from foundation', priority: 'high' });
  actions.push({ code: 'MOVE_VALUABLES', label: 'Move valuables from basement or low-lying areas', priority: 'medium' });

  const impactSummary = p.hasDrainageIssues
    ? 'Heavy rain / flood risk event. Known drainage issues increase your property risk — take action now.'
    : 'Heavy rain or flood risk detected. Inspect gutters, drainage, and any low-lying areas.';

  return { matchScore: clamp(score), impactSummary, drivers, actions, systems };
}

function computeAirQualitySmoke(baseScore: number, eventType: string): EventImpactPartial {
  const actions: RecommendedAction[] = [
    { code: 'CHECK_AIR_FILTERS', label: 'Replace HVAC air filters — smoke can clog quickly', priority: 'high' },
    { code: 'SEAL_WINDOWS', label: 'Keep windows and doors closed; seal gaps if possible', priority: 'medium' },
    { code: 'USE_AIR_PURIFIER', label: 'Run HEPA air purifier indoors', priority: 'medium' },
  ];
  const systems: MatchedSystem[] = [{ type: 'hvac', relevance: 'medium' }];
  const impactSummary = eventType === 'wildfire_smoke'
    ? 'Wildfire smoke detected in your area. Run HVAC on recirculate and replace filters frequently.'
    : 'Poor air quality detected. Keep windows closed and check HVAC filters.';

  return { matchScore: clamp(baseScore + 0.05), impactSummary, drivers: [], actions, systems };
}

function computePowerSurgeRisk(baseScore: number): EventImpactPartial {
  return {
    matchScore: clamp(baseScore + 0.05),
    impactSummary: 'Power surge risk in your area. Protect electronics and sensitive appliances.',
    drivers: [],
    actions: [
      { code: 'CHECK_SURGE_PROTECTORS', label: 'Verify all electronics are on surge-protected power strips', priority: 'high' },
      { code: 'UNPLUG_APPLIANCES', label: 'Unplug sensitive appliances during storm if possible', priority: 'medium' },
    ],
    systems: [{ type: 'electrical', relevance: 'high' }],
  };
}

function computeInsuranceMarket(p: PropertySnapshot, baseScore: number, currentYear: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [
    { code: 'REVIEW_POLICY', label: 'Review your current insurance policy and coverage limits', priority: 'high' },
    { code: 'GET_QUOTES', label: 'Get competing quotes from 2–3 insurers', priority: 'high' },
  ];
  const systems: MatchedSystem[] = [{ type: 'insurance', relevance: 'high' }];

  const roofAge = roofAgeFn(p, currentYear);
  if (roofAge !== null && roofAge > 15) {
    score += 0.1;
    drivers.push({ code: 'OLDER_ROOF', effect: 'increase', description: 'Older roof may lead to coverage exclusions or higher premiums.' });
    actions.push({ code: 'DOCUMENT_ROOF', label: 'Get a roof inspection and document condition for insurer', priority: 'medium' });
  }

  if (p.hasDrainageIssues) {
    score += 0.08;
    drivers.push({ code: 'KNOWN_DRAINAGE_ISSUES', effect: 'increase', description: 'Known drainage issues may affect insurability.' });
  }

  return {
    matchScore: clamp(score),
    impactSummary: 'Insurance market conditions in your area are shifting. Review your coverage and compare rates.',
    drivers,
    actions,
    systems,
  };
}

function computeUtilityOutage(p: PropertySnapshot, baseScore: number): EventImpactPartial {
  let score = baseScore;
  const drivers: ImpactDriver[] = [];
  const actions: RecommendedAction[] = [
    { code: 'CHARGE_DEVICES', label: 'Charge phones, tablets, and backup batteries', priority: 'high' },
    { code: 'FOOD_SAFETY', label: 'Avoid opening refrigerator/freezer to preserve temperature', priority: 'medium' },
  ];
  const systems: MatchedSystem[] = [{ type: 'electrical', relevance: 'high' }];

  const fuel = (p.primaryHeatingFuel ?? '').toLowerCase();
  if (fuel === 'electric' || fuel === 'electricity') {
    score += 0.15;
    drivers.push({ code: 'ELECTRIC_DEPENDENT_HEATING', effect: 'increase', description: 'Primary heating is electric — outage directly affects home heating.' });
    actions.push({ code: 'PREPARE_BACKUP_HEAT', label: 'Prepare a backup heat source (space heater, fireplace)', priority: 'high' });
    systems.push({ type: 'hvac', relevance: 'high' });
  }

  if (!p.hasSecondaryHeat) {
    score += 0.08;
    drivers.push({ code: 'NO_SECONDARY_HEAT', effect: 'increase', description: 'No secondary heat source on record.' });
  }

  const impactSummary = fuel === 'electric' || fuel === 'electricity'
    ? 'Utility outage in your area. Your electric heating system will be affected — prepare a backup heat source.'
    : 'Utility outage detected in your area. Charge devices and check on critical systems.';

  return { matchScore: clamp(score), impactSummary, drivers, actions, systems };
}

function computeUtilityRateChange(baseScore: number): EventImpactPartial {
  return {
    matchScore: clamp(baseScore),
    impactSummary: 'A utility rate change has been detected in your area. Review your energy usage to manage costs.',
    drivers: [],
    actions: [
      { code: 'REVIEW_ENERGY_USAGE', label: 'Review your energy usage report and identify savings opportunities', priority: 'medium' },
      { code: 'COMPARE_PROVIDERS', label: 'Compare utility providers or consider a fixed-rate plan', priority: 'low' },
    ],
    systems: [],
  };
}

function computeTaxEvent(baseScore: number, eventType: string): EventImpactPartial {
  const impactSummary = eventType === 'tax_reassessment'
    ? 'A property tax reassessment is occurring in your area. Review your assessment value and understand your appeal options.'
    : 'A tax rate change has been detected in your area. Update your homeownership budget accordingly.';

  return {
    matchScore: clamp(baseScore),
    impactSummary,
    drivers: [],
    actions: [
      { code: 'REVIEW_ASSESSMENT', label: 'Review the new tax assessment for accuracy', priority: 'high' },
      { code: 'PREPARE_APPEAL', label: 'Gather comparable sales data if you plan to appeal', priority: 'medium' },
      { code: 'UPDATE_BUDGET', label: 'Update your annual budget to reflect new tax obligations', priority: 'medium' },
    ],
    systems: [],
  };
}

function computeGeneric(baseScore: number, eventType: string): EventImpactPartial {
  return {
    matchScore: clamp(baseScore),
    impactSummary: `A ${eventType.replace(/_/g, ' ')} event has been detected in your area. Monitor local conditions.`,
    drivers: [],
    actions: [
      { code: 'MONITOR_SITUATION', label: `Monitor local updates for this ${eventType.replace(/_/g, ' ')} event`, priority: 'medium' },
    ],
    systems: [],
  };
}

// ---------------------------------------------------------------------------
// Impact computation dispatcher
// ---------------------------------------------------------------------------

function computeImpact(event: any, property: PropertySnapshot): ImpactResult {
  const currentYear = new Date().getFullYear();
  const eventType: string = String(event.eventType);
  const severity: string = String(event.severity);
  const baseScore = SEVERITY_BASE_SCORE[severity] ?? 0.45;

  let partial: EventImpactPartial;

  switch (eventType) {
    case 'hail':
      partial = computeWeatherHail(property, baseScore, currentYear);
      break;
    case 'freeze':
      partial = computeWeatherFreeze(property, baseScore, currentYear);
      break;
    case 'heat_wave':
      partial = computeWeatherHeatWave(property, baseScore, currentYear);
      break;
    case 'wind':
      partial = computeWeatherWind(property, baseScore, currentYear);
      break;
    case 'heavy_rain':
    case 'flood_risk':
      partial = computeWeatherFloodRain(property, baseScore);
      break;
    case 'air_quality':
    case 'wildfire_smoke':
      partial = computeAirQualitySmoke(baseScore, eventType);
      break;
    case 'power_surge_risk':
      partial = computePowerSurgeRisk(baseScore);
      break;
    case 'insurance_market':
      partial = computeInsuranceMarket(property, baseScore, currentYear);
      break;
    case 'utility_outage':
      partial = computeUtilityOutage(property, baseScore);
      break;
    case 'utility_rate_change':
      partial = computeUtilityRateChange(baseScore);
      break;
    case 'tax_reassessment':
    case 'tax_rate_change':
      partial = computeTaxEvent(baseScore, eventType);
      break;
    default:
      partial = computeGeneric(baseScore, eventType);
  }

  const score = partial.matchScore ?? baseScore;
  const impactLevel = scoreToImpactLevel(score);
  const drivers = partial.drivers ?? [];
  const actions = partial.actions ?? [];
  const systems = partial.systems ?? [];

  const impactFactorsJson: Record<string, unknown> = {
    property: {
      yearBuilt: property.yearBuilt,
      squareFootage: property.propertySize,
      homeType: property.propertyType,
    },
    location: {
      state: property.state,
      city: property.city,
      zip: property.zipCode,
    },
    event: {
      eventType: event.eventType,
      eventSubType: event.eventSubType ?? null,
      severity: event.severity,
    },
    drivers,
  };

  return {
    matchScore: score,
    impactLevel,
    impactSummary: partial.impactSummary ?? 'Event detected in your area. Review recommended actions.',
    impactFactorsJson,
    recommendedActionsJson: { actions },
    matchedSystemsJson: { systems },
  };
}

// ---------------------------------------------------------------------------
// Property lookup by event location
// ---------------------------------------------------------------------------

async function findMatchingProperties(
  event: any,
  propertyIdFilter?: string[] | null,
): Promise<PropertySnapshot[]> {
  const locationType: string = String(event.locationType);
  const locationKey: string = String(event.locationKey);

  let where: Record<string, unknown> = {};

  switch (locationType) {
    case 'property':
      where = { id: locationKey };
      break;
    case 'zip':
      where = { zipCode: locationKey };
      break;
    case 'city':
      where = { city: { equals: locationKey, mode: 'insensitive' } };
      break;
    case 'state':
      where = { state: { equals: locationKey, mode: 'insensitive' } };
      break;
    case 'county':
    case 'polygon':
      // MVP: county field not on Property; polygon requires geo library.
      // TODO: implement when county is added to schema or geo library is available.
      return [];
    default:
      return [];
  }

  if (propertyIdFilter && propertyIdFilter.length > 0) {
    where = { AND: [where, { id: { in: propertyIdFilter } }] };
  }

  return prisma.property.findMany({
    where,
    select: PROPERTY_FIELDS_SELECT,
  }) as unknown as Promise<PropertySnapshot[]>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Finds all matching properties for a radar event, computes impact for each,
 * and upserts PropertyRadarMatch records.
 */
export async function runMatchingForEvent(
  eventId: string,
  propertyIdFilter?: string[] | null,
): Promise<{ matched: number; skipped: number }> {
  const db = prisma as any;

  const event = await db.radarEvent.findUnique({ where: { id: eventId } });
  if (!event) return { matched: 0, skipped: 0 };

  if (event.status === 'archived') return { matched: 0, skipped: 0 };

  const properties = await findMatchingProperties(event, propertyIdFilter);

  let matched = 0;
  let skipped = 0;

  for (const property of properties) {
    try {
      const impact = computeImpact(event, property);

      await db.propertyRadarMatch.upsert({
        where: {
          propertyId_radarEventId: {
            propertyId: property.id,
            radarEventId: eventId,
          },
        },
        create: {
          propertyId: property.id,
          radarEventId: eventId,
          matchScore: impact.matchScore.toFixed(4),
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactFactorsJson: impact.impactFactorsJson,
          recommendedActionsJson: impact.recommendedActionsJson,
          matchedSystemsJson: impact.matchedSystemsJson,
          isVisible: true,
          visibleFrom: event.startAt,
          visibleUntil: event.endAt ?? null,
        },
        update: {
          matchScore: impact.matchScore.toFixed(4),
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
          impactFactorsJson: impact.impactFactorsJson,
          recommendedActionsJson: impact.recommendedActionsJson,
          matchedSystemsJson: impact.matchedSystemsJson,
          isVisible: true,
          visibleFrom: event.startAt,
          visibleUntil: event.endAt ?? null,
        },
      });

      const envelope = buildUnifiedEventEnvelope({
        eventType: event.eventType,
        propertyId: property.id,
        sourceModel: 'RadarEvent',
        sourceId: eventId,
        occurredAt: event.startAt,
        payloadJson: {
          eventType: event.eventType,
          eventSubType: event.eventSubType ?? null,
          severity: event.severity,
          impactLevel: impact.impactLevel,
          impactSummary: impact.impactSummary,
        },
      });

      await signalService.publishRadarEventSignals({
        propertyId: property.id,
        radarEventId: eventId,
        eventType: envelope.eventType.toLowerCase(),
        severity: String(event.severity),
        impactLevel: String(impact.impactLevel),
        capturedAt: envelope.occurredAt,
        validUntil: event.endAt ?? null,
      });

      matched++;
    } catch (err) {
      logger.error({ propertyId: property.id, err }, '[RadarMatcher] Failed to upsert match for property');
      skipped++;
    }
  }

  return { matched, skipped };
}
