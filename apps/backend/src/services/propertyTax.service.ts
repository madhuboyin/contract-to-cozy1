// apps/backend/src/services/propertyTax.service.ts
import { prisma } from '../lib/prisma';

export type PropertyTaxConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PropertyTaxEstimateInput = {
  assessedValue?: number; // USD (override)
  taxRate?: number; // e.g. 0.0185 = 1.85% (override)
  historyYears?: number; // default 7
};

export type PropertyTaxEstimateDTO = {
  input: {
    propertyId: string;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: {
      assessedValue?: number;
      taxRate?: number;
    };
  };

  current: {
    assessedValue: number;
    taxRate: number;
    annualTax: number;
    monthlyTax: number;
    confidence: PropertyTaxConfidence;
  };

  history: { year: number; annualTax: number }[];

  projection: { years: 5 | 10 | 20; estimatedAnnualTax: number; assumptions: string[] }[];

  comparison: {
    stateMedianAnnualTax: number;
    countyMedianAnnualTax: number;
    cityMedianAnnualTax: number;
    percentileApprox: number; // 1..99
  };

  drivers: {
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }[];

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
  };
};

const DEFAULT_HISTORY_YEARS = 7;

// Conservative, approximate effective property tax rates by state.
// (These are heuristics for v1; later you’ll replace with county/school district providers.)
const EFFECTIVE_TAX_RATE_BY_STATE: Record<string, number> = {
  TX: 0.0185,
  CA: 0.0075,
  FL: 0.0105,
  NY: 0.0140,
  NJ: 0.0210,
  IL: 0.0190,
  WA: 0.0095,
  MA: 0.0115,
  CO: 0.0065,
  NC: 0.0085,
  GA: 0.0090,
  AZ: 0.0070,
};

// Rough $/sqft estimates (v1 heuristic only)
const VALUE_PER_SQFT_BY_STATE: Record<string, number> = {
  TX: 180,
  CA: 380,
  FL: 220,
  NY: 320,
  NJ: 300,
  IL: 200,
  WA: 260,
  MA: 320,
  CO: 240,
  NC: 190,
  GA: 180,
  AZ: 210,
};

// Simple annual growth assumption used for history backfill + projections
function assumedAnnualIncreaseRate(state: string) {
  // Keep modest; you can tune per-state later
  if (state === 'TX' || state === 'FL') return 0.045;
  if (state === 'CA' || state === 'NY' || state === 'NJ') return 0.035;
  return 0.03;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function estimateAssessedValueUSD(args: { state: string; propertySize?: number | null }): { value: number; confidence: PropertyTaxConfidence; notes: string[] } {
  const notes: string[] = [];
  const { state, propertySize } = args;

  if (propertySize && Number.isFinite(propertySize) && propertySize > 200) {
    const ppsf = VALUE_PER_SQFT_BY_STATE[state] ?? 200;
    const v = propertySize * ppsf;
    notes.push(`Estimated assessed value using ${ppsf}/sqft heuristic.`);
    return { value: v, confidence: 'MEDIUM', notes };
  }

  // fallback
  notes.push('Estimated assessed value using generic fallback (no property size).');
  return { value: 350000, confidence: 'LOW', notes };
}

function estimateTaxRate(state: string): { rate: number; confidence: PropertyTaxConfidence; notes: string[] } {
  const notes: string[] = [];
  const rate = EFFECTIVE_TAX_RATE_BY_STATE[state] ?? 0.011;
  if (EFFECTIVE_TAX_RATE_BY_STATE[state]) {
    notes.push('Used state-level effective rate heuristic.');
    return { rate, confidence: 'MEDIUM', notes };
  }
  notes.push('Used generic effective rate fallback.');
  return { rate, confidence: 'LOW', notes };
}

function buildHistory(currentAnnualTax: number, state: string, historyYears: number) {
  const nowYear = new Date().getFullYear();
  const g = assumedAnnualIncreaseRate(state);

  const years = clamp(historyYears, 3, 15);
  const out: { year: number; annualTax: number }[] = [];

  // Build past years ending at current year
  for (let i = years - 1; i >= 0; i--) {
    const year = nowYear - i;
    const factor = Math.pow(1 + g, -i);
    out.push({ year, annualTax: toMoney(currentAnnualTax * factor) });
  }
  return out;
}

function buildProjections(currentAnnualTax: number, state: string) {
  const g = assumedAnnualIncreaseRate(state);

  const mk = (years: 5 | 10 | 20) => ({
    years,
    estimatedAnnualTax: toMoney(currentAnnualTax * Math.pow(1 + g, years)),
    assumptions: [
      `Assumed average annual increase rate of ${(g * 100).toFixed(1)}%.`,
      'Projection is a heuristic (county reassessment rules and exemptions can vary).',
    ],
  });

  return [mk(5), mk(10), mk(20)];
}

function buildComparison(currentAnnualTax: number, state: string) {
  // v1 heuristic: treat "state median annual tax" as 85% of current (or a state baseline if you add one later).
  // Later: replace with real city/county medians from open data.
  const stateMedian = toMoney(currentAnnualTax * 0.85);
  const countyMedian = toMoney(currentAnnualTax * 0.95);
  const cityMedian = toMoney(currentAnnualTax * 0.9);

  // percentile heuristic: compare to state median
  const ratio = stateMedian > 0 ? currentAnnualTax / stateMedian : 1;
  const percentileApprox = clamp(Math.round(50 + (ratio - 1) * 40), 1, 99);

  return {
    stateMedianAnnualTax: stateMedian,
    countyMedianAnnualTax: countyMedian,
    cityMedianAnnualTax: cityMedian,
    percentileApprox,
  };
}

type Driver = { factor: string; impact: ImpactLevel; explanation: string };

function buildDriversLocalized(args: { state: string; zipCode: string; taxRate: number; assessedValue: number }): Driver[] {
  const { state, zipCode, taxRate, assessedValue } = args;

  const zp = zipPrefix(zipCode);
  const rateBand = typicalEffectiveRateBand(state, taxRate);
  const growth = localGrowthHint(state, zipCode);

  const drivers: Driver[] = [
    {
      factor: `Local effective tax rates (${state})`,
      impact: rateBand.band,
      explanation:
        `Based on your state (${state}), your effective rate (${(taxRate * 100).toFixed(2)}%) is ${rateBand.msg}. ` +
        `This is one of the biggest drivers of annual tax differences across ZIP codes.`,
    },
    {
      factor: `Assessed value pressure (ZIP ${zipCode})`,
      impact: assessedValue >= 500000 ? 'HIGH' : assessedValue >= 300000 ? 'MEDIUM' : 'LOW',
      explanation:
        `Your estimate scales with assessed value. ZIP prefix ${zp} is used to anchor localized messaging in v1; ` +
        `we’ll enrich this with county/assessor data later for more precision.`,
    },
    {
      factor: `Reassessment & market growth signals (ZIP ${zipCode})`,
      impact: growth,
      explanation:
        growth === 'HIGH'
          ? `Homes in parts of your region (ZIP prefix ${zp}) often experience faster valuation changes, which can push taxes upward during reassessments.`
          : `Your region (ZIP prefix ${zp}) typically follows moderate reassessment-driven changes compared to high-growth metros.`,
    },
  ];
  

  if (stateHasHomestead(state)) {
    drivers.push({
      factor: `Exemptions & caps (${state})`,
      impact: 'MEDIUM',
      explanation:
        `Many homeowners can reduce taxable value or limit increases via exemptions/caps (often called “homestead” or similar). ` +
        `We can surface eligibility prompts later once you confirm your residency/ownership status.`,
    });
  }

  if (state !==  'TX') {
    const school = schoolFundingSignal(state);

    drivers.splice(1, 0, {
      factor: `School funding impact (${state})`,
      impact: school.impact,
      explanation:
        `${school.note} ` +
        `If your area is known for strong school resources, that can correlate with higher local rates compared to nearby ZIP codes.`,
    });
  } else {
    // keep the detailed TX card and insert it instead at index 1
    drivers.splice(1, 0, {
      factor: 'School district levies (TX)',
      impact: 'HIGH',
      explanation:
        'In many Texas jurisdictions, school district taxes make up a large portion of the total bill. This can vary significantly by district even within the same city.',
    });
  }
  
  return drivers;
}


function zipPrefix(zip: string) {
  const z = String(zip || '').replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : z;
}

function stateHasHomestead(state: string) {
  // v1: broad hinting; expand later per-state
  return [
    'TX','FL','CA','NY','NJ','IL','WA','MA','CO','NC','GA','AZ'
  ].includes(state);
}

function localGrowthHint(state: string, zip: string): ImpactLevel {
  const zp = zipPrefix(zip);
  if (state === 'TX' && ['786', '787', '750', '752'].includes(zp)) return 'HIGH';
  if (state === 'FL' && ['331', '333', '334', '328'].includes(zp)) return 'HIGH';
  if (state === 'CA' && ['900', '902', '940', '941', '943'].includes(zp)) return 'HIGH';
  return 'MEDIUM';
}

function typicalEffectiveRateBand(state: string, rate: number): { band: ImpactLevel; msg: string } {
  const baseline = EFFECTIVE_TAX_RATE_BY_STATE[state] ?? 0.011;
  const delta = rate - baseline;
  if (delta > 0.003) return { band: 'HIGH', msg: 'higher than typical for your state' };
  if (delta < -0.003) return { band: 'LOW', msg: 'lower than typical for your state' };
  return { band: 'MEDIUM', msg: 'around typical for your state' };
}
function schoolFundingSignal(state: string): { impact: 'LOW' | 'MEDIUM' | 'HIGH'; note: string } {
  // Heuristic: states where property-tax-funded school systems are a major narrative/driver.
  // This is intentionally conservative; later you can replace with district finance data.
  const high = new Set(['NJ', 'NY', 'TX', 'IL', 'CT', 'NH', 'MA', 'PA']);
  const medium = new Set(['CA', 'FL', 'VA', 'MD', 'WA', 'CO', 'NC', 'GA', 'AZ']);

  if (high.has(state)) {
    return {
      impact: 'HIGH',
      note:
        'Public schools are often heavily funded through local property taxes, and school budgets can meaningfully influence total tax rates.',
    };
  }
  if (medium.has(state)) {
    return {
      impact: 'MEDIUM',
      note:
        'A meaningful share of local property taxes often supports public schools, which can influence overall tax rates.',
    };
  }
  return {
    impact: 'MEDIUM',
    note:
      'Property taxes can support local services including public schools; the school funding share varies by area.',
  };
}

export class PropertyTaxService {
  async estimate(propertyId: string, opts: PropertyTaxEstimateInput = {}): Promise<PropertyTaxEstimateDTO> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        propertySize: true,
      },
    });

    if (!property) {
      // propertyAuthMiddleware should prevent this, but keep service safe
      throw new Error('Property not found');
    }

    const state = String(property.state || '').toUpperCase().trim();
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'Internal property profile (address/state/zip/propertySize)',
      'Heuristic state-level effective tax rate (v1)',
      'Heuristic value-per-sqft estimate (v1)',
    ];

    let assessedValue: number;
    let taxRate: number;

    let confidence: PropertyTaxConfidence = 'LOW';

    if (opts.assessedValue !== undefined) {
      assessedValue = opts.assessedValue;
      notes.push('Assessed value override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const r = estimateAssessedValueUSD({ state, propertySize: property.propertySize });
      assessedValue = r.value;
      notes.push(...r.notes);
      confidence = r.confidence;
    }

    if (opts.taxRate !== undefined) {
      taxRate = opts.taxRate;
      notes.push('Tax rate override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const r = estimateTaxRate(state);
      taxRate = r.rate;
      notes.push(...r.notes);
      confidence = confidence === 'HIGH' ? 'HIGH' : r.confidence; // preserve HIGH if overrides exist
    }

    const annualTax = toMoney(assessedValue * taxRate);
    const monthlyTax = toMoney(annualTax / 12);

    const historyYears = opts.historyYears ?? DEFAULT_HISTORY_YEARS;
    const history = buildHistory(annualTax, state, historyYears);
    const projection = buildProjections(annualTax, state);
    const comparison = buildComparison(annualTax, state);
    const drivers = buildDriversLocalized({
      state,
      zipCode: property.zipCode,
      taxRate,
      assessedValue,
    });
    

    return {
      input: {
        propertyId,
        addressLabel,
        state,
        zipCode: property.zipCode,
        overrides: {
          assessedValue: opts.assessedValue,
          taxRate: opts.taxRate,
        },
      },
      current: {
        assessedValue: toMoney(assessedValue),
        taxRate,
        annualTax,
        monthlyTax,
        confidence,
      },
      history,
      projection,
      comparison,
      drivers,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
      },
    };
  }
}
