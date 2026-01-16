// apps/backend/src/services/propertyTax.service.ts
import { prisma } from '../lib/prisma';

export type PropertyTaxConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

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

function buildDrivers(state: string) {
  // Simple “explainers” you can later replace with county-specific breakdown.
  const base = [
    {
      factor: 'Assessed value',
      impact: 'HIGH' as const,
      explanation:
        'Property taxes generally scale with assessed value. Higher assessed value typically means higher annual tax.',
    },
    {
      factor: 'Local tax rates',
      impact: 'HIGH' as const,
      explanation:
        'County, city, and school district rates can vary significantly even within the same state.',
    },
    {
      factor: 'Reassessment cadence',
      impact: 'MEDIUM' as const,
      explanation:
        'Some areas reassess annually while others do so less frequently, which impacts year-over-year changes.',
    },
    {
      factor: 'Exemptions & caps',
      impact: 'MEDIUM' as const,
      explanation:
        'Homestead exemptions and growth caps can reduce or limit increases depending on eligibility and local rules.',
    },
  ];

  if (state === 'TX') {
    base.push({
      factor: 'School district levies (TX)',
      impact: 'HIGH',
      explanation:
        'In many Texas counties, school district taxes are a major portion of the total property tax bill.',
    });
  }

  return base;
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
    const drivers = buildDrivers(state);

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
