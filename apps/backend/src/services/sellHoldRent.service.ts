// apps/backend/src/services/sellHoldRent.service.ts
import { prisma } from '../lib/prisma';

import { HomeCostGrowthService } from './homeCostGrowth.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';
import { listToolOverrides } from './toolOverride.service';
import { getFinanceSnapshot } from './propertyFinanceSnapshot.service';

import { amortizeYears, computeMonthlyPayment } from '../services/tools/mortgageMath';

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type Impact = 'LOW' | 'MEDIUM' | 'HIGH';

export type SellHoldRentInput = {
  years?: 5 | 10;

  // Overrides (request)
  homeValueNow?: number;
  appreciationRate?: number;     // decimal
  sellingCostRate?: number;      // decimal

  // Rent modeling
  monthlyRentNow?: number;
  rentGrowthRate?: number;       // decimal
  vacancyRate?: number;          // decimal
  managementRate?: number;       // decimal

  // Debt overrides (optional; normally sourced from propertyFinanceSnapshot)
  mortgageBalance?: number;
  mortgageAnnualRate?: number;   // decimal
  remainingTermMonths?: number;
  monthlyPayment?: number;
};

export type SellHoldRentDTO = {
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
    monthlyRentNow: number;
    sellingCostRate: number;
    // debt (for transparency)
    mortgageBalanceNow?: number | null;
    mortgageAnnualRate?: number | null;
    remainingTermMonths?: number | null;
    monthlyPayment?: number | null;
  };

  scenarios: {
    sell: {
      projectedSalePrice: number;
      sellingCosts: number;
      netProceeds: number;             // equity proceeds after payoff if debt known; otherwise net proceeds before debt
      notes: string[];
    };
    hold: {
      totalOwnershipCosts: number;     // true-cost + (interest, if debt known)
      appreciationGain: number;
      principalPaydown: number;        // 0 if no debt
      net: number;                     // appreciation + principalPaydown - costs
      notes: string[];
    };
    rent: {
      totalRentalIncome: number;
      rentalOverheads: {
        vacancyLoss: number;
        managementFees: number;
      };
      totalOwnershipCosts: number;     // true-cost + (interest, if debt known)
      appreciationGain: number;
      principalPaydown: number;
      net: number;                     // rentalCash + appreciation + principalPaydown - costs
      notes: string[];
    };
  };

  history: Array<{
    year: number;
    homeValue: number;
    ownershipCosts: number;
    holdNetDelta: number;
    rentNetDelta: number;
  }>;

  recommendation: {
    winner: 'SELL' | 'HOLD' | 'RENT';
    rationale: string[];
    confidence: Confidence;
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

const TOOL_KEY = 'SELL_HOLD_RENT';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}
function zipPrefix(zip: string) {
  const z = String(zip || '').replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : z;
}

/**
 * Phase 3: Use ToolOverride rows as persisted defaults for this tool.
 */
async function loadToolOverrideMap(propertyId: string): Promise<Record<string, number>> {
  const rows = await listToolOverrides(propertyId, TOOL_KEY);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function pickOverride(
  reqVal: number | undefined,
  toolVal: number | undefined,
  fallback: number
) {
  if (reqVal !== undefined && Number.isFinite(reqVal)) return reqVal;
  if (toolVal !== undefined && Number.isFinite(toolVal)) return toolVal;
  return fallback;
}

function buildDrivers(args: {
  appreciationRate: number;
  vacancyRate: number;
  managementRate: number;
  sellingCostRate: number;
  rentGrowthRate: number;
  debtMode: 'ON' | 'OFF';
  confidence: Confidence;
  state: string;
  zipCode: string;
}) {
  const z3 = zipPrefix(args.zipCode);
  const drivers: SellHoldRentDTO['drivers'] = [
    {
      factor: `Appreciation sensitivity (${args.state}, ZIP ${z3}*)`,
      impact: args.appreciationRate >= 0.04 ? 'HIGH' : args.appreciationRate >= 0.025 ? 'MEDIUM' : 'LOW',
      explanation: `Appreciation modeled at ${(args.appreciationRate * 100).toFixed(1)}%/yr. Higher appreciation favors HOLD/RENT outcomes.`,
    },
    {
      factor: 'Rental overhead friction',
      impact: (args.vacancyRate + args.managementRate) >= 0.16 ? 'HIGH' : (args.vacancyRate + args.managementRate) >= 0.12 ? 'MEDIUM' : 'LOW',
      explanation: `Vacancy ${(args.vacancyRate * 100).toFixed(1)}% + management ${(args.managementRate * 100).toFixed(1)}% reduce rental income.`,
    },
    {
      factor: 'Selling costs friction',
      impact: args.sellingCostRate >= 0.07 ? 'HIGH' : args.sellingCostRate >= 0.055 ? 'MEDIUM' : 'LOW',
      explanation: `Selling costs modeled at ${(args.sellingCostRate * 100).toFixed(1)}% (agent + closing + fees).`,
    },
    {
      factor: args.debtMode === 'ON' ? 'Debt-aware modeling' : 'Debt unknown',
      impact: 'MEDIUM',
      explanation:
        args.debtMode === 'ON'
          ? 'Mortgage interest + principal paydown are modeled from the finance snapshot/overrides.'
          : 'No mortgage snapshot/override provided; mortgage effects are not modeled.',
    },
    {
      factor: 'Confidence & data completeness',
      impact: args.confidence,
      explanation:
        args.confidence === 'HIGH'
          ? 'Inputs are override/snapshot-backed.'
          : args.confidence === 'MEDIUM'
          ? 'Mix of modeled estimates + partial overrides.'
          : 'Mostly heuristic estimates; add overrides for stronger signal.',
    },
  ];
  return drivers;
}

export class SellHoldRentService {
  constructor(
    private costGrowth = new HomeCostGrowthService(),
    private trueCost = new TrueCostOwnershipService()
  ) {}

  async estimate(propertyId: string, input: SellHoldRentInput = {}): Promise<SellHoldRentDTO> {
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
    if (!property) throw new Error('Property not found');

    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const years: 5 | 10 = input.years === 10 ? 10 : 5;

    // --- Phase 3 persisted overrides ---
    const toolOv = await loadToolOverrideMap(propertyId);

    // --- Cost growth tool gives appreciation rate + value trajectory ---
    const cg = await this.costGrowth.estimate(propertyId, { years: years as any } as any);

    const modeledAppreciation =
      (cg as any)?.current?.appreciationRate ??
      (cg as any)?.current?.annualAppreciationRate ??
      0.035;

    // defaults aligned to Phase1/2 assumptions
    const appreciationRate = clamp(
      pickOverride(input.appreciationRate, toolOv['appreciationRate'], modeledAppreciation),
      0,
      0.15
    );

    const sellingCostRate = clamp(
      pickOverride(input.sellingCostRate, toolOv['sellingCostRate'], 0.06),
      0.01,
      0.12
    );

    // home value: request override > tool override > costGrowth current > heuristic fallback
    const modeledHomeValue =
      (cg as any)?.current?.homeValueNow ??
      (cg as any)?.current?.homeValue ??
      (cg as any)?.current?.valueNow ??
      350000;

    const homeValueNow = pickOverride(input.homeValueNow, toolOv['homeValueNow'], modeledHomeValue);

    // Rent: request > tool override > heuristic (state + sqft)
    const ppsfRentByState: Record<string, number> = {
      NJ: 2.2, NY: 2.4, CA: 2.7, TX: 1.4, FL: 1.7, WA: 1.9, MA: 2.3, CO: 1.8, AZ: 1.6,
    };
    const sqft = property.propertySize && property.propertySize > 200 ? property.propertySize : undefined;
    const heuristicRent =
      sqft ? (ppsfRentByState[state] ?? 1.6) * sqft : 2400;

    const monthlyRentNow = pickOverride(input.monthlyRentNow, toolOv['monthlyRentNow'], heuristicRent);

    const rentGrowthRate = clamp(
      pickOverride(input.rentGrowthRate, toolOv['rentGrowthRate'], 0.03),
      0,
      0.10
    );
    const vacancyRate = clamp(
      pickOverride(input.vacancyRate, toolOv['vacancyRate'], 0.06),
      0,
      0.25
    );
    const managementRate = clamp(
      pickOverride(input.managementRate, toolOv['managementRate'], 0.08),
      0,
      0.20
    );

    // --- Ownership costs from TrueCost tool (5y fixed), extend to 10y with a light drift assumption ---
    const tc = await this.trueCost.estimate(propertyId, {
      homeValueNow,
      // allow overrides later via ToolOverride keys if you add UI:
      insuranceAnnualNow: toolOv['insuranceAnnualNow'],
      maintenanceAnnualNow: toolOv['maintenanceAnnualNow'],
      utilitiesAnnualNow: toolOv['utilitiesAnnualNow'],
      inflationRate: toolOv['inflationRate'],
    } as any);

    const annualTotalNow = (tc as any)?.current?.annualTotalNow ?? 0;
    const total5y = (tc as any)?.rollup?.total5y ?? 0;

    const inflationRate =
      toolOv['inflationRate'] !== undefined
        ? clamp(toolOv['inflationRate'], 0, 0.12)
        : (['CA', 'FL', 'TX'].includes(state) ? 0.045 : 0.035);

    const ownershipCosts =
      years === 5
        ? total5y
        : (() => {
            // extend years 6..10 using drift on current annual baseline
            // keeps behavior deterministic + cheap (<200ms)
            let s = total5y;
            let base = annualTotalNow;
            for (let i = 6; i <= 10; i++) {
              base = base * (1 + inflationRate);
              s += base;
            }
            return s;
          })();

    // --- Debt aware (Phase 3) ---
    const snap = await getFinanceSnapshot(propertyId);

    // allow request/tool overrides to override snapshot
    const mortgageBalanceNow =
      input.mortgageBalance ?? toolOv['mortgageBalance'] ?? snap?.mortgageBalance ?? null;
    const mortgageAnnualRate =
      input.mortgageAnnualRate ?? toolOv['mortgageAnnualRate'] ?? snap?.interestRate ?? null;
    const remainingTermMonths =
      input.remainingTermMonths ?? toolOv['remainingTermMonths'] ?? snap?.remainingTermMonths ?? null;
    const monthlyPaymentOverride =
      input.monthlyPayment ?? toolOv['monthlyPayment'] ?? snap?.monthlyPayment ?? null;

    const debtMode: 'ON' | 'OFF' =
      mortgageBalanceNow && mortgageAnnualRate !== null && remainingTermMonths ? 'ON' : 'OFF';

    let debt = {
      endingBalance: 0,
      interestPaid: 0,
      principalPaid: 0,
      monthlyPayment: null as number | null,
    };

    if (debtMode === 'ON') {
      const mi = {
        balanceNow: mortgageBalanceNow!,
        annualRate: mortgageAnnualRate!,
        remainingTermMonths: remainingTermMonths!,
        monthlyPayment: monthlyPaymentOverride,
      };

      const payment = mi.monthlyPayment ?? computeMonthlyPayment(mi);
      const a = amortizeYears({ ...mi, monthlyPayment: payment }, years);
      debt = {
        endingBalance: a.endingBalance,
        interestPaid: a.interestPaid,
        principalPaid: a.principalPaid,
        monthlyPayment: a.monthlyPayment,
      };
    }

    // --- Sale price projection ---
    const projectedSalePrice = homeValueNow * Math.pow(1 + appreciationRate, years);
    const sellingCosts = projectedSalePrice * sellingCostRate;

    // net proceeds BEFORE debt payoff
    const netBeforeDebt = projectedSalePrice - sellingCosts;

    // net proceeds AFTER debt payoff if known (equity check)
    const netProceeds = debtMode === 'ON'
      ? Math.max(0, netBeforeDebt - debt.endingBalance)
      : netBeforeDebt;

    const appreciationGain = projectedSalePrice - homeValueNow;

    // HOLD: appreciation + principal paydown - (ownership costs + interest)
    const holdCosts = ownershipCosts + (debtMode === 'ON' ? debt.interestPaid : 0);
    const holdNet = (appreciationGain + (debtMode === 'ON' ? debt.principalPaid : 0)) - holdCosts;

    // RENT: rental income net of vacancy/management, then + appreciation + principal paydown - (ownership + interest)
    const totalRentalIncome = (() => {
      let total = 0;
      for (let y = 1; y <= years; y++) {
        const annualRent = monthlyRentNow * 12 * Math.pow(1 + rentGrowthRate, y - 1);
        total += annualRent;
      }
      return total;
    })();

    const vacancyLoss = totalRentalIncome * vacancyRate;
    const managementFees = totalRentalIncome * managementRate;
    const rentalOverheads = vacancyLoss + managementFees;

    const rentCosts = ownershipCosts + rentalOverheads + (debtMode === 'ON' ? debt.interestPaid : 0);

    // rental cash contribution AFTER overheads and ownership costs (exclude appreciation / principal)
    const rentalCashNet = totalRentalIncome - rentalOverheads - ownershipCosts - (debtMode === 'ON' ? debt.interestPaid : 0);

    const rentNet =
      rentalCashNet + appreciationGain + (debtMode === 'ON' ? debt.principalPaid : 0);

    // --- winner logic ---
    const candidates = [
      { k: 'SELL' as const, v: netProceeds },
      { k: 'HOLD' as const, v: holdNet },
      { k: 'RENT' as const, v: rentNet },
    ].sort((a, b) => b.v - a.v);

    const winner = candidates[0].k;

    // confidence heuristic
    let confidence: Confidence = 'LOW';
    const hasSize = !!(sqft && sqft > 200);
    const hasOverrides = Object.keys(toolOv).length > 0 || Object.values(input).some((v) => v !== undefined);
    if (debtMode === 'ON' && hasOverrides) confidence = 'HIGH';
    else if (hasOverrides || hasSize) confidence = 'MEDIUM';

    // --- Notes ---
    const sellNotes: string[] = [
      `Projected sale price assumes ${(appreciationRate * 100).toFixed(1)}%/yr appreciation.`,
      `Selling costs assume ${(sellingCostRate * 100).toFixed(1)}% (agent + closing + fees).`,
    ];
    if (debtMode === 'ON') sellNotes.push(`Mortgage payoff modeled; ending balance at sale ≈ ${roundMoney(debt.endingBalance)}.`);
    else sellNotes.push('Mortgage not modeled (no finance snapshot/override).');

    const holdNotes: string[] = [
      'Ownership costs use True Cost model components (tax + insurance + maintenance + utilities).',
    ];
    if (years === 10) holdNotes.push('Years 6–10 ownership costs extend the 5y True Cost baseline with an inflation drift assumption.');
    if (debtMode === 'ON') holdNotes.push('Mortgage interest is treated as a cost; principal paydown increases equity.');
    else holdNotes.push('Mortgage not modeled (no finance snapshot/override).');

    const rentNotes: string[] = [
      'Rent modeled with simple growth + overhead assumptions.',
      `Vacancy ${(vacancyRate * 100).toFixed(1)}% • management ${(managementRate * 100).toFixed(1)}% • rent growth ${(rentGrowthRate * 100).toFixed(1)}%/yr.`,
    ];
    if (!input.monthlyRentNow && toolOv['monthlyRentNow'] === undefined) {
      rentNotes.push(`Rent estimated using $/sqft heuristic for ${state} (Phase 3 baseline). Override monthly rent for accuracy.`);
    }
    if (debtMode === 'ON') rentNotes.push('Mortgage interest is treated as a cost; principal paydown increases equity.');
    else rentNotes.push('Mortgage not modeled (no finance snapshot/override).');

    // --- history: keep chart calm (5 points) using last 5 years ending now ---
    const nowYear = new Date().getFullYear();
    const historyYears = 5;
    const history: SellHoldRentDTO['history'] = [];
    for (let i = historyYears - 1; i >= 0; i--) {
      const year = nowYear - i;
      const t = historyYears - 1 - i; // 0..4

      const hv = homeValueNow * Math.pow(1 + appreciationRate, t - (historyYears - 1));
      const annualCosts = annualTotalNow * Math.pow(1 + inflationRate, t - (historyYears - 1));

      // show “net delta” as: appreciation for that year minus costs (and minus interest if debt ON)
      const annualAppGain = hv * appreciationRate;
      const annualInterest = debtMode === 'ON' ? (debt.interestPaid / Math.max(1, years)) : 0;

      // rent delta adds net rent - overheads (simplified annualized)
      const annualRent = monthlyRentNow * 12 * Math.pow(1 + rentGrowthRate, t - (historyYears - 1));
      const annualVac = annualRent * vacancyRate;
      const annualMgmt = annualRent * managementRate;
      const rentDelta = (annualRent - annualVac - annualMgmt) + annualAppGain - annualCosts - annualInterest;

      history.push({
        year,
        homeValue: roundMoney(hv),
        ownershipCosts: roundMoney(annualCosts),
        holdNetDelta: roundMoney(annualAppGain - annualCosts - annualInterest),
        rentNetDelta: roundMoney(rentDelta),
      });
    }

    const rationale: string[] = [];
    if (winner === 'SELL') {
      rationale.push('Selling provides the strongest liquidity outcome under current assumptions.');
      if (debtMode === 'ON') rationale.push('Mortgage payoff is included in sale proceeds (equity-based net).');
    } else if (winner === 'HOLD') {
      rationale.push('Holding wins when appreciation plus equity paydown outweigh ownership + interest costs.');
    } else {
      rationale.push('Rent wins when rental net cashflow plus equity growth outweighs costs and overhead.');
    }

    const dataSources: string[] = [
      'HomeCostGrowthService (appreciation/value trend)',
      'TrueCostOwnershipService (tax/insurance/maintenance/utilities)',
      'ToolOverride (persisted per-property overrides)',
    ];
    if (debtMode === 'ON') dataSources.push('PropertyFinanceSnapshot + mortgageMath (debt modeling)');

    return {
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          years,
          homeValueNow: input.homeValueNow,
          appreciationRate: input.appreciationRate,
          sellingCostRate: input.sellingCostRate,
          monthlyRentNow: input.monthlyRentNow,
          rentGrowthRate: input.rentGrowthRate,
          vacancyRate: input.vacancyRate,
          managementRate: input.managementRate,
          mortgageBalance: input.mortgageBalance,
          mortgageAnnualRate: input.mortgageAnnualRate,
          remainingTermMonths: input.remainingTermMonths,
          monthlyPayment: input.monthlyPayment,
        },
      },

      current: {
        homeValueNow: roundMoney(homeValueNow),
        appreciationRate,
        monthlyRentNow: roundMoney(monthlyRentNow),
        sellingCostRate,
        mortgageBalanceNow,
        mortgageAnnualRate,
        remainingTermMonths,
        monthlyPayment: debtMode === 'ON' ? roundMoney(debt.monthlyPayment || 0) : monthlyPaymentOverride,
      },

      scenarios: {
        sell: {
          projectedSalePrice: roundMoney(projectedSalePrice),
          sellingCosts: roundMoney(sellingCosts),
          netProceeds: roundMoney(netProceeds),
          notes: sellNotes,
        },
        hold: {
          totalOwnershipCosts: roundMoney(holdCosts),
          appreciationGain: roundMoney(appreciationGain),
          principalPaydown: roundMoney(debtMode === 'ON' ? debt.principalPaid : 0),
          net: roundMoney(holdNet),
          notes: holdNotes,
        },
        rent: {
          totalRentalIncome: roundMoney(totalRentalIncome),
          rentalOverheads: {
            vacancyLoss: roundMoney(vacancyLoss),
            managementFees: roundMoney(managementFees),
          },
          totalOwnershipCosts: roundMoney(rentCosts),
          appreciationGain: roundMoney(appreciationGain),
          principalPaydown: roundMoney(debtMode === 'ON' ? debt.principalPaid : 0),
          net: roundMoney(rentNet),
          notes: rentNotes,
        },
      },

      history,

      recommendation: {
        winner,
        rationale,
        confidence,
      },

      drivers: buildDrivers({
        appreciationRate,
        vacancyRate,
        managementRate,
        sellingCostRate,
        rentGrowthRate,
        debtMode,
        confidence,
        state,
        zipCode,
      }),

      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes: [
          `Tool overrides (ToolOverride) are applied automatically for ${TOOL_KEY}.`,
          debtMode === 'ON'
            ? 'Debt-aware modeling is ON (snapshot/overrides present).'
            : 'Debt-aware modeling is OFF (no snapshot/overrides).',
          years === 10
            ? '10y mode extends True Cost beyond 5y using a drift assumption; adjust via overrides for better accuracy.'
            : '5y mode uses True Cost 5y rollup directly.',
        ],
        confidence,
      },
    };
  }
}

// ✅ Backward-safe: allow either import style.
// Named import:  import { SellHoldRentService } from ...
// Default import: import SellHoldRentService from ...
export default SellHoldRentService;
