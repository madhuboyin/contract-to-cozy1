// apps/backend/src/services/costExplainer.service.ts
import { prisma } from '../lib/prisma';
import { PropertyTaxService } from './propertyTax.service';
import { getObservedInsurancePremiumHistory } from './insurancePolicyHistory.service';

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

    // Phase-3: transparency array
    assumptions: Array<{
      field: string;
      source: 'DATA_BACKED' | 'HEURISTIC' | 'USER_OVERRIDE' | 'UNKNOWN';
      value: unknown;
      note: string;
    }>;
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
  constructor(private propertyTax = new PropertyTaxService()) {}

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
    const tax = await this.propertyTax.estimate(propertyId);
    const taxNow = tax.current.annualTax;
    const taxPrev = taxNow;
    const taxDelta = 0;

    // 2) Insurance — confirmed policy terms only. Missing history stays missing.
    const observedInsurance = await getObservedInsurancePremiumHistory(propertyId);
    const insHist = observedInsurance.premiumSeries
      .filter((entry) => entry.year !== null)
      .slice(-Math.max(2, years));
    const insNow = observedInsurance.currentAnnualPremium ?? 0;
    const insPrev = observedInsurance.previousAnnualPremium ?? insNow;
    const insDelta = insNow - insPrev;
    const hasObservedInsurance = observedInsurance.currentAnnualPremium !== null;
    const hasObservedInsuranceChange = observedInsurance.previousAnnualPremium !== null;

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

    // Build the modeled cost series without inventing property-tax history.
    // Until observed tax-year records exist, the current planning estimate is
    // held constant and must not be interpreted as a historical observation.
    const byYear = new Map<number, { tax?: number; ins?: number }>();
    for (const h of insHist) {
      if (h.year !== null) {
        byYear.set(h.year, { ...(byYear.get(h.year) || {}), ins: h.annualPremium });
      }
    }

    const yearKeys = Array.from(byYear.keys()).sort((a, b) => a - b);
    const baseYears =
      yearKeys.length > 0
        ? yearKeys
        : [new Date().getFullYear()];

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
      const i = byYear.get(y)?.ins ?? 0;
      const m = maintenanceByYear.get(y) ?? maintNow;
      return {
        year: y,
        annualTax: t,
        annualInsurance: i,
        annualMaintenance: m,
        annualTotal: t + i + m,
      };
    });

    const insConfidence: 'HIGH' | 'MEDIUM' | 'LOW' =
      hasObservedInsuranceChange ? 'HIGH' : hasObservedInsurance ? 'MEDIUM' : 'LOW';

    const explanations: CostExplainerDTO['explanations'] = [
      {
        category: 'TAXES',
        headline: 'A year-over-year property-tax change is not available',
        bullets: [
          'The tax component is a current planning estimate, not an observed assessment or bill history.',
          'Verify tax-year records with the official assessor or collector before drawing a trend conclusion.',
          `The modeled cost series holds the current estimate of ${fmtMoney(taxNow)} constant.`,
        ],
        confidence: 'LOW',
      },
      {
        category: 'INSURANCE',
        headline: hasObservedInsuranceChange
          ? `Confirmed annual premium ${insDelta >= 0 ? 'increased' : 'decreased'} by ${fmtMoney(Math.abs(insDelta))}`
          : hasObservedInsurance
            ? 'One confirmed annual premium is available'
            : 'No confirmed annual premium is available',
        bullets: [
          hasObservedInsuranceChange
            ? 'The change compares confirmed terms for the same recorded policy.'
            : 'At least two confirmed terms are required for a premium-change statement.',
          'No state, ZIP, climate, or synthetic growth heuristic is used.',
          'Review the source policy document before making a financial decision.',
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

    const assumptions: CostExplainerDTO['meta']['assumptions'] = [
      {
        field: 'annualTax',
        source: 'HEURISTIC',
        value: taxNow,
        note: 'PropertyTaxService modeled estimate — state-level heuristic (no county/assessor live data).',
      },
      {
        field: 'annualInsurance',
        source: hasObservedInsurance ? 'DATA_BACKED' : 'UNKNOWN',
        value: hasObservedInsurance ? insNow : null,
        note: hasObservedInsurance
          ? 'Latest homeowner-confirmed annual premium from a verified policy term.'
          : 'No confirmed policy-term premium is available; insurance is excluded from totals.',
      },
      {
        field: 'annualMaintenance',
        source: 'HEURISTIC',
        value: maintNow,
        note: `~1% of home value/year × state adjustment for ${state}, drifted by ${Math.round(inflation * 100)}% inflation (rule-of-thumb estimate).`,
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
        dataSources: ['PropertyTaxService (modeled)', 'Confirmed insurance policy terms', 'Maintenance heuristic'],
        assumptions,
        notes: [
          'Uses modeled estimates (no external datasets) and does not store snapshots.',
          'Maintenance is a heuristic (~1% of value/year) adjusted lightly by state and inflation.',
          ...(hasObservedInsurance
            ? ['Insurance values include confirmed policy terms only.']
            : ['Insurance is excluded because no confirmed premium is available.']),
        ],
      },
    };
  }
}
