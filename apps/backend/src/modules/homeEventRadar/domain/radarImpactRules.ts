import type { RadarActionCode } from './radarActionRegistry';

export const RADAR_IMPACT_RULE_VERSION = 'impact-v1';
export const RADAR_IMPACT_DRIVER_CODES = [
  'OLDER_ROOF',
  'FREEZE_EXPOSURE_IRRIGATION',
  'AGING_TANK_WATER_HEATER',
  'NO_SECONDARY_HEAT',
  'AGING_HVAC',
  'KNOWN_DRAINAGE_ISSUES',
  'NO_SUMP_BACKUP',
  'BELOW_GRADE_FOUNDATION',
  'ELECTRIC_DEPENDENT_HEATING',
] as const;
export type RadarImpactDriverCode = typeof RADAR_IMPACT_DRIVER_CODES[number];

export type RadarImpactLevel = 'none' | 'watch' | 'moderate' | 'high';
export type RadarImpactSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RadarResponsibilityScope =
  | 'ROOF'
  | 'BUILDING_EXTERIOR'
  | 'LANDSCAPING'
  | 'TREES_SHRUBS'
  | 'DRIVEWAY_WALKWAYS'
  | 'DECK_PATIO_BALCONY'
  | 'PLUMBING'
  | 'HVAC'
  | 'COMMON_SAFETY'
  | 'SNOW_ICE'
  | 'PEST_CONTROL'
  | 'SHARED_SYSTEMS';
export type RadarResponsibleParty = 'OWNER' | 'ASSOCIATION' | 'LANDLORD' | 'SHARED' | 'UNKNOWN';

export interface RadarImpactEventInput {
  eventType: string;
  eventSubType?: string | null;
  severity: string;
}

export interface RadarImpactPropertyInput {
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
  hasSumpPump: boolean | null;
  hasSumpPumpBackup: boolean | null;
  primaryHeatingFuel: string | null;
  hasSecondaryHeat: boolean | null;
  foundationType: string | null;
  propertySize: number | null;
  dwellingType: string;
  zipCode: string;
  city: string;
  state: string;
  responsibilities: Array<{
    scope: string;
    party: string;
  }>;
}

export interface RadarImpactDriver {
  code: RadarImpactDriverCode;
  effect: 'increase' | 'decrease' | 'neutral';
  description: string;
  factKeys: string[];
}

export interface RadarRecommendedAction {
  code: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  responsibilityScope?: RadarResponsibilityScope;
  responsibleParty?: RadarResponsibleParty;
  applicability?: 'owner_action' | 'coordinate' | 'verify_responsibility';
}

export interface RadarMatchedSystem {
  type: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface RadarImpactInputFact {
  factKey: string;
  state: 'known' | 'unknown';
  value: string | number | boolean | null;
}

export interface RadarImpactMissingFact {
  factKey: string;
  reasonCode: string;
}

export interface RadarResponsibilityDecision {
  scope: RadarResponsibilityScope;
  party: RadarResponsibleParty;
  decision: 'owner_action' | 'coordinate' | 'unknown';
}

export interface RadarImpactResult {
  ruleVersion: typeof RADAR_IMPACT_RULE_VERSION;
  matchScore: number;
  impactLevel: RadarImpactLevel;
  impactSummary: string;
  impactFactorsJson: {
    ruleVersion: typeof RADAR_IMPACT_RULE_VERSION;
    evaluatedAt: string;
    property: {
      yearBuilt: number | null;
      propertySize: number | null;
      dwellingType: string;
    };
    location: {
      state: string;
      city: string;
      zip: string;
    };
    event: {
      eventType: string;
      eventSubType: string | null;
      severity: string;
    };
    drivers: RadarImpactDriver[];
    inputFacts: RadarImpactInputFact[];
    missingFacts: RadarImpactMissingFact[];
    responsibilityDecisions: RadarResponsibilityDecision[];
  };
  recommendedActionsJson: { actions: RadarRecommendedAction[] };
  matchedSystemsJson: { systems: RadarMatchedSystem[] };
}

interface EventImpactPartial {
  matchScore?: number;
  impactSummary: string;
  drivers: RadarImpactDriver[];
  actions: RadarRecommendedAction[];
  systems: RadarMatchedSystem[];
}

const SEVERITY_BASE_SCORE: Record<RadarImpactSeverity, number> = {
  info: 0.15,
  low: 0.25,
  medium: 0.45,
  high: 0.65,
  critical: 0.85,
};

class ImpactEvidence {
  private readonly facts = new Map<string, RadarImpactInputFact>();
  private readonly missing = new Map<string, RadarImpactMissingFact>();

  read<K extends keyof RadarImpactPropertyInput>(
    property: RadarImpactPropertyInput,
    key: K,
  ): RadarImpactPropertyInput[K] {
    const value = property[key];
    this.record(`property.${String(key)}`, value);
    return value;
  }

  record(factKey: string, value: unknown): void {
    const known = value !== null && value !== undefined && value !== 'UNKNOWN';
    const traceValue = typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      ? value
      : null;
    this.facts.set(factKey, {
      factKey,
      state: known ? 'known' : 'unknown',
      value: traceValue,
    });
  }

  markMissing(factKey: string, reasonCode: string): void {
    if (!this.missing.has(factKey)) {
      this.missing.set(factKey, { factKey, reasonCode });
    }
  }

  inputFacts(): RadarImpactInputFact[] {
    return [...this.facts.values()].sort((a, b) => a.factKey.localeCompare(b.factKey));
  }

  missingFacts(): RadarImpactMissingFact[] {
    return [...this.missing.values()].sort((a, b) => a.factKey.localeCompare(b.factKey));
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function scoreToImpactLevel(score: number): RadarImpactLevel {
  if (score < 0.25) return 'none';
  if (score < 0.45) return 'watch';
  if (score < 0.65) return 'moderate';
  return 'high';
}

function explicitSystemAge(
  property: RadarImpactPropertyInput,
  evidence: ImpactEvidence,
  key: 'roofReplacementYear' | 'hvacInstallYear' | 'waterHeaterInstallYear',
  evaluationYear: number,
  missingReasonCode: string,
): number | null {
  const value = evidence.read(property, key);
  if (!Number.isInteger(value) || value === null || value < 1900 || value > evaluationYear) {
    evidence.markMissing(`property.${key}`, missingReasonCode);
    return null;
  }
  return evaluationYear - value;
}

function action(
  code: RadarActionCode,
  label: string,
  priority: RadarRecommendedAction['priority'],
  responsibilityScope?: RadarResponsibilityScope,
): RadarRecommendedAction {
  return { code, label, priority, ...(responsibilityScope ? { responsibilityScope } : {}) };
}

function driver(
  code: RadarImpactDriverCode,
  description: string,
  factKeys: string[],
): RadarImpactDriver {
  return { code, effect: 'increase', description, factKeys };
}

function computeWeatherHail(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evaluationYear: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const roofAge = explicitSystemAge(
    property,
    evidence,
    'roofReplacementYear',
    evaluationYear,
    'ROOF_REPLACEMENT_YEAR_UNKNOWN',
  );
  if (roofAge !== null && roofAge > 15) {
    score += 0.15;
    drivers.push(driver(
      'OLDER_ROOF',
      `Roof is ${roofAge} years old — increased hail damage risk.`,
      ['property.roofReplacementYear'],
    ));
  }
  return {
    matchScore: clamp(score),
    impactSummary: roofAge !== null && roofAge > 15
      ? `Hail event detected. Your ${roofAge}-year-old roof increases risk of shingle damage.`
      : 'Hail event detected in your area. Inspect roof and gutters for impact damage.',
    drivers,
    actions: [
      action(
        'INSPECT_ROOF',
        roofAge !== null && roofAge > 15
          ? 'Inspect roof shingles and flashing for hail damage'
          : 'Check roof for hail damage',
        roofAge !== null && roofAge > 15 ? 'high' : 'medium',
        'ROOF',
      ),
      action('CHECK_GUTTERS', 'Clear gutters and downspouts of hail debris', 'medium', 'ROOF'),
    ],
    systems: [{ type: 'roof', relevance: 'high' }],
  };
}

function computeWeatherFreeze(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evaluationYear: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const actions: RadarRecommendedAction[] = [];
  const systems: RadarMatchedSystem[] = [{ type: 'plumbing', relevance: 'high' }];

  const hasIrrigation = evidence.read(property, 'hasIrrigation');
  if (hasIrrigation === true) {
    score += 0.1;
    drivers.push(driver(
      'FREEZE_EXPOSURE_IRRIGATION',
      'Irrigation system may be vulnerable to freeze damage.',
      ['property.hasIrrigation'],
    ));
    actions.push(action(
      'SHUT_OFF_IRRIGATION',
      'Shut off and drain irrigation system before freeze',
      'high',
      'LANDSCAPING',
    ));
  } else if (hasIrrigation === null) {
    evidence.markMissing('property.hasIrrigation', 'IRRIGATION_PRESENCE_UNKNOWN');
  }

  const waterHeaterType = evidence.read(property, 'waterHeaterType');
  if (waterHeaterType === 'TANK') {
    const waterHeaterAge = explicitSystemAge(
      property,
      evidence,
      'waterHeaterInstallYear',
      evaluationYear,
      'WATER_HEATER_INSTALL_YEAR_UNKNOWN',
    );
    if (waterHeaterAge !== null && waterHeaterAge > 10) {
      score += 0.08;
      drivers.push(driver(
        'AGING_TANK_WATER_HEATER',
        'Tank water heater is older and more vulnerable to freeze damage.',
        ['property.waterHeaterType', 'property.waterHeaterInstallYear'],
      ));
      systems.push({ type: 'water_heater', relevance: 'medium' });
    }
  } else if (waterHeaterType === null || waterHeaterType === 'UNKNOWN') {
    evidence.markMissing('property.waterHeaterType', 'WATER_HEATER_TYPE_UNKNOWN');
  }

  const hasSecondaryHeat = evidence.read(property, 'hasSecondaryHeat');
  if (hasSecondaryHeat === false) {
    score += 0.1;
    drivers.push(driver(
      'NO_SECONDARY_HEAT',
      'No secondary heat source — power outage during freeze is higher risk.',
      ['property.hasSecondaryHeat'],
    ));
    actions.push(action(
      'PREPARE_BACKUP_HEAT',
      'Prepare a safe backup heat source',
      'high',
      'HVAC',
    ));
  } else if (hasSecondaryHeat === null) {
    evidence.markMissing('property.hasSecondaryHeat', 'SECONDARY_HEAT_PRESENCE_UNKNOWN');
  }

  const hvacAge = explicitSystemAge(
    property,
    evidence,
    'hvacInstallYear',
    evaluationYear,
    'HVAC_INSTALL_YEAR_UNKNOWN',
  );
  if (hvacAge !== null && hvacAge > 15) {
    score += 0.08;
    drivers.push(driver(
      'AGING_HVAC',
      `HVAC is ${hvacAge} years old and may struggle in extreme cold.`,
      ['property.hvacInstallYear'],
    ));
    systems.push({ type: 'hvac', relevance: 'high' });
    actions.push(action(
      'SERVICE_HVAC',
      'Have HVAC serviced and inspect the heat exchanger',
      'medium',
      'HVAC',
    ));
  } else {
    systems.push({ type: 'hvac', relevance: 'medium' });
  }

  actions.push(action(
    'PROTECT_PIPES',
    'Insulate exposed pipes and let faucets drip during freeze',
    'high',
    'PLUMBING',
  ));
  return {
    matchScore: clamp(score),
    impactSummary: hasIrrigation === true
      ? 'Freeze event in your area. Drain your irrigation system and protect pipes.'
      : 'Freeze event detected. Protect pipes and ensure HVAC is functioning.',
    drivers,
    actions,
    systems,
  };
}

function computeWeatherHeatWave(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evaluationYear: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const actions: RadarRecommendedAction[] = [];
  const systems: RadarMatchedSystem[] = [];
  const coolingType = evidence.read(property, 'coolingType');
  const hvacAge = explicitSystemAge(
    property,
    evidence,
    'hvacInstallYear',
    evaluationYear,
    'HVAC_INSTALL_YEAR_UNKNOWN',
  );

  if (coolingType === null || coolingType === 'UNKNOWN') {
    evidence.markMissing('property.coolingType', 'COOLING_TYPE_UNKNOWN');
    actions.push(action(
      'VERIFY_COOLING',
      'Confirm that a safe cooling option is available before the heat wave',
      'high',
      'HVAC',
    ));
  } else if (hvacAge !== null && hvacAge > 12) {
    score += 0.1;
    drivers.push(driver(
      'AGING_HVAC',
      `HVAC is ${hvacAge} years old — efficiency may be reduced in extreme heat.`,
      ['property.hvacInstallYear'],
    ));
    actions.push(action(
      'SERVICE_HVAC',
      'Service HVAC before the heat wave and replace air filters',
      'high',
      'HVAC',
    ));
    systems.push({ type: 'hvac', relevance: 'high' });
  } else {
    systems.push({ type: 'hvac', relevance: 'medium' });
    actions.push(action(
      'CHECK_AIR_FILTERS',
      'Replace HVAC air filters before the heat wave',
      'medium',
      'HVAC',
    ));
  }

  actions.push(action(
    'CHECK_ATTIC_INSULATION',
    'Check attic insulation to reduce heat transfer',
    'low',
    'BUILDING_EXTERIOR',
  ));
  return {
    matchScore: clamp(score),
    impactSummary: hvacAge !== null && hvacAge > 12
      ? `Heat wave alert. Your ${hvacAge}-year-old HVAC may struggle — service recommended.`
      : 'Heat wave detected in your area. Ensure cooling systems are working and minimize heat gain.',
    drivers,
    actions,
    systems,
  };
}

function computeWeatherWind(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evaluationYear: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const roofAge = explicitSystemAge(
    property,
    evidence,
    'roofReplacementYear',
    evaluationYear,
    'ROOF_REPLACEMENT_YEAR_UNKNOWN',
  );
  if (roofAge !== null && roofAge > 15) {
    score += 0.12;
    drivers.push(driver(
      'OLDER_ROOF',
      `Roof is ${roofAge} years old — shingles are more prone to wind uplift.`,
      ['property.roofReplacementYear'],
    ));
  }
  return {
    matchScore: clamp(score),
    impactSummary: 'High wind event detected. Secure outdoor items and inspect roof for damage.',
    drivers,
    actions: [
      action(
        'INSPECT_ROOF',
        roofAge !== null && roofAge > 15
          ? 'Inspect roof for lifted or missing shingles after the wind event'
          : 'Check roof and gutters for wind damage',
        roofAge !== null && roofAge > 15 ? 'high' : 'medium',
        'ROOF',
      ),
      action('SECURE_OUTDOOR_ITEMS', 'Secure or bring in outdoor furniture and decorations', 'high', 'BUILDING_EXTERIOR'),
      action('CHECK_FENCING', 'Inspect fencing and gates for wind damage', 'low', 'BUILDING_EXTERIOR'),
    ],
    systems: [{ type: 'roof', relevance: 'high' }],
  };
}

function computeWeatherFloodRain(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const actions: RadarRecommendedAction[] = [];
  const systems: RadarMatchedSystem[] = [];

  const hasDrainageIssues = evidence.read(property, 'hasDrainageIssues');
  if (hasDrainageIssues === true) {
    score += 0.15;
    drivers.push(driver(
      'KNOWN_DRAINAGE_ISSUES',
      'Property has known drainage issues — flood risk is elevated.',
      ['property.hasDrainageIssues'],
    ));
    actions.push(action(
      'CLEAR_DRAINS',
      'Clear all drains, gutters, and downspouts immediately',
      'high',
      'LANDSCAPING',
    ));
    systems.push({ type: 'drainage', relevance: 'high' });
  } else if (hasDrainageIssues === null) {
    evidence.markMissing('property.hasDrainageIssues', 'DRAINAGE_ISSUES_UNKNOWN');
  }

  const hasSumpPump = evidence.read(property, 'hasSumpPump');
  if (hasSumpPump === true) {
    const hasSumpPumpBackup = evidence.read(property, 'hasSumpPumpBackup');
    if (hasSumpPumpBackup === false) {
      score += 0.1;
      drivers.push(driver(
        'NO_SUMP_BACKUP',
        'Confirmed sump pump has no backup — basement flood risk is higher if power fails.',
        ['property.hasSumpPump', 'property.hasSumpPumpBackup'],
      ));
      actions.push(action(
        'INSPECT_SUMP_PUMP',
        'Test the sump pump and consider a battery backup',
        'high',
        'PLUMBING',
      ));
      systems.push({ type: 'sump_pump', relevance: 'high' });
    } else if (hasSumpPumpBackup === null) {
      evidence.markMissing('property.hasSumpPumpBackup', 'SUMP_PUMP_BACKUP_UNKNOWN');
    }
  } else if (hasSumpPump === null) {
    evidence.markMissing('property.hasSumpPump', 'SUMP_PUMP_PRESENCE_UNKNOWN');
  }

  const foundationType = evidence.read(property, 'foundationType');
  if (foundationType === 'BASEMENT' || foundationType === 'CRAWL_SPACE') {
    score += 0.08;
    drivers.push(driver(
      'BELOW_GRADE_FOUNDATION',
      'Below-grade foundation increases flood water intrusion risk.',
      ['property.foundationType'],
    ));
    systems.push({ type: 'foundation', relevance: 'medium' });
  } else if (foundationType === null || foundationType === 'UNKNOWN') {
    evidence.markMissing('property.foundationType', 'FOUNDATION_TYPE_UNKNOWN');
  }

  actions.push(action(
    'CHECK_GUTTERS',
    'Clear gutters and extend downspouts away from the foundation',
    'high',
    'ROOF',
  ));
  actions.push(action(
    'MOVE_VALUABLES',
    'Move valuables from basement or low-lying areas',
    'medium',
  ));
  return {
    matchScore: clamp(score),
    impactSummary: hasDrainageIssues === true
      ? 'Heavy rain / flood risk event. Known drainage issues increase your property risk — take action now.'
      : 'Heavy rain or flood risk detected. Inspect gutters, drainage, and low-lying areas.',
    drivers,
    actions,
    systems,
  };
}

function computeAirQualitySmoke(baseScore: number, eventType: string): EventImpactPartial {
  return {
    matchScore: clamp(baseScore + 0.05),
    impactSummary: eventType === 'wildfire_smoke'
      ? 'Wildfire smoke detected in your area. Run HVAC on recirculate and replace filters frequently.'
      : 'Poor air quality detected. Keep windows closed and check HVAC filters.',
    drivers: [],
    actions: [
      action('CHECK_AIR_FILTERS', 'Replace HVAC air filters — smoke can clog them quickly', 'high', 'HVAC'),
      action('SERVICE_HVAC', 'Schedule HVAC service if filtration or recirculation is not working properly', 'medium', 'HVAC'),
      action('SEAL_WINDOWS', 'Keep windows and doors closed; seal gaps if possible', 'medium', 'BUILDING_EXTERIOR'),
      action('USE_AIR_PURIFIER', 'Run a HEPA air purifier indoors', 'medium'),
    ],
    systems: [{ type: 'hvac', relevance: 'medium' }],
  };
}

function computePowerSurgeRisk(baseScore: number): EventImpactPartial {
  return {
    matchScore: clamp(baseScore + 0.05),
    impactSummary: 'Power surge risk in your area. Protect electronics and sensitive appliances.',
    drivers: [],
    actions: [
      action('CHECK_SURGE_PROTECTORS', 'Verify electronics are on surge-protected power strips', 'high', 'SHARED_SYSTEMS'),
      action('UNPLUG_APPLIANCES', 'Unplug sensitive appliances during the storm if possible', 'medium'),
    ],
    systems: [{ type: 'electrical', relevance: 'high' }],
  };
}

function computeInsuranceMarket(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evaluationYear: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const actions: RadarRecommendedAction[] = [
    action('REVIEW_POLICY', 'Review your current insurance policy and coverage limits', 'high'),
    action('GET_QUOTES', 'Get competing quotes from two or three insurers', 'high'),
  ];
  const roofAge = explicitSystemAge(
    property,
    evidence,
    'roofReplacementYear',
    evaluationYear,
    'ROOF_REPLACEMENT_YEAR_UNKNOWN',
  );
  if (roofAge !== null && roofAge > 15) {
    score += 0.1;
    drivers.push(driver(
      'OLDER_ROOF',
      'Older roof may lead to coverage exclusions or higher premiums.',
      ['property.roofReplacementYear'],
    ));
    actions.push(action(
      'DOCUMENT_ROOF',
      'Get a roof inspection and document its condition for the insurer',
      'medium',
      'ROOF',
    ));
  }
  const hasDrainageIssues = evidence.read(property, 'hasDrainageIssues');
  if (hasDrainageIssues === true) {
    score += 0.08;
    drivers.push(driver(
      'KNOWN_DRAINAGE_ISSUES',
      'Known drainage issues may affect insurability.',
      ['property.hasDrainageIssues'],
    ));
  } else if (hasDrainageIssues === null) {
    evidence.markMissing('property.hasDrainageIssues', 'DRAINAGE_ISSUES_UNKNOWN');
  }
  return {
    matchScore: clamp(score),
    impactSummary: 'Insurance market conditions in your area are shifting. Review your coverage and compare rates.',
    drivers,
    actions,
    systems: [{ type: 'insurance', relevance: 'high' }],
  };
}

function computeUtilityOutage(
  property: RadarImpactPropertyInput,
  baseScore: number,
  evidence: ImpactEvidence,
): EventImpactPartial {
  let score = baseScore;
  const drivers: RadarImpactDriver[] = [];
  const actions: RadarRecommendedAction[] = [
    action('CHARGE_DEVICES', 'Charge phones, tablets, and backup batteries', 'high'),
    action('FOOD_SAFETY', 'Avoid opening the refrigerator or freezer to preserve temperature', 'medium'),
  ];
  const systems: RadarMatchedSystem[] = [{ type: 'electrical', relevance: 'high' }];
  const fuelValue = evidence.read(property, 'primaryHeatingFuel');
  const fuel = fuelValue?.trim().toLowerCase() ?? null;
  const electricHeating = fuel === 'electric' || fuel === 'electricity';
  if (electricHeating) {
    score += 0.15;
    drivers.push(driver(
      'ELECTRIC_DEPENDENT_HEATING',
      'Primary heating is electric — an outage directly affects home heating.',
      ['property.primaryHeatingFuel'],
    ));
    actions.push(action(
      'PREPARE_BACKUP_HEAT',
      'Prepare a safe backup heat source',
      'high',
      'HVAC',
    ));
    systems.push({ type: 'hvac', relevance: 'high' });
  } else if (!fuel) {
    evidence.markMissing('property.primaryHeatingFuel', 'PRIMARY_HEATING_FUEL_UNKNOWN');
  }

  const hasSecondaryHeat = evidence.read(property, 'hasSecondaryHeat');
  if (hasSecondaryHeat === false) {
    score += 0.08;
    drivers.push(driver(
      'NO_SECONDARY_HEAT',
      'No secondary heat source is recorded.',
      ['property.hasSecondaryHeat'],
    ));
  } else if (hasSecondaryHeat === null) {
    evidence.markMissing('property.hasSecondaryHeat', 'SECONDARY_HEAT_PRESENCE_UNKNOWN');
  }
  return {
    matchScore: clamp(score),
    impactSummary: electricHeating
      ? 'Utility outage in your area. Your electric heating system will be affected — prepare a safe backup heat source.'
      : 'Utility outage detected in your area. Charge devices and check critical systems.',
    drivers,
    actions,
    systems,
  };
}

function computeStaticEvent(baseScore: number, eventType: string): EventImpactPartial {
  if (eventType === 'earthquake') {
    return {
      matchScore: clamp(baseScore),
      impactSummary:
        'USGS reported an earthquake within the reviewed monitoring distance for this home. This does not by itself indicate property damage; local effects vary by distance, depth, and ground conditions.',
      drivers: [],
      actions: [
        action('MONITOR_SITUATION', 'Review the official USGS event page for verified updates', 'medium'),
      ],
      systems: [],
    };
  }
  if (eventType === 'utility_rate_change') {
    return {
      matchScore: clamp(baseScore),
      impactSummary: 'A utility rate change has been detected in your area. Review energy usage to manage costs.',
      drivers: [],
      actions: [
        action('REVIEW_ENERGY_USAGE', 'Review energy usage and identify savings opportunities', 'medium'),
        action('COMPARE_PROVIDERS', 'Compare utility providers or consider a fixed-rate plan', 'low'),
      ],
      systems: [],
    };
  }
  if (eventType === 'tax_reassessment' || eventType === 'tax_rate_change') {
    return {
      matchScore: clamp(baseScore),
      impactSummary: eventType === 'tax_reassessment'
        ? 'A property tax reassessment is occurring in your area. Review the assessment and appeal options.'
        : 'A tax rate change has been detected in your area. Update your homeownership budget accordingly.',
      drivers: [],
      actions: [
        action('REVIEW_ASSESSMENT', 'Review the new tax assessment for accuracy', 'high'),
        action('PREPARE_APPEAL', 'Gather comparable sales data if you plan to appeal', 'medium'),
        action('UPDATE_BUDGET', 'Update your annual budget for the new tax obligation', 'medium'),
      ],
      systems: [],
    };
  }
  return {
    matchScore: clamp(baseScore),
    impactSummary: `A ${eventType.replace(/_/g, ' ')} event has been detected in your area. Monitor local conditions.`,
    drivers: [],
    actions: [
      action('MONITOR_SITUATION', `Monitor local updates for this ${eventType.replace(/_/g, ' ')} event`, 'medium'),
    ],
    systems: [],
  };
}

function normalizeParty(value: string | undefined): RadarResponsibleParty {
  return value === 'OWNER'
    || value === 'ASSOCIATION'
    || value === 'LANDLORD'
    || value === 'SHARED'
    ? value
    : 'UNKNOWN';
}

function applyResponsibilityDecisions(
  actions: RadarRecommendedAction[],
  property: RadarImpactPropertyInput,
  evidence: ImpactEvidence,
): {
  actions: RadarRecommendedAction[];
  decisions: RadarResponsibilityDecision[];
} {
  const byScope = new Map(property.responsibilities.map((entry) => [entry.scope, entry.party]));
  const decisions = new Map<RadarResponsibilityScope, RadarResponsibilityDecision>();
  const applied = actions.map((candidate) => {
    if (!candidate.responsibilityScope) return candidate;
    const scope = candidate.responsibilityScope;
    const party = normalizeParty(byScope.get(scope));
    evidence.record(`responsibility.${scope}`, party);
    const decision = party === 'OWNER'
      ? 'owner_action' as const
      : party === 'UNKNOWN'
        ? 'unknown' as const
        : 'coordinate' as const;
    decisions.set(scope, { scope, party, decision });
    if (party === 'UNKNOWN') {
      evidence.markMissing(`responsibility.${scope}`, 'RESPONSIBILITY_UNKNOWN');
      return { ...candidate, responsibleParty: party, applicability: 'verify_responsibility' as const };
    }
    if (party === 'ASSOCIATION' || party === 'LANDLORD') {
      const label = candidate.label.charAt(0).toLowerCase() + candidate.label.slice(1);
      return {
        ...candidate,
        label: `Contact your ${party === 'ASSOCIATION' ? 'association' : 'landlord'} to ${label}`,
        responsibleParty: party,
        applicability: 'coordinate' as const,
      };
    }
    return {
      ...candidate,
      responsibleParty: party,
      applicability: party === 'OWNER' ? 'owner_action' as const : 'coordinate' as const,
    };
  });
  return {
    actions: applied,
    decisions: [...decisions.values()].sort((a, b) => a.scope.localeCompare(b.scope)),
  };
}

/**
 * Pure deterministic impact calculation. All time, event, property, and
 * responsibility inputs are supplied by the caller; this module performs no
 * I/O and never infers a system installation year from construction year.
 */
export function computeRadarImpact(
  event: RadarImpactEventInput,
  property: RadarImpactPropertyInput,
  evaluatedAt: Date,
): RadarImpactResult {
  if (!Number.isFinite(evaluatedAt.getTime())) {
    throw new TypeError('Radar impact evaluation time must be valid');
  }
  const evidence = new ImpactEvidence();
  evidence.record('event.eventType', event.eventType);
  evidence.record('event.eventSubType', event.eventSubType ?? null);
  evidence.record('event.severity', event.severity);
  const severity = event.severity in SEVERITY_BASE_SCORE
    ? event.severity as RadarImpactSeverity
    : 'medium';
  const baseScore = SEVERITY_BASE_SCORE[severity];
  const evaluationYear = evaluatedAt.getUTCFullYear();
  let partial: EventImpactPartial;

  switch (event.eventType) {
    case 'hail':
      partial = computeWeatherHail(property, baseScore, evaluationYear, evidence);
      break;
    case 'freeze':
      partial = computeWeatherFreeze(property, baseScore, evaluationYear, evidence);
      break;
    case 'heat_wave':
      partial = computeWeatherHeatWave(property, baseScore, evaluationYear, evidence);
      break;
    case 'wind':
      partial = computeWeatherWind(property, baseScore, evaluationYear, evidence);
      break;
    case 'heavy_rain':
    case 'flood_risk':
      partial = computeWeatherFloodRain(property, baseScore, evidence);
      break;
    case 'air_quality':
    case 'wildfire_smoke':
      partial = computeAirQualitySmoke(baseScore, event.eventType);
      break;
    case 'power_surge_risk':
      partial = computePowerSurgeRisk(baseScore);
      break;
    case 'insurance_market':
      partial = computeInsuranceMarket(property, baseScore, evaluationYear, evidence);
      break;
    case 'utility_outage':
      partial = computeUtilityOutage(property, baseScore, evidence);
      break;
    default:
      partial = computeStaticEvent(baseScore, event.eventType);
  }

  const responsibility = applyResponsibilityDecisions(
    partial.actions,
    property,
    evidence,
  );
  const score = partial.matchScore ?? baseScore;
  return {
    ruleVersion: RADAR_IMPACT_RULE_VERSION,
    matchScore: score,
    impactLevel: scoreToImpactLevel(score),
    impactSummary: partial.impactSummary,
    impactFactorsJson: {
      ruleVersion: RADAR_IMPACT_RULE_VERSION,
      evaluatedAt: evaluatedAt.toISOString(),
      property: {
        yearBuilt: property.yearBuilt,
        propertySize: property.propertySize,
        dwellingType: property.dwellingType,
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
      drivers: partial.drivers,
      inputFacts: evidence.inputFacts(),
      missingFacts: evidence.missingFacts(),
      responsibilityDecisions: responsibility.decisions,
    },
    recommendedActionsJson: { actions: responsibility.actions },
    matchedSystemsJson: { systems: partial.systems },
  };
}
