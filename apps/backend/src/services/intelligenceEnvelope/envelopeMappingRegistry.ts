import {
  INTELLIGENCE_ISSUE_DOMAINS,
  SHARED_SIGNAL_KEYS,
  type EnvelopeDomain,
  type QualifiedClaimPropositionType,
  type SharedSignalKey,
} from '../../productFramework/intelligence';
import { RADAR_COMPOUND_RULE_CODES } from '../../modules/homeEventRadar/domain/radarCompoundRules';
import { PERSONALIZATION_DEFINITIONS } from '../../modules/personalization/catalog/personalizationDefinitions';
import { DECISION_DEFINITIONS, type DecisionDefinitionId } from '../decisionPlatform/decisionDefinitionRegistry';
import type { EnvelopeProducerModel, EnvelopeType } from './intelligenceEnvelope.contract';

export type EnvelopeMapping = Readonly<{
  producerModel: EnvelopeProducerModel;
  type: EnvelopeType;
  nativeSubtype: string;
  domain: EnvelopeDomain;
  propositionType?: QualifiedClaimPropositionType;
}>;

const signalDomains: Record<SharedSignalKey, EnvelopeDomain> = {
  MAINT_ADHERENCE: 'MAINTENANCE',
  COVERAGE_GAP: 'INSURANCE',
  SAVINGS_REALIZATION: 'FINANCIAL',
  RISK_SPIKE: 'SAFETY',
  COST_ANOMALY: 'PRICING',
  RISK_ACCUMULATION: 'MAINTENANCE',
  SYSTEM_DEGRADATION: 'ASSET_LIFECYCLE',
  COST_PRESSURE_PATTERN: 'FINANCIAL',
  FINANCIAL_DISCIPLINE: 'FINANCIAL',
};

const decisionMappings: Record<DecisionDefinitionId, {
  domain: EnvelopeDomain;
  propositionType: QualifiedClaimPropositionType;
}> = {
  HVAC_REPAIR_REPLACE: { domain: 'ASSET_LIFECYCLE', propositionType: 'HVAC_REPAIR_REPLACE_VERDICT' },
  REFINANCE_OPPORTUNITY: { domain: 'FINANCIAL', propositionType: 'REFINANCE_OPPORTUNITY_VERDICT' },
  HOME_CAPITAL_TIMELINE_WINDOW: { domain: 'ASSET_LIFECYCLE', propositionType: 'HOME_CAPITAL_TIMELINE_WINDOW_VERDICT' },
  OWNERSHIP_COST_CHANGE: { domain: 'FINANCIAL', propositionType: 'OWNERSHIP_COST_CHANGE_VERDICT' },
  SAVINGS_BENEFIT_MATCH: { domain: 'FINANCIAL', propositionType: 'SAVINGS_BENEFIT_MATCH_VERDICT' },
  COVERAGE_QUESTION: { domain: 'INSURANCE', propositionType: 'COVERAGE_QUESTION_VERDICT' },
  SELL_HOLD_RENT: { domain: 'MARKET_VALUE', propositionType: 'SELL_HOLD_RENT_VERDICT' },
};

const personalizationDomains: Readonly<Record<string, EnvelopeDomain>> = {
  hvac_filter_replacement_check_proof: 'MAINTENANCE',
  smoke_co_detector_battery_check: 'SAFETY',
  dryer_vent_cleaning_reminder: 'SAFETY',
  smoke_detector_installation_review: 'SAFETY',
  aging_roof_condition_review: 'ASSET_LIFECYCLE',
};

export const ADMITTED_INTELLIGENCE_OBSERVATION_DOMAINS = Object.freeze({
  NYC_ZONING_APPLICATION: 'NEIGHBORHOOD',
  EARTHQUAKE_EVENT: 'WEATHER',
} satisfies Readonly<Record<string, EnvelopeDomain>>);

export const ADMITTED_RADAR_EVENT_DOMAINS = Object.freeze({
  weather: 'WEATHER',
  hail: 'WEATHER',
  freeze: 'WEATHER',
  heat_wave: 'WEATHER',
  wind: 'WEATHER',
  heavy_rain: 'WEATHER',
  flood_risk: 'WEATHER',
  air_quality: 'SAFETY',
  wildfire_smoke: 'SAFETY',
  power_surge_risk: 'SAFETY',
  insurance_market: 'INSURANCE',
  utility_outage: 'SAFETY',
  disaster_declaration: 'SAFETY',
  earthquake: 'WEATHER',
  utility_rate_change: 'ENERGY',
  tax_reassessment: 'FINANCIAL',
  tax_rate_change: 'FINANCIAL',
} satisfies Readonly<Record<string, EnvelopeDomain>>);

const radarCompoundDomains: Readonly<Record<typeof RADAR_COMPOUND_RULE_CODES[number], EnvelopeDomain>> = {
  HEAVY_RAIN_OUTAGE_SUMP_BACKUP: 'WEATHER',
  SMOKE_HVAC_FILTER: 'SAFETY',
  FREEZE_OUTAGE_ELECTRIC_HEAT: 'SAFETY',
  SEVERE_WEATHER_OPEN_ROOF_ISSUE: 'WEATHER',
  HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE: 'WEATHER',
};

export const ENVELOPE_MAPPINGS: readonly EnvelopeMapping[] = Object.freeze([
  ...SHARED_SIGNAL_KEYS.map((nativeSubtype): EnvelopeMapping => ({
    producerModel: 'Signal',
    type: 'SIGNAL',
    nativeSubtype,
    domain: signalDomains[nativeSubtype],
  })),
  ...INTELLIGENCE_ISSUE_DOMAINS.map((domain): EnvelopeMapping => ({
    producerModel: 'GuidanceSignal',
    type: 'GUIDANCE',
    nativeSubtype: domain,
    domain,
  })),
  ...Object.entries(ADMITTED_INTELLIGENCE_OBSERVATION_DOMAINS).map(([nativeSubtype, domain]): EnvelopeMapping => ({
    producerModel: 'IntelligenceObservation',
    type: 'OBSERVATION',
    nativeSubtype,
    domain,
  })),
  ...(Object.keys(DECISION_DEFINITIONS) as DecisionDefinitionId[]).map((nativeSubtype): EnvelopeMapping => ({
    producerModel: 'RecommendationSnapshot',
    type: 'RECOMMENDATION',
    nativeSubtype,
    ...decisionMappings[nativeSubtype],
  })),
  ...PERSONALIZATION_DEFINITIONS.map(({ code }): EnvelopeMapping => ({
    producerModel: 'PersonalizedRecommendation',
    type: 'RECOMMENDATION',
    nativeSubtype: code,
    domain: personalizationDomains[code],
  })),
  ...Object.entries(ADMITTED_RADAR_EVENT_DOMAINS).map(([nativeSubtype, domain]): EnvelopeMapping => ({
    producerModel: 'PropertyRadarMatch',
    type: 'RADAR_INSIGHT',
    nativeSubtype,
    domain,
  })),
  ...RADAR_COMPOUND_RULE_CODES.map((nativeSubtype): EnvelopeMapping => ({
    producerModel: 'PropertyRadarCompoundInsight',
    type: 'RADAR_INSIGHT',
    nativeSubtype,
    domain: radarCompoundDomains[nativeSubtype],
  })),
]);

const mappingByKey = new Map(
  ENVELOPE_MAPPINGS.map((mapping) => [`${mapping.producerModel}:${mapping.nativeSubtype}`, mapping]),
);

export function getEnvelopeMapping(
  producerModel: EnvelopeProducerModel,
  nativeSubtype: string,
): EnvelopeMapping | null {
  return mappingByKey.get(`${producerModel}:${nativeSubtype}`) ?? null;
}
