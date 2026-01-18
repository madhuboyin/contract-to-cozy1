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

    // Phase-2 additive fields
    bandLabel?: string; // "Moderate volatility", etc.
    dominantDriver?: 'INSURANCE' | 'TAX' | 'CLIMATE';
  };

  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualTotal: number;
    yoyTotalPct: number | null; // percent points
    yoyInsurancePct: number | null;
    yoyTaxPct: number | null;
  }>;

  drivers: Array<{
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }>;

  // Phase-2 additive fields
  events?: Array<{
    year: number;
    type: 'INSURANCE_SHOCK' | 'TAX_RESET' | 'CLIMATE_EVENT';
    description: string;
  }>;

  // Phase-2 AI readiness hook (no LLM calls)
  aiSummary?: {
    shortExplanation: string;
    riskNarrative: string;
    whatToWatch: string[];
  };

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
 * We keep Phase-1 band (LOW/MED/HIGH) but compute Phase-2 five-bucket label.
 */
function bandLabelForPhase2(score: number) {
  if (score <= 25) return { label: 'Very stable', copy: 'Costs tend to move predictably', tier: 'LOW' as const };
  if (score <= 45) return { label: 'Stable', copy: 'Some variation, low surprise risk', tier: 'LOW' as const };
  if (score <= 65) return { label: 'Moderate', copy: 'Noticeable swings in certain years', tier: 'MEDIUM' as const };
  if (score <= 80) return { label: 'High', copy: 'Frequent cost surprises', tier: 'MEDIUM' as const };
  return { label: 'Severe', copy: 'Highly unpredictable cost environment', tier: 'HIGH' as const };
}

/**
 * Phase-2: lightweight TTL cache (in-memory)
 * Keeps performance stable (<300ms) once adapters expand.
 */
class TTLCache<T> {
  private map = new Map<string, { exp: number; value: T }>();
  constructor(private ttlMs: number) {}
  get(key: string): T | null {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }
  set(key: string, value: T) {
    this.map.set(key, { exp: Date.now() + this.ttlMs, value });
  }
}

const PHASE2_CACHE = new TTLCache<any>(15 * 60 * 1000);

/**
 * Phase-2 Adapters (lightweight / public-derived mappings)
 * These are intentionally minimal in-code so Phase-2 is drop-in without new DB tables.
 * You can later replace with real dataset loaders, keeping the same adapter interfaces.
 */

type InsuranceShock = {
  year: number;
  pctJump: number; // fraction e.g. 0.22
  classification: 'INFLATIONARY_DRIFT' | 'CATASTROPHE_REPRICE' | 'INSURER_SHOCK';
  description: string;
};

class InsuranceRateFilingAdapter {
  // Public-derived state sensitivity buckets (placeholder until DOI/NAIC ingestion is wired)
  private hurricane = new Set(['FL', 'LA', 'TX', 'NC', 'SC', 'GA']);
  private wildfire = new Set(['CA', 'OR', 'WA', 'CO', 'AZ', 'NM']);
  private mixed = new Set(['NJ', 'NY', 'MA', 'CT']);

  classify(state: string, pctJump: number) {
    const s = String(state || '').toUpperCase().trim();
    if (pctJump >= 0.25 && (this.hurricane.has(s) || this.wildfire.has(s))) return 'CATASTROPHE_REPRICE' as const;
    if (pctJump >= 0.18) return 'INSURER_SHOCK' as const;
    return 'INFLATIONARY_DRIFT' as const;
  }

  /**
   * Detect step-change years from the *property's* insurance history.
   * This is "data-anchored" even before DOI/NAIC parsing is added.
   */
  detectStepEvents(state: string, history: Array<{ year: number; yoyInsurancePct: number | null }>, jumpPct = 15) {
    const cacheKey = `insStep:${state}:${jumpPct}:${history.map((h) => `${h.year}:${h.yoyInsurancePct ?? 'n'}`).join('|')}`;
    const cached = PHASE2_CACHE.get(cacheKey);
    if (cached) return cached as InsuranceShock[];

    const out: InsuranceShock[] = [];
    for (const h of history) {
      if (typeof h.yoyInsurancePct !== 'number') continue;
      const frac = h.yoyInsurancePct / 100;
      if (Math.abs(frac) >= jumpPct / 100) {
        const cls = this.classify(state, Math.abs(frac));
        const desc =
          cls === 'CATASTROPHE_REPRICE'
            ? 'Insurance repricing spike (catastrophe-driven sensitivity)'
            : cls === 'INSURER_SHOCK'
              ? 'Insurance repricing spike (market/insurer shock)'
              : 'Insurance jump above normal drift';
        out.push({ year: h.year, pctJump: frac, classification: cls, description: desc });
      }
    }

    PHASE2_CACHE.set(cacheKey, out);
    return out;
  }
}

type TaxCadence = {
  cadenceYears: 1 | 2 | 3 | 4 | 5 | 6;
  pattern: 'ANNUAL' | 'MULTI_YEAR_STEP';
  label: string;
};

class TaxCadenceAdapter {
  // Static cadence mapping (Phase-2). Expand later to county tables when available.
  private stateCadence: Record<string, TaxCadence> = {
    // annual-ish
    TX: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },
    FL: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment with exemptions/caps' },
    CA: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual with cap rules (Prop 13-like effects)' },
    WA: { cadenceYears: 1, pattern: 'ANNUAL', label: 'Annual reassessment environment' },
    CO: { cadenceYears: 2, pattern: 'MULTI_YEAR_STEP', label: 'Reassessment tends to create step-changes' },

    // multi-year / step-change-prone
    NJ: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year cadence with step-change resets' },
    NY: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year cadence with step-change resets' },
    IL: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year cadence with step-change resets' },
    PA: { cadenceYears: 4, pattern: 'MULTI_YEAR_STEP', label: 'Longer reassessment cycles can cause step-changes' },
    CT: { cadenceYears: 5, pattern: 'MULTI_YEAR_STEP', label: 'Infrequent reassessment can cause step-changes' },
    MA: { cadenceYears: 3, pattern: 'MULTI_YEAR_STEP', label: 'Multi-year cadence with step-change resets' },
  };

  get(state: string): TaxCadence {
    const s = String(state || '').toUpperCase().trim();
    return (
      this.stateCadence[s] || {
        cadenceYears: 1,
        pattern: 'ANNUAL',
        label: 'More stable annual adjustment patterns',
      }
    );
  }

  // Tag "reassessment event years" based on cadence + observed YoY jumps
  detectReassessmentEvents(
    state: string,
    yearsSorted: number[],
    history: Array<{ year: number; yoyTaxPct: number | null }>,
    jumpPct = 10
  ) {
    const cadence = this.get(state);
    const cacheKey = `taxCad:${state}:${jumpPct}:${yearsSorted.join(',')}:${history
      .map((h) => `${h.year}:${h.yoyTaxPct ?? 'n'}`)
      .join('|')}`;
    const cached = PHASE2_CACHE.get(cacheKey);
    if (cached) return cached as Array<{ year: number; description: string; cadence: TaxCadence }>;

    const out: Array<{ year: number; description: string; cadence: TaxCadence }> = [];
    const byYear = new Map(history.map((h) => [h.year, h.yoyTaxPct]));

    for (let i = 0; i < yearsSorted.length; i++) {
      const y = yearsSorted[i];
      const yoy = byYear.get(y);
      const frac = typeof yoy === 'number' ? yoy / 100 : null;

      // cadence-based "expected reset years"
      const cadenceHit =
        cadence.pattern === 'MULTI_YEAR_STEP' && i > 0 && cadence.cadenceYears > 1 ? i % cadence.cadenceYears === 0 : false;

      const jumpHit = frac !== null && Math.abs(frac) >= jumpPct / 100;

      if (cadenceHit || (cadence.pattern === 'MULTI_YEAR_STEP' && jumpHit)) {
        out.push({
          year: y,
          cadence,
          description: cadenceHit
            ? 'County/state reassessment cadence year (step-change risk)'
            : 'Tax reset / step-change detected from YoY tax jump',
        });
      }
    }

    PHASE2_CACHE.set(cacheKey, out);
    return out;
  }
}

type ClimateRisk = {
  score: number; // 0..100 (pressure/sensitivity)
  label: string;
};

class ClimateRiskAdapter {
  // State-level risk pressure proxy (placeholder until FEMA NRI / NOAA ingestion is wired)
  private stateRisk: Record<string, ClimateRisk> = {
    FL: { score: 78, label: 'Higher repricing sensitivity (hurricane exposure)' },
    LA: { score: 75, label: 'Higher repricing sensitivity (hurricane/flood exposure)' },
    TX: { score: 65, label: 'Higher repricing sensitivity (storm/flood exposure)' },
    CA: { score: 70, label: 'Higher repricing sensitivity (wildfire exposure)' },
    CO: { score: 58, label: 'Moderate repricing sensitivity (hail/wildfire exposure)' },
    NJ: { score: 54, label: 'Moderate repricing sensitivity (coastal storm exposure)' },
    NY: { score: 52, label: 'Moderate repricing sensitivity (coastal storm exposure)' },
    AZ: { score: 55, label: 'Moderate repricing sensitivity (heat/wildfire exposure)' },
  };

  get(state: string): ClimateRisk {
    const s = String(state || '').toUpperCase().trim();
    return this.stateRisk[s] || { score: 42, label: 'Stable pricing environment (lower shock sensitivity)' };
  }

  // Climate "shock years" derived from insurance shocks + risk environment
  inferShockYearsFromInsurance(
    state: string,
    insuranceShocks: InsuranceShock[]
  ): Array<{ year: number; description: string }> {
    const risk = this.get(state);
    const out: Array<{ year: number; description: string }> = [];
    if (risk.score < 50) return out;

    for (const e of insuranceShocks) {
      if (e.classification === 'CATASTROPHE_REPRICE') {
        out.push({ year: e.year, description: 'Climate-linked repricing sensitivity year' });
      }
    }
    return out;
  }
}

export class CostVolatilityService {
  constructor(
    private insuranceTrend = new InsuranceCostTrendService(),
    private propertyTax = new PropertyTaxService(),
    private trueCost = new TrueCostOwnershipService(),
    private insAdapter = new InsuranceRateFilingAdapter(),
    private taxCadenceAdapter = new TaxCadenceAdapter(),
    private climateAdapter = new ClimateRiskAdapter()
  ) {}

  async compute(propertyId: string, input: CostVolatilityInput = {}): Promise<CostVolatilityDTO> {
    const years: 5 | 10 = input.years ?? 5;

    // Phase-2 toggles default ON (still graceful fallback if no signals)
    const useRealInsuranceData = input.useRealInsuranceData !== false;
    const useRealTaxCadence = input.useRealTaxCadence !== false;
    const useClimateDatasets = input.useClimateDatasets !== false;

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
      'InsuranceCostTrendService (property history)',
      'PropertyTaxService (property history)',
      'TrueCostOwnershipService (optional cross-check for 5y)',
      'Phase-2: step-change detection (insurance)',
      'Phase-2: reassessment cadence mapping (tax)',
      'Phase-2: climate sensitivity mapping (state-level; FEMA/NOAA-ready)',
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
    for (const r of insHist) byYearIns.set(r.year, Number((r as any).annualPremium) || 0);

    const byYearTax = new Map<number, number>();
    for (const r of taxHist) byYearTax.set(r.year, Number((r as any).annualTax) || 0);

    const byYearTrue = new Map<number, number>();
    for (const r of trueCostHist) byYearTrue.set(r.year, Number((r as any).annualTotal) || 0);

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

    // --- Phase-2 signals: step events, cadence events, climate shock years ---
    const insuranceStepEvents: InsuranceShock[] =
      useRealInsuranceData ? this.insAdapter.detectStepEvents(state, history, 15) : [];

    const taxReassessmentEvents =
      useRealTaxCadence ? this.taxCadenceAdapter.detectReassessmentEvents(state, yearsSorted, history, 10) : [];

    const climateShockYears =
      useClimateDatasets ? this.climateAdapter.inferShockYearsFromInsurance(state, insuranceStepEvents) : [];

    // --- Scores (Phase-2 model) ---
    // Insurance variance score: stddev + step-event amplification
    const deltasIns = history.map((h) => (h.yoyInsurancePct == null ? null : h.yoyInsurancePct / 100));
    const insStd = stddev(deltasIns);

    // step-event boost: each shock adds pressure, scaled by magnitude
    const stepBoost = insuranceStepEvents.reduce((s, e) => s + clamp(Math.abs(e.pctJump) * 140, 0, 22), 0);
    const insuranceVarianceScore = clamp(deltaStdToScore(insStd, 0.22, 0) + Math.round(stepBoost), 0, 100);

    // Tax cadence score: cadence pressure + variance + event tag influence
    const deltasTax = history.map((h) => (h.yoyTaxPct == null ? null : h.yoyTaxPct / 100));
    const taxStd = stddev(deltasTax);
    const taxVarianceScore = deltaStdToScore(taxStd, 0.18, 0);

    const cadence = this.taxCadenceAdapter.get(state);
    const cadencePressure =
      cadence.pattern === 'MULTI_YEAR_STEP'
        ? clamp(55 + cadence.cadenceYears * 4, 0, 85)
        : clamp(38, 0, 55);

    const cadenceEventBoost = clamp(taxReassessmentEvents.length * 7, 0, 18);
    const taxCadenceScore = clamp(Math.round(0.65 * taxVarianceScore + 0.35 * cadencePressure + cadenceEventBoost), 0, 100);

    // Climate shock score: risk environment + shock years
    const climate = this.climateAdapter.get(state);
    const shockBoost = clamp(climateShockYears.length * 10, 0, 25);
    const climateShockScore = clamp(Math.round(0.75 * climate.score + shockBoost), 0, 100);

    // Regional sensitivity modifier: normalized pressure (not a "truth" claim)
    const regionalSensitivityModifier = clamp(Math.round(0.6 * climate.score + 0.4 * cadencePressure), 0, 100);

    // Final Phase-2 index
    const volatilityIndex = clamp(
      Math.round(
        0.45 * insuranceVarianceScore +
          0.30 * taxCadenceScore +
          0.15 * climateShockScore +
          0.10 * regionalSensitivityModifier
      ),
      0,
      100
    );

    // Backward-compatible Phase-1 band + Phase-2 bandLabel
    const phase2Band = bandLabelForPhase2(volatilityIndex);
    const band: 'LOW' | 'MEDIUM' | 'HIGH' = phase2Band.tier;

    // Keep Phase-1 field names but align them to Phase-2 concepts
    // (still 0..100, still interpretable)
    const insuranceVolatility = insuranceVarianceScore;
    const taxVolatility = taxCadenceScore;

    // Keep Phase-1 zipVolatility field for compatibility:
    // Phase-2: replace "ZIP prefix bucket" with "regional sensitivity modifier"
    // (still "directional pressure", not "truth")
    const zipVolatility = regionalSensitivityModifier;

    // Dominant driver (weighted contribution)
    const contrib = [
      { k: 'INSURANCE' as const, v: 0.45 * insuranceVarianceScore },
      { k: 'TAX' as const, v: 0.30 * taxCadenceScore },
      { k: 'CLIMATE' as const, v: 0.15 * climateShockScore },
    ].sort((a, b) => b.v - a.v);
    const dominantDriver = contrib[0]?.k;

    // Events (additive)
    const events: CostVolatilityDTO['events'] = [];
    for (const e of insuranceStepEvents) {
      events.push({
        year: e.year,
        type: 'INSURANCE_SHOCK',
        description: e.description,
      });
    }
    for (const e of taxReassessmentEvents) {
      events.push({
        year: e.year,
        type: 'TAX_RESET',
        description: e.description,
      });
    }
    for (const e of climateShockYears) {
      events.push({
        year: e.year,
        type: 'CLIMATE_EVENT',
        description: e.description,
      });
    }
    events.sort((a, b) => a.year - b.year);

    // Confidence + notes (Phase-2)
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

    const hasValidState = !!state && state.length === 2;
    const hasValidZip = !!zp;
    const hasHistory = yearsSorted.length >= 4;

    if (!hasValidState || !hasValidZip || !hasHistory) confidence = 'LOW';

    // "HIGH only when real signals exist" (non-promisory: dataset adapters are still lightweight)
    const realSignalCount = (insuranceStepEvents.length > 0 ? 1 : 0) + (taxReassessmentEvents.length > 0 ? 1 : 0) + (climateShockYears.length > 0 ? 1 : 0);
    if (confidence !== 'LOW' && realSignalCount >= 2) confidence = 'HIGH';

    if (!hasValidState) notes.push('State missing/invalid; cadence and climate sensitivity used conservative defaults.');
    if (!hasValidZip) notes.push('ZIP missing/invalid; regional sensitivity uses state-only defaults.');
    if (!hasHistory) notes.push('Insufficient history to measure volatility; index is conservative.');

    if (years === 10) {
      notes.push('10y view uses AnnualTotal = Insurance + Taxes baseline when True Cost history is not available.');
    } else {
      notes.push(trueCostHist.length ? 'AnnualTotal uses True Cost when available (cross-check).' : 'AnnualTotal uses Insurance + Taxes baseline.');
    }
    notes.push('Phase-2 adds event detection (step-changes, cadence resets, climate sensitivity) for explainability.');

    // Drivers (plain English, tied to state / cadence / sensitivity)
    const drivers: CostVolatilityDTO['drivers'] = [
      {
        factor: 'Insurance repricing volatility',
        impact: impactForScore(insuranceVarianceScore),
        explanation:
          insuranceStepEvents.length > 0
            ? `We detected ${insuranceStepEvents.length} repricing spike(s) in your insurance history in ${state || 'your state'}. ` +
              `These step-changes increase year-to-year unpredictability beyond normal drift.`
            : `Your insurance variability in ${state || 'your state'} is driven mostly by year-to-year premium changes (variance), without major spike years detected.`,
      },
      {
        factor: 'Tax reassessment cadence',
        impact: impactForScore(taxCadenceScore),
        explanation:
          cadence.pattern === 'MULTI_YEAR_STEP'
            ? `Your state tends to use a multi-year reassessment cadence (${cadence.cadenceYears}y), which can create step-change years. ` +
              (taxReassessmentEvents.length ? `We flagged ${taxReassessmentEvents.length} potential cadence/reset year(s).` : `We did not detect strong reset years in your observed history.`)
            : `Your tax environment is closer to annual adjustments, so volatility comes more from smaller rate/assessment drift than cadence resets.`,
      },
      {
        factor: 'Regional sensitivity (climate)',
        impact: impactForScore(climate.score),
        explanation:
          `${climate.label} in ${state || 'your region'}. ` +
          (climateShockYears.length ? `We flagged ${climateShockYears.length} year(s) where repricing sensitivity likely increased.` : `No climate-linked shock years were flagged from your insurance history.`),
      },
    ];

    // AI readiness hook (no calls, just structured text)
    const aiSummary = {
      shortExplanation: `Overall volatility is ${phase2Band.label.toLowerCase()} (${volatilityIndex}/100).`,
      riskNarrative:
        dominantDriver === 'INSURANCE'
          ? 'Insurance repricing is the primary source of unpredictability, especially when step-change years occur.'
          : dominantDriver === 'TAX'
            ? 'Tax cadence and reassessment patterns are the primary source of unpredictability, creating step-change risk.'
            : 'Regional repricing sensitivity (climate/region) is a meaningful contributor to unpredictability.',
      whatToWatch: [
        dominantDriver === 'INSURANCE' ? 'Large premium renewal jumps (≥15%)' : 'Assessment reset / millage changes',
        climate.score >= 60 ? 'Storm/wildfire season pressure in your region' : 'Gradual drift rather than shocks',
      ],
    };

    return {
      input: { propertyId, years, addressLabel, state, zipCode },

      index: {
        volatilityIndex,
        band, // Phase-1 compatible
        insuranceVolatility,
        taxVolatility,
        zipVolatility,

        // Phase-2 additive
        bandLabel: `${phase2Band.label} volatility`,
        dominantDriver,
      },

      history,
      drivers,

      // Phase-2 additive
      events: events.length ? events : [],
      aiSummary,

      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
        confidence,
      },
    };
  }
}
