// apps/backend/src/services/costExplainer.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';
import { InsuranceCostTrendService } from './insuranceCostTrend.service';

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

    // ✅ ADD THIS (so the chart can render)
    history: Array<{
      year: number;
      annualTax: number;
      annualInsurance: number;
      annualMaintenance: number;
      annualTotal: number;
    }>;

    deltaVsPriorYear: {
      tax: number;
      insurance: number;
      maintenance: number;
      total: number;
    };
  };
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
 * - base = 1% of home value per year
 * - slight state modifier
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

    if (!property) throw new Error('Property not found');

    const state = String(property.state || '').toUpperCase() || '—';
    const zip = property.zipCode || '—';
    const addressLabel =
      [property.address, property.city].filter(Boolean).join(', ') || 'Property';

    // 1) Taxes
    const tax = await this.propertyTax.estimate(propertyId, { historyYears: years } as any);
    const taxHist = (tax?.history || []).slice(-Math.max(2, years));
    const taxNow = (tax?.current as any)?.annualTax ?? taxHist.at(-1)?.annualTax ?? 0;
    const taxPrev = taxHist.length >= 2 ? taxHist.at(-2)!.annualTax : taxNow;
    const taxDelta = taxNow - taxPrev;

    // 2) Insurance (your service exposes estimate(), not getTrend())
    const ins = await this.insuranceTrend.estimate(propertyId, { years });
    const insHist = (ins?.history || []).slice(-Math.max(2, years));
    const insNow = ins?.current?.insuranceAnnualNow ?? insHist.at(-1)?.annualPremium ?? 0;
    const insPrev = insHist.length >= 2 ? insHist.at(-2)!.annualPremium : insNow;
    const insDelta = insNow - insPrev;

    // 3) Home value proxy (prefer tax service if it provides it; else heuristic)
    const homeValueNow =
      (tax?.current as any)?.homeValueNow ??
      clamp((property.propertySize || 1800) * (state === 'NJ' ? 310 : state === 'CA' ? 420 : 260), 150_000, 2_500_000);

    // 4) Maintenance heuristic + inflation back-calc for prior year
    const maintNow = estimateMaintenanceNow(homeValueNow, state);
    const inflation = 0.035;
    const maintPrev = maintNow / (1 + inflation);
    const maintDelta = maintNow - maintPrev;

    const totalNow = taxNow + insNow + maintNow;
    const totalPrev = taxPrev + insPrev + maintPrev;
    const totalDelta = totalNow - totalPrev;

    // ✅ Build a history series for the chart (align by year)
    // We anchor maintenance to the same years as tax/insurance history.
    // Use the “last N years” from tax history if available, else insurance, else fallback.
    const yearsBack = years;
    const taxSeries = (tax?.history || []).slice(-yearsBack);
    const insSeries = (ins?.history || []).slice(-yearsBack);

    const byYear = new Map<number, { tax?: number; ins?: number }>();
    for (const h of taxSeries) byYear.set(h.year, { ...(byYear.get(h.year) || {}), tax: h.annualTax });
    for (const h of insSeries) byYear.set(h.year, { ...(byYear.get(h.year) || {}), ins: h.annualPremium });

    const yearKeys = Array.from(byYear.keys()).sort((a, b) => a - b);
    const baseYears =
      yearKeys.length >= 2
        ? yearKeys
        : (() => {
            const nowYear = new Date().getFullYear();
            return Array.from({ length: yearsBack }, (_, i) => nowYear - (yearsBack - 1 - i));
          })();

    // Maintenance series: roll backward from maintNow using inflation
    const nowYear = new Date().getFullYear();
    const maintenanceByYear = new Map<number, number>();
    for (const y of baseYears) {
      const diff = nowYear - y;
      const v = maintNow * Math.pow(1 + inflation, -diff);
      maintenanceByYear.set(y, v);
    }

    const history = baseYears.map((y) => {
      const t = byYear.get(y)?.tax ?? (y === nowYear ? taxNow : taxNow); // fallback
      const i = byYear.get(y)?.ins ?? (y === nowYear ? insNow : insNow); // fallback
      const m = maintenanceByYear.get(y) ?? maintNow;
      return {
        year: y,
        annualTax: t,
        annualInsurance: i,
        annualMaintenance: m,
        annualTotal: t + i + m,
      };
    });

    const zipPrefix = String(zip).slice(0, 3);
    const coastal = ['FL', 'TX', 'LA', 'NC', 'SC', 'NJ', 'NY', 'MA'].includes(state);

    const taxConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      ((tax as any)?.meta?.confidence as any) ?? 'MEDIUM';

    const insConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      ((ins as any)?.meta?.confidence as any) ?? 'LOW';

    const explanations: CostExplainerDTO['explanations'] = [
      {
        category: 'TAXES',
        headline: `Property taxes ${taxDelta >= 0 ? 'increased' : 'decreased'} about ${fmtMoney(taxDelta)} vs last year`,
        bullets: [
          `In ${state}, reassessment cadence and levy adjustments can move the bill even without a big change in your home.`,
          `Your ZIP prefix ${zipPrefix} suggests local variability in assessed values; small changes can compound.`,
          taxDelta >= 0 ? `Net effect: taxes are contributing upward pressure this year.` : `Net effect: taxes are easing slightly this year.`,
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
        history, // ✅ now valid
        deltaVsPriorYear: {
          tax: taxDelta,
          insurance: insDelta,
          maintenance: maintDelta,
          total: totalDelta,
        },
      },
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
