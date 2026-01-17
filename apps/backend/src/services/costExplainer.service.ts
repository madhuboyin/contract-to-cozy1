// apps/backend/src/services/costExplainer.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';
import { InsuranceCostTrendService } from './insuranceCostTrend.service'; // adjust import if your file exports differently

type Years = 5 | 10;

export type CostExplainerDTO = {
  input: {
    propertyId: string;
    years: Years;
    addressLabel: string;
    state: string;
    zipCode: string;
  };

  snapshot: {
    annualTaxNow: number;
    annualInsuranceNow: number;
    annualMaintenanceNow: number;
    annualTotalNow: number;
    deltaVsPriorYear: {
      tax: number;
      insurance: number;
      maintenance: number;
      total: number;
    };
  };

  // ✅ ADD THIS
  history: Array<{
    year: number;
    annualTax: number;
    annualInsurance: number;
    annualMaintenance: number;
    annualTotal: number;
  }>;

  explanations: Array<{
    category: 'TAXES' | 'INSURANCE' | 'MAINTENANCE' | 'TOTAL';
    headline: string;
    bullets: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;

  meta: {
    generatedAt: string;
    notes: string[];
    dataSources: string[];
  };
};


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtMoney(n: number) {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${sign}$${Math.round(a).toLocaleString()}`;
}

/**
 * Phase-1 maintenance heuristic:
 * - base = 1% of home value per year (common rule of thumb)
 * - inflation escalation ~3.5%
 * - slight state modifier (very lightweight)
 */
function estimateMaintenanceNow(homeValueNow: number, state: string) {
  const stateAdj =
    ['CA', 'NY', 'NJ', 'MA', 'WA'].includes(state) ? 1.08 :
    ['TX', 'FL', 'LA'].includes(state) ? 1.06 :
    1.0;
  return homeValueNow * 0.01 * stateAdj;
}

export class CostExplainerService {
  constructor(
    private propertyTax = new PropertyTaxService(),
    private insuranceTrend = new InsuranceCostTrendService()
  ) {}

  async explain(propertyId: string, years: Years = 5): Promise<CostExplainerDTO> {
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

    if (!property) {
      throw new Error('Property not found');
    }

    const state = property.state || '—';
    const zip = property.zipCode || '—';
    const addressLabel = [property.address, property.city].filter(Boolean).join(', ') || 'Property';

    // 1) Taxes — call the existing tax estimator for history
    const tax = await this.propertyTax.estimate(propertyId, { historyYears: years }); // adjust signature if yours differs
    const taxHist = (tax?.history || []).slice(-Math.max(2, years));
    const taxNow = tax?.current?.annualTax ?? taxHist.at(-1)?.annualTax ?? 0;
    const taxPrev = taxHist.length >= 2 ? taxHist.at(-2)!.annualTax : taxNow;
    const taxDelta = taxNow - taxPrev;

    // 2) Insurance — reuse insurance trend endpoint/service
    const ins = await this.insuranceTrend.estimate(propertyId, { years });
    const insHist = (ins?.history || []).slice(-Math.max(2, years));
    const insNow = ins?.current?.insuranceAnnualNow ?? insHist.at(-1)?.annualPremium ?? 0;
    const insPrev = insHist.length >= 2 ? insHist.at(-2)!.annualPremium : insNow;
    const insDelta = insNow - insPrev;


    // 3) Home value proxy (from tax service if available, otherwise heuristic)
    const homeValueNow =
      (tax?.current as any)?.homeValueNow ??
      clamp((property.propertySize || 1800) * (state === 'NJ' ? 310 : state === 'CA' ? 420 : 260), 150_000, 2_500_000);
      
    // 4) Maintenance heuristic
    const maintNow = estimateMaintenanceNow(homeValueNow, state);
    const inflation = 0.035;
    const maintPrev = maintNow / (1 + inflation);
    const maintDelta = maintNow - maintPrev;

    const totalNow = taxNow + insNow + maintNow;
    const totalPrev = taxPrev + insPrev + maintPrev;
    const totalDelta = totalNow - totalPrev;

    // Localized narrative hints (Phase 1, non-generic)
    const zipPrefix = String(zip).slice(0, 3);
    const coastal = ['FL', 'TX', 'LA', 'NC', 'SC', 'NJ', 'NY', 'MA'].includes(state);

    const taxConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    tax?.current?.annualTax ? 'MEDIUM' : 'LOW';
  
    const insConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
    ins?.meta?.confidence ?? 'LOW';
  
    const nowYear = new Date().getFullYear();
    
    // Align years to available history
    const n = years;
    
    // Build aligned year list ending at current year (n points)
    const yearsList = Array.from({ length: n }, (_, i) => nowYear - (n - 1 - i));
    
    // Taxes: if taxHist has matching years use them; else backfill flat
    const taxByYear = new Map<number, number>(
      (tax?.history || []).map((h: any) => [h.year, h.annualTax])
    );
    
    const insByYear = new Map<number, number>(
      (ins?.history || []).map((h) => [h.year, h.annualPremium])
    );
    
    // Maintenance: estimate backwards using inflation (maintenanceNow is current year)
    function maintenanceForYear(targetYear: number) {
      const delta = nowYear - targetYear;
      return maintNow / Math.pow(1 + inflation, delta);
    }
    
    const history = yearsList.map((y) => {
      const annualTax = taxByYear.get(y) ?? taxNow; // fallback
      const annualInsurance = insByYear.get(y) ?? insNow; // fallback
      const annualMaintenance = maintenanceForYear(y);
    
      return {
        year: y,
        annualTax,
        annualInsurance,
        annualMaintenance,
        annualTotal: annualTax + annualInsurance + annualMaintenance,
      };
    });
    
    const explanations: CostExplainerDTO['explanations'] = [
      {
        category: 'TAXES',
        headline: `Property taxes ${taxDelta >= 0 ? 'increased' : 'decreased'} about ${fmtMoney(taxDelta)} vs last year`,
        bullets: [
          `In ${state}, reassessment cadence and levy adjustments can move the bill even without a big change in your home.`,
          `Your ZIP prefix ${zipPrefix} suggests local variability in assessed values; small changes can compound.`,
          taxDelta >= 0
            ? `Net effect: taxes are contributing upward pressure this year.`
            : `Net effect: taxes are easing slightly this year.`,
        ],
        confidence: taxConfidence,
      },
      {
        category: 'INSURANCE',
        headline: `Insurance ${insDelta >= 0 ? 'increased' : 'decreased'} about ${fmtMoney(insDelta)} vs last year`,
        bullets: [
          coastal
            ? `Coastal/hurricane-adjacent states like ${state} tend to see more volatility tied to catastrophe losses and reinsurance pricing.`
            : `Inland states like ${state} still see premium drift from claims inflation and rebuild-cost increases.`,
          `ZIP prefix ${zipPrefix} is treated as a risk proxy by carriers (claims frequency + rebuild costs).`,
          `In Phase 1 this is modeled; Phase 2 will incorporate DOI filings + FEMA/NOAA correlations.`,
        ],
        confidence: insConfidence,
      },
      {
        category: 'MAINTENANCE',
        headline: `Maintenance is trending up about ${fmtMoney(maintDelta)} (inflation + aging-home curve)`,
        bullets: [
          `We estimate maintenance as ~1% of home value/year (common rule of thumb), escalated by ~${Math.round(inflation * 100)}% inflation.`,
          `As homes age, small repairs (sealants, HVAC tune-ups, minor leaks) become more frequent — even without major renovations.`,
          `If your maintenance plan is sparse, the “unplanned” share tends to rise year-over-year.`,
        ],
        confidence: 'LOW',
      },
      {
        category: 'TOTAL',
        headline: `Total ownership costs moved about ${fmtMoney(totalDelta)} vs last year`,
        bullets: [
          `Taxes: ${fmtMoney(taxDelta)} · Insurance: ${fmtMoney(insDelta)} · Maintenance: ${fmtMoney(maintDelta)}`,
          totalDelta >= 0
            ? `Top driver is currently ${Math.abs(insDelta) >= Math.abs(taxDelta) ? 'insurance' : 'taxes'} for your area.`
            : `Overall costs eased; the largest relief came from ${Math.abs(insDelta) >= Math.abs(taxDelta) ? 'insurance' : 'taxes'}.`,
          `Next: use Cost Growth + Insurance Trend together to see whether appreciation is outpacing these increases.`,
        ],
        confidence: 'MEDIUM',
      },
      
    ];

    return {
      input: { propertyId, years, addressLabel, state, zipCode: zip },
    
      snapshot: {
        annualTaxNow: taxNow,
        annualInsuranceNow: insNow,
        annualMaintenanceNow: maintNow,
        annualTotalNow: totalNow,
        deltaVsPriorYear: {
          tax: taxDelta,
          insurance: insDelta,
          maintenance: maintDelta,
          total: totalDelta,
        },
      },
    
      // ✅ MOVE HERE (top-level)
      history,
    
      explanations,
    
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources: ['PropertyTaxService (modeled)', 'InsuranceTrend (modeled)', 'Maintenance heuristic'],
        notes: [
          'Phase 1 uses modeled estimates (no external datasets) and does not store snapshots.',
          'Maintenance is a heuristic (~1% of value/year) adjusted lightly by state and inflation.',
        ],
      },
    };    
  }
}
