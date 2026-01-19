// apps/backend/src/services/breakEven.service.ts
import { prisma } from '../lib/prisma';
import { HomeCostGrowthService } from './homeCostGrowth.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';

export type BreakEvenYears = 5 | 10 | 20 | 30;

export type BreakEvenInput = {
  years?: BreakEvenYears; // default 20
  homeValueNow?: number; // optional override
  appreciationRate?: number; // decimal override
  expenseGrowthRate?: number; // optional override (decimal) for sensitivity / projection
};

type Impact = 'LOW' | 'MEDIUM' | 'HIGH';

export type BreakEvenDTO = {
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

function impactFromPct(p: number): Impact {
  if (p >= 0.25) return 'HIGH';
  if (p >= 0.15) return 'MEDIUM';
  return 'LOW';
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

/**
 * Break-even projections:
 * - Use HomeCostGrowthService for state/zip/current values + recent tax/insurance/maintenance levels.
 * - Project forward for N years from current year (Year 1 = current year).
 * - Expense growth uses:
 *    - if input.expenseGrowthRate provided => used
 *    - else inferred from recent insurance drift in HomeCostGrowth history (backfilled using inflation heuristic)
 */
export class BreakEvenService {
  private costGrowth = new HomeCostGrowthService();
  private trueCost = new TrueCostOwnershipService();

  async compute(propertyId: string, input: BreakEvenInput = {}): Promise<BreakEvenDTO> {
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
    ];

    // Use HomeCostGrowth for current values (5y/10y backfill), and use its current fields as anchor
    const baseCg = await this.costGrowth.estimate(propertyId, {
      years: 10,
      homeValueNow: input.homeValueNow,
      appreciationRate: input.appreciationRate,
    });

    const homeValueNow = baseCg.current.homeValueNow;
    const appreciationRate = baseCg.current.appreciationRate;
    const annualExpensesNow = baseCg.current.annualExpensesNow;

    // Prefer TrueCostOwnershipService annualTotalNow as an “ownership cost anchor” (even though it is 5y fixed),
    // but keep HomeCostGrowth annualExpensesNow as canonical to avoid mixing utilities in/out.
    // This is still helpful as a confidence note if it’s close/far.
    try {
      const tc = await this.trueCost.estimate(propertyId, {
        years: 5,
        homeValueNow: input.homeValueNow,
      });
      dataSources.push('TrueCostOwnershipService (annualTotalNow anchor; Phase 1)');
      const tcNow = tc.current.annualTotalNow;
      const diffPct = annualExpensesNow > 0 ? Math.abs(tcNow - annualExpensesNow) / annualExpensesNow : 0;
      if (diffPct > 0.2) {
        notes.push('Note: True Cost (incl utilities) differs materially from cost-growth (excl utilities). Break-even uses cost-growth expenses for consistency.');
      }
    } catch {
      // If trueCost fails for any reason, ignore; base remains HomeCostGrowthService
    }

    // Infer a default expense growth rate from last 2 years of insurance backfill (since HomeCostGrowth uses inflationRateForState)
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
    const expenseGrowthRate = input.expenseGrowthRate ?? inferredExpenseGrowth;
    if (input.expenseGrowthRate !== undefined) notes.push('Used client-provided expenseGrowthRate override for projection.');

    // Project series forward: Year 1 is current year; Year t is nowYear + t - 1
    const annualExpenses: number[] = [];
    const annualAppGain: number[] = [];

    let hv = homeValueNow;
    let exp = annualExpensesNow;

    for (let t = 1; t <= years; t++) {
      const prevHv = hv;
      hv = t === 1 ? hv : hv * (1 + appreciationRate);
      const gain = t === 1 ? hv * appreciationRate : hv - prevHv;

      exp = t === 1 ? exp : exp * (1 + expenseGrowthRate);

      annualExpenses.push(toMoney(exp));
      annualAppGain.push(toMoney(gain));
    }

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

    const netSeries = historyOut.map((x) => x.netCumulative);
    const beIdx = firstBreakEvenIndex(netSeries);

    const status: BreakEvenDTO['breakEven']['status'] =
      beIdx === 1 ? 'ALREADY_BREAKEVEN' : beIdx ? 'PROJECTED' : 'NOT_REACHED';

    const breakEven = {
      status,
      reached: !!beIdx,
      breakEvenYearIndex: beIdx,
      breakEvenCalendarYear: beIdx ? nowYear + (beIdx - 1) : null,
      netAtBreakEven: beIdx ? historyOut[beIdx - 1].netCumulative : null,
    };

    // Events: step-change detection using YoY % changes (projected series)
    const events: BreakEvenDTO['events'] = [];
    const TAX_STEP_PCT = 0.12; // 12%
    const INS_SHOCK_PCT = 0.15; // 15%
    const MAINT_PRESS_PCT = 0.12; // 12%
    const APP_ACCEL_PCT = 0.02; // 2% deviation vs avg appreciation gain pct

    // For component events, we don’t have projected component splits in this tool;
    // we approximate shocks/steps based on total expense jumps.
    // This keeps UI calm and still surfaces “step years”.
    const yoyExpensePct: number[] = [];
    for (let i = 1; i < historyOut.length; i++) {
      const prev = historyOut[i - 1].annualExpenses;
      const cur = historyOut[i].annualExpenses;
      yoyExpensePct.push(prev > 0 ? cur / prev - 1 : 0);
    }
    // Approximate a “tax step” if YoY expenses jump above threshold and state tends to reassess (simple heuristic)
    for (let i = 1; i < historyOut.length; i++) {
      const yp = yoyExpensePct[i - 1] ?? 0;
      if (yp > TAX_STEP_PCT) {
        events.push({
          year: historyOut[i].year,
          type: 'TAX_STEP',
          impact: impactFromPct(yp),
          description: `Projected ownership cost step-change (~${Math.round(yp * 100)}% YoY). Often driven by tax cadence/reassessment in ${state}.`,
        });
      } else if (yp > INS_SHOCK_PCT) {
        events.push({
          year: historyOut[i].year,
          type: 'INSURANCE_SHOCK',
          impact: impactFromPct(yp),
          description: `Projected expense jump (~${Math.round(yp * 100)}% YoY). Insurance repricing spikes are more common in-region.`,
        });
      } else if (yp > MAINT_PRESS_PCT) {
        events.push({
          year: historyOut[i].year,
          type: 'MAINTENANCE_PRESSURE',
          impact: impactFromPct(yp),
          description: `Projected expense drift (~${Math.round(yp * 100)}% YoY). Maintenance/utilities inflation can outpace appreciation.`,
        });
      }
    }

    // Appreciation accel/slowdown markers using annualAppGain vs average
    const gains = historyOut.map((x) => x.annualAppreciationGain);
    const avgGain = gains.reduce((a, b) => a + b, 0) / Math.max(1, gains.length);
    for (let i = 0; i < historyOut.length; i++) {
      const g = gains[i];
      if (avgGain <= 0) continue;
      const dev = g / avgGain - 1;
      if (dev > APP_ACCEL_PCT) {
        events.push({
          year: historyOut[i].year,
          type: 'APPRECIATION_ACCEL',
          impact: impactFromPct(Math.min(0.3, dev)),
          description: `Appreciation gain above baseline (+${Math.round(dev * 100)}% vs avg).`,
        });
      } else if (dev < -APP_ACCEL_PCT) {
        events.push({
          year: historyOut[i].year,
          type: 'APPRECIATION_SLOWDOWN',
          impact: impactFromPct(Math.min(0.3, Math.abs(dev))),
          description: `Appreciation gain below baseline (${Math.round(dev * 100)}% vs avg).`,
        });
      }
    }

    // De-dupe events by (year,type)
    const seen = new Set<string>();
    const eventsDedup = events.filter((e) => {
      const k = `${e.year}:${e.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Sensitivity (simple multiplicative adjustments)
    const baseBreakEvenIdx = beIdx;
    const baseNetH = historyOut.at(-1)?.netCumulative ?? 0;

    const scenario = (label: 'conservative' | 'optimistic') => {
      const r0 = appreciationRate;
      const r =
        label === 'conservative'
          ? Math.max(0, r0 - 0.015)
          : r0 + 0.015;

      const expAdj =
        label === 'conservative'
          ? 1 + 0.015
          : 1 - 0.01;

      const ratio = r0 > 1e-9 ? r / r0 : 0;

      const net: number[] = [];
      let cE = 0;
      let cG = 0;

      for (let i = 0; i < historyOut.length; i++) {
        const e = historyOut[i].annualExpenses * expAdj;
        const g = historyOut[i].annualAppreciationGain * ratio;
        cE += e;
        cG += g;
        net.push(cG - cE);
      }

      return {
        be: firstBreakEvenIndex(net),
        netAtH: toMoney(net.at(-1) ?? 0),
      };
    };

    const cons = scenario('conservative');
    const opt = scenario('optimistic');

    const sensitivity = {
      conservative: { breakEvenYearIndex: cons.be, netAtHorizon: cons.netAtH },
      base: { breakEvenYearIndex: baseBreakEvenIdx, netAtHorizon: toMoney(baseNetH) },
      optimistic: { breakEvenYearIndex: opt.be, netAtHorizon: opt.netAtH },
      rangeLabel: rangeLabel(cons.be, opt.be),
    };

    // Drivers (ranked, calm)
    const zp = zipPrefix(zipCode);
    const appreciationImpact: Impact =
      appreciationRate >= 0.05 ? 'HIGH' : appreciationRate >= 0.04 ? 'MEDIUM' : 'LOW';
    const expenseImpact: Impact =
      expenseGrowthRate >= 0.06 ? 'HIGH' : expenseGrowthRate >= 0.045 ? 'MEDIUM' : 'LOW';

    const drivers: BreakEvenDTO['drivers'] = [
      {
        factor: 'Appreciation rate',
        impact: appreciationImpact,
        explanation: `Modeled at ${(appreciationRate * 100).toFixed(2)}%/yr using ${state} + ZIP ${zp} heuristics (Phase 1). Higher appreciation reaches break-even sooner.`,
      },
      {
        factor: 'Insurance inflation',
        impact: expenseImpact,
        explanation: `Annual expense growth is modeled at ${(expenseGrowthRate * 100).toFixed(2)}%/yr (inferred from recent insurance drift unless overridden). Premium repricing can dominate the curve in ${state}.`,
      },
      {
        factor: 'Tax cadence / reassessment',
        impact: 'MEDIUM',
        explanation: `Step-change markers call out years with unusually large expense jumps. These often correlate with reassessments and local tax cadence (state ${state}).`,
      },
      {
        factor: 'Maintenance inflation vs appreciation',
        impact: 'MEDIUM',
        explanation: `If maintenance/utilities inflation outpaces appreciation, net can remain negative even in rising markets. This tool highlights those pressure years as markers.`,
      },
    ];

    const rollup = {
      netAtHorizon: toMoney(historyOut.at(-1)?.netCumulative ?? 0),
      cumulativeExpensesAtHorizon: toMoney(historyOut.at(-1)?.cumulativeExpenses ?? 0),
      cumulativeAppreciationAtHorizon: toMoney(historyOut.at(-1)?.cumulativeAppreciationGain ?? 0),
    };

    // Confidence: align with existing tools: HIGH if overrides supplied, otherwise MEDIUM/LOW based on HomeCostGrowth
    const confidence: BreakEvenDTO['meta']['confidence'] =
      input.homeValueNow !== undefined || input.appreciationRate !== undefined || input.expenseGrowthRate !== undefined
        ? 'HIGH'
        : baseCg.meta.confidence === 'HIGH'
          ? 'MEDIUM'
          : 'LOW';

    notes.push(
      'Break-even is computed from cumulative appreciation gain vs cumulative ownership expenses.',
      'This is a Phase 1+2 projection model: no persisted snapshots; uses heuristics and localized messaging only.'
    );

    return {
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          years: input.years,
          homeValueNow: input.homeValueNow,
          appreciationRate: input.appreciationRate,
          expenseGrowthRate: input.expenseGrowthRate,
        },
      },
      current: {
        homeValueNow: toMoney(homeValueNow),
        appreciationRate: toMoney(appreciationRate),
        annualExpensesNow: toMoney(annualExpensesNow),
      },
      history: historyOut,
      breakEven,
      sensitivity,
      events: eventsDedup,
      rollup,
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
