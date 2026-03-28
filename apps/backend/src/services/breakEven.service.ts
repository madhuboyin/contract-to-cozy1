// apps/backend/src/services/breakEven.service.ts
import { prisma } from '../lib/prisma';
import { HomeCostGrowthService } from './homeCostGrowth.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';
import { AppreciationIndexService } from './appreciationIndex.service';
import {
  FinancialAssumptionService,
  FinancialAssumptions,
  deriveExpenseGrowthRate,
  hasFinancialAssumptionInput,
} from './financialAssumption.service';
import { buildAnnualCostSeries, buildAnnualGainSeries } from './tools/financialProjectionMath';

export type BreakEvenYears = 5 | 10 | 20 | 30;

export type BreakEvenInput = {
  years?: BreakEvenYears; // default 20
  assumptionSetId?: string;
  homeValueNow?: number; // optional override
  appreciationRate?: number; // decimal override
  expenseGrowthRate?: number; // optional override (decimal) for sensitivity / projection
  inflationRate?: number;
  rentGrowthRate?: number;
  interestRate?: number;
  propertyTaxGrowthRate?: number;
  insuranceGrowthRate?: number;
  maintenanceGrowthRate?: number;
  sellingCostPercent?: number;
};

type Impact = 'LOW' | 'MEDIUM' | 'HIGH';

export type BreakEvenDTO = {
  assumptionSetId?: string | null;
  preferenceProfileId?: string | null;
  sharedSignalsUsed?: string[];
  financialAssumptions?: FinancialAssumptions;

  input: {
    propertyId: string;
    years: BreakEvenYears;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    homeValueNow: number;
    appreciationRate: number; // decimal
    annualExpensesNow: number;
  };

  history: Array<{
    year: number; // calendar year
    annualExpenses: number;
    annualAppreciationGain: number;
    cumulativeExpenses: number;
    cumulativeAppreciationGain: number;
    netCumulative: number;
  }>;

  breakEven: {
    status: 'ALREADY_BREAKEVEN' | 'PROJECTED' | 'NOT_REACHED';
    reached: boolean;
    breakEvenYearIndex: number | null; // 1..N
    breakEvenCalendarYear: number | null;
    netAtBreakEven: number | null;
  };

  sensitivity: {
    conservative: { breakEvenYearIndex: number | null; netAtHorizon: number };
    base: { breakEvenYearIndex: number | null; netAtHorizon: number };
    optimistic: { breakEvenYearIndex: number | null; netAtHorizon: number };
    rangeLabel: string; // e.g., "Year 6–9"
  };

  events: Array<{
    year: number;
    type:
      | 'TAX_STEP'
      | 'INSURANCE_SHOCK'
      | 'MAINTENANCE_PRESSURE'
      | 'APPRECIATION_ACCEL'
      | 'APPRECIATION_SLOWDOWN';
    description: string;
    impact: Impact;
  }>;

  rollup: {
    netAtHorizon: number;
    cumulativeExpensesAtHorizon: number;
    cumulativeAppreciationAtHorizon: number;
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
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';

    // ✅ Phase-3 additive field (safe for existing clients)
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

function clampYears(y?: number): BreakEvenYears {
  if (y === 5 || y === 10 || y === 20 || y === 30) return y;
  return 20;
}

function toMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function zipPrefix(zip: string) {
  const z = String(zip || '').replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : z;
}

function firstBreakEvenIndex(net: number[]) {
  for (let i = 0; i < net.length; i++) {
    if (net[i] >= 0) return i + 1; // 1-based index
  }
  return null;
}

function rangeLabel(a: number | null, b: number | null) {
  const xs = [a, b].filter((v): v is number => typeof v === 'number');
  if (!xs.length) return 'Not reached';
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  return min === max ? `Year ${min}` : `Year ${min}–${max}`;
}

function bumpConfidence(
  cur: 'HIGH' | 'MEDIUM' | 'LOW',
  next: 'HIGH' | 'MEDIUM' | 'LOW'
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  return rank[next] > rank[cur] ? next : cur;
}

export class BreakEvenService {
  private costGrowth = new HomeCostGrowthService();
  private trueCost = new TrueCostOwnershipService();
  private appreciation = new AppreciationIndexService();
  private financialAssumptionService = new FinancialAssumptionService();

  async compute(
    propertyId: string,
    input: BreakEvenInput = {},
    userId?: string
  ): Promise<BreakEvenDTO> {
    const years = clampYears(input.years);

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });
    if (!property) throw new Error('Property not found');

    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;
    const nowYear = new Date().getFullYear();

    const notes: string[] = [];
    const dataSources: string[] = [
      'Internal property profile (address/state/zip)',
      'HomeCostGrowthService (Phase 1 heuristics)',
      'AssumptionSet + PreferenceProfile (shared financial assumptions)',
    ];

    // Base: still call HomeCostGrowthService to anchor homeValueNow + annualExpensesNow
    const baseCg = await this.costGrowth.estimate(propertyId, {
      years: 10,
      homeValueNow: input.homeValueNow,
    });

    const homeValueNow = baseCg.current.homeValueNow;
    let appreciationRate = baseCg.current.appreciationRate; // replaced below if FHFA comps used
    const annualExpensesNow = baseCg.current.annualExpensesNow;

    // Overall confidence starts low; we bump based on data
    let confidence: BreakEvenDTO['meta']['confidence'] = 'LOW';
    if (input.homeValueNow !== undefined || input.appreciationRate !== undefined || input.expenseGrowthRate !== undefined) {
      confidence = bumpConfidence(confidence, 'MEDIUM');
    }

    // ✅ Phase-3: swap appreciationRate to real comps when user did NOT override appreciationRate
    let appreciationMeta: BreakEvenDTO['meta']['appreciation'] | undefined;

    if (input.appreciationRate === undefined) {
      try {
        const comp = await this.appreciation.getAnnualizedAppreciation({
          city: String(property.city || ''),
          state,
          zipCode,
          years,
        });

        if (Number.isFinite(comp.annualizedRate) && comp.annualizedRate !== 0) {
          appreciationRate = comp.annualizedRate;

          dataSources.push('FHFA HPI (repeat-sale) appreciation comps (Phase 3)');
          notes.push(
            `Appreciation rate derived from ${comp.regionLevel} repeat-sale index: ${comp.regionLabel} (as of ${comp.asOf}).`
          );

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

          // bump confidence according to FHFA match strength
          confidence = bumpConfidence(confidence, comp.confidence);
        } else {
          notes.push('FHFA comps returned no usable rate for this horizon; using heuristic appreciation.');
          appreciationMeta = {
            source: 'HEURISTIC',
            regionLevel: 'STATE',
            regionLabel: state || 'Unknown',
            asOf: new Date().toISOString(),
            annualizedRatePct: Math.round(appreciationRate * 1000) / 10,
            confidence: 'LOW',
            fallbackChain: ['HomeCostGrowthService heuristic'],
            notes: ['FHFA series alignment insufficient; using localized heuristic.'],
          };
        }
      } catch {
        notes.push('Using heuristic appreciation rate (FHFA comps unavailable).');
        appreciationMeta = {
          source: 'HEURISTIC',
          regionLevel: 'STATE',
          regionLabel: state || 'Unknown',
          asOf: new Date().toISOString(),
          annualizedRatePct: Math.round(appreciationRate * 1000) / 10,
          confidence: 'LOW',
          fallbackChain: ['HomeCostGrowthService heuristic'],
          notes: ['FHFA dataset unavailable; using localized heuristic.'],
        };
      }
    } else {
      notes.push('Used client-provided appreciationRate override for projection.');
    }

    // True cost anchor note (unchanged)
    try {
      const tc = await this.trueCost.estimate(propertyId, {
        years: 5,
        homeValueNow: input.homeValueNow,
      });
      dataSources.push('TrueCostOwnershipService (annualTotalNow anchor; Phase 1)');
      const tcNow = tc.current.annualTotalNow;
      const diffPct = annualExpensesNow > 0 ? Math.abs(tcNow - annualExpensesNow) / annualExpensesNow : 0;
      if (diffPct > 0.2) {
        notes.push(
          'Note: True Cost (incl utilities) differs materially from cost-growth (excl utilities). Break-even uses cost-growth expenses for consistency.'
        );
      }
    } catch {
      // ignore
    }

    // Infer a default expense growth rate from last 2 years of insurance backfill
    let inferredExpenseGrowth = 0.04;
    const h = baseCg.history;
    if (h.length >= 2) {
      const a = h[h.length - 2].annualInsurance;
      const b = h[h.length - 1].annualInsurance;
      if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) {
        const g = b / a - 1;
        if (Number.isFinite(g) && g > -0.2 && g < 0.3) inferredExpenseGrowth = g;
      }
    }
    const sharedFinancialOverrides = {
      appreciationRate: input.appreciationRate,
      inflationRate: input.inflationRate,
      rentGrowthRate: input.rentGrowthRate,
      interestRate: input.interestRate,
      propertyTaxGrowthRate:
        input.propertyTaxGrowthRate ?? input.expenseGrowthRate,
      insuranceGrowthRate:
        input.insuranceGrowthRate ?? input.expenseGrowthRate,
      maintenanceGrowthRate:
        input.maintenanceGrowthRate ?? input.expenseGrowthRate,
      sellingCostPercent: input.sellingCostPercent,
    };

    const hasFinancialOverrideInput = hasFinancialAssumptionInput(sharedFinancialOverrides);
    const financialContext = await this.financialAssumptionService.resolveForTool({
      propertyId,
      toolKey: 'BREAK_EVEN',
      assumptionSetId: input.assumptionSetId,
      requestOverrides: sharedFinancialOverrides,
      canonicalDefaults: {
        appreciationRate,
        inflationRate: 0.035,
        rentGrowthRate: 0.03,
        interestRate: 0.065,
        propertyTaxGrowthRate: inferredExpenseGrowth,
        insuranceGrowthRate: inferredExpenseGrowth,
        maintenanceGrowthRate: inferredExpenseGrowth,
        sellingCostPercent: 0.06,
      },
      legacyFallbacks: {
        appreciationRate,
        propertyTaxGrowthRate: inferredExpenseGrowth,
        insuranceGrowthRate: inferredExpenseGrowth,
        maintenanceGrowthRate: inferredExpenseGrowth,
      },
      createdByUserId: userId ?? null,
    });

    appreciationRate = financialContext.assumptions.appreciationRate;
    const expenseGrowthRate =
      input.expenseGrowthRate !== undefined
        ? input.expenseGrowthRate
        : deriveExpenseGrowthRate(financialContext.assumptions);

    if (input.expenseGrowthRate !== undefined) {
      notes.push('Used client-provided expenseGrowthRate override for projection.');
    }
    if (hasFinancialOverrideInput) {
      notes.push('Financial overrides were persisted into a reusable AssumptionSet.');
      confidence = bumpConfidence(confidence, 'MEDIUM');
    }
    if (input.assumptionSetId) {
      notes.push('Input assumptions were hydrated from the provided AssumptionSet before projection.');
    }
    if (financialContext.savingsRealizationAnnual !== null && financialContext.savingsRealizationAnnual > 0) {
      notes.push(
        `Savings realization context applied (~$${Math.round(financialContext.savingsRealizationAnnual).toLocaleString()}/yr).`
      );
      confidence = bumpConfidence(confidence, 'MEDIUM');
    }
    if (financialContext.sharedSignalsUsed.length > 0) {
      dataSources.push('SignalService (shared financial signal context)');
    }

    // Project series forward
    const annualExpenses = buildAnnualCostSeries(annualExpensesNow, expenseGrowthRate, years).map(toMoney);
    const annualAppGain = buildAnnualGainSeries(homeValueNow, appreciationRate, years).map(toMoney);

    // Cumulative + net
    const historyOut: BreakEvenDTO['history'] = [];
    let cumExp = 0;
    let cumGain = 0;

    for (let i = 0; i < years; i++) {
      cumExp += annualExpenses[i];
      cumGain += annualAppGain[i];
      const net = cumGain - cumExp;

      historyOut.push({
        year: nowYear + i,
        annualExpenses: toMoney(annualExpenses[i]),
        annualAppreciationGain: toMoney(annualAppGain[i]),
        cumulativeExpenses: toMoney(cumExp),
        cumulativeAppreciationGain: toMoney(cumGain),
        netCumulative: toMoney(net),
      });
    }

    // Break-even status
    const netSeries = historyOut.map((x) => x.netCumulative);
    const beIdx = firstBreakEvenIndex(netSeries);
    const reached = beIdx !== null;

    const status: BreakEvenDTO['breakEven']['status'] =
      netSeries[0] >= 0 ? 'ALREADY_BREAKEVEN' : reached ? 'PROJECTED' : 'NOT_REACHED';

    const breakEvenYearIndex = status === 'ALREADY_BREAKEVEN' ? 1 : beIdx;
    const breakEvenCalendarYear =
      breakEvenYearIndex !== null ? nowYear + (breakEvenYearIndex - 1) : null;
    const netAtBreakEven =
      breakEvenYearIndex !== null ? historyOut[breakEvenYearIndex - 1]?.netCumulative ?? null : null;

    // Sensitivity (unchanged)
    const sens = (adj: number) => {
      let cumE = 0;
      let cumG = 0;
      const net: number[] = [];

      const ar = appreciationRate + adj;
      const er = expenseGrowthRate - adj * 0.5;

      const gains = buildAnnualGainSeries(homeValueNow, ar, years);
      const costs = buildAnnualCostSeries(annualExpensesNow, er, years);
      for (let t = 0; t < years; t++) {
        cumE += costs[t];
        cumG += gains[t];
        net.push(toMoney(cumG - cumE));
      }

      const idx = firstBreakEvenIndex(net);
      return { breakEvenYearIndex: idx, netAtHorizon: net[net.length - 1] };
    };

    const conservative = sens(-0.01);
    const base = sens(0);
    const optimistic = sens(+0.01);
    const range = rangeLabel(optimistic.breakEvenYearIndex, conservative.breakEvenYearIndex);

    // Events + drivers (your current impl keeps events empty; OK for now)
    const events: BreakEvenDTO['events'] = [];
    const drivers: BreakEvenDTO['drivers'] = [];

    const zp = zipPrefix(zipCode);
    if (zp) {
      drivers.push({
        factor: 'Local pricing environment',
        impact: 'LOW',
        explanation: `Localized modeling uses state + ZIP prefix ${zp} heuristics for context (Phase 1–2).`,
      });
    }

    drivers.push({
      factor: 'Appreciation rate (key driver)',
      impact: 'HIGH',
      explanation:
        input.appreciationRate !== undefined
          ? 'Using your provided appreciation rate override.'
          : appreciationMeta?.source === 'FHFA'
            ? `Based on FHFA repeat-sale index (${appreciationMeta.regionLevel}): ${appreciationMeta.regionLabel}.`
            : 'Modeled using localized historical heuristics (Phase 1–2).',
    });

    return {
      assumptionSetId: financialContext.assumptionSetId,
      preferenceProfileId: financialContext.preferenceProfileId,
      sharedSignalsUsed: financialContext.sharedSignalsUsed,
      financialAssumptions: financialContext.assumptions,
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          homeValueNow: input.homeValueNow,
          appreciationRate: input.appreciationRate,
          expenseGrowthRate: input.expenseGrowthRate,
          inflationRate: input.inflationRate,
          rentGrowthRate: input.rentGrowthRate,
          interestRate: input.interestRate,
          propertyTaxGrowthRate: input.propertyTaxGrowthRate,
          insuranceGrowthRate: input.insuranceGrowthRate,
          maintenanceGrowthRate: input.maintenanceGrowthRate,
          sellingCostPercent: input.sellingCostPercent,
        },
      },

      current: { homeValueNow, appreciationRate, annualExpensesNow },

      history: historyOut,

      breakEven: {
        status,
        reached,
        breakEvenYearIndex,
        breakEvenCalendarYear,
        netAtBreakEven,
      },

      sensitivity: { conservative, base, optimistic, rangeLabel: range },

      events,

      rollup: {
        netAtHorizon: historyOut[historyOut.length - 1].netCumulative,
        cumulativeExpensesAtHorizon: historyOut[historyOut.length - 1].cumulativeExpenses,
        cumulativeAppreciationAtHorizon: historyOut[historyOut.length - 1].cumulativeAppreciationGain,
      },

      drivers,

      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
        confidence,
        appreciation: appreciationMeta,
      },
    };
  }
}
