// apps/backend/src/services/sellHoldRent.service.ts
import { prisma } from '../lib/prisma';
import { HomeCostGrowthService } from './homeCostGrowth.service';
import { TrueCostOwnershipService } from './trueCostOwnership.service';

type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SellHoldRentInput = {
  years?: 5 | 10; // default 5

  // Overrides
  homeValueNow?: number;
  appreciationRate?: number; // decimal
  sellingCostRate?: number; // default 0.06

  // Rent modeling
  monthlyRentNow?: number;
  rentGrowthRate?: number; // default 0.03
  vacancyRate?: number; // default 0.06
  managementRate?: number; // default 0.08
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
  };

  scenarios: {
    sell: {
      projectedSalePrice: number;
      sellingCosts: number;
      netProceeds: number;
      notes: string[];
    };
    hold: {
      totalOwnershipCosts: number;
      appreciationGain: number;
      net: number;
      notes: string[];
    };
    rent: {
      totalRentalIncome: number;
      rentalOverheads: {
        vacancyLoss: number;
        managementFees: number;
      };
      totalOwnershipCosts: number;
      appreciationGain: number;
      net: number;
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
    impact: ImpactLevel;
    explanation: string;
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
    confidence: Confidence;
  };
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

const RENT_PER_SQFT_BY_STATE: Record<string, number> = {
  CA: 2.6,
  NY: 2.8,
  NJ: 2.4,
  WA: 2.1,
  MA: 2.4,
  CO: 2.0,
  TX: 1.45,
  FL: 1.7,
  AZ: 1.75,
  NC: 1.55,
  GA: 1.5,
  IL: 1.6,
};

function estimateMonthlyRentNow(args: {
  state: string;
  zipCode: string;
  propertySize?: number | null;
}): { monthlyRentNow: number; confidence: Confidence; notes: string[] } {
  const notes: string[] = [];
  const state = (args.state || '').toUpperCase();
  const sqft = args.propertySize ?? null;

  const basePerSqft = RENT_PER_SQFT_BY_STATE[state] ?? 1.6;

  // Light ZIP prefix “volatility / desirability” knob (Phase 1 messaging only).
  const zp = String(args.zipCode || '').replace(/\D/g, '').slice(0, 3);
  const zipAdj =
    ['941', '940', '100', '021', '900', '902'].includes(zp) ? 1.18 :
    ['787', '750', '981', '303', '282'].includes(zp) ? 1.08 :
    1.0;

  if (sqft && Number.isFinite(sqft) && sqft > 250) {
    const est = sqft * basePerSqft * zipAdj;
    notes.push(`Rent estimated using $/sqft heuristic for ${state} with ZIP prefix adjustment (Phase 1).`);
    return { monthlyRentNow: clamp(est, 900, 20000), confidence: 'MEDIUM', notes };
  }

  notes.push('Rent estimated using generic fallback (no property size).');
  return { monthlyRentNow: clamp(2200 * zipAdj, 900, 20000), confidence: 'LOW', notes };
}

function buildDrivers(args: {
  appreciationRate: number;
  vacancyRate: number;
  managementRate: number;
  sellingCostRate: number;
  rentGrowthRate: number;
  confidence: Confidence;
  state: string;
  zipCode: string;
}): Array<{ factor: string; impact: ImpactLevel; explanation: string }> {
  const zp = String(args.zipCode || '').replace(/\D/g, '').slice(0, 3);

  const appreciationImpact: ImpactLevel =
    args.appreciationRate >= 0.05 ? 'HIGH' : args.appreciationRate >= 0.04 ? 'MEDIUM' : 'LOW';

  const rentOpsImpact: ImpactLevel =
    (args.vacancyRate + args.managementRate) >= 0.16 ? 'HIGH'
      : (args.vacancyRate + args.managementRate) >= 0.12 ? 'MEDIUM'
      : 'LOW';

  const sellFrictionImpact: ImpactLevel =
    args.sellingCostRate >= 0.07 ? 'HIGH' : args.sellingCostRate >= 0.055 ? 'MEDIUM' : 'LOW';

  return [
    {
      factor: `Appreciation sensitivity (${args.state}, ZIP ${zp}*)`,
      impact: appreciationImpact,
      explanation:
        `Appreciation is modeled at ${(args.appreciationRate * 100).toFixed(1)}%/yr. Higher appreciation favors HOLD/RENT outcomes.`,
    },
    {
      factor: 'Rental overhead friction',
      impact: rentOpsImpact,
      explanation:
        `Vacancy ${(args.vacancyRate * 100).toFixed(1)}% + management ${(args.managementRate * 100).toFixed(1)}% directly reduce rental income in Phase 1.`,
    },
    {
      factor: 'Selling costs friction',
      impact: sellFrictionImpact,
      explanation:
        `Selling costs modeled at ${(args.sellingCostRate * 100).toFixed(1)}% (agent + closing + fees). Higher costs reduce SELL net proceeds.`,
    },
    {
      factor: 'Confidence & data completeness',
      impact: (args.confidence === 'HIGH' ? 'LOW' : args.confidence === 'MEDIUM' ? 'MEDIUM' : 'HIGH') as ImpactLevel,
      explanation:
        `Confidence is ${args.confidence}. Add overrides (home value, appreciation, rent) to increase signal quality.`,
    },
  ];
}

export class SellHoldRentService {
  private costGrowth = new HomeCostGrowthService();
  private trueCost = new TrueCostOwnershipService();

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

    const years: 5 | 10 = input.years ?? 5;
    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const sellingCostRate = input.sellingCostRate ?? 0.06;
    const rentGrowthRate = input.rentGrowthRate ?? 0.03;
    const vacancyRate = input.vacancyRate ?? 0.06;
    const managementRate = input.managementRate ?? 0.08;

    const metaNotes: string[] = [];
    const dataSources: string[] = [
      'HomeCostGrowthService (appreciation + expense trend)',
      'TrueCostOwnershipService (ownership cost model for 5y)',
      'Rent heuristic model (Phase 1, $/sqft by state + ZIP prefix adjustment)',
    ];

    // --- Base series for home value + tax/ins/maint (no utilities inside cost-growth)
    const cg = await this.costGrowth.estimate(propertyId, {
      years,
      homeValueNow: input.homeValueNow,
      appreciationRate: input.appreciationRate,
    });

    // utilities + richer ownership costs: use TrueCost service directly for 5y; for 10y extend simply
    // by inflating utilities and reusing cg annual expenses (tax/ins/maint).
    let utilitiesAnnualNow = 3000;
    let utilitiesConfidence: Confidence = 'LOW';

    // Pull from TrueCost for better “now” utilities & drift assumptions if possible (works for 5y).
    if (years === 5) {
      try {
        const tc = await this.trueCost.estimate(propertyId, {
          homeValueNow: input.homeValueNow,
          insuranceAnnualNow: undefined,
          maintenanceAnnualNow: undefined,
          utilitiesAnnualNow: undefined,
          inflationRate: undefined,
        });
        utilitiesAnnualNow = tc.current.annualUtilitiesNow ?? utilitiesAnnualNow;
        utilitiesConfidence = tc.meta.confidence as Confidence;
      } catch {
        // keep fallback
      }
    } else {
      // For 10y, we keep utilities model light (Phase 1).
      utilitiesAnnualNow = state === 'TX' ? 3600 : state === 'CA' ? 3200 : state === 'FL' ? 3400 : 3000;
      utilitiesConfidence = 'LOW';
      metaNotes.push('10y utilities modeled using state-level heuristic (Phase 1).');
    }

    // Build ownership costs per year:
    // cg.history includes annualTax/Insurance/Maintenance. We add utilities drift using cg’s inflation-ish behavior.
    // Use a simple drift: 3.5–4.5% based on state.
    const utilDrift = ['CA', 'FL', 'TX'].includes(state) ? 0.045 : 0.035;

    // cg.history is sized to requested years and ends at “nowYear”
    const hist = cg.history.slice(-years);
    const nowYear = new Date().getFullYear();

    const utilitiesByYear = new Map<number, number>();
    for (const row of hist) {
      // row.year aligns to nowYear-(years-1)..nowYear
      const diff = nowYear - row.year; // 0 at nowYear
      // Backcast from now to keep calm chart stable:
      utilitiesByYear.set(row.year, utilitiesAnnualNow * Math.pow(1 + utilDrift, -diff));
    }

    const ownershipCostsByYear = hist.map((r) => {
      const util = utilitiesByYear.get(r.year) ?? utilitiesAnnualNow;
      return {
        year: r.year,
        annualOwnershipCosts: roundMoney((r.annualTax ?? 0) + (r.annualInsurance ?? 0) + (r.annualMaintenance ?? 0) + util),
        util,
      };
    });

    const totalOwnershipCosts = roundMoney(ownershipCostsByYear.reduce((a, r) => a + r.annualOwnershipCosts, 0));

    const homeValueNow = cg.current.homeValueNow;
    const appreciationRate = cg.current.appreciationRate;

    // Rent estimate (override or heuristic)
    let monthlyRentNow: number;
    let rentConfidence: Confidence = 'LOW';
    let rentNotes: string[] = [];

    if (input.monthlyRentNow !== undefined) {
      monthlyRentNow = input.monthlyRentNow;
      rentConfidence = 'HIGH';
      rentNotes.push('Monthly rent override provided by client.');
    } else {
      const est = estimateMonthlyRentNow({ state, zipCode, propertySize: property.propertySize });
      monthlyRentNow = est.monthlyRentNow;
      rentConfidence = est.confidence;
      rentNotes.push(...est.notes);
    }

    // Confidence composition
    let confidence: Confidence = 'LOW';
    if (input.homeValueNow !== undefined || input.appreciationRate !== undefined || input.monthlyRentNow !== undefined) {
      confidence = 'HIGH';
    } else if (cg.meta.confidence === 'MEDIUM' || rentConfidence === 'MEDIUM' || utilitiesConfidence === 'MEDIUM') {
      confidence = 'MEDIUM';
    }

    // --- SELL scenario
    const projectedSalePrice = roundMoney(homeValueNow * Math.pow(1 + appreciationRate, years));
    const sellingCosts = roundMoney(projectedSalePrice * sellingCostRate);
    const netProceeds = roundMoney(projectedSalePrice - sellingCosts);

    const sellNotes: string[] = [
      `Projected sale price assumes ${(appreciationRate * 100).toFixed(1)}%/yr appreciation.`,
      `Selling costs assume ${(sellingCostRate * 100).toFixed(1)}% (agent + closing + fees).`,
    ];

    // --- HOLD scenario
    const appreciationGain = roundMoney(projectedSalePrice - homeValueNow);
    const holdNet = roundMoney(appreciationGain - totalOwnershipCosts);

    const holdNotes: string[] = [
      'Ownership costs use True Cost model components (tax + insurance + maintenance + utilities).',
      years === 10 ? '10-year utilities drift is heuristic in Phase 1.' : 'Utilities derived from True Cost tool baseline when available.',
    ];

    // --- RENT scenario
    let totalRentalIncome = 0;
    for (let y = 0; y < years; y++) {
      const annualRent = monthlyRentNow * Math.pow(1 + rentGrowthRate, y) * 12;
      totalRentalIncome += annualRent;
    }
    totalRentalIncome = roundMoney(totalRentalIncome);

    const vacancyLoss = roundMoney(totalRentalIncome * vacancyRate);
    const managementFees = roundMoney(totalRentalIncome * managementRate);

    const rentNet = roundMoney((totalRentalIncome - vacancyLoss - managementFees - totalOwnershipCosts) + appreciationGain);

    rentNotes = [
      ...rentNotes,
      `Vacancy modeled at ${(vacancyRate * 100).toFixed(1)}%; management at ${(managementRate * 100).toFixed(1)}%.`,
      `Rent growth modeled at ${(rentGrowthRate * 100).toFixed(1)}%/yr.`,
      'Mortgage is ignored in Phase 1 if not available (explicitly).',
    ];

    // --- History for trend chart (yearly deltas)
    const history: SellHoldRentDTO['history'] = [];
    for (let i = 0; i < hist.length; i++) {
      const r = hist[i];
      const own = ownershipCostsByYear[i]?.annualOwnershipCosts ?? 0;

      const prevHomeValue = i === 0 ? (r.homeValue - r.appreciationGain) : hist[i - 1].homeValue;
      const appreciationGainYear = roundMoney(r.homeValue - prevHomeValue);

      const annualRentIncome = roundMoney(monthlyRentNow * Math.pow(1 + rentGrowthRate, i) * 12);
      const annualVacancy = roundMoney(annualRentIncome * vacancyRate);
      const annualMgmt = roundMoney(annualRentIncome * managementRate);

      const holdNetDelta = roundMoney(appreciationGainYear - own);
      const rentNetDelta = roundMoney((annualRentIncome - annualVacancy - annualMgmt - own) + appreciationGainYear);

      history.push({
        year: r.year,
        homeValue: roundMoney(r.homeValue),
        ownershipCosts: roundMoney(own),
        holdNetDelta,
        rentNetDelta,
      });
    }

    // --- Winner
    const sellScore = netProceeds;          // proceeds, not compared to living costs (Phase 1)
    const holdScore = holdNet;
    const rentScore = rentNet;

    const winner =
      rentScore >= holdScore && rentScore >= sellScore ? 'RENT'
        : holdScore >= sellScore ? 'HOLD'
        : 'SELL';

    const rationale: string[] = [];
    if (winner === 'SELL') {
      rationale.push('Selling has the strongest net proceeds under current appreciation and selling-cost assumptions.');
      rationale.push('This ignores the value of housing services (living in the home) in Phase 1 — we’re focusing on modeled cash outcomes.');
    } else if (winner === 'HOLD') {
      rationale.push('Holding wins when appreciation meaningfully offsets total ownership costs.');
      rationale.push('Owning costs are projected using tax/insurance/maintenance/utilities trends from Home Tools.');
    } else {
      rationale.push('Rent wins when rental income net of vacancy/management meaningfully exceeds ownership costs, while still capturing appreciation.');
      rationale.push('Mortgage is ignored in Phase 1; integrate in Phase 2 for financing realism.');
    }

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
        },
      },
      current: {
        homeValueNow: roundMoney(homeValueNow),
        appreciationRate,
        monthlyRentNow: roundMoney(monthlyRentNow),
        sellingCostRate,
      },
      scenarios: {
        sell: {
          projectedSalePrice,
          sellingCosts,
          netProceeds,
          notes: sellNotes,
        },
        hold: {
          totalOwnershipCosts,
          appreciationGain,
          net: holdNet,
          notes: holdNotes,
        },
        rent: {
          totalRentalIncome,
          rentalOverheads: { vacancyLoss, managementFees },
          totalOwnershipCosts,
          appreciationGain,
          net: rentNet,
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
        confidence,
        state,
        zipCode,
      }),
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes: [
          ...metaNotes,
          'Phase 1 ignores mortgage/financing unless you provide overrides later.',
          'Rent estimate is heuristic in Phase 1; override monthly rent for higher accuracy.',
          'ZIP prefix is used only for messaging heuristics in Phase 1.',
        ],
        confidence,
      },
    };
  }
}
