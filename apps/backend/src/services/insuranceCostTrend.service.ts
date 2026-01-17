// apps/backend/src/services/insuranceCostTrend.service.ts
import { prisma } from '../lib/prisma';

type Impact = 'LOW' | 'MEDIUM' | 'HIGH';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type InsuranceCostTrendInput = {
  years?: 5 | 10;                 // default 5
  homeValueNow?: number;          // optional override
  insuranceAnnualNow?: number;    // optional override
  inflationRate?: number;         // optional override (decimal)
};

export type InsuranceCostTrendDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    insuranceAnnualNow: number;
    insuranceGrowthRate: number; // modeled growth (decimal)
    stateAvgAnnualNow: number;
    deltaVsStateNow: number; // insuranceAnnualNow - stateAvgAnnualNow
  };

  history: Array<{
    year: number;
    annualPremium: number;
    stateAvgAnnual: number;
    deltaVsState: number;
    climatePressureIndex: number; // 0..100 (Phase 1 heuristic)
  }>;

  rollup: {
    totalPremiumPaid: number;
    totalStateAvgPaid: number;
    totalDeltaVsState: number;
    cagrPremium: number;
    cagrStateAvg: number;
  };

  drivers: Array<{
    factor: string;
    impact: Impact;
    explanation: string;
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: Confidence;
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function toMoney(n: number) {
  return Math.round(n * 100) / 100;
}
function zipPrefix(zip: string) {
  const z = String(zip || '').replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : z;
}

// Phase 1: state baseline premium (rough) + modifiers.
// Replace later with public rate filings / DOI datasets.
const STATE_BASE_PREMIUM: Record<string, number> = {
  NJ: 1400,
  NY: 1600,
  CA: 1800,
  TX: 2400,
  FL: 4200,
  LA: 3800,
  WA: 1200,
  MA: 1500,
  CO: 1900,
  AZ: 2100,
  NC: 1400,
  GA: 1500,
  IL: 1500,
};

function stateClimateRiskBand(state: string): { label: string; pressure: number; impact: Impact } {
  // pressure = 0..100
  if (['FL', 'LA'].includes(state)) return { label: 'Hurricane / flood exposure', pressure: 82, impact: 'HIGH' };
  if (['TX'].includes(state)) return { label: 'Hurricane + hail + convective storms', pressure: 74, impact: 'HIGH' };
  if (['CA'].includes(state)) return { label: 'Wildfire + reinsurance pressure', pressure: 78, impact: 'HIGH' };
  if (['CO', 'AZ'].includes(state)) return { label: 'Hail / wildfire-adjacent exposure', pressure: 62, impact: 'MEDIUM' };
  if (['NJ', 'NY', 'MA'].includes(state)) return { label: 'Coastal storm risk pockets', pressure: 55, impact: 'MEDIUM' };
  return { label: 'Broad inflation + claims severity', pressure: 48, impact: 'LOW' };
}

function zipVolatilityHeuristic(zip: string): { volatility: number; impact: Impact } {
  // 0..100
  const zp = zipPrefix(zip);
  if (!zp) return { volatility: 45, impact: 'LOW' };

  // Simple “ZIP prefix volatility” mapping (Phase 1 messaging only).
  // Swap with actual loss / filing / catastrophe models later.
  const high = new Set(['331', '334', '336', '337', '700', '701', '702', '770', '774', '775', '902', '941', '940']);
  const med = new Set(['085', '087', '100', '021', '787', '750', '981', '303', '328']);

  if (high.has(zp)) return { volatility: 75, impact: 'HIGH' };
  if (med.has(zp)) return { volatility: 60, impact: 'MEDIUM' };
  return { volatility: 50, impact: 'LOW' };
}

function estimateHomeValueNowUSD(args: { state: string; propertySize?: number | null }) {
  // Keep this light and consistent with your other tools: fallback on size*ppsf, else generic.
  const VALUE_PER_SQFT_BY_STATE: Record<string, number> = {
    NJ: 300, NY: 320, CA: 380, TX: 180, FL: 220, WA: 260, MA: 320, CO: 240, AZ: 210,
  };

  const notes: string[] = [];
  if (args.propertySize && Number.isFinite(args.propertySize) && args.propertySize > 200) {
    const ppsf = VALUE_PER_SQFT_BY_STATE[args.state] ?? 200;
    notes.push(`Estimated home value using ${ppsf}/sqft heuristic (Phase 1).`);
    return { value: args.propertySize * ppsf, notes, confidence: 'MEDIUM' as Confidence };
  }
  notes.push('Estimated home value using generic fallback (no property size).');
  return { value: 350000, notes, confidence: 'LOW' as Confidence };
}

function cagr(start: number, end: number, years: number) {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return Math.pow(end / start, 1 / years) - 1;
}

export class InsuranceCostTrendService {
  async estimate(propertyId: string, input: InsuranceCostTrendInput = {}): Promise<InsuranceCostTrendDTO> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, address: true, city: true, state: true, zipCode: true, propertySize: true },
    });
    if (!property) throw new Error('Property not found');

    const years: 5 | 10 = input.years ?? 5;
    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'Internal property profile (state/zip/propertySize)',
      'Phase 1 heuristic state premium baseline',
      'Phase 1 heuristic climate/claims pressure index',
    ];

    let confidence: Confidence = 'LOW';

    // Home value (used only if insuranceAnnualNow not overridden)
    let homeValueNow: number;
    if (input.homeValueNow !== undefined) {
      homeValueNow = input.homeValueNow;
      notes.push('Home value override provided by client.');
      confidence = 'HIGH';
    } else {
      const hv = estimateHomeValueNowUSD({ state, propertySize: property.propertySize });
      homeValueNow = hv.value;
      notes.push(...hv.notes);
      confidence = hv.confidence;
    }

    // State avg baseline now
    const stateAvgAnnualNowRaw = STATE_BASE_PREMIUM[state] ?? 1600;

    // ZIP + climate pressure shaping
    const climate = stateClimateRiskBand(state);
    const zipVol = zipVolatilityHeuristic(zipCode);

    // Premium now
    let insuranceAnnualNow: number;
    if (input.insuranceAnnualNow !== undefined) {
      insuranceAnnualNow = input.insuranceAnnualNow;
      notes.push('Insurance annual override provided by client.');
      confidence = 'HIGH';
    } else {
      // Base: % of value, then state + climate + zip multipliers
      const basePct = 0.0048; // 0.48%
      const valueComponent = basePct * homeValueNow;

      const climateMult = 1 + (climate.pressure - 50) / 250;  // ~0.88..1.12
      const zipMult = 1 + (zipVol.volatility - 50) / 300;     // ~0.83..1.08

      insuranceAnnualNow = clamp(valueComponent * climateMult * zipMult, 800, 12000);

      // Anchor toward state avg so values aren’t wildly off
      insuranceAnnualNow = (insuranceAnnualNow * 0.55) + (stateAvgAnnualNowRaw * 0.45);

      notes.push('Insurance premium estimated from home value + state/ZIP climate heuristics (Phase 1).');
      confidence = confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    // Growth modeling (insurance tends to grow faster than CPI recently; Phase 1 knob)
    const inflationRate = input.inflationRate ?? (['FL', 'TX', 'CA', 'LA'].includes(state) ? 0.09 : 0.07);
    const stateAvgGrowth = ['FL', 'TX', 'CA', 'LA'].includes(state) ? 0.08 : 0.06;

    if (input.inflationRate !== undefined) {
      notes.push('Inflation/growth override applied.');
      confidence = 'HIGH';
    } else {
      notes.push(`Modeled premium growth ${(inflationRate * 100).toFixed(1)}%/yr (Phase 1).`);
    }

    const nowYear = new Date().getFullYear();

    // Backfill series from current year, inverse growth
    const history: InsuranceCostTrendDTO['history'] = [];
    for (let i = years - 1; i >= 0; i--) {
      const year = nowYear - i;
      const annualPremium = toMoney(insuranceAnnualNow * Math.pow(1 + inflationRate, -i));
      const stateAvgAnnual = toMoney(stateAvgAnnualNowRaw * Math.pow(1 + stateAvgGrowth, -i));
      const deltaVsState = toMoney(annualPremium - stateAvgAnnual);

      // Pressure index = blend of climate + zip volatility (0..100)
      const climatePressureIndex = Math.round(
        clamp((climate.pressure * 0.65) + (zipVol.volatility * 0.35), 0, 100)
      );

      history.push({ year, annualPremium, stateAvgAnnual, deltaVsState, climatePressureIndex });
    }

    const start = history[0];
    const end = history[history.length - 1];

    const rollup = {
      totalPremiumPaid: toMoney(history.reduce((a, h) => a + h.annualPremium, 0)),
      totalStateAvgPaid: toMoney(history.reduce((a, h) => a + h.stateAvgAnnual, 0)),
      totalDeltaVsState: toMoney(history.reduce((a, h) => a + h.deltaVsState, 0)),
      cagrPremium: cagr(start.annualPremium, end.annualPremium, Math.max(1, years - 1)),
      cagrStateAvg: cagr(start.stateAvgAnnual, end.stateAvgAnnual, Math.max(1, years - 1)),
    };

    const drivers = [
      {
        factor: `Climate / catastrophe pressure (${state})`,
        impact: climate.impact,
        explanation:
          `${climate.label} increases reinsurance + claims severity pressure. ` +
          `Phase 1 uses a heuristic pressure index; we’ll swap to FEMA/NOAA-derived correlations later.`,
      },
      {
        factor: `ZIP volatility (prefix ${zipPrefix(zipCode)})`,
        impact: zipVol.impact,
        explanation:
          `ZIP prefix is used for localized messaging in Phase 1 (not a full catastrophe model). ` +
          `Higher volatility implies greater premium repricing risk year-to-year.`,
      },
      {
        factor: `Market repricing vs state average`,
        impact: (Math.abs((insuranceAnnualNow - stateAvgAnnualNowRaw) / Math.max(1, stateAvgAnnualNowRaw)) > 0.2 ? 'HIGH' : 'MEDIUM') as Impact,
        explanation:
          `Your modeled premium is ${insuranceAnnualNow >= stateAvgAnnualNowRaw ? 'above' : 'below'} the state average baseline. ` +
          `Large deltas often reflect insurer appetite shifts, claims history in-region, or underwriting tightening.`,
      },
    ];

    const dto: InsuranceCostTrendDTO = {
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          years,
          homeValueNow: input.homeValueNow,
          insuranceAnnualNow: input.insuranceAnnualNow,
          inflationRate: input.inflationRate,
        },
      },

      current: {
        insuranceAnnualNow: toMoney(insuranceAnnualNow),
        insuranceGrowthRate: inflationRate,
        stateAvgAnnualNow: toMoney(stateAvgAnnualNowRaw),
        deltaVsStateNow: toMoney(insuranceAnnualNow - stateAvgAnnualNowRaw),
      },

      history,
      rollup,
      drivers,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes: [
          ...notes,
          'Phase 1 does not fetch live DOI/FEMA/NOAA datasets. It is a storytelling estimator with clear upgrade hooks.',
        ],
        confidence,
      },
    };

    return dto;
  }
}
