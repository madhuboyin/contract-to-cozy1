import type {
  RadarImpactInputFact,
  RadarImpactMissingFact,
} from './radarImpactRules';

export const RADAR_CONFIDENCE_VERSION = 'confidence-v1';

export const RADAR_CONFIDENCE_WEIGHTS = {
  source: 0.25,
  geography: 0.25,
  freshness: 0.20,
  propertyCompleteness: 0.15,
  domainEvidence: 0.15,
} as const;

export type RadarConfidenceBand = 'low' | 'medium' | 'high';
export type RadarConfidenceComponentName = keyof typeof RADAR_CONFIDENCE_WEIGHTS;

export interface RadarConfidenceEventInput {
  eventType: string;
  locationType: string;
  locationKey?: string;
  geoJson?: unknown;
  observedAt: Date | string;
  sourceDefinition?: {
    isEnabled: boolean;
    freshnessSeconds: number;
    health?: {
      status: string;
      lastSuccessAt?: Date | string | null;
      dataFreshThrough?: Date | string | null;
    } | null;
  } | null;
  sourceRun?: {
    status: string;
    finishedAt?: Date | string | null;
    dataFreshThrough?: Date | string | null;
  } | null;
}

export interface RadarConfidenceImpactInput {
  inputFacts: RadarImpactInputFact[];
  missingFacts: RadarImpactMissingFact[];
  drivers: Array<{ code: string; factKeys?: string[] }>;
}

export interface RadarConfidenceMissingReason {
  component: RadarConfidenceComponentName;
  code: string;
  detail: string;
}

export interface RadarConfidenceComponent {
  name: RadarConfidenceComponentName;
  weight: number;
  score: number;
  weightedScore: number;
  reasonCodes: string[];
}

export interface RadarConfidenceResult {
  version: typeof RADAR_CONFIDENCE_VERSION;
  score: number;
  band: RadarConfidenceBand;
  components: RadarConfidenceComponent[];
  missingFactReasons: RadarConfidenceMissingReason[];
  homeownerExplanation: string;
}

type ComponentEvaluation = {
  score: number;
  reasons: RadarConfidenceMissingReason[];
  reasonCodes: string[];
};

const REVIEWED_DOMAIN_EVENT_TYPES = new Set([
  'hail',
  'freeze',
  'heat_wave',
  'wind',
  'heavy_rain',
  'flood_risk',
  'air_quality',
  'wildfire_smoke',
  'power_surge_risk',
  'insurance_market',
  'utility_outage',
  'utility_rate_change',
  'tax_reassessment',
  'tax_rate_change',
]);

const IMPACT_MISSING_DETAIL: Record<string, string> = {
  ROOF_REPLACEMENT_YEAR_UNKNOWN: 'roof replacement year',
  HVAC_INSTALL_YEAR_UNKNOWN: 'HVAC installation year',
  WATER_HEATER_INSTALL_YEAR_UNKNOWN: 'water-heater installation year',
  WATER_HEATER_TYPE_UNKNOWN: 'water-heater type',
  IRRIGATION_PRESENCE_UNKNOWN: 'irrigation presence',
  SECONDARY_HEAT_PRESENCE_UNKNOWN: 'backup heat availability',
  COOLING_TYPE_UNKNOWN: 'cooling system type',
  DRAINAGE_ISSUES_UNKNOWN: 'drainage condition',
  SUMP_PUMP_PRESENCE_UNKNOWN: 'sump-pump presence',
  SUMP_PUMP_BACKUP_UNKNOWN: 'sump-pump backup',
  FOUNDATION_TYPE_UNKNOWN: 'foundation type',
  PRIMARY_HEATING_FUEL_UNKNOWN: 'primary heating fuel',
  RESPONSIBILITY_UNKNOWN: 'maintenance responsibility',
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rounded(value: number): number {
  return Number(clamp(value).toFixed(4));
}

function missing(
  component: RadarConfidenceComponentName,
  code: string,
  detail: string,
): RadarConfidenceMissingReason {
  return { component, code, detail };
}

function sourceComponent(event: RadarConfidenceEventInput): ComponentEvaluation {
  const definition = event.sourceDefinition;
  if (!definition) {
    return {
      score: 0.45,
      reasonCodes: ['SOURCE_DEFINITION_UNKNOWN'],
      reasons: [
        missing(
          'source',
          'SOURCE_DEFINITION_UNKNOWN',
          'the event source has not been linked to a reviewed source definition',
        ),
      ],
    };
  }
  if (!definition.isEnabled) {
    return {
      score: 0.2,
      reasonCodes: ['SOURCE_DISABLED'],
      reasons: [
        missing('source', 'SOURCE_DISABLED', 'the event source is currently disabled'),
      ],
    };
  }

  const healthStatus = definition.health?.status ?? 'unknown';
  const healthScores: Record<string, number> = {
    healthy: 1,
    degraded: 0.75,
    stale: 0.45,
    failed: 0.2,
    disabled: 0.15,
    unknown: 0.6,
  };
  const runStatus = event.sourceRun?.status ?? 'unknown';
  const runScores: Record<string, number> = {
    success: 1,
    successful_empty: 1,
    partial: 0.75,
    started: 0.55,
    failed: 0.2,
    skipped: 0.35,
    unknown: 0.65,
  };
  const reasons: RadarConfidenceMissingReason[] = [];
  const reasonCodes: string[] = [];
  if (healthStatus !== 'healthy') {
    const code = healthStatus === 'unknown'
      ? 'SOURCE_HEALTH_UNKNOWN'
      : `SOURCE_HEALTH_${healthStatus.toUpperCase()}`;
    reasonCodes.push(code);
    reasons.push(missing(
      'source',
      code,
      healthStatus === 'unknown'
        ? 'current source health is unavailable'
        : `current source health is ${healthStatus}`,
    ));
  }
  if (runStatus !== 'success' && runStatus !== 'successful_empty') {
    const code = runStatus === 'unknown'
      ? 'SOURCE_RUN_UNKNOWN'
      : `SOURCE_RUN_${runStatus.toUpperCase()}`;
    reasonCodes.push(code);
    reasons.push(missing(
      'source',
      code,
      runStatus === 'unknown'
        ? 'the source run outcome is unavailable'
        : `the source run outcome is ${runStatus}`,
    ));
  }
  return {
    score: rounded(
      ((healthScores[healthStatus] ?? healthScores.unknown)
        + (runScores[runStatus] ?? runScores.unknown)) / 2,
    ),
    reasonCodes,
    reasons,
  };
}

function radiusMeters(geoJson: unknown): number | null {
  if (!geoJson || typeof geoJson !== 'object') return null;
  const value = Number((geoJson as { radiusMeters?: unknown }).radiusMeters);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function geographyComponent(event: RadarConfidenceEventInput): ComponentEvaluation {
  const locationType = event.locationType;
  let score: number;
  let reasonCode: string;
  switch (locationType) {
    case 'property':
      score = 1;
      reasonCode = 'GEOGRAPHY_EXACT_PROPERTY';
      break;
    case 'polygon':
      score = 0.95;
      reasonCode = 'GEOGRAPHY_CANONICAL_POINT_IN_POLYGON';
      break;
    case 'point':
      score = 0.9;
      reasonCode = 'GEOGRAPHY_POINT_DISTANCE';
      break;
    case 'radius': {
      const radius = radiusMeters(event.geoJson);
      if (radius === null) {
        return {
          score: 0.35,
          reasonCodes: ['GEOGRAPHY_RADIUS_UNKNOWN'],
          reasons: [
            missing(
              'geography',
              'GEOGRAPHY_RADIUS_UNKNOWN',
              'the geographic radius is unavailable',
            ),
          ],
        };
      }
      score = radius <= 1_000
        ? 0.9
        : radius <= 10_000
          ? 0.8
          : radius <= 50_000
            ? 0.7
            : 0.55;
      reasonCode = radius <= 10_000
        ? 'GEOGRAPHY_BOUNDED_RADIUS'
        : 'GEOGRAPHY_BROAD_RADIUS';
      break;
    }
    case 'postal_code':
    case 'zip':
      score = 0.75;
      reasonCode = 'GEOGRAPHY_NORMALIZED_ZIP';
      break;
    case 'city':
      score = 0.65;
      reasonCode = 'GEOGRAPHY_CITY_STATE';
      break;
    case 'county':
      score = 0.6;
      reasonCode = 'GEOGRAPHY_COUNTY_FIPS';
      break;
    case 'state':
      score = 0.45;
      reasonCode = 'GEOGRAPHY_STATE';
      break;
    case 'administrative_area': {
      const level = event.locationKey?.split(':')[1];
      if (level === 'city') {
        score = 0.65;
        reasonCode = 'GEOGRAPHY_CITY_STATE';
      } else if (level === 'county') {
        score = 0.6;
        reasonCode = 'GEOGRAPHY_COUNTY_FIPS';
      } else if (level === 'state') {
        score = 0.45;
        reasonCode = 'GEOGRAPHY_STATE';
      } else {
        score = 0.4;
        reasonCode = 'GEOGRAPHY_ADMINISTRATIVE_AREA_UNKNOWN';
      }
      break;
    }
    default:
      return {
        score: 0.3,
        reasonCodes: ['GEOGRAPHY_PRECISION_UNKNOWN'],
        reasons: [
          missing(
            'geography',
            'GEOGRAPHY_PRECISION_UNKNOWN',
            'the geographic precision is unavailable',
          ),
        ],
      };
  }
  const broad = score < 0.6;
  return {
    score,
    reasonCodes: [reasonCode],
    reasons: broad
      ? [
          missing(
            'geography',
            'GEOGRAPHY_BROAD_SCOPE',
            'the event is matched at a broad geographic scope',
          ),
        ]
      : [],
  };
}

function validTimestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function freshnessComponent(
  event: RadarConfidenceEventInput,
  evaluatedAt: Date,
): ComponentEvaluation {
  const anchors = [
    event.observedAt,
    event.sourceDefinition?.health?.dataFreshThrough,
    event.sourceDefinition?.health?.lastSuccessAt,
    event.sourceRun?.dataFreshThrough,
    event.sourceRun?.finishedAt,
  ]
    .map(validTimestamp)
    .filter((value): value is number => value !== null);
  if (anchors.length === 0) {
    return {
      score: 0.3,
      reasonCodes: ['FRESHNESS_ANCHOR_UNKNOWN'],
      reasons: [
        missing(
          'freshness',
          'FRESHNESS_ANCHOR_UNKNOWN',
          'the latest successful source check time is unavailable',
        ),
      ],
    };
  }
  const freshnessSeconds = event.sourceDefinition?.freshnessSeconds;
  const reviewedWindow = typeof freshnessSeconds === 'number'
    && Number.isFinite(freshnessSeconds)
    && freshnessSeconds > 0;
  const windowMs = (reviewedWindow ? freshnessSeconds : 6 * 3_600) * 1_000;
  const ageMs = Math.max(0, evaluatedAt.getTime() - Math.max(...anchors));
  let score: number;
  let code: string;
  if (ageMs <= windowMs) {
    score = 1;
    code = 'FRESHNESS_WITHIN_WINDOW';
  } else if (ageMs <= windowMs * 2) {
    score = 0.8;
    code = 'FRESHNESS_SLIGHTLY_STALE';
  } else if (ageMs <= windowMs * 4) {
    score = 0.55;
    code = 'FRESHNESS_STALE';
  } else {
    score = 0.25;
    code = 'FRESHNESS_EXPIRED';
  }
  const reasons: RadarConfidenceMissingReason[] = [];
  if (!reviewedWindow) {
    reasons.push(missing(
      'freshness',
      'FRESHNESS_WINDOW_UNKNOWN',
      'the source freshness window is unavailable',
    ));
  }
  if (score < 0.8) {
    reasons.push(missing(
      'freshness',
      code,
      score <= 0.25
        ? 'the latest successful source evidence is well past its freshness window'
        : 'the latest successful source evidence is stale',
    ));
  }
  return {
    score: reviewedWindow ? score : Math.min(score, 0.65),
    reasonCodes: [
      ...(!reviewedWindow ? ['FRESHNESS_WINDOW_UNKNOWN'] : []),
      code,
    ],
    reasons,
  };
}

function propertyCompletenessComponent(
  impact: RadarConfidenceImpactInput,
): ComponentEvaluation {
  const relevant = impact.inputFacts.filter(
    (fact) =>
      fact.factKey.startsWith('property.')
      || fact.factKey.startsWith('responsibility.'),
  );
  if (relevant.length === 0) {
    return {
      score: 1,
      reasonCodes: ['PROPERTY_FACTS_NOT_REQUIRED'],
      reasons: [],
    };
  }
  const known = relevant.filter((fact) => fact.state === 'known').length;
  const score = known / relevant.length;
  const reasons = impact.missingFacts.map((fact) => missing(
    'propertyCompleteness',
    fact.reasonCode,
    `missing ${IMPACT_MISSING_DETAIL[fact.reasonCode] ?? fact.factKey}`,
  ));
  return {
    score: rounded(score),
    reasonCodes: score === 1
      ? ['PROPERTY_FACTS_COMPLETE']
      : ['PROPERTY_FACTS_INCOMPLETE'],
    reasons,
  };
}

function domainEvidenceComponent(
  event: RadarConfidenceEventInput,
  impact: RadarConfidenceImpactInput,
): ComponentEvaluation {
  if (!REVIEWED_DOMAIN_EVENT_TYPES.has(event.eventType)) {
    return {
      score: 0.5,
      reasonCodes: ['DOMAIN_RULE_GENERIC'],
      reasons: [
        missing(
          'domainEvidence',
          'DOMAIN_RULE_GENERIC',
          'this event family currently uses a general awareness rule',
        ),
      ],
    };
  }
  const missingCount = impact.missingFacts.length;
  const score = Math.max(0.45, 0.9 - missingCount * 0.08)
    + (impact.drivers.length > 0 ? 0.05 : 0);
  return {
    score: rounded(score),
    reasonCodes: [
      'DOMAIN_RULE_REVIEWED',
      impact.drivers.length > 0
        ? 'DOMAIN_EVIDENCE_CONFIRMED'
        : 'DOMAIN_NO_VULNERABILITY_CONFIRMED',
    ],
    reasons: [],
  };
}

function confidenceBand(score: number): RadarConfidenceBand {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function homeownerExplanation(
  band: RadarConfidenceBand,
  reasons: RadarConfidenceMissingReason[],
): string {
  const prefix = band === 'high'
    ? 'Confidence is high because the source, location, freshness, and relevant home evidence are well supported.'
    : band === 'medium'
      ? 'Confidence is medium: the event is relevant, but some supporting evidence is incomplete.'
      : 'Confidence is low: treat this as an awareness signal until supporting evidence is refreshed or confirmed.';
  if (reasons.length === 0) return prefix;
  const details = [...new Set(reasons.map((reason) => reason.detail))].slice(0, 3);
  return `${prefix} Needs review: ${details.join('; ')}.`;
}

/**
 * Pure bounded confidence calculation. The score is an internal evidence
 * diagnostic, not a probability of loss or damage.
 */
export function computeRadarConfidence(
  event: RadarConfidenceEventInput,
  impact: RadarConfidenceImpactInput,
  evaluatedAt: Date,
): RadarConfidenceResult {
  if (!Number.isFinite(evaluatedAt.getTime())) {
    throw new TypeError('Radar confidence evaluation time must be valid');
  }
  const evaluations: Record<RadarConfidenceComponentName, ComponentEvaluation> = {
    source: sourceComponent(event),
    geography: geographyComponent(event),
    freshness: freshnessComponent(event, evaluatedAt),
    propertyCompleteness: propertyCompletenessComponent(impact),
    domainEvidence: domainEvidenceComponent(event, impact),
  };
  const components = (Object.keys(RADAR_CONFIDENCE_WEIGHTS) as RadarConfidenceComponentName[])
    .map((name) => {
      const weight = RADAR_CONFIDENCE_WEIGHTS[name];
      const score = rounded(evaluations[name].score);
      return {
        name,
        weight,
        score,
        weightedScore: rounded(score * weight),
        reasonCodes: evaluations[name].reasonCodes,
      };
    });
  const score = rounded(components.reduce(
    (sum, component) => sum + component.score * component.weight,
    0,
  ));
  const band = confidenceBand(score);
  const missingFactReasons = components.flatMap(
    (component) => evaluations[component.name].reasons,
  );
  return {
    version: RADAR_CONFIDENCE_VERSION,
    score,
    band,
    components,
    missingFactReasons,
    homeownerExplanation: homeownerExplanation(band, missingFactReasons),
  };
}
