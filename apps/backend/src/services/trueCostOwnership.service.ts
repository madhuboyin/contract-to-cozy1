// apps/backend/src/services/trueCostOwnership.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';
import { InsuranceCostTrendService } from './insuranceCostTrend.service';

type Impact = 'LOW' | 'MEDIUM' | 'HIGH';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type TrueCostOwnershipInput = {
  years?: 5; // Phase 1 fixed to 5 (keep for extensibility)
  homeValueNow?: number; // override
  insuranceAnnualNow?: number; // override
  maintenanceAnnualNow?: number; // override
  utilitiesAnnualNow?: number; // override
  inflationRate?: number; // override (utilities + maintenance + insurance drift)
};

export type TrueCostOwnershipDTO = {
  input: {
    propertyId: string;
    years: 5;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: Record<string, number | undefined>;
  };

  current: {
    homeValueNow: number;
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualUtilitiesNow: number;
    annualTotalNow: number;
  };

  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualUtilities: number;
    annualTotal: number;
  }>;

  rollup: {
    total5y: number;
    breakdown5y: {
      taxes: number;
      insurance: number;
      maintenance: number;
      utilities: number;
    };
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

// Keep consistent with your other tools: lightweight ppsf heuristic
const VALUE_PER_SQFT_BY_STATE: Record<string, number> = {
  NJ: 300, NY: 320, CA: 380, TX: 180, FL: 220, WA: 260, MA: 320, CO: 240, AZ: 210,
};

// Utilities (annual) heuristic — Phase 1 “regional avg” messaging
const UTILITIES_ANNUAL_BY_STATE: Record<string, number> = {
  CA: 3200,
  TX: 3600,
  FL: 3400,
  NJ: 3000,
  NY: 3300,
  WA: 2800,
  MA: 3100,
  CO: 2900,
  AZ: 3700,
  NC: 2800,
  GA: 2900,
  IL: 3000,
};

function estimateHomeValueNowUSD(args: { state: string; propertySize?: number | null }) {
  const notes: string[] = [];
  if (args.propertySize && Number.isFinite(args.propertySize) && args.propertySize > 200) {
    const ppsf = VALUE_PER_SQFT_BY_STATE[args.state] ?? 200;
    notes.push(`Estimated home value using ${ppsf}/sqft heuristic (Phase 1).`);
    return { value: args.propertySize * ppsf, notes, confidence: 'MEDIUM' as Confidence };
  }
  notes.push('Estimated home value using generic fallback (no property size).');
  return { value: 350000, notes, confidence: 'LOW' as Confidence };
}

function estimateMaintenanceNow(homeValueNow: number, state: string) {
  const stateAdj =
    ['CA', 'NY', 'NJ', 'MA', 'WA'].includes(state) ? 1.08 :
    ['TX', 'FL', 'LA'].includes(state) ? 1.06 :
    1.0;
  return homeValueNow * 0.01 * stateAdj;
}

function estimateUtilitiesNow(state: string) {
  return UTILITIES_ANNUAL_BY_STATE[state] ?? 3000;
}

export class TrueCostOwnershipService {
  constructor(
    private propertyTax = new PropertyTaxService(),
    private insuranceTrend = new InsuranceCostTrendService()
  ) {}

  async estimate(propertyId: string, input: TrueCostOwnershipInput = {}): Promise<TrueCostOwnershipDTO> {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, address: true, city: true, state: true, zipCode: true, propertySize: true },
    });
    if (!property) throw new Error('Property not found');

    const years: 5 = 5;
    const state = String(property.state || '').toUpperCase().trim();
    const zipCode = String(property.zipCode || '');
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'Internal property profile (state/zip/propertySize)',
      'PropertyTaxService (modeled)',
      'InsuranceCostTrendService (modeled)',
      'Phase 1 maintenance heuristic (1% rule)',
      'Phase 1 utilities regional avg heuristic',
    ];

    let confidence: Confidence = 'LOW';

    // Home value (used for maintenance & for insurance estimate if not overridden)
    let homeValueNow: number;
    if (input.homeValueNow !== undefined) {
      homeValueNow = input.homeValueNow;
      notes.push('Home value override provided by client.');
      confidence = 'HIGH';
    } else {
      const hv = estimateHomeValueNowUSD({ state, propertySize: property.propertySize });
      homeValueNow = hv.value;
      notes.push(...hv.notes);
      confidence = hv.confidence;
    }

    // Taxes: rely on existing tax tool logic for annualNow + series
    // Your tax service signature may vary; the common pattern is estimate(propertyId, { historyYears })
    const tax = await this.propertyTax.estimate(propertyId, { historyYears: years } as any);
    const taxHist = (tax?.history || []).slice(-years);
    const annualTaxNow = (tax?.current as any)?.annualTax ?? taxHist.at(-1)?.annualTax ?? 0;

    if (!(tax as any)?.history?.length) {
      notes.push('Tax series was not available; using current annual tax for projection.');
    }

    // Insurance: reuse insurance trend estimate() for a modeled now and growth rate; take its history if available
    const ins = await this.insuranceTrend.estimate(propertyId, {
      years,
      homeValueNow: input.homeValueNow,
      insuranceAnnualNow: input.insuranceAnnualNow,
      inflationRate: input.inflationRate,
    });

    const annualInsuranceNow = ins?.current?.insuranceAnnualNow ?? 0;
    const insHist = (ins?.history || []).slice(-years);

    if (input.insuranceAnnualNow !== undefined) {
      notes.push('Insurance override applied.');
      confidence = 'HIGH';
    } else {
      confidence = confidence === 'HIGH' ? 'HIGH' : 'MEDIUM';
    }

    // Maintenance (override or heuristic)
    const annualMaintenanceNow =
      input.maintenanceAnnualNow !== undefined
        ? input.maintenanceAnnualNow
        : estimateMaintenanceNow(homeValueNow, state);

    if (input.maintenanceAnnualNow !== undefined) {
      notes.push('Maintenance override applied.');
    } else {
      notes.push('Maintenance estimated using ~1% of home value/year (Phase 1).');
    }

    // Utilities (override or heuristic)
    const annualUtilitiesNow =
      input.utilitiesAnnualNow !== undefined ? input.utilitiesAnnualNow : estimateUtilitiesNow(state);

    if (input.utilitiesAnnualNow !== undefined) {
      notes.push('Utilities override applied.');
    } else {
      notes.push('Utilities estimated using state-level regional averages (Phase 1).');
    }

    // Inflation / drift assumption for utilities + maintenance (insurance handled by its model)
    const inflationRate = input.inflationRate ?? (['CA', 'FL', 'TX'].includes(state) ? 0.045 : 0.035);

    if (input.inflationRate !== undefined) {
      notes.push('Inflation override applied.');
      confidence = 'HIGH';
    } else {
      notes.push(`Projected utilities/maintenance drift ${(inflationRate * 100).toFixed(1)}%/yr (Phase 1).`);
    }

    const nowYear = new Date().getFullYear();

    // Build 5y series (historical-looking timeline ending now, for calm readability)
    // Align on year labels with tax/insurance if present.
    const yearLabels: number[] = [];
    for (let i = years - 1; i >= 0; i--) yearLabels.push(nowYear - i);

    // Taxes: if tax history exists, align by year; else backfill constant
    const taxByYear = new Map<number, number>();
    for (const h of taxHist) taxByYear.set(h.year, h.annualTax);

    // Insurance: from insurance trend history if present; else backfill by its growth rate
    const insByYear = new Map<number, number>();
    if (insHist.length) {
      for (const h of insHist) insByYear.set(h.year, h.annualPremium);
    } else {
      // backfill using modeled growth in insurance trend current insuranceGrowthRate
      const g = ins?.current?.insuranceGrowthRate ?? 0.06;
      for (const y of yearLabels) {
        const diff = nowYear - y;
        insByYear.set(y, annualInsuranceNow * Math.pow(1 + g, -diff));
      }
      notes.push('Insurance series derived from modeled growth rate (no explicit history).');
    }

    // Maintenance/utilities: roll backward from “now” using inflationRate
    const maintByYear = new Map<number, number>();
    const utilByYear = new Map<number, number>();
    for (const y of yearLabels) {
      const diff = nowYear - y;
      maintByYear.set(y, annualMaintenanceNow * Math.pow(1 + inflationRate, -diff));
      utilByYear.set(y, annualUtilitiesNow * Math.pow(1 + inflationRate, -diff));
    }

    const history = yearLabels.map((y) => {
      const annualTax = taxByYear.get(y) ?? annualTaxNow;
      const annualInsurance = insByYear.get(y) ?? annualInsuranceNow;
      const annualMaintenance = maintByYear.get(y) ?? annualMaintenanceNow;
      const annualUtilities = utilByYear.get(y) ?? annualUtilitiesNow;
      const annualTotal = annualTax + annualInsurance + annualMaintenance + annualUtilities;

      return {
        year: y,
        annualTax: toMoney(annualTax),
        annualInsurance: toMoney(annualInsurance),
        annualMaintenance: toMoney(annualMaintenance),
        annualUtilities: toMoney(annualUtilities),
        annualTotal: toMoney(annualTotal),
      };
    });

    const breakdown5y = {
      taxes: toMoney(history.reduce((a, h) => a + h.annualTax, 0)),
      insurance: toMoney(history.reduce((a, h) => a + h.annualInsurance, 0)),
      maintenance: toMoney(history.reduce((a, h) => a + h.annualMaintenance, 0)),
      utilities: toMoney(history.reduce((a, h) => a + h.annualUtilities, 0)),
    };

    const total5y = toMoney(
      breakdown5y.taxes + breakdown5y.insurance + breakdown5y.maintenance + breakdown5y.utilities
    );

    const zp = zipPrefix(zipCode);

    const drivers = [
      {
        factor: `Insurance volatility (state ${state}, ZIP ${zp})`,
        impact: (['FL', 'TX', 'CA', 'LA'].includes(state) ? 'HIGH' : 'MEDIUM') as Impact,
        explanation:
          `Insurance is modeled with localized climate/claims pressure. Phase 2 can replace this with DOI filings + FEMA/NOAA correlations.`,
      },
      {
        factor: `Utilities regional averages (${state})`,
        impact: 'MEDIUM' as Impact,
        explanation:
          `Utilities are estimated from state-level averages in Phase 1. Add provider/energy-rate datasets later for higher precision.`,
      },
      {
        factor: `Maintenance drift vs home value`,
        impact: 'MEDIUM' as Impact,
        explanation:
          `Maintenance uses the “1% rule” baseline with light state adjustment. Homes with deferred maintenance can exceed this baseline.`,
      },
    ];

    const dto: TrueCostOwnershipDTO = {
      input: {
        propertyId,
        years,
        addressLabel,
        state,
        zipCode,
        overrides: {
          homeValueNow: input.homeValueNow,
          insuranceAnnualNow: input.insuranceAnnualNow,
          maintenanceAnnualNow: input.maintenanceAnnualNow,
          utilitiesAnnualNow: input.utilitiesAnnualNow,
          inflationRate: input.inflationRate,
        },
      },
      current: {
        homeValueNow: toMoney(homeValueNow),
        annualTaxNow: toMoney(annualTaxNow),
        annualInsuranceNow: toMoney(annualInsuranceNow),
        annualMaintenanceNow: toMoney(annualMaintenanceNow),
        annualUtilitiesNow: toMoney(annualUtilitiesNow),
        annualTotalNow: toMoney(annualTaxNow + annualInsuranceNow + annualMaintenanceNow + annualUtilitiesNow),
      },
      history,
      rollup: { total5y, breakdown5y },
      drivers,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes: [
          ...notes,
          'Phase 1 is a storytelling estimator: no external utility provider data, no DOI filings, no snapshot persistence.',
        ],
        confidence,
      },
    };

    return dto;
  }
}
