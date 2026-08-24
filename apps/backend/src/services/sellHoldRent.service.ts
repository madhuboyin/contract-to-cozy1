// apps/backend/src/services/sellHoldRent.service.ts
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

import { listToolOverrides } from './toolOverride.service';
import { getCanonicalMortgage } from './canonicalFinanceAdapter.service';
import {
  FinancialAssumptionService,
  FinancialAssumptions,
  hasFinancialAssumptionInput,
} from './financialAssumption.service';

import { amortizeYears, computeMonthlyPayment } from '../services/tools/mortgageMath';
import { projectValueAtYear } from './tools/financialProjectionMath';
import {
  ownershipCostConsumerProjectionService,
  type OwnershipCostConsumerProjection,
} from './ownershipCosts/ownershipCostConsumerProjection.service';

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type Impact = 'LOW' | 'MEDIUM' | 'HIGH';

export type SellHoldRentInput = {
  years?: 5 | 10;
  assumptionSetId?: string;

  // Overrides (request)
  homeValueNow?: number;
  appreciationRate?: number;     // decimal
  sellingCostRate?: number;      // decimal
  inflationRate?: number;        // decimal
  interestRate?: number;         // decimal
  propertyTaxGrowthRate?: number;// decimal
  insuranceGrowthRate?: number;  // decimal
  maintenanceGrowthRate?: number;// decimal

  // Rent modeling
  monthlyRentNow?: number;
  rentGrowthRate?: number;       // decimal
  vacancyRate?: number;          // decimal
  managementRate?: number;       // decimal

  // Debt overrides (optional; normally sourced from PropertyFinancingProfile)
  mortgageBalance?: number;
  mortgageAnnualRate?: number;   // decimal
  remainingTermMonths?: number;
  monthlyPayment?: number;
};

export type SellHoldRentDTO = {
  assumptionSetId?: string | null;
  preferenceProfileId?: string | null;
  sharedSignalsUsed?: string[];
  financialAssumptions?: FinancialAssumptions;
  ownershipCostContext: {
    contractVersion: string;
    lens: 'OPERATING_EXPENSE';
    snapshotId: string;
    definitionVersion: string;
    methodVersion: string;
    categoryDefinitionVersion: string;
    forecastId: string | null;
    forecastMethodVersion: string;
    calculationFingerprint: string;
  };

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
      totalOwnershipCosts: number;     // canonical operating expense + interest, if debt is known
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
      totalOwnershipCosts: number;     // canonical operating expense + interest, if debt is known
      appreciationGain: number;
      principalPaydown: number;
      net: number;                     // rentalCash + appreciation + principalPaydown - costs
      notes: string[];
    };
  };

  projection: Array<{
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

function ownershipCostContext(
  projection: OwnershipCostConsumerProjection,
): SellHoldRentDTO['ownershipCostContext'] {
  return {
    contractVersion: projection.contractVersion,
    lens: 'OPERATING_EXPENSE',
    snapshotId: projection.snapshot.id,
    definitionVersion: projection.snapshot.definitionVersion,
    methodVersion: projection.snapshot.methodVersion,
    categoryDefinitionVersion: projection.snapshot.categoryDefinitionVersion,
    forecastId: projection.forecast.id,
    forecastMethodVersion: projection.forecast.methodVersion,
    calculationFingerprint: projection.forecast.calculationFingerprint,
  };
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
          ? 'Mortgage interest + principal paydown are modeled from the financing profile or explicit overrides.'
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
    private financialAssumptionService = new FinancialAssumptionService()
  ) {}

  async estimate(
    propertyId: string,
    input: SellHoldRentInput = {},
    userId?: string
  ): Promise<SellHoldRentDTO> {
    if (!userId) throw new Error('Authentication is required for Sell / Hold / Rent.');
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        homeownerProfileId: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        propertySize: true,
        yearBuilt: true,
        financingProfile: {
          select: { purchasePriceCents: true },
        },
      },
    });
    if (!property) throw new Error('Property not found');

    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const years: 5 | 10 = input.years === 10 ? 10 : 5;

    // Home Intelligence Functional Completeness FRD Phase 3 review finding
    // 4, delivery step 7: only the canonical (no request-time scenario
    // override) evaluation is the property's authoritative recommendation
    // worth persisting for a Home Action / Decision Thread to reference. A
    // "what if I raise the rent" scenario run must never overwrite it.
    const isCanonicalRequest = (Object.keys(input) as Array<keyof SellHoldRentInput>)
      .every((key) => key === 'years' || input[key] === undefined);

    // --- Phase 3 persisted overrides ---
    const toolOv = await loadToolOverrideMap(propertyId);

    const ownershipCostProjection =
      await ownershipCostConsumerProjectionService.getProjection({
        propertyId,
        userId,
        lens: 'OPERATING_EXPENSE',
        horizonYears: years,
      });
    const modeledAppreciation = 0.035;
    const modeledHomeValue =
      property.financingProfile?.purchasePriceCents != null
        ? property.financingProfile.purchasePriceCents / 100
        : 350_000;

    const homeValueNow = pickOverride(input.homeValueNow, toolOv['homeValueNow'], modeledHomeValue);

    // Rent: request > tool override > heuristic (state + sqft)
    const ppsfRentByState: Record<string, number> = {
      NJ: 2.2, NY: 2.4, CA: 2.7, TX: 1.4, FL: 1.7, WA: 1.9, MA: 2.3, CO: 1.8, AZ: 1.6,
    };
    const sqft = property.propertySize && property.propertySize > 200 ? property.propertySize : undefined;
    const heuristicRent =
      sqft ? (ppsfRentByState[state] ?? 1.6) * sqft : 2400;

    const monthlyRentNow = pickOverride(input.monthlyRentNow, toolOv['monthlyRentNow'], heuristicRent);
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

    const sharedFinancialOverrides = {
      appreciationRate: input.appreciationRate,
      inflationRate: input.inflationRate,
      rentGrowthRate: input.rentGrowthRate,
      interestRate: input.interestRate,
      propertyTaxGrowthRate: input.propertyTaxGrowthRate,
      insuranceGrowthRate: input.insuranceGrowthRate,
      maintenanceGrowthRate: input.maintenanceGrowthRate,
      sellingCostPercent: input.sellingCostRate,
    };

    const hasFinancialOverrideInput = hasFinancialAssumptionInput(sharedFinancialOverrides);
    const financialContext = await this.financialAssumptionService.resolveForTool({
      propertyId,
      toolKey: TOOL_KEY,
      assumptionSetId: input.assumptionSetId,
      requestOverrides: sharedFinancialOverrides,
      canonicalDefaults: {
        appreciationRate: modeledAppreciation,
        inflationRate: ['CA', 'FL', 'TX'].includes(state) ? 0.045 : 0.035,
        rentGrowthRate: 0.03,
        propertyTaxGrowthRate: ['CA', 'TX', 'NJ', 'IL'].includes(state) ? 0.04 : 0.032,
        insuranceGrowthRate: ['FL', 'LA', 'TX', 'CA'].includes(state) ? 0.06 : 0.045,
        maintenanceGrowthRate: 0.04,
        sellingCostPercent: 0.06,
      },
      legacyFallbacks: {
        appreciationRate: toolOv['appreciationRate'],
        inflationRate: toolOv['inflationRate'],
        rentGrowthRate: toolOv['rentGrowthRate'],
        interestRate: toolOv['mortgageAnnualRate'],
        propertyTaxGrowthRate: toolOv['propertyTaxGrowthRate'],
        insuranceGrowthRate: toolOv['insuranceGrowthRate'],
        maintenanceGrowthRate: toolOv['maintenanceGrowthRate'],
        sellingCostPercent: toolOv['sellingCostRate'],
      },
      createdByUserId: userId ?? null,
    });

    const appreciationRate = clamp(financialContext.assumptions.appreciationRate, 0, 0.15);
    const sellingCostRate = clamp(financialContext.assumptions.sellingCostPercent, 0.01, 0.12);
    const rentGrowthRate = clamp(financialContext.assumptions.rentGrowthRate, 0, 0.1);
    const ownershipCosts = ownershipCostProjection.forwardAnnualDollars
      .reduce((total, period) => total + period.base, 0);

    // --- Debt aware (Phase 3) ---
    const snap = await getCanonicalMortgage(propertyId);

    // allow request/tool overrides to override snapshot
    const mortgageBalanceNow =
      input.mortgageBalance ?? toolOv['mortgageBalance'] ?? snap?.mortgageBalance ?? null;
    const mortgageAnnualRate =
      input.mortgageAnnualRate ??
      financialContext.assumptions.interestRate ??
      snap?.interestRate ??
      toolOv['mortgageAnnualRate'] ??
      null;
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
    const projectedSalePrice = projectValueAtYear(homeValueNow, appreciationRate, years);
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
    else sellNotes.push('Mortgage not modeled (no financing profile or override).');

    const holdNotes: string[] = [
      'Ownership costs use the versioned Ownership Cost Intelligence operating-expense lens.',
    ];
    holdNotes.push(
      `Snapshot ${ownershipCostProjection.snapshot.id} and forecast ${ownershipCostProjection.forecast.id ?? ownershipCostProjection.forecast.calculationFingerprint} are retained with this decision.`,
    );
    if (debtMode === 'ON') holdNotes.push('Mortgage interest is treated as a cost; principal paydown increases equity.');
    else holdNotes.push('Mortgage not modeled (no financing profile or override).');

    const rentNotes: string[] = [
      'Rent modeled with simple growth + overhead assumptions.',
      `Vacancy ${(vacancyRate * 100).toFixed(1)}% • management ${(managementRate * 100).toFixed(1)}% • rent growth ${(rentGrowthRate * 100).toFixed(1)}%/yr.`,
    ];
    if (!input.monthlyRentNow && toolOv['monthlyRentNow'] === undefined) {
      rentNotes.push(`Rent estimated using $/sqft heuristic for ${state} (Phase 3 baseline). Override monthly rent for accuracy.`);
    }
    if (debtMode === 'ON') rentNotes.push('Mortgage interest is treated as a cost; principal paydown increases equity.');
    else rentNotes.push('Mortgage not modeled (no financing profile or override).');

    const projection: SellHoldRentDTO['projection'] = [];
    for (let t = 0; t < years; t += 1) {
      const costPeriod = ownershipCostProjection.forwardAnnualDollars[t];
      if (!costPeriod) break;
      const year = costPeriod.year;
      const hv = homeValueNow * Math.pow(1 + appreciationRate, t + 1);
      const annualCosts = costPeriod.base;

      // show “net delta” as: appreciation for that year minus costs (and minus interest if debt ON)
      const annualAppGain = hv * appreciationRate;
      const annualInterest = debtMode === 'ON' ? (debt.interestPaid / Math.max(1, years)) : 0;

      // rent delta adds net rent - overheads (simplified annualized)
      const annualRent = monthlyRentNow * 12 * Math.pow(1 + rentGrowthRate, t);
      const annualVac = annualRent * vacancyRate;
      const annualMgmt = annualRent * managementRate;
      const rentDelta = (annualRent - annualVac - annualMgmt) + annualAppGain - annualCosts - annualInterest;

      projection.push({
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
      'Ownership Cost Intelligence versioned operating-expense snapshot and forecast',
      'ToolOverride (persisted per-property overrides)',
      'AssumptionSet + PreferenceProfile (shared financial assumptions)',
    ];
    if (financialContext.sharedSignalsUsed.length > 0) {
      dataSources.push('SignalService (shared financial signal context)');
    }
    if (debtMode === 'ON') dataSources.push('PropertyFinancingProfile + mortgageMath (debt modeling)');

    const dto: SellHoldRentDTO = {
      ownershipCostContext: ownershipCostContext(ownershipCostProjection),
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
          years,
          homeValueNow: input.homeValueNow,
          appreciationRate: input.appreciationRate,
          sellingCostRate: input.sellingCostRate,
          inflationRate: input.inflationRate,
          interestRate: input.interestRate,
          propertyTaxGrowthRate: input.propertyTaxGrowthRate,
          insuranceGrowthRate: input.insuranceGrowthRate,
          maintenanceGrowthRate: input.maintenanceGrowthRate,
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

      projection,

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
          hasFinancialOverrideInput
            ? 'Financial overrides were persisted to a new AssumptionSet for cross-tool scenario continuity.'
            : 'No new financial overrides were submitted; existing shared defaults were reused.',
          financialContext.savingsRealizationAnnual !== null && financialContext.savingsRealizationAnnual > 0
            ? `Savings realization signal available (~$${Math.round(financialContext.savingsRealizationAnnual).toLocaleString()}/yr).`
            : 'No fresh savings realization signal was available.',
          debtMode === 'ON'
            ? 'Debt-aware modeling is ON (snapshot/overrides present).'
            : 'Debt-aware modeling is OFF (no snapshot/overrides).',
          `The ${years}-year ownership-cost total comes directly from the canonical forecast without a downstream extension.`,
        ],
        confidence,
      },
    };

    if (isCanonicalRequest) {
      // Best-effort: persistence must never break the live estimate
      // response the homeowner is waiting on.
      try {
        await prisma.sellHoldRentAnalysis.create({
          data: {
            homeownerProfileId: property.homeownerProfileId,
            propertyId,
            years,
            winner: dto.recommendation.winner,
            confidence: dto.recommendation.confidence,
            homeValueNowCents: Math.round(dto.current.homeValueNow * 100),
            netSellCents: Math.round(dto.scenarios.sell.netProceeds * 100),
            netHoldCents: Math.round(dto.scenarios.hold.net * 100),
            netRentCents: Math.round(dto.scenarios.rent.net * 100),
            rationale: dto.recommendation.rationale,
            drivers: dto.drivers,
          },
        });
      } catch (err) {
        logger.warn({ err, propertyId }, 'Failed to persist SellHoldRentAnalysis; the live estimate is unaffected');
      }
    }

    return dto;
  }
}

// ✅ Backward-safe: allow either import style.
// Named import:  import { SellHoldRentService } from ...
// Default import: import SellHoldRentService from ...
export default SellHoldRentService;
