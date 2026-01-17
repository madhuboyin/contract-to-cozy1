// apps/backend/src/services/homeCostGrowth.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';

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

// Reuse same idea as propertyTax.service.ts, but keep independent map here (Phase 1).
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
    notes.push(`Estimated home value using ${ppsf}/sqft heuristic (Phase 1).`);
    return { value: propertySize * ppsf, confidence: 'MEDIUM', notes };
  }

  notes.push('Estimated home value using generic fallback (no property size).');
  return { value: 350000, confidence: 'LOW', notes };
}

function estimateAppreciationRate(state: string): { rate: number; confidence: HomeCostGrowthConfidence; notes: string[] } {
  const notes: string[] = [];
  const rate = DEFAULT_APPRECIATION_RATE_BY_STATE[state] ?? 0.035;
  if (DEFAULT_APPRECIATION_RATE_BY_STATE[state]) {
    notes.push('Used state-level appreciation heuristic (Phase 1).');
    return { rate, confidence: 'MEDIUM', notes };
  }
  notes.push('Used generic appreciation fallback (Phase 1).');
  return { rate, confidence: 'LOW', notes };
}

// Insurance heuristic: base percent of value, with state/coastal volatility adjustments.
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
  // simple Phase 1 knob (3–5%)
  if (['FL', 'TX', 'CA'].includes(state)) return 0.045;
  return 0.04;
}

function buildDrivers(state: string, zipCode: string, appreciationRate: number, insuranceAnnualNow: number, homeValueNow: number) {
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

  const volatilityHint =
    ['085', '900', '902', '940', '941', '943'].includes(zp)
      ? 'HIGH'
      : ['750', '787', '981', '021', '100'].includes(zp)
        ? 'MEDIUM'
        : 'LOW';

  return [
    {
      factor: `Appreciation sensitivity (ZIP prefix ${zp})`,
      impact: (volatilityHint as ImpactLevel),
      explanation:
        `ZIP prefix ${zp} is used for localized messaging in Phase 1. Volatility signal: ${volatilityHint}. ` +
        `We’ll swap this for a real HPI series later without changing the UI.`,
    },
    {
      factor: `State appreciation baseline (${state})`,
      impact: appreciationImpact,
      explanation:
        `Your appreciation rate is modeled at ${(appreciationRate * 100).toFixed(1)}%/yr (Phase 1 heuristic). ` +
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
      'Internal property profile (address/state/zip/propertySize)',
      'PropertyTaxService estimate (Phase 1 heuristic)',
      'Heuristic value-per-sqft estimate (Phase 1)',
      'Heuristic insurance/maintenance model (Phase 1)',
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

    // Appreciation rate
    let appreciationRate: number;
    if (opts.appreciationRate !== undefined) {
      appreciationRate = opts.appreciationRate;
      notes.push('Appreciation rate override was provided by the client.');
      confidence = 'HIGH';
    } else {
      const r = estimateAppreciationRate(state);
      appreciationRate = r.rate;
      notes.push(...r.notes);
      confidence = confidence === 'HIGH' ? 'HIGH' : r.confidence;
    }

    // Taxes (reuse PropertyTaxService for consistency + history)
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
      notes.push('Insurance estimated as % of home value (state-adjusted; Phase 1).');
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
      notes.push('Maintenance estimated as 1% of home value (state-adjusted; Phase 1).');
      confidence = confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    const inflation = inflationRateForState(state);

    // Build series (current year inclusive)
    const nowYear = new Date().getFullYear();
    const history: HomeCostGrowthDTO['history'] = [];

    // We anchor at "now" then backfill earlier years using inverse growth.
    // For taxes we use PropertyTaxService history as the anchor to remain consistent with its assumed growth.
    const taxByYear = new Map<number, number>(taxHistory.map((h) => [h.year, h.annualTax]));

    // Compute home value each year similarly: build from now backward using appreciationRate
    const yearsCount = years;
    const homeValueByYear: { year: number; homeValue: number }[] = [];

    for (let i = yearsCount - 1; i >= 0; i--) {
      const year = nowYear - i;
      const factor = Math.pow(1 + appreciationRate, -i);
      homeValueByYear.push({ year, homeValue: toMoney(homeValueNow * factor) });
    }

    // For insurance/maintenance: backfill using inflation inverse (so current is anchor)
    for (let i = yearsCount - 1; i >= 0; i--) {
      const year = nowYear - i;

      const homeValue = homeValueByYear.find((x) => x.year === year)?.homeValue ?? 0;
      const annualTax = toMoney(taxByYear.get(year) ?? annualTaxNow * Math.pow(1 + inflation, -i)); // fallback if tax history missing
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

    // Rollups
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

    const drivers = buildDrivers(state, zipCode, appreciationRate, annualInsuranceNow, homeValueNow);

    const dto: HomeCostGrowthDTO = {
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
          `Insurance/maintenance use inflation ${(inflation * 100).toFixed(1)}%/yr (Phase 1).`,
          'No external price/HPI datasets are used in Phase 1.',
        ],
        confidence,
      },
    };

    return dto;
  }
}
