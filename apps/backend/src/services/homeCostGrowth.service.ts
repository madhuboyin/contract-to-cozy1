// apps/backend/src/services/homeCostGrowth.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';
import { AppreciationIndexService } from './appreciationIndex.service';

type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type HomeCostGrowthConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type HomeCostGrowthInput = {
  years?: 5 | 10; // default 5
  assessedValue?: number;
  taxRate?: number;
  homeValueNow?: number;
  appreciationRate?: number; // decimal
  insuranceAnnualNow?: number;
  maintenanceAnnualNow?: number;
};

export type HomeCostGrowthDTO = {
  input: {
    propertyId: string;
    years: 5 | 10;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    homeValueNow: number;
    appreciationRate: number;
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualExpensesNow: number;
  };

  history: Array<{
    year: number;
    homeValue: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualExpenses: number;
    appreciationGain: number;
    netDelta: number;
  }>;

  rollup: {
    totalAppreciationGain: number;
    totalExpenses: number;
    totalNet: number;
    expenseBreakdown: {
      taxes: number;
      insurance: number;
      maintenance: number;
    };
  };

  drivers: Array<{
    factor: string;
    impact: ImpactLevel;
    explanation: string;
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: HomeCostGrowthConfidence;

    // Phase-3: transparency array
    assumptions: Array<{
      field: string;
      source: 'DATA_BACKED' | 'HEURISTIC' | 'USER_OVERRIDE';
      value: unknown;
      note: string;
    }>;

    // ✅ Phase-3 additive (safe)
    appreciation?: {
      source: 'FHFA' | 'HEURISTIC';
      regionLevel: 'MSA' | 'STATE' | 'US';
      regionLabel: string;
      seriesKey?: string;
      asOf: string;
      annualizedRatePct: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      fallbackChain: string[];
      notes: string[];
    };
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

// Phase-1 value-per-sqft baseline
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

const DEFAULT_APPRECIATION_RATE_BY_STATE: Record<string, number> = {
  TX: 0.05,
  FL: 0.045,
  CA: 0.04,
  NY: 0.035,
  NJ: 0.035,
  WA: 0.04,
  MA: 0.035,
  CO: 0.04,
  AZ: 0.045,
};

function estimateHomeValueNowUSD(args: {
  state: string;
  propertySize?: number | null;
}): { value: number; confidence: HomeCostGrowthConfidence; notes: string[] } {
  const notes: string[] = [];
  const { state, propertySize } = args;

  if (propertySize && Number.isFinite(propertySize) && propertySize > 200) {
    const ppsf = VALUE_PER_SQFT_BY_STATE[state] ?? 200;
    notes.push(`Home value estimated using regional $/sqft benchmarks (${ppsf}/sqft for ${args.state}).`);
    return { value: propertySize * ppsf, confidence: 'MEDIUM', notes };
  }

  notes.push('Estimated home value using generic fallback (no property size).');
  return { value: 350000, confidence: 'LOW', notes };
}

function estimateAppreciationRateHeuristic(state: string): { rate: number; confidence: HomeCostGrowthConfidence; notes: string[] } {
  const notes: string[] = [];
  const rate = DEFAULT_APPRECIATION_RATE_BY_STATE[state] ?? 0.035;
  if (DEFAULT_APPRECIATION_RATE_BY_STATE[state]) {
    notes.push('Appreciation rate estimated using state-level benchmarks (FHFA data unavailable for this area).');
    return { rate, confidence: 'MEDIUM', notes };
  }
  notes.push('Appreciation rate estimated using national average benchmarks (no state-specific data available).');
  return { rate, confidence: 'LOW', notes };
}

// Insurance heuristic
function insuranceRateFactorByState(state: string): number {
  if (['FL', 'LA', 'TX'].includes(state)) return 1.45;
  if (['CA'].includes(state)) return 1.2;
  if (['NY', 'NJ'].includes(state)) return 1.15;
  return 1.0;
}

function maintenanceRateFactorByState(state: string): number {
  if (['CA', 'NY', 'NJ', 'MA', 'WA'].includes(state)) return 1.1;
  if (['TX', 'FL'].includes(state)) return 1.05;
  return 1.0;
}

function inflationRateForState(state: string): number {
  if (['FL', 'TX', 'CA'].includes(state)) return 0.045;
  return 0.04;
}

function buildDrivers(args: {
  state: string;
  zipCode: string;
  appreciationRate: number;
  insuranceAnnualNow: number;
  homeValueNow: number;
  appreciationMeta?: HomeCostGrowthDTO['meta']['appreciation'];
}) {
  const { state, zipCode, appreciationRate, insuranceAnnualNow, homeValueNow, appreciationMeta } = args;

  const zp = zipPrefix(zipCode);

  const appreciationImpact: ImpactLevel =
    appreciationRate >= 0.05 ? 'HIGH' : appreciationRate >= 0.04 ? 'MEDIUM' : 'LOW';

  const insPct = homeValueNow > 0 ? insuranceAnnualNow / homeValueNow : 0;
  const insuranceImpact: ImpactLevel =
    insPct >= 0.008 ? 'HIGH' : insPct >= 0.006 ? 'MEDIUM' : 'LOW';

  const coastalHint =
    ['FL', 'TX', 'LA'].includes(state)
      ? `In ${state}, weather/peril exposure can make premiums more volatile year-to-year.`
      : `Premium growth tends to track inflation, but can spike due to insurer repricing or claims in-region.`;

  const appreciationSourceLine =
    appreciationMeta?.source === 'FHFA'
      ? `Based on FHFA repeat-sale index (${appreciationMeta.regionLevel}): ${appreciationMeta.regionLabel}.`
      : `Modeled using state + ZIP prefix ${zp} heuristics (fallback).`;

  return [
    {
      factor: `Local appreciation comps`,
      impact: appreciationMeta?.source === 'FHFA' ? ('HIGH' as ImpactLevel) : ('MEDIUM' as ImpactLevel),
      explanation:
        `${appreciationSourceLine} Used as the default appreciation input unless you override it.`,
    },
    {
      factor: `State appreciation baseline (${state})`,
      impact: appreciationImpact,
      explanation:
        `Your appreciation rate is modeled at ${(appreciationRate * 100).toFixed(1)}%/yr. ` +
        `Higher appreciation can offset ownership costs more quickly.`,
    },
    {
      factor: `Insurance volatility (${state})`,
      impact: insuranceImpact,
      explanation:
        `${coastalHint} Your current insurance is modeled as ~$${Math.round(insuranceAnnualNow).toLocaleString()}/yr.`,
    },
    {
      factor: `Maintenance inflation vs value growth`,
      impact: 'MEDIUM' as ImpactLevel,
      explanation:
        `Maintenance is modeled as a % of home value and grows with inflation. If maintenance inflation outpaces appreciation, ` +
        `net ownership cost can trend negative even in rising markets.`,
    },
  ];
}

export class HomeCostGrowthService {
  private taxSvc = new PropertyTaxService();
  private appreciationSvc = new AppreciationIndexService();

  async estimate(propertyId: string, opts: HomeCostGrowthInput = {}): Promise<HomeCostGrowthDTO> {
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

    if (!property) throw new Error('Property not found');

    const years: 5 | 10 = opts.years ?? 5;
    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'Property profile (address, state, ZIP, size)',
      'Property tax estimate (state and county benchmarks)',
      'Home value estimate (regional $/sqft benchmarks)',
      'Insurance and maintenance model (state-adjusted benchmarks)',
    ];

    // Confidence: HIGH if key overrides present, else MEDIUM/LOW
    let confidence: HomeCostGrowthConfidence = 'LOW';

    // Home value now
    let homeValueNow: number;
    if (opts.homeValueNow !== undefined) {
      homeValueNow = opts.homeValueNow;
      notes.push('Home value override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const r = estimateHomeValueNowUSD({ state, propertySize: property.propertySize });
      homeValueNow = r.value;
      notes.push(...r.notes);
      confidence = r.confidence;
    }

    // Appreciation rate (Phase-3: FHFA comps if no override)
    let appreciationRate: number;
    let appreciationMeta: HomeCostGrowthDTO['meta']['appreciation'] | undefined;

    if (opts.appreciationRate !== undefined) {
      appreciationRate = opts.appreciationRate;
      notes.push('Appreciation rate override was provided by the client.');
      confidence = 'HIGH';
    } else {
      try {
        const comp = await this.appreciationSvc.getAnnualizedAppreciation({
          city: String(property.city || ''),
          state,
          years,
        });

        if (Number.isFinite(comp.annualizedRate)) {
          appreciationRate = comp.annualizedRate;
          dataSources.push('FHFA House Price Index (repeat-sale appreciation comps)');
          const asOfDate = new Date(comp.asOf).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
          notes.push(`Appreciation rate sourced from FHFA repeat-sale index — ${comp.regionLabel} (as of ${asOfDate}).`);

          appreciationMeta = {
            source: 'FHFA',
            regionLevel: comp.regionLevel,
            regionLabel: comp.regionLabel,
            seriesKey: comp.seriesKey,
            asOf: comp.asOf,
            annualizedRatePct: comp.annualizedRatePct,
            confidence: comp.confidence,
            fallbackChain: comp.fallbackChain,
            notes: comp.notes,
          };

          // bump confidence when comps are strong
          confidence = comp.confidence === 'HIGH' ? 'HIGH' : (confidence === 'HIGH' ? 'HIGH' : 'MEDIUM');
        } else {
          throw new Error('FHFA returned no usable rate');
        }
      } catch {
        const r = estimateAppreciationRateHeuristic(state);
        appreciationRate = r.rate;
        notes.push(...r.notes);

        appreciationMeta = {
          source: 'HEURISTIC',
          regionLevel: 'STATE',
          regionLabel: state || 'Unknown',
          asOf: new Date().toISOString(),
          annualizedRatePct: Math.round(appreciationRate * 1000) / 10,
          confidence: 'LOW',
          fallbackChain: ['HomeCostGrowthService heuristic'],
          notes: ['FHFA comps unavailable; using localized heuristic.'],
        };

        confidence = confidence === 'HIGH' ? 'HIGH' : r.confidence;
      }
    }

    // Taxes
    const taxEstimate = await this.taxSvc.estimate(propertyId, {
      assessedValue: opts.assessedValue,
      taxRate: opts.taxRate,
      historyYears: years,
    });

    const taxHistory = (taxEstimate.history || []).slice(-years);
    const annualTaxNow = taxEstimate.current?.annualTax ?? (taxHistory.at(-1)?.annualTax ?? 0);

    if (opts.assessedValue !== undefined) notes.push('Assessed value override applied to PropertyTaxService.');
    if (opts.taxRate !== undefined) notes.push('Tax rate override applied to PropertyTaxService.');

    // Insurance now
    let annualInsuranceNow: number;
    if (opts.insuranceAnnualNow !== undefined) {
      annualInsuranceNow = opts.insuranceAnnualNow;
      notes.push('Insurance annual override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const base = 0.005 * homeValueNow; // 0.5%
      const adjusted = base * insuranceRateFactorByState(state);
      annualInsuranceNow = clamp(adjusted, 800, 12000);
      notes.push('Insurance estimated as 0.5% of home value, adjusted for state risk profile.');
      confidence = confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    // Maintenance now
    let annualMaintenanceNow: number;
    if (opts.maintenanceAnnualNow !== undefined) {
      annualMaintenanceNow = opts.maintenanceAnnualNow;
      notes.push('Maintenance annual override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const base = 0.01 * homeValueNow; // 1%
      const adjusted = base * maintenanceRateFactorByState(state);
      annualMaintenanceNow = clamp(adjusted, 1200, 18000);
      notes.push('Maintenance estimated as 1% of home value per year, adjusted for state cost-of-living.');
      confidence = confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    const inflation = inflationRateForState(state);

    // Build series (current year inclusive)
    const nowYear = new Date().getFullYear();
    const history: HomeCostGrowthDTO['history'] = [];

    const taxByYear = new Map<number, number>((taxHistory || []).map((h) => [h.year, h.annualTax]));

    // Home value series
    const homeValueByYear: { year: number; homeValue: number }[] = [];
    for (let i = years - 1; i >= 0; i--) {
      const year = nowYear - i;
      const factor = Math.pow(1 + appreciationRate, -i);
      homeValueByYear.push({ year, homeValue: toMoney(homeValueNow * factor) });
    }

    // Insurance/maintenance backfill via inflation
    for (let i = years - 1; i >= 0; i--) {
      const year = nowYear - i;

      const homeValue = homeValueByYear.find((x) => x.year === year)?.homeValue ?? 0;
      const annualTax = toMoney(taxByYear.get(year) ?? annualTaxNow * Math.pow(1 + inflation, -i));
      const annualInsurance = toMoney(annualInsuranceNow * Math.pow(1 + inflation, -i));
      const annualMaintenance = toMoney(annualMaintenanceNow * Math.pow(1 + inflation, -i));

      const annualExpenses = toMoney(annualTax + annualInsurance + annualMaintenance);

      const prev = history.at(-1);
      const appreciationGain = prev ? toMoney(homeValue - prev.homeValue) : 0;
      const netDelta = toMoney(appreciationGain - annualExpenses);

      history.push({
        year,
        homeValue,
        annualTax,
        annualInsurance,
        annualMaintenance,
        annualExpenses,
        appreciationGain,
        netDelta,
      });
    }

    const totals = history.reduce(
      (acc, y) => {
        acc.taxes += y.annualTax;
        acc.insurance += y.annualInsurance;
        acc.maintenance += y.annualMaintenance;
        acc.expenses += y.annualExpenses;
        acc.appreciation += y.appreciationGain;
        acc.net += y.netDelta;
        return acc;
      },
      { taxes: 0, insurance: 0, maintenance: 0, expenses: 0, appreciation: 0, net: 0 }
    );

    const drivers = buildDrivers({
      state,
      zipCode,
      appreciationRate,
      insuranceAnnualNow: annualInsuranceNow,
      homeValueNow,
      appreciationMeta,
    });

    const assumptions: HomeCostGrowthDTO['meta']['assumptions'] = [
      {
        field: 'homeValueNow',
        source: opts.homeValueNow !== undefined ? 'USER_OVERRIDE' : (property.propertySize ? 'HEURISTIC' : 'HEURISTIC'),
        value: toMoney(homeValueNow),
        note: opts.homeValueNow !== undefined
          ? 'Client-provided override.'
          : property.propertySize
            ? `Estimated from regional benchmark of $${VALUE_PER_SQFT_BY_STATE[state] ?? 200}/sqft × ${property.propertySize} sqft.`
            : 'Generic $350,000 fallback used — no property size on file.',
      },
      {
        field: 'appreciationRate',
        source: opts.appreciationRate !== undefined ? 'USER_OVERRIDE' : (appreciationMeta?.source === 'FHFA' ? 'DATA_BACKED' : 'HEURISTIC'),
        value: `${(appreciationRate * 100).toFixed(2)}%`,
        note: opts.appreciationRate !== undefined
          ? 'Client-provided override.'
          : appreciationMeta?.source === 'FHFA'
            ? `FHFA repeat-sale index — ${appreciationMeta.regionLabel} (as of ${new Date(appreciationMeta.asOf).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}).`
            : `State-level benchmark for ${state} (FHFA data unavailable for this area).`,
      },
      {
        field: 'annualInsurance',
        source: opts.insuranceAnnualNow !== undefined ? 'USER_OVERRIDE' : 'HEURISTIC',
        value: toMoney(annualInsuranceNow),
        note: opts.insuranceAnnualNow !== undefined
          ? 'Client-provided override.'
          : `0.5% of home value × state risk factor ${insuranceRateFactorByState(state)} (state-adjusted benchmark).`,
      },
      {
        field: 'annualMaintenance',
        source: opts.maintenanceAnnualNow !== undefined ? 'USER_OVERRIDE' : 'HEURISTIC',
        value: toMoney(annualMaintenanceNow),
        note: opts.maintenanceAnnualNow !== undefined
          ? 'Client-provided override.'
          : `1% of home value × state cost-of-living factor ${maintenanceRateFactorByState(state)} (state-adjusted benchmark).`,
      },
      {
        field: 'inflationRate',
        source: 'HEURISTIC',
        value: `${(inflation * 100).toFixed(1)}%`,
        note: `State-adjusted inflation estimate for ${state}.`,
      },
    ];

    return {
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          years,
          assessedValue: opts.assessedValue,
          taxRate: opts.taxRate,
          homeValueNow: opts.homeValueNow,
          appreciationRate: opts.appreciationRate,
          insuranceAnnualNow: opts.insuranceAnnualNow,
          maintenanceAnnualNow: opts.maintenanceAnnualNow,
        },
      },

      current: {
        homeValueNow: toMoney(homeValueNow),
        appreciationRate,
        annualTaxNow: toMoney(annualTaxNow),
        annualInsuranceNow: toMoney(annualInsuranceNow),
        annualMaintenanceNow: toMoney(annualMaintenanceNow),
        annualExpensesNow: toMoney(annualTaxNow + annualInsuranceNow + annualMaintenanceNow),
      },

      history,

      rollup: {
        totalAppreciationGain: toMoney(totals.appreciation),
        totalExpenses: toMoney(totals.expenses),
        totalNet: toMoney(totals.net),
        expenseBreakdown: {
          taxes: toMoney(totals.taxes),
          insurance: toMoney(totals.insurance),
          maintenance: toMoney(totals.maintenance),
        },
      },

      drivers,

      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes: [
          ...notes,
          `Insurance and maintenance projections use a ${(inflation * 100).toFixed(1)}%/yr inflation assumption.`,
        ],
        confidence,
        assumptions,
        appreciation: appreciationMeta,
      },
    };
  }
}
