import {
  BenchmarkMatch,
  LinkedEntityContext,
  PriceAdjustment,
  PropertyContext,
  ServiceCategoryValue,
  ServicePriceRadarEvaluation,
  ServiceRadarCreateInput,
  ServiceRadarVerdictValue,
} from './servicePriceRadar.types';

const ENGINE_VERSION = 'service-price-radar-mvp-v1';

type CategoryHeuristic = {
  baseLow: number;
  baseHigh: number;
  areaSensitive: boolean;
  notes: string[];
};

const CATEGORY_HEURISTICS: Record<ServiceCategoryValue, CategoryHeuristic> = {
  INSPECTION: { baseLow: 250, baseHigh: 800, areaSensitive: false, notes: ['Inspection pricing is typically scoped per visit rather than full-home size.'] },
  HANDYMAN: { baseLow: 150, baseHigh: 850, areaSensitive: false, notes: ['Handyman pricing is often labor-driven for small repairs.'] },
  GENERAL_HANDYMAN: { baseLow: 150, baseHigh: 900, areaSensitive: false, notes: ['General handyman work is usually quoted as a small-scope labor job.'] },
  PLUMBING: { baseLow: 180, baseHigh: 950, areaSensitive: false, notes: ['Plumbing pricing changes with access difficulty and fixture complexity.'] },
  ELECTRICAL: { baseLow: 175, baseHigh: 900, areaSensitive: false, notes: ['Electrical work usually carries permit and safety-driven labor premiums.'] },
  HVAC: { baseLow: 250, baseHigh: 1200, areaSensitive: false, notes: ['HVAC quotes vary heavily by equipment age and replacement scope.'] },
  ROOFING: { baseLow: 700, baseHigh: 3200, areaSensitive: true, notes: ['Roofing work scales with surface area and access complexity.'] },
  WATER_HEATER: { baseLow: 650, baseHigh: 2400, areaSensitive: false, notes: ['Water heater jobs swing between repair, venting, and full replacement.'] },
  FOUNDATION: { baseLow: 1500, baseHigh: 8500, areaSensitive: true, notes: ['Foundation pricing is sensitive to structural severity and property footprint.'] },
  WINDOWS_DOORS: { baseLow: 350, baseHigh: 2600, areaSensitive: true, notes: ['Window and door work usually scales with unit count and trim complexity.'] },
  INSULATION: { baseLow: 900, baseHigh: 3200, areaSensitive: true, notes: ['Insulation work commonly tracks attic or wall coverage area.'] },
  LANDSCAPING: { baseLow: 200, baseHigh: 1600, areaSensitive: true, notes: ['Landscaping pricing varies with yard size and drainage conditions.'] },
  LANDSCAPING_DRAINAGE: { baseLow: 500, baseHigh: 3800, areaSensitive: true, notes: ['Drainage work tends to scale with grading and runoff complexity.'] },
  GUTTERS: { baseLow: 250, baseHigh: 1800, areaSensitive: true, notes: ['Gutter pricing scales with roofline length and height.'] },
  SOLAR: { baseLow: 1500, baseHigh: 9000, areaSensitive: true, notes: ['Solar work ranges widely between repairs, add-ons, and equipment replacement.'] },
  FLOORING: { baseLow: 1200, baseHigh: 6500, areaSensitive: true, notes: ['Flooring quotes generally scale with square footage and finish quality.'] },
  PAINTING: { baseLow: 600, baseHigh: 4800, areaSensitive: true, notes: ['Painting quotes change materially with coverage area and prep needs.'] },
  SIDING: { baseLow: 900, baseHigh: 7000, areaSensitive: true, notes: ['Siding work scales with exterior size and existing condition.'] },
  MOLD_REMEDIATION: { baseLow: 800, baseHigh: 6000, areaSensitive: true, notes: ['Mold remediation quotes reflect spread, containment, and cleanup scope.'] },
  CLEANING: { baseLow: 120, baseHigh: 500, areaSensitive: true, notes: ['Cleaning quotes usually reflect size, access, and intensity of service.'] },
  MOVING: { baseLow: 300, baseHigh: 2600, areaSensitive: true, notes: ['Moving costs typically depend on size, access, and distance.'] },
  PEST_CONTROL: { baseLow: 150, baseHigh: 650, areaSensitive: false, notes: ['Pest control pricing depends on treatment type and visit count.'] },
  LOCKSMITH: { baseLow: 120, baseHigh: 420, areaSensitive: false, notes: ['Locksmith pricing is usually visit-based with hardware add-ons.'] },
  APPLIANCE_REPAIR: { baseLow: 150, baseHigh: 700, areaSensitive: false, notes: ['Appliance repair quotes usually depend on diagnostic depth and part cost.'] },
  APPLIANCE_REPLACEMENT: { baseLow: 450, baseHigh: 3500, areaSensitive: false, notes: ['Appliance replacement usually reflects equipment size and installation extras.'] },
  SECURITY_SAFETY: { baseLow: 200, baseHigh: 1800, areaSensitive: false, notes: ['Safety upgrades vary with hardware count and code requirements.'] },
  INSURANCE: { baseLow: 250, baseHigh: 1200, areaSensitive: false, notes: ['Insurance-related service estimates are treated as generic professional service pricing.'] },
  ATTORNEY: { baseLow: 350, baseHigh: 2500, areaSensitive: false, notes: ['Attorney pricing is handled as a generic professional service estimate in MVP.'] },
  FINANCE: { baseLow: 200, baseHigh: 1200, areaSensitive: false, notes: ['Finance-related service estimates are broad until dedicated benchmarks exist.'] },
  WARRANTY: { baseLow: 150, baseHigh: 900, areaSensitive: false, notes: ['Warranty-related service estimates are broad until dedicated benchmarks exist.'] },
  ADMIN: { baseLow: 100, baseHigh: 600, areaSensitive: false, notes: ['Administrative service pricing is estimated from broad visit-based assumptions.'] },
  OTHER: { baseLow: 200, baseHigh: 1500, areaSensitive: false, notes: ['Generic fallback estimate used because a more specific category baseline was unavailable.'] },
};

const REPLACEMENT_HINTS = ['replace', 'replacement', 'install', 'installation', 'new unit', 'new system', 'upgrade', 'full'];
const REPAIR_HINTS = ['repair', 'fix', 'patch', 'service', 'tune', 'maintenance', 'inspect', 'inspection', 'clean', 'flush', 'diagnostic', 'leak', 'clog'];

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeFreeform(value?: string | null): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function sentenceCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function detectScope(serviceCategory: ServiceCategoryValue, subcategory: string | null, labelRaw?: string): {
  code: 'REPAIR' | 'REPLACEMENT' | 'GENERAL';
  multiplier: number;
  note: string;
} {
  if (serviceCategory === 'APPLIANCE_REPLACEMENT') {
    return { code: 'REPLACEMENT', multiplier: 1.35, note: 'Replacement category selected, so the estimate assumes equipment and install costs.' };
  }

  if (serviceCategory === 'APPLIANCE_REPAIR') {
    return { code: 'REPAIR', multiplier: 0.88, note: 'Repair category selected, so the estimate leans toward labor-plus-parts pricing.' };
  }

  const search = `${subcategory ?? ''} ${labelRaw ?? ''}`.toLowerCase();
  if (REPLACEMENT_HINTS.some((hint) => search.includes(hint))) {
    return { code: 'REPLACEMENT', multiplier: 1.28, note: 'Replacement/install wording increased the expected range.' };
  }

  if (REPAIR_HINTS.some((hint) => search.includes(hint))) {
    return { code: 'REPAIR', multiplier: 0.9, note: 'Repair/service wording narrowed the estimate toward a labor-first job.' };
  }

  return { code: 'GENERAL', multiplier: 1, note: 'No strong repair-vs-replacement clue was detected, so a general service scope was assumed.' };
}

function sizeMultiplier(sizeBand: string | null, areaSensitive: boolean): { multiplier: number; note: string } {
  if (!sizeBand) {
    return { multiplier: 1, note: 'Property size was unavailable, so no size adjustment was applied.' };
  }

  const table: Record<string, number> = areaSensitive
    ? { SMALL: 0.85, MEDIUM: 1, LARGE: 1.22, XLARGE: 1.42 }
    : { SMALL: 0.95, MEDIUM: 1, LARGE: 1.08, XLARGE: 1.15 };

  const multiplier = table[sizeBand] ?? 1;
  const effect = multiplier > 1 ? 'larger' : multiplier < 1 ? 'smaller' : 'average-sized';
  return {
    multiplier,
    note: `A ${effect} home size band (${sizeBand.toLowerCase()}) adjusted the estimate.`,
  };
}

function normalizeStateCode(state?: string | null): string | null {
  const raw = String(state ?? '').trim().toUpperCase();
  if (!raw) return null;

  const fullToCode: Record<string, string> = {
    CALIFORNIA: 'CA',
    NEW_YORK: 'NY',
    NEW_JERSEY: 'NJ',
    MASSACHUSETTS: 'MA',
    CONNECTICUT: 'CT',
    WASHINGTON: 'WA',
    HAWAII: 'HI',
    ALASKA: 'AK',
    FLORIDA: 'FL',
    TEXAS: 'TX',
    GEORGIA: 'GA',
    COLORADO: 'CO',
    OREGON: 'OR',
    VIRGINIA: 'VA',
    MARYLAND: 'MD',
    PENNSYLVANIA: 'PA',
    ILLINOIS: 'IL',
  };

  const token = raw.replace(/[^A-Z]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (token.length === 2) return token;
  return fullToCode[token] ?? null;
}

function regionMultiplier(state?: string | null): { multiplier: number; note: string } {
  const code = normalizeStateCode(state);
  if (!code) {
    return { multiplier: 1, note: 'Region fallback used because no state-level market tier was available.' };
  }

  const highCost = new Set(['CA', 'NY', 'NJ', 'MA', 'CT', 'WA', 'HI', 'AK']);
  const elevated = new Set(['CO', 'FL', 'MD', 'VA', 'OR']);
  const lowerCost = new Set(['TX', 'GA', 'PA', 'IN', 'OH', 'MI', 'MO']);

  if (highCost.has(code)) {
    return { multiplier: 1.18, note: `State market tier (${code}) raised the estimate.` };
  }

  if (elevated.has(code)) {
    return { multiplier: 1.08, note: `State market tier (${code}) modestly raised the estimate.` };
  }

  if (lowerCost.has(code)) {
    return { multiplier: 0.94, note: `State market tier (${code}) modestly reduced the estimate.` };
  }

  return { multiplier: 1, note: `State market tier (${code}) was treated as neutral.` };
}

function ageMultiplier(yearBuilt: number | null, linkedEntities: LinkedEntityContext[]): { multiplier: number; note: string; reasonCode?: string } {
  const currentYear = new Date().getFullYear();
  const propertyAge = yearBuilt ? Math.max(0, currentYear - yearBuilt) : null;

  let systemAge: number | null = null;
  for (const entity of linkedEntities) {
    const installedYear = typeof entity.facts.installedYear === 'number' ? entity.facts.installedYear : null;
    if (!installedYear) continue;
    const age = Math.max(0, currentYear - installedYear);
    if (systemAge === null || age > systemAge) systemAge = age;
  }

  if (systemAge !== null && systemAge >= 15) {
    return {
      multiplier: 1.12,
      note: 'An older linked system increased the expected range.',
      reasonCode: 'SYSTEM_CONTEXT',
    };
  }

  if (propertyAge === null) {
    return {
      multiplier: 1,
      note: 'Home age was unavailable, so no age adjustment was applied.',
    };
  }

  if (propertyAge >= 70) {
    return { multiplier: 1.16, note: 'An older home age increased complexity assumptions.', reasonCode: 'PROPERTY_AGE' };
  }

  if (propertyAge >= 40) {
    return { multiplier: 1.1, note: 'Home age modestly increased complexity assumptions.', reasonCode: 'PROPERTY_AGE' };
  }

  if (propertyAge <= 10) {
    return { multiplier: 0.96, note: 'A newer home slightly reduced complexity assumptions.', reasonCode: 'PROPERTY_AGE' };
  }

  return { multiplier: 1, note: 'Home age was treated as neutral for this estimate.', reasonCode: 'PROPERTY_AGE' };
}

function linkedEntityMultiplier(linkedEntities: LinkedEntityContext[]): { multiplier: number; note: string; reasonCodes: string[] } {
  if (!linkedEntities.length) {
    return { multiplier: 1, note: 'No linked system or room context was provided.', reasonCodes: [] };
  }

  let multiplier = 1;
  const reasonCodes = new Set<string>();
  const notes: string[] = [];

  for (const entity of linkedEntities) {
    if (entity.linkedEntityType === 'INCIDENT') {
      const severity = String(entity.facts.severity ?? '').toUpperCase();
      if (severity === 'CRITICAL') {
        multiplier *= 1.1;
        reasonCodes.add('INCIDENT_CONTEXT');
        notes.push('A linked critical incident increased the expected range.');
      } else if (severity === 'WARNING') {
        multiplier *= 1.04;
        reasonCodes.add('INCIDENT_CONTEXT');
        notes.push('A linked warning incident modestly increased the expected range.');
      }
    }

    if (entity.linkedEntityType === 'SYSTEM' || entity.linkedEntityType === 'APPLIANCE') {
      if (entity.facts.isVerified === true) {
        reasonCodes.add('SYSTEM_CONTEXT');
        notes.push('Verified linked equipment improved estimate specificity.');
      }

      const relevance = typeof entity.relevanceScore === 'number' ? entity.relevanceScore : 0.5;
      if (relevance >= 0.8) {
        multiplier *= 1.03;
      }
    }

    if (entity.linkedEntityType === 'ROOM') {
      reasonCodes.add('ROOM_CONTEXT');
      notes.push('Linked room context helped narrow scope assumptions.');
    }
  }

  return {
    multiplier,
    note: notes[0] ?? 'Linked context modestly refined the estimate.',
    reasonCodes: Array.from(reasonCodes),
  };
}

function benchmarkAdjustments(match: BenchmarkMatch): { multiplier: number; note: string } {
  if (!match.matched || !match.benchmark) {
    return { multiplier: 1, note: 'No benchmark match was available, so heuristic fallback logic was used.' };
  }

  const labor = match.benchmark.laborFactor ?? 1;
  const material = match.benchmark.materialFactor ?? 1;
  const multiplier = clamp((labor + material) / 2, 0.7, 1.45);
  return {
    multiplier,
    note: 'Matched benchmark labor and material factors influenced the expected range.',
  };
}

function buildAdjustment(code: string, effectMultiplier: number, note: string): PriceAdjustment {
  return {
    code,
    effect: effectMultiplier > 1.005 ? 'up' : effectMultiplier < 0.995 ? 'down' : 'neutral',
    multiplier: round(effectMultiplier, 4),
    note,
  };
}

function determineVerdict(quoteAmount: number, low: number | null, high: number | null, confidence: number | null): ServiceRadarVerdictValue {
  if (!low || !high || high <= 0 || low <= 0) {
    return 'INSUFFICIENT_DATA';
  }

  if (confidence !== null && confidence < 0.25) {
    return 'INSUFFICIENT_DATA';
  }

  if (quoteAmount < low * 0.8) return 'UNDERPRICED';
  if (quoteAmount <= high) return 'FAIR';
  if (quoteAmount <= high * 1.25) return 'HIGH';
  return 'VERY_HIGH';
}

function confidenceBand(confidence: number | null): 'low' | 'medium' | 'high' | 'unknown' {
  if (confidence === null || confidence === undefined) return 'unknown';
  if (confidence >= 0.72) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

function buildExplanationShort(
  verdict: ServiceRadarVerdictValue,
  quoteAmount: number,
  low: number | null,
  high: number | null,
  category: ServiceCategoryValue,
  confidence: number | null,
  benchmarkMatched: boolean
): string {
  const categoryLabel = sentenceCase(category.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  const lowConfidence = confidence !== null && confidence < 0.5;

  if (!low || !high || verdict === 'INSUFFICIENT_DATA') {
    if (!benchmarkMatched) {
      return `We could only estimate a broad ${categoryLabel} range based on limited property and pricing context.`;
    }

    return `We could only estimate a broad ${categoryLabel} range for this home with the context available.`;
  }

  const range = `$${round(low).toLocaleString()}-$${round(high).toLocaleString()}`;
  const amount = `$${round(quoteAmount).toLocaleString()}`;
  const fallbackSuffix = !benchmarkMatched ? ' This result uses fallback regional assumptions.' : '';
  const directionalPrefix = lowConfidence ? 'Directional result: ' : '';

  if (verdict === 'FAIR') {
    return `${directionalPrefix}${amount} looks within the expected ${categoryLabel} range of ${range} for this property.${fallbackSuffix}`;
  }

  if (verdict === 'HIGH') {
    return `${directionalPrefix}${amount} looks somewhat above the expected ${categoryLabel} range of ${range} for this property.${fallbackSuffix}`;
  }

  if (verdict === 'VERY_HIGH') {
    return `${directionalPrefix}${amount} looks well above the expected ${categoryLabel} range of ${range} for this property.${fallbackSuffix}`;
  }

  if (verdict === 'UNDERPRICED') {
    return `${directionalPrefix}${amount} looks meaningfully below the expected ${categoryLabel} range of ${range} for this property.${fallbackSuffix}`;
  }

  return `We could only estimate a broad ${categoryLabel} range for this property.`;
}

export class ServicePriceRadarEngine {
  evaluate(
    property: PropertyContext,
    input: ServiceRadarCreateInput,
    linkedEntities: LinkedEntityContext[],
    benchmarkMatch: BenchmarkMatch
  ): ServicePriceRadarEvaluation {
    const heuristic = CATEGORY_HEURISTICS[input.serviceCategory] ?? CATEGORY_HEURISTICS.OTHER;
    const normalizedSubcategory = normalizeFreeform(input.serviceSubcategory) ?? normalizeFreeform(input.serviceLabelRaw);

    const scope = detectScope(input.serviceCategory, normalizedSubcategory, input.serviceLabelRaw);
    const size = sizeMultiplier(property.sizeBand, heuristic.areaSensitive);
    const region = regionMultiplier(property.state);
    const age = ageMultiplier(property.yearBuilt, linkedEntities);
    const linked = linkedEntityMultiplier(linkedEntities);
    const benchmark = benchmarkAdjustments(benchmarkMatch);

    const adjustments: PriceAdjustment[] = [];
    const reasonCodes = new Set<string>();
    const notes = [...heuristic.notes];

    let low = benchmarkMatch.matched && benchmarkMatch.benchmark ? benchmarkMatch.benchmark.baseLow : heuristic.baseLow;
    let high = benchmarkMatch.matched && benchmarkMatch.benchmark ? benchmarkMatch.benchmark.baseHigh : heuristic.baseHigh;
    let median =
      benchmarkMatch.matched && benchmarkMatch.benchmark?.baseMedian != null
        ? benchmarkMatch.benchmark.baseMedian
        : (low + high) / 2;

    const adjustmentSeries: Array<{ code: string; multiplier: number; note: string; reasonCode?: string | string[] }> = [
      { code: 'SCOPE', multiplier: scope.multiplier, note: scope.note, reasonCode: 'SERVICE_SCOPE' },
      { code: 'SIZE_BAND', multiplier: size.multiplier, note: size.note, reasonCode: 'PROPERTY_SIZE' },
      { code: 'REGION_BASELINE', multiplier: region.multiplier, note: region.note, reasonCode: 'REGION_BASELINE' },
      { code: 'PROPERTY_AGE', multiplier: age.multiplier, note: age.note, reasonCode: age.reasonCode },
      { code: 'LINKED_CONTEXT', multiplier: linked.multiplier, note: linked.note, reasonCode: linked.reasonCodes },
      { code: 'BENCHMARK_FACTORS', multiplier: benchmark.multiplier, note: benchmark.note, reasonCode: benchmarkMatch.matched ? 'BENCHMARK' : 'HEURISTIC_FALLBACK' },
    ];

    for (const item of adjustmentSeries) {
      low *= item.multiplier;
      high *= item.multiplier;
      median *= item.multiplier;
      adjustments.push(buildAdjustment(item.code, item.multiplier, item.note));
      notes.push(item.note);

      if (Array.isArray(item.reasonCode)) {
        item.reasonCode.filter(Boolean).forEach((value) => reasonCodes.add(value));
      } else if (item.reasonCode) {
        reasonCodes.add(item.reasonCode);
      }
    }

    if (input.quoteCurrency && input.quoteCurrency.toUpperCase() !== 'USD') {
      adjustments.push(buildAdjustment('CURRENCY_ASSUMPTION', 1, 'Non-USD quotes are not FX-adjusted in this MVP.'));
      reasonCodes.add('CURRENCY_ASSUMPTION');
      notes.push('Quote currency was stored as provided, but the estimate assumes USD-oriented benchmark logic.');
    }

    low = round(clamp(low, 50, 250000));
    high = round(clamp(high, low + 25, 400000));
    median = round(clamp(median, low, high));

    let confidence = 0.32;
    if (benchmarkMatch.matched) confidence += 0.28;
    if (benchmarkMatch.benchmark?.serviceSubcategory && normalizedSubcategory && benchmarkMatch.benchmark.serviceSubcategory === normalizedSubcategory) confidence += 0.08;
    if (property.sizeBand) confidence += 0.06;
    if (property.yearBuilt) confidence += 0.05;
    if (linkedEntities.length) confidence += 0.08;
    if (normalizedSubcategory) confidence += 0.04;
    if (input.serviceCategory === 'OTHER' || input.serviceCategory === 'ADMIN' || input.serviceCategory === 'FINANCE') confidence -= 0.08;
    if (input.quoteCurrency && input.quoteCurrency.toUpperCase() !== 'USD') confidence -= 0.12;
    confidence = round(clamp(confidence, 0.18, 0.92), 4);

    const verdict = determineVerdict(input.quoteAmount, low, high, confidence);
    const lowConfidence = confidence !== null && confidence < 0.5;
    const explanationShort = buildExplanationShort(
      verdict,
      input.quoteAmount,
      low,
      high,
      input.serviceCategory,
      confidence,
      benchmarkMatch.matched
    );
    const mode = benchmarkMatch.matched ? 'benchmark' : 'fallback';
    const confidenceLabel = confidenceBand(confidence);

    const propertySnapshotJson = {
      propertyId: property.propertyId,
      propertyType: property.propertyType,
      homeType: property.homeType,
      propertySize: property.propertySize,
      sizeBand: property.sizeBand,
      yearBuilt: property.yearBuilt,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      systems: property.systems,
    };

    const pricingFactorsJson = {
      property: {
        squareFootage: property.propertySize,
        yearBuilt: property.yearBuilt,
        homeType: property.homeType,
        sizeBand: property.sizeBand,
      },
      region: {
        state: property.state,
        city: property.city,
        zip: property.zipCode,
        zipPrefix: property.zipCode ? property.zipCode.slice(0, 3) : null,
      },
      service: {
        category: input.serviceCategory,
        subcategory: normalizedSubcategory,
        labelRaw: input.serviceLabelRaw ?? null,
      },
      benchmark: {
        matched: benchmarkMatch.matched,
        benchmarkId: benchmarkMatch.benchmark?.id ?? null,
        regionType: benchmarkMatch.benchmark?.regionType ?? null,
        regionKey: benchmarkMatch.benchmark?.regionKey ?? null,
        sourceLabel: benchmarkMatch.benchmark?.sourceLabel ?? null,
      },
      confidence: {
        score: confidence,
        band: confidenceLabel,
      },
      estimationMode: mode,
      linkedEntities: linkedEntities.map((entity) => ({
        linkedEntityType: entity.linkedEntityType,
        linkedEntityId: entity.linkedEntityId,
        label: entity.label,
        relevanceScore: entity.relevanceScore,
      })),
      adjustments,
    };

    const explanationJson = {
      summary: explanationShort,
      reasonCodes: Array.from(reasonCodes),
      notes,
      limitations:
        verdict === 'INSUFFICIENT_DATA'
          ? ['Estimate is broad because the available property or pricing context was limited.']
          : !benchmarkMatch.matched
            ? ['Direct benchmark data was unavailable, so fallback regional assumptions were used.']
            : lowConfidence
              ? ['Estimate confidence is limited, so treat the result as directional rather than exact.']
              : [],
    };

    return {
      status: 'COMPLETED',
      normalizedSubcategory,
      expectedLow: low,
      expectedHigh: high,
      expectedMedian: median,
      confidenceScore: confidence,
      verdict,
      explanationShort,
      explanationJson,
      propertySnapshotJson,
      pricingFactorsJson,
      engineVersion: ENGINE_VERSION,
    };
  }
}
