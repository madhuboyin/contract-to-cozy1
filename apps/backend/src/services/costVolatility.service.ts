// apps/backend/src/services/costVolatility.service.ts
import { prisma } from '../lib/prisma';
import { InsuranceCostTrendService } from './insuranceCostTrend.service';
import { PropertyTaxService } from './propertyTax.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';

export type CostVolatilityInput = {
  years?: 5 | 10; // default 5
};

export type CostVolatilityDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
  };

  index: {
    volatilityIndex: number; // 0..100
    band: 'LOW' | 'MEDIUM' | 'HIGH';
    insuranceVolatility: number; // 0..100
    taxVolatility: number; // 0..100
    zipVolatility: number; // 0..100
  };

  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualTotal: number;
    yoyTotalPct: number | null; // percent points (e.g., 4.2 means +4.2%)
    yoyInsurancePct: number | null;
    yoyTaxPct: number | null;
  }>;

  drivers: Array<{
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function zipPrefix(zip: string) {
  const z = String(zip || '').replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : z;
}

function bandFor(v: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (v >= 67) return 'HIGH';
  if (v >= 34) return 'MEDIUM';
  return 'LOW';
}

function yoyFrac(curr: number, prev: number) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev <= 0) return null;
  return (curr - prev) / prev;
}

function stddev(xs: Array<number | null | undefined>) {
  const a = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (a.length < 2) return 0;
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  const v = a.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / (a.length - 1);
  return Math.sqrt(v);
}

function deltaStdToScore(std: number, scale = 0.25, add = 0) {
  return clamp(Math.round((std / scale) * 100 + add), 0, 100);
}

function insuranceStateBaseline(state: string) {
  const s = String(state || '').toUpperCase().trim();
  if (['FL', 'LA'].includes(s)) return 10;
  if (s === 'TX') return 8;
  if (s === 'CA') return 9;
  if (['CO', 'AZ'].includes(s)) return 6;
  if (['NJ', 'NY', 'MA'].includes(s)) return 5;
  return 3;
}

function cadencePressureByState(state: string): { pressure: number; impact: 'LOW' | 'MEDIUM' | 'HIGH'; label: string } {
  const s = String(state || '').toUpperCase().trim();
  const stepChange = new Set(['NJ', 'NY', 'IL', 'PA', 'CT', 'MA']);
  const medium = new Set(['CA', 'FL', 'TX', 'WA', 'CO', 'GA', 'NC', 'AZ']);

  if (stepChange.has(s)) {
    return { pressure: 72, impact: 'HIGH', label: 'Reassessment cadence tends to create step-changes' };
  }
  if (medium.has(s)) {
    return { pressure: 55, impact: 'MEDIUM', label: 'Moderate reassessment / exemption-driven swings' };
  }
  return { pressure: 40, impact: 'LOW', label: 'More stable annual adjustment patterns' };
}

function zipVolatilityHeuristic(zip: string): { score: number; impact: 'LOW' | 'MEDIUM' | 'HIGH' } {
  const zp = zipPrefix(zip);
  if (!zp) return { score: 45, impact: 'LOW' };

  // Phase 1: light heuristic buckets (messaging only)
  const high = new Set(['331', '334', '336', '337', '700', '770', '775', '902', '941', '940']);
  const med = new Set(['085', '087', '100', '021', '787', '750', '981', '303', '328']);

  if (high.has(zp)) return { score: 75, impact: 'HIGH' };
  if (med.has(zp)) return { score: 60, impact: 'MEDIUM' };
  return { score: 50, impact: 'LOW' };
}

function impactForScore(s: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (s >= 67) return 'HIGH';
  if (s >= 34) return 'MEDIUM';
  return 'LOW';
}

export class CostVolatilityService {
  constructor(
    private insuranceTrend = new InsuranceCostTrendService(),
    private propertyTax = new PropertyTaxService(),
    private trueCost = new TrueCostOwnershipService()
  ) {}

  async compute(propertyId: string, input: CostVolatilityInput = {}): Promise<CostVolatilityDTO> {
    const years: 5 | 10 = input.years ?? 5;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, address: true, city: true, state: true, zipCode: true },
    });
    if (!property) throw new Error('Property not found');

    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const zp = zipPrefix(zipCode);

    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'InsuranceCostTrendService (modeled)',
      'PropertyTaxService (modeled)',
      'TrueCostOwnershipService (optional cross-check for 5y)',
      'ZIP prefix volatility proxy (Phase 1, messaging only)',
      'State cadence heuristic (Phase 1)',
    ];

    // 1) Insurance history
    const ins = await this.insuranceTrend.estimate(propertyId, { years });
    const insHist = (ins?.history || []).slice(-years);

    // 2) Tax history
    const tax = await this.propertyTax.estimate(propertyId, { historyYears: years } as any);
    const taxHist = (((tax as any)?.history || []) as Array<{ year: number; annualTax: number }>).slice(-years);

    // 3) TrueCost optional (5y only)
    const trueCostHist =
      years === 5
        ? (await (async () => {
            try {
              const tc = await this.trueCost.estimate(propertyId, {});
              return (tc?.history || []).map((h: any) => ({ year: h.year, annualTotal: h.annualTotal }));
            } catch {
              return [];
            }
          })())
        : [];

    // Align by year keys
    const yearSet = new Set<number>();
    for (const r of insHist) yearSet.add(r.year);
    for (const r of taxHist) yearSet.add(r.year);

    const yearsSorted = Array.from(yearSet).sort((a, b) => a - b).slice(-years);

    const byYearIns = new Map<number, number>();
    for (const r of insHist) byYearIns.set(r.year, Number(r.annualPremium) || 0);

    const byYearTax = new Map<number, number>();
    for (const r of taxHist) byYearTax.set(r.year, Number(r.annualTax) || 0);

    const byYearTrue = new Map<number, number>();
    for (const r of trueCostHist) byYearTrue.set(r.year, Number(r.annualTotal) || 0);

    const history: CostVolatilityDTO['history'] = yearsSorted.map((year, idx) => {
      const annualInsurance = byYearIns.get(year) ?? 0;
      const annualTax = byYearTax.get(year) ?? 0;

      const baseTotal = annualInsurance + annualTax;
      const annualTotal = byYearTrue.get(year) ?? baseTotal;

      const prevYear = yearsSorted[idx - 1];
      const prevIns = prevYear ? byYearIns.get(prevYear) ?? null : null;
      const prevTax = prevYear ? byYearTax.get(prevYear) ?? null : null;
      const prevTotal = prevYear
        ? byYearTrue.get(prevYear) ?? ((byYearIns.get(prevYear) ?? 0) + (byYearTax.get(prevYear) ?? 0))
        : null;

      const yoyInsurance = prevIns ? yoyFrac(annualInsurance, prevIns) : null;
      const yoyTax = prevTax ? yoyFrac(annualTax, prevTax) : null;
      const yoyTotal = prevTotal ? yoyFrac(annualTotal, prevTotal) : null;

      return {
        year,
        annualTax,
        annualInsurance,
        annualTotal,
        yoyTotalPct: yoyTotal === null ? null : round1(yoyTotal * 100),
        yoyInsurancePct: yoyInsurance === null ? null : round1(yoyInsurance * 100),
        yoyTaxPct: yoyTax === null ? null : round1(yoyTax * 100),
      };
    });

    const deltasIns = history.map((h) => (h.yoyInsurancePct == null ? null : h.yoyInsurancePct / 100));
    const deltasTax = history.map((h) => (h.yoyTaxPct == null ? null : h.yoyTaxPct / 100));

    const insStd = stddev(deltasIns);
    const taxStd = stddev(deltasTax);

    const zipVol = zipVolatilityHeuristic(zipCode);
    const cadence = cadencePressureByState(state);

    const insuranceVolatility = deltaStdToScore(insStd, 0.25, insuranceStateBaseline(state));
    const taxVarianceScore = deltaStdToScore(taxStd, 0.20, 0);
    const taxVolatility = clamp(Math.round(0.6 * taxVarianceScore + 0.4 * cadence.pressure), 0, 100);
    const zipVolatility = zipVol.score;

    const volatilityIndex = clamp(
      Math.round(0.55 * insuranceVolatility + 0.35 * taxVolatility + 0.1 * zipVolatility),
      0,
      100
    );

    // Confidence + notes (Phase 1)
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (!state || state.length !== 2) {
      confidence = 'LOW';
      notes.push('State missing/invalid; cadence and baseline adjustments used conservative defaults.');
    }
    if (!zp) {
      confidence = 'LOW';
      notes.push('ZIP missing/invalid; ZIP volatility proxy defaulted to neutral.');
    }
    if (years === 10) {
      notes.push('10y view uses AnnualTotal = Insurance + Taxes baseline (Phase 1).');
    } else {
      notes.push(trueCostHist.length ? 'AnnualTotal uses True Cost when available (Phase 1 cross-check).' : 'AnnualTotal uses Insurance + Taxes baseline.');
    }
    notes.push('ZIP volatility is a heuristic proxy used for messaging only (Phase 1).');

    // Drivers ranked
    const ranked = [
      { key: 'Insurance repricing volatility', score: insuranceVolatility },
      { key: 'Tax reassessment cadence', score: taxVolatility },
      { key: 'ZIP volatility proxy', score: zipVolatility },
    ].sort((a, b) => b.score - a.score);

    const drivers: CostVolatilityDTO['drivers'] = ranked.map((d) => {
      if (d.key === 'Insurance repricing volatility') {
        return {
          factor: d.key,
          impact: impactForScore(insuranceVolatility),
          explanation:
            `Your insurance shows variable year-to-year repricing in ${state || 'your state'}. ` +
            `We measure this using the variability (std dev) of YoY premium changes.`,
        };
      }
      if (d.key === 'Tax reassessment cadence') {
        return {
          factor: d.key,
          impact: cadence.impact,
          explanation:
            `${cadence.label} in ${state || 'your state'}, which can create step-changes instead of smooth adjustments. ` +
            `We blend cadence pressure with the variability of YoY tax changes.`,
        };
      }
      return {
        factor: d.key,
        impact: zipVol.impact,
        explanation:
          `ZIP prefix ${zp || '(unknown)'} is used as a light volatility proxy in Phase 1. ` +
          `Example message: “ZIP prefix ${zp || '—'} shows higher repricing swings.”`,
      };
    });

    return {
      input: { propertyId, years, addressLabel, state, zipCode },
      index: {
        volatilityIndex,
        band: bandFor(volatilityIndex),
        insuranceVolatility,
        taxVolatility,
        zipVolatility,
      },
      history,
      drivers,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
        confidence,
      },
    };
  }
}
