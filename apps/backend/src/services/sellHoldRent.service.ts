// apps/backend/src/services/sellHoldRent.service.ts
import { prisma } from '../lib/prisma';
import { HomeCostGrowthService } from './homeCostGrowth.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';

type Years = 5 | 10;

export type SellHoldRentInput = {
  years?: Years;

  // Phase-1 overrides
  homeValueNow?: number;
  appreciationRate?: number;
  sellingCostRate?: number;

  monthlyRentNow?: number;
  rentGrowthRate?: number;
  vacancyRate?: number;
  managementRate?: number;

  // Phase-2 (optional)
  mortgageBalance?: number;
  interestRate?: number; // decimal
  remainingTermMonths?: number;
};

type MortgageSnapshot = {
  mortgageBalance?: number | null;
  interestRate?: number | null;
  remainingTermMonths?: number | null;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nowIso() {
  return new Date().toISOString();
}

function safeNum(v: any): number | undefined {
  const n = typeof v === 'number' ? v : v === '' || v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Standard fixed-rate mortgage amortization.
 * Returns yearly aggregates for interest/principal paid and balance.
 */
function amortize(params: {
  balance: number;
  annualRate: number; // decimal
  termMonths: number;
  years: Years;
}) {
  const { balance, annualRate, termMonths, years } = params;

  // Guard rails
  const b0 = Math.max(0, balance);
  const r = clamp(annualRate, 0, 0.25);
  const n = Math.max(1, Math.floor(termMonths));
  const monthsToSim = Math.min(n, years * 12);

  const monthlyRate = r / 12;

  // Payment formula:
  // pmt = B * i / (1 - (1+i)^-n)
  const payment =
    monthlyRate === 0
      ? b0 / n
      : (b0 * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));

  let bal = b0;
  const yearly: Array<{
    yearIndex: number; // 1..years
    interestPaid: number;
    principalPaid: number;
    balanceEnd: number;
  }> = [];

  for (let y = 1; y <= years; y++) {
    let interestPaid = 0;
    let principalPaid = 0;

    for (let m = 0; m < 12; m++) {
      const globalMonth = (y - 1) * 12 + m + 1;
      if (globalMonth > monthsToSim) break;
      if (bal <= 0) break;

      const interest = bal * monthlyRate;
      const principal = Math.min(bal, Math.max(0, payment - interest));

      interestPaid += interest;
      principalPaid += principal;
      bal = Math.max(0, bal - principal);
    }

    yearly.push({
      yearIndex: y,
      interestPaid,
      principalPaid,
      balanceEnd: bal,
    });
  }

  const interestTotal = yearly.reduce((s, r) => s + r.interestPaid, 0);
  const principalTotal = yearly.reduce((s, r) => s + r.principalPaid, 0);

  return { payment, yearly, interestTotal, principalTotal, balanceEnd: bal };
}

async function readToolOverrides(propertyId: string) {
  const rows = await prisma.toolOverride.findMany({
    where: { propertyId, toolKey: 'SELL_HOLD_RENT' },
  });

  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

async function readMortgageSnapshot(propertyId: string): Promise<MortgageSnapshot | null> {
  const snap = await prisma.propertyFinanceSnapshot.findUnique({ where: { propertyId } });
  if (!snap) return null;
  return {
    mortgageBalance: snap.mortgageBalance,
    interestRate: snap.interestRate,
    remainingTermMonths: snap.remainingTermMonths,
  };
}

function confidenceFromCompleteness(args: {
  hasTrueCost: boolean;
  hasGrowth: boolean;
  usedMortgage: boolean;
  mortgageComplete: boolean;
  usedOverrides: boolean;
}) {
  const { hasTrueCost, hasGrowth, usedMortgage, mortgageComplete, usedOverrides } = args;

  // Simple heuristic
  let score = 0;
  if (hasTrueCost) score += 2;
  if (hasGrowth) score += 2;
  if (usedMortgage) score += mortgageComplete ? 2 : 1;
  if (usedOverrides) score += 1;

  if (score >= 6) return 'HIGH' as const;
  if (score >= 4) return 'MEDIUM' as const;
  return 'LOW' as const;
}

export class SellHoldRentService {
  constructor(
    private costGrowth = new HomeCostGrowthService(),
    private trueCost = new TrueCostOwnershipService()
  ) {}

  async getSellHoldRent(propertyId: string, input: SellHoldRentInput) {
    const years: Years = input.years === 10 ? 10 : 5;

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        propertySize: true,
        yearBuilt: true,
      },
    });

    if (!property) {
      throw new Error('Property not found');
    }

    // Persisted overrides (Option B)
    const persistedOverrides = await readToolOverrides(propertyId);

    // Mortgage snapshot (Option B)
    const mortgageSnap = await readMortgageSnapshot(propertyId);

    // Merge overrides:
    // - explicit request input wins
    // - else persisted override
    // - else default
    const homeValueNow =
      safeNum(input.homeValueNow) ??
      safeNum(persistedOverrides.homeValueNow) ??
      600000;

    const appreciationRate =
      safeNum(input.appreciationRate) ??
      safeNum(persistedOverrides.appreciationRate) ??
      0.035;

    const sellingCostRate =
      safeNum(input.sellingCostRate) ??
      safeNum(persistedOverrides.sellingCostRate) ??
      0.06;

    const monthlyRentNow =
      safeNum(input.monthlyRentNow) ??
      safeNum(persistedOverrides.monthlyRentNow) ??
      this.estimateRentHeuristic({
        state: property.state || '',
        zipCode: property.zipCode || '',
        sqft: property.propertySize ?? undefined,
      });

    const rentGrowthRate =
      safeNum(input.rentGrowthRate) ??
      safeNum(persistedOverrides.rentGrowthRate) ??
      0.03;

    const vacancyRate =
      safeNum(input.vacancyRate) ??
      safeNum(persistedOverrides.vacancyRate) ??
      0.06;

    const managementRate =
      safeNum(input.managementRate) ??
      safeNum(persistedOverrides.managementRate) ??
      0.08;

    // Phase-2 mortgage fields (optional)
    const mortgageBalance =
      safeNum(input.mortgageBalance) ??
      safeNum(persistedOverrides.mortgageBalance) ??
      safeNum(mortgageSnap?.mortgageBalance);

    const interestRate =
      safeNum(input.interestRate) ??
      safeNum(persistedOverrides.interestRate) ??
      safeNum(mortgageSnap?.interestRate);

    const remainingTermMonths =
      safeNum(input.remainingTermMonths) ??
      safeNum(persistedOverrides.remainingTermMonths) ??
      safeNum(mortgageSnap?.remainingTermMonths);

    const usingMortgage =
      mortgageBalance !== undefined &&
      interestRate !== undefined &&
      remainingTermMonths !== undefined &&
      mortgageBalance > 0 &&
      remainingTermMonths > 0;

    // Existing tool services for trends/costs
    const growth = await this.costGrowth.estimate(propertyId, { years });
    const tc = await this.trueCost.estimate(propertyId);

    // total ownership costs (already includes tax/ins/maint/util)
    const totalOwnershipCosts = tc?.rollup?.total5y ?? 0;

    // appreciation gain over horizon (use growth output if available; else compound)
    const projectedSalePrice =
      growth?.history?.[growth.history.length - 1]?.homeValue ??
      homeValueNow * Math.pow(1 + appreciationRate, years);

    const appreciationGain =
      projectedSalePrice - homeValueNow;

    // Mortgage amortization impacts
    let mortgage = null as null | {
      paymentMonthly: number;
      interestTotal: number;
      principalTotal: number;
      balanceEnd: number;
      notes: string[];
    };

    let interestTotal = 0;
    let principalTotal = 0;
    let balanceEnd = mortgageBalance ?? 0;

    if (usingMortgage) {
      const sim = amortize({
        balance: mortgageBalance!,
        annualRate: interestRate!,
        termMonths: remainingTermMonths!,
        years,
      });
      interestTotal = sim.interestTotal;
      principalTotal = sim.principalTotal;
      balanceEnd = sim.balanceEnd;

      mortgage = {
        paymentMonthly: sim.payment,
        interestTotal,
        principalTotal,
        balanceEnd,
        notes: [
          'Mortgage modeled with fixed-rate amortization (Phase 2).',
          'Interest counts as cost; principal increases equity (not treated as expense).',
        ],
      };
    }

    // SELL scenario (Phase 2 subtract remaining balance at sale time)
    const sellingCosts = projectedSalePrice * sellingCostRate;
    const netProceedsBeforeDebt = projectedSalePrice - sellingCosts;
    const netProceeds = netProceedsBeforeDebt - (usingMortgage ? balanceEnd : 0);

    // HOLD: costs + (interest if mortgage) against appreciation
    const holdCosts = totalOwnershipCosts + (usingMortgage ? interestTotal : 0);
    const holdNet = appreciationGain - holdCosts;

    // RENT: rental income minus overhead minus ownership costs minus interest, plus appreciation
    const totalRentalIncome = this.projectRentTotal({
      monthlyRentNow,
      rentGrowthRate,
      years,
    });

    const vacancyLoss = totalRentalIncome * vacancyRate;
    const managementFees = totalRentalIncome * managementRate;
    const rentalOverheads = vacancyLoss + managementFees;

    const rentCosts = totalOwnershipCosts + rentalOverheads + (usingMortgage ? interestTotal : 0);
    const rentNet = (totalRentalIncome - rentalOverheads - (totalOwnershipCosts + (usingMortgage ? interestTotal : 0))) + appreciationGain;

    // Equity signals
    const equityNow = usingMortgage ? (homeValueNow - mortgageBalance!) : homeValueNow;
    const equityEndHold = usingMortgage ? (projectedSalePrice - balanceEnd) : projectedSalePrice;
    const equityGrowth = equityEndHold - equityNow;

    // Winner scoring (Phase 2: blended)
    const cashflowStability = usingMortgage ? 0.6 : 0.7; // placeholder signal (keep calm)
    const decisionScore = {
      SELL: netProceeds * 0.6 + equityGrowth * 0.25 + (cashflowStability * 0.15 * 1000),
      HOLD: holdNet * 0.6 + equityGrowth * 0.25 + (cashflowStability * 0.15 * 1000),
      RENT: rentNet * 0.6 + equityGrowth * 0.25 + (cashflowStability * 0.15 * 1000),
    };

    const winner =
      decisionScore.SELL >= decisionScore.HOLD && decisionScore.SELL >= decisionScore.RENT
        ? 'SELL'
        : decisionScore.RENT >= decisionScore.HOLD
          ? 'RENT'
          : 'HOLD';

    const usedOverrides =
      Object.keys(persistedOverrides || {}).length > 0 ||
      Object.keys(input || {}).some((k) => (input as any)[k] !== undefined);

    const confidence = confidenceFromCompleteness({
      hasTrueCost: !!tc,
      hasGrowth: !!growth,
      usedMortgage: usingMortgage,
      mortgageComplete: usingMortgage,
      usedOverrides,
    });

    // Build Phase-1 compatible history shape:
    // - Keep same keys used by your existing UI chart
    const history = (growth?.history ?? []).map((h: any, idx: number) => {
      // ownership cost per year from true-cost history if present
      const tcYear = (tc?.history ?? [])[idx];
      const ownershipCostsYear = tcYear?.annualTotal ?? 0;

      // allocate mortgage interest by year if mortgage is used
      let interestYear = 0;
      let principalYear = 0;
      if (usingMortgage && mortgage) {
        const yr = idx + 1;
        const sim = amortize({
          balance: mortgageBalance!,
          annualRate: interestRate!,
          termMonths: remainingTermMonths!,
          years,
        });
        const row = sim.yearly.find((r) => r.yearIndex === yr);
        interestYear = row?.interestPaid ?? 0;
        principalYear = row?.principalPaid ?? 0;
      }

      // keep the UI-friendly “delta” semantics (annual net delta)
      const holdNetDelta = -(ownershipCostsYear + interestYear); // appreciation shown via growth in winner story
      const rentNetDelta =
        this.projectRentYearly({ monthlyRentNow, rentGrowthRate, yearIndex: idx + 1 }) -
        (ownershipCostsYear + interestYear) -
        (this.projectRentYearly({ monthlyRentNow, rentGrowthRate, yearIndex: idx + 1 }) * (vacancyRate + managementRate));

      return {
        year: h.year,
        homeValue: h.homeValue,
        ownershipCosts: ownershipCostsYear + interestYear,
        holdNetDelta,
        rentNetDelta,
        // optional Phase-2 info (ignored by Phase-1 UI)
        mortgageInterest: interestYear,
        mortgagePrincipal: principalYear,
      };
    });

    const addressLabel =
      [property.address, property.city, property.state, property.zipCode].filter(Boolean).join(', ');

    return {
      input: {
        propertyId,
        years,
        addressLabel: addressLabel || '—',
        state: property.state || '',
        zipCode: property.zipCode || '',
        overrides: {
          ...persistedOverrides,
          ...Object.fromEntries(Object.entries(input).filter(([_, v]) => v !== undefined)),
        },
      },

      current: {
        homeValueNow,
        appreciationRate,
        monthlyRentNow,
        sellingCostRate,
      },

      scenarios: {
        sell: {
          projectedSalePrice,
          sellingCosts,
          netProceeds,
          notes: [
            `Projected sale price assumes ${(appreciationRate * 100).toFixed(1)}%/yr appreciation.`,
            `Selling costs assume ${(sellingCostRate * 100).toFixed(1)}% (agent + closing + fees).`,
            ...(usingMortgage ? [`Mortgage payoff subtracted (ending balance ≈ $${Math.round(balanceEnd).toLocaleString()}).`] : []),
          ],
        },

        hold: {
          totalOwnershipCosts: holdCosts,
          appreciationGain,
          net: holdNet,
          notes: [
            'Ownership costs use True Cost components (tax + insurance + maintenance + utilities).',
            ...(usingMortgage ? ['Mortgage interest included in costs; principal treated as equity transfer.'] : []),
          ],
        },

        rent: {
          totalRentalIncome,
          rentalOverheads: {
            vacancyLoss,
            managementFees,
          },
          totalOwnershipCosts: holdCosts, // includes interest if used
          appreciationGain,
          net: rentNet,
          notes: [
            'Rent modeled with simple growth and overhead assumptions.',
            `Vacancy ${(vacancyRate * 100).toFixed(1)}% • management ${(managementRate * 100).toFixed(1)}% • rent growth ${(rentGrowthRate * 100).toFixed(1)}%/yr.`,
            ...(usingMortgage ? ['Mortgage interest included; principal increases equity (Phase 2).'] : ['Mortgage ignored (no mortgage snapshot/override provided).']),
          ],
        },
      },

      history,

      recommendation: {
        winner,
        rationale: this.buildRationale({
          winner,
          netProceeds,
          holdNet,
          rentNet,
          usingMortgage,
        }),
        confidence,
      },

      drivers: this.buildDrivers({
        propertyState: property.state || '',
        zip: property.zipCode || '',
        appreciationRate,
        vacancyRate,
        managementRate,
        sellingCostRate,
        confidence,
        usingMortgage,
      }),

      // ✅ Phase-2 additions (backward compatible — UI can ignore)
      mortgage: mortgage
        ? {
            balanceNow: mortgageBalance!,
            interestRate: interestRate!,
            remainingTermMonths: remainingTermMonths!,
            paymentMonthly: mortgage.paymentMonthly,
            interestTotal: mortgage.interestTotal,
            principalTotal: mortgage.principalTotal,
            balanceEnd: mortgage.balanceEnd,
            notes: mortgage.notes,
          }
        : null,

      equity: {
        equityNow,
        equityEnd: equityEndHold,
        equityGrowth,
        notes: usingMortgage
          ? ['Equity = home value − mortgage balance.', 'Principal payments increase equity; interest is a cost.']
          : ['No mortgage modeled; equity equals home value.'],
      },

      decisionQuality: {
        annualized: {
          sell: netProceeds / years,
          hold: holdNet / years,
          rent: rentNet / years,
        },
        cashflowStability: usingMortgage ? 'MEDIUM' : 'HIGH',
      },

      meta: {
        generatedAt: nowIso(),
        dataSources: [
          'HomeCostGrowthService',
          'TrueCostOwnershipService',
          ...(usingMortgage ? ['PropertyFinanceSnapshot / ToolOverride (Phase 2 mortgage)'] : ['Rent heuristic model']),
        ],
        notes: [
          ...(usingMortgage ? [] : ['Add mortgage snapshot or override values to enable Phase 2 debt-aware modeling.']),
          'Overrides are persisted per property (ToolOverride) when you add UI later.',
        ],
        confidence,
      },
    };
  }

  private estimateRentHeuristic(args: { state: string; zipCode: string; sqft?: number }) {
    const sqft = args.sqft ?? 1600;
    const basePerSqftByState: Record<string, number> = {
      NJ: 3.0,
      NY: 3.6,
      CA: 3.3,
      TX: 1.8,
      FL: 2.3,
    };

    const per = basePerSqftByState[args.state] ?? 2.2;
    const est = sqft * per;

    // mild ZIP prefix adjustment (messaging-level heuristic)
    const zipPrefix = (args.zipCode || '').slice(0, 3);
    const bump = zipPrefix ? 1.0 : 1.0;

    return Math.round(est * bump);
  }

  private projectRentTotal(args: { monthlyRentNow: number; rentGrowthRate: number; years: Years }) {
    const { monthlyRentNow, rentGrowthRate, years } = args;
    let total = 0;
    for (let y = 1; y <= years; y++) {
      const yearRent = monthlyRentNow * 12 * Math.pow(1 + rentGrowthRate, y - 1);
      total += yearRent;
    }
    return total;
  }

  private projectRentYearly(args: { monthlyRentNow: number; rentGrowthRate: number; yearIndex: number }) {
    const { monthlyRentNow, rentGrowthRate, yearIndex } = args;
    return monthlyRentNow * 12 * Math.pow(1 + rentGrowthRate, Math.max(0, yearIndex - 1));
  }

  private buildRationale(args: {
    winner: 'SELL' | 'HOLD' | 'RENT';
    netProceeds: number;
    holdNet: number;
    rentNet: number;
    usingMortgage: boolean;
  }) {
    const r: string[] = [];
    if (args.winner === 'SELL') {
      r.push('Selling provides the strongest liquidity outcome under current assumptions.');
      if (args.usingMortgage) r.push('Mortgage payoff was included in net proceeds (Phase 2).');
    } else if (args.winner === 'RENT') {
      r.push('Renting wins due to modeled rental income outweighing costs and overhead.');
      if (args.usingMortgage) r.push('Mortgage interest was included; principal treated as equity transfer (Phase 2).');
    } else {
      r.push('Holding wins when appreciation dominates ownership costs over the horizon.');
      if (args.usingMortgage) r.push('Equity growth benefits from principal paydown (Phase 2).');
    }
    return r;
  }

  private buildDrivers(args: {
    propertyState: string;
    zip: string;
    appreciationRate: number;
    vacancyRate: number;
    managementRate: number;
    sellingCostRate: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    usingMortgage: boolean;
  }) {
    return [
      {
        factor: `Appreciation sensitivity (${args.propertyState}, ZIP ${String(args.zip).slice(0, 3)}*)`,
        impact: 'MEDIUM',
        explanation: `Appreciation modeled at ${(args.appreciationRate * 100).toFixed(1)}%/yr. Higher appreciation favors HOLD/RENT.`,
      },
      {
        factor: 'Rental overhead friction',
        impact: 'MEDIUM',
        explanation: `Vacancy ${(args.vacancyRate * 100).toFixed(1)}% + management ${(args.managementRate * 100).toFixed(1)}% reduce rental income.`,
      },
      {
        factor: 'Selling costs friction',
        impact: 'MEDIUM',
        explanation: `Selling costs modeled at ${(args.sellingCostRate * 100).toFixed(1)}%. Higher costs reduce SELL net.`,
      },
      ...(args.usingMortgage
        ? [
            {
              factor: 'Mortgage structure',
              impact: 'HIGH',
              explanation: 'Interest is treated as cost; principal paydown increases equity (Phase 2).',
            },
          ]
        : [
            {
              factor: 'Debt unknown',
              impact: 'MEDIUM',
              explanation: 'No mortgage snapshot/override provided; mortgage effects are not modeled.',
            },
          ]),
      {
        factor: 'Confidence & data completeness',
        impact: 'MEDIUM',
        explanation: `Confidence is ${args.confidence}. Add/verify mortgage + override inputs to increase signal.`,
      },
    ] as any;
  }
}
