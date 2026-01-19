// apps/backend/src/services/costVolatility.service.ts
import { prisma } from '../lib/prisma';
import { InsuranceCostTrendService } from './insuranceCostTrend.service';
import { PropertyTaxService } from './propertyTax.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';

export type CostVolatilityInput = {
  years?: 5 | 10; // default 5

  // Phase-2 internal toggles (non-breaking; optional)
  useRealInsuranceData?: boolean;
  useRealTaxCadence?: boolean;
  useClimateDatasets?: boolean;
};

export type CostVolatilityEvent = {
  year: number;
  type: 'INSURANCE_SHOCK' | 'TAX_RESET' | 'CLIMATE_EVENT';
  description: string;
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

    // Phase-1 fields (kept)
    insuranceVolatility: number; // 0..100
    taxVolatility: number; // 0..100
    zipVolatility: number; // 0..100

    // Phase-2 additive fields (non-breaking)
    bandLabel?: string; // "Very stable volatility", "Moderate volatility", etc.
    dominantDriver?: 'INSURANCE' | 'TAX' | 'CLIMATE';
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

  // Phase-2 additive fields
  events?: CostVolatilityEvent[];

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';

    // Phase-2 AI readiness hook (no LLM calls yet)
    aiSummary?: {
      shortExplanation: string;
      riskNarrative: string;
      whatToWatch: string[];
    };
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

function impactForScore(s: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (s >= 67) return 'HIGH';
  if (s >= 34) return 'MEDIUM';
  return 'LOW';
}

/**
 * Backward-compatible band mapping:
 * Keep Phase-1 tier (LOW/MED/HIGH), add Phase-2 five-bucket label (non-breaking).
 */
function bandLabelForPhase2(score: number) {
  if (score <= 25) return { label: 'Very stable volatility', copy: 'Costs tend to move predictably', tier: 'LOW' as const };
  if (score <= 45) return { label: 'Stable volatility', copy: 'Some variation, low surprise risk', tier: 'LOW' as const };
  if (score <= 65) return { label: 'Moderate volatility', copy: 'Noticeable swings in certain years', tier: 'MEDIUM' as const };
  if (score <= 80) return { label: 'High volatility', copy: 'Frequent cost surprises', tier: 'MEDIUM' as const };
  return { label: 'Severe volatility', copy: 'Highly unpredictable cost environment', tier: 'HIGH' as const };
}

/**
 * Phase-2 Tax cadence mapping (static; can be replaced with county tables later)
 * This is used to produce window-invariant TAX_RESET events.
 */
type TaxCadence = {
  cadenceYears: 1 | 2 | 3 | 4 | 5 | 6;
  pattern: 'ANNUAL' | 'MULTI_YEAR_STEP';
  label: string;
};

function taxCadenceByState(state: string): TaxCadence {
  const s = String(state || '').toUpperCase().trim();

  // NOTE: Expand as you add county/assessor tables.
  const MAP: Record<string, TaxCadence> = {
    // annual-ish
    TX: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },
    FL: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment with exemptions/caps' },
    CA: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment with cap rules' },
    WA: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },
    GA: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },
    NC: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },

    // multi-year / step-change prone
    NJ: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },
    NY: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },
    IL: { cadenceYears: 4, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },
    PA: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },
    MA: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },
    CT: { cadenceYears: 5, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year reassessment cadence (step-change risk)' },

    // some states commonly exhibit step behavior at a shorter cadence
    CO: { cadenceYears: 2, pattern: 'MULTI_YEAR_STEP', label: 'Reassessment tends to create step-changes' },
  };

  return MAP[s] ?? { cadenceYears: 1, pattern: 'ANNUAL', label: 'More stable annual adjustment patterns' };
}

/**
 * Phase-2 Regional sensitivity (climate) modifier:
 * Kept in zipVolatility (field name preserved for backward compatibility).
 */
function regionalSensitivityByState(state: string): { score: number; label: string; impact: 'LOW' | 'MEDIUM' | 'HIGH' } {
  const s = String(state || '').toUpperCase().trim();
  if (['FL', 'LA'].includes(s)) return { score: 82, label: 'Hurricane / flood exposure', impact: 'HIGH' };
  if (['TX'].includes(s)) return { score: 74, label: 'Convective storms + hurricane sensitivity', impact: 'HIGH' };
  if (['CA'].includes(s)) return { score: 78, label: 'Wildfire + reinsurance pressure', impact: 'HIGH' };
  if (['CO', 'AZ'].includes(s)) return { score: 62, label: 'Hail / wildfire-adjacent exposure', impact: 'MEDIUM' };
  if (['NJ', 'NY', 'MA', 'CT'].includes(s)) return { score: 59, label: 'Coastal storm risk pockets', impact: 'MEDIUM' };
  return { score: 52, label: 'Broad inflation + claims severity', impact: 'LOW' };
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

function computeYoY<T extends Record<string, any>>(
  series: T[],
  field: keyof T
): Array<{ year: number; delta: number }> {
  const out: Array<{ year: number; delta: number }> = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1]?.[field]);
    const curr = Number(series[i]?.[field]);
    if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(curr)) continue;
    out.push({ year: Number(series[i].year), delta: (curr - prev) / prev });
  }
  return out;
}

/**
 * Build aligned annual history for N years.
 * NOTE: TrueCostOwnershipService is only 5y; we blend it when present and fall back otherwise.
 */
async function buildAnnualHistory(args: {
  propertyId: string;
  years: 5 | 10;
  insuranceSvc: InsuranceCostTrendService;
  taxSvc: PropertyTaxService;
  trueCostSvc: TrueCostOwnershipService;
}) {
  const { propertyId, years, insuranceSvc, taxSvc, trueCostSvc } = args;

  const ins = await insuranceSvc.estimate(propertyId, { years });
  const insHist = (ins?.history || []).slice(-years);

  const tax = await taxSvc.estimate(propertyId, { historyYears: years } as any);
  const taxHist = (((tax as any)?.history || []) as Array<{ year: number; annualTax: number }>).slice(-years);

  // True cost is only 5y; use it if available, otherwise fall back.
  const trueCostHist =
    years === 5
      ? await (async () => {
          try {
            const tc = await trueCostSvc.estimate(propertyId, {});
            return (tc?.history || []).map((h: any) => ({ year: h.year, annualTotal: h.annualTotal }));
          } catch {
            return [];
          }
        })()
      : [];

  const byYearIns = new Map<number, number>();
  for (const r of insHist) byYearIns.set(r.year, Number(r.annualPremium) || 0);

  const byYearTax = new Map<number, number>();
  for (const r of taxHist) byYearTax.set(r.year, Number((r as any).annualTax) || 0);

  const byYearTrue = new Map<number, number>();
  for (const r of trueCostHist) byYearTrue.set(r.year, Number(r.annualTotal) || 0);

  const yearSet = new Set<number>();
  for (const r of insHist) yearSet.add(r.year);
  for (const r of taxHist) yearSet.add(r.year);

  const yearsSorted = Array.from(yearSet).sort((a, b) => a - b).slice(-years);

  return yearsSorted.map((year, idx) => {
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
      'InsuranceCostTrendService (modeled; Phase 2 step-event detection anchored on series)',
      'PropertyTaxService (modeled; Phase 2 cadence mapping + delta variance)',
      'TrueCostOwnershipService (optional cross-check for 5y totals)',
      'State reassessment cadence mapping (Phase 2 static adapter)',
      'Regional sensitivity (climate) modifier (Phase 2 state-level mapping)',
    ];

    // ============================
    // ✅ FIX: window-invariant events
    // ============================

    // 1) Build full history once (10y) for stable event detection
    const MAX_EVENT_YEARS: 10 = 10;
    const fullHistory = await buildAnnualHistory({
      propertyId,
      years: MAX_EVENT_YEARS,
      insuranceSvc: this.insuranceTrend,
      taxSvc: this.propertyTax,
      trueCostSvc: this.trueCost,
    });

    // 2) Slice requested window for scoring & chart
    const windowYears = years;
    const historyWindow = fullHistory.slice(-windowYears);

    // 3) Detect events on full history (window-invariant)
    const eventsFull: CostVolatilityEvent[] = [];

    // --- TAX REASSESSMENT EVENTS (cadence-driven, deterministic)
    const taxCadence = taxCadenceByState(state);
    if (taxCadence.cadenceYears > 1 && fullHistory.length) {
      const baseYear = fullHistory[fullHistory.length - 1].year; // stable anchor (current-year-ish)
      for (const h of fullHistory) {
        if ((baseYear - h.year) % taxCadence.cadenceYears === 0) {
          eventsFull.push({
            year: h.year,
            type: 'TAX_RESET',
            description: `County reassessment reset year (~${taxCadence.cadenceYears}y cadence).`,
          });
        }
      }
    }

    // Optional: tax step-change detection anchored on full series (guards for modeled drift)
    const taxDeltas = computeYoY(fullHistory, 'annualTax');
    const taxStd = stddev(taxDeltas.map((d) => d.delta));
    const taxShockThreshold = Math.max(taxStd * 2.0, 0.12); // >=12% change treated as notable
    for (const d of taxDeltas) {
      if (Math.abs(d.delta) >= taxShockThreshold) {
        eventsFull.push({
          year: d.year,
          type: 'TAX_RESET',
          description: 'Notable tax step-change detected.',
        });
      }
    }

    // --- INSURANCE STEP CHANGES (window-invariant)
    const insuranceDeltas = computeYoY(fullHistory, 'annualInsurance');
    const insuranceStd = stddev(insuranceDeltas.map((d) => d.delta));
    const insuranceShockThreshold = Math.max(insuranceStd * 2.0, 0.15); // >=15% jump baseline
    for (const d of insuranceDeltas) {
      if (Math.abs(d.delta) >= insuranceShockThreshold) {
        eventsFull.push({
          year: d.year,
          type: 'INSURANCE_SHOCK',
          description: 'Significant insurance repricing year detected.',
        });
      }
    }

    // --- CLIMATE SHOCK YEARS (Phase-2 placeholder: infer from regional sensitivity only)
    // No external dataset ingestion in Phase 2 drop-in; keep event list empty unless you add real sources.
    // When you wire FEMA/NOAA later, push years here and keep the same event shape.
    const climateShockYears: number[] = [];
    for (const y of climateShockYears) {
      eventsFull.push({
        year: y,
        type: 'CLIMATE_EVENT',
        description: 'Regional climate-related repricing pressure.',
      });
    }

    // De-dupe events by (year,type) – keeps UI calm
    const dedupKey = (e: CostVolatilityEvent) => `${e.year}:${e.type}`;
    const dedupMap = new Map<string, CostVolatilityEvent>();
    for (const e of eventsFull) dedupMap.set(dedupKey(e), e);
    const eventsFullDedup = Array.from(dedupMap.values()).sort((a, b) => a.year - b.year);

    // 4) Filter events for requested window
    const visibleYears = new Set(historyWindow.map((h) => h.year));
    const events = eventsFullDedup.filter((e) => visibleYears.has(e.year));

    // 5) Optional note for hidden events
    const hiddenEvents = eventsFullDedup.filter((e) => !visibleYears.has(e.year));
    if (hiddenEvents.length) {
      notes.push('Some volatility events fall outside the selected time range.');
    }

    // ============================
    // Scoring (Phase 2 index; backward compatible fields)
    // ============================

    const deltasInsWin = historyWindow.map((h) => (h.yoyInsurancePct == null ? null : h.yoyInsurancePct / 100));
    const deltasTaxWin = historyWindow.map((h) => (h.yoyTaxPct == null ? null : h.yoyTaxPct / 100));
    const deltasTotWin = historyWindow.map((h) => (h.yoyTotalPct == null ? null : h.yoyTotalPct / 100));

    const insStdWin = stddev(deltasInsWin);
    const taxStdWin2 = stddev(deltasTaxWin);

    // insurance variance score (0..100)
    const insuranceVolatility = deltaStdToScore(insStdWin, 0.25, insuranceStateBaseline(state));

    // tax cadence score: blend variance + cadence pressure (kept conceptually from Phase 1)
    const taxVarianceScore = deltaStdToScore(taxStdWin2, 0.20, 0);
    const cadencePressure = taxCadence.pattern === 'MULTI_YEAR_STEP' ? 70 : 45;
    const taxVolatility = clamp(Math.round(0.6 * taxVarianceScore + 0.4 * cadencePressure), 0, 100);

    // regional sensitivity modifier (stored in zipVolatility for backward compatibility)
    const regional = regionalSensitivityByState(state);
    const zipVolatility = regional.score;

    // climate shock score (not exposed as a separate field to keep DTO additive-only)
    // We derive a low-intensity score based on event presence within window (future datasets will strengthen this).
    const climateShockScore = clamp(events.filter((e) => e.type === 'CLIMATE_EVENT').length * 25, 0, 100);

    // Phase-2 revised formula (as requested)
    const volatilityIndex = clamp(
      Math.round(0.45 * insuranceVolatility + 0.30 * taxVolatility + 0.15 * climateShockScore + 0.10 * zipVolatility),
      0,
      100
    );

    // Confidence rules (Phase 2)
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (!state || state.length !== 2) {
      confidence = 'LOW';
      notes.push('State missing/invalid; cadence and sensitivity adjustments used conservative defaults.');
    }
    if (!zp) {
      confidence = 'LOW';
      notes.push('ZIP missing/invalid; localized messaging reduced.');
    }

    // Totals note (preserve Phase-1 behavior)
    if (years === 10) {
      notes.push('10y view uses AnnualTotal = Insurance + Taxes baseline (True Cost is 5y-only).');
    } else {
      notes.push('5y view blends True Cost totals when available; otherwise uses Insurance + Taxes baseline.');
    }

    // Dominant driver (Phase 2)
    const contribution = [
      { k: 'INSURANCE' as const, w: 0.45, s: insuranceVolatility },
      { k: 'TAX' as const, w: 0.30, s: taxVolatility },
      { k: 'CLIMATE' as const, w: 0.10, s: zipVolatility + climateShockScore * 0.5 }, // rolled climate pressure
    ].sort((a, b) => b.w * b.s - a.w * a.s);

    const dominantDriver = contribution[0]?.k ?? 'TAX';

    // Drivers list (Phase 2 wording)
    const drivers: CostVolatilityDTO['drivers'] = [
      {
        factor: 'Insurance repricing volatility',
        impact: impactForScore(insuranceVolatility),
        explanation:
          `Your insurance variability in ${state || 'your state'} is driven mostly by year-to-year premium changes (variance). ` +
          `${events.some((e) => e.type === 'INSURANCE_SHOCK') ? 'We detected at least one repricing spike year.' : 'No major spike years were detected.'}`,
      },
      {
        factor: 'Tax reassessment cadence',
        impact: impactForScore(taxVolatility),
        explanation:
          `Your state tends to use a ${taxCadence.cadenceYears}y reassessment cadence (${taxCadence.pattern === 'MULTI_YEAR_STEP' ? 'step-change prone' : 'annual'}), ` +
          `which can create step-change years. We flagged ${events.filter((e) => e.type === 'TAX_RESET').length} potential cadence/reset year(s).`,
      },
      {
        factor: 'Regional sensitivity (climate)',
        impact: regional.impact,
        explanation:
          `Moderate repricing sensitivity (${regional.label}) in ${state || 'your region'}. ` +
          `${events.some((e) => e.type === 'CLIMATE_EVENT') ? 'We flagged a potential climate-linked shock year.' : 'No climate-linked shock years were flagged from your current history.'}`,
      },
    ].sort((a, b) => (a.impact === 'HIGH' ? 3 : a.impact === 'MEDIUM' ? 2 : 1) - (b.impact === 'HIGH' ? 3 : b.impact === 'MEDIUM' ? 2 : 1));

    const band2 = bandLabelForPhase2(volatilityIndex);

    // AI readiness hook (structured; no LLM call)
    const aiSummary =
      confidence === 'LOW'
        ? undefined
        : {
            shortExplanation: `Volatility is ${band2.label.toLowerCase()} — driven mostly by ${dominantDriver.toLowerCase()} factors.`,
            riskNarrative:
              dominantDriver === 'TAX'
                ? `Your area shows reassessment cadence that can create step-change years. Even if costs aren’t rising fast, surprise jumps can happen in reset years.`
                : dominantDriver === 'INSURANCE'
                  ? `Insurance repricing can create surprise premium jumps. Variability matters as much as the long-run trend.`
                  : `Regional risk sensitivity can amplify repricing pressure during extreme years, even if your local trend is stable.`,
            whatToWatch: [
              dominantDriver === 'TAX' ? 'Upcoming reassessment/reset years' : 'Premium renewal and underwriting changes',
              'Large year-over-year changes (≥15%)',
              'Any new hazard or market shifts in your region',
            ],
          };

    return {
      input: { propertyId, years, addressLabel, state, zipCode },
      index: {
        volatilityIndex,
        band: band2.tier,
        insuranceVolatility,
        taxVolatility,
        zipVolatility,
        bandLabel: band2.label,
        dominantDriver,
      },
      history: historyWindow,
      drivers,
      events,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
        confidence,
        aiSummary,
      },
    };
  }
}
