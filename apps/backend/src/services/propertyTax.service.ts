// apps/backend/src/services/propertyTax.service.ts
import { prisma } from '../lib/prisma';
import { getSchoolInsights, type SchoolInsights } from './tax/schoolInsights.provider';

export type PropertyTaxConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type PropertyTaxEstimateInput = {
  assessedValue?: number; // USD (override)
  taxRate?: number; // e.g. 0.0185 = 1.85% (override)
};

export type PropertyTaxEstimateDTO = {
  input: {
    propertyId: string;
    addressLabel: string;
    state: string;
    zipCode: string;
    overrides: {
      assessedValue?: number;
      taxRate?: number;
    };
  };

  current: {
    assessedValue: number;
    taxRate: number;
    annualTax: number;
    monthlyTax: number;
    confidence: PropertyTaxConfidence;
    source: 'HOMEOWNER_REPORTED' | 'PLANNING_ESTIMATE';
  };

  projection: { years: 5 | 10 | 20; estimatedAnnualTax: number; assumptions: string[] }[];

  drivers: {
    factor: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    explanation: string;
  }[];

  nextSteps: Array<{
    title: string;
    detail: string;
    action?: { href: string; label: string; targetTool?: string };
  }>;

  meta: {
    generatedAt: string;
    dataSources: string[];
    notes: string[];
  };
};

// Conservative, approximate effective property tax rates by state.
// (These are heuristics for v1; later you’ll replace with county/school district providers.)
const EFFECTIVE_TAX_RATE_BY_STATE: Record<string, number> = {
  TX: 0.0185,
  CA: 0.0075,
  FL: 0.0105,
  NY: 0.0140,
  NJ: 0.0210,
  IL: 0.0190,
  WA: 0.0095,
  MA: 0.0115,
  CO: 0.0065,
  NC: 0.0085,
  GA: 0.0090,
  AZ: 0.0070,
};

// Rough $/sqft estimates (v1 heuristic only)
const VALUE_PER_SQFT_BY_STATE: Record<string, number> = {
  TX: 180,
  CA: 380,
  FL: 220,
  NY: 320,
  NJ: 300,
  IL: 200,
  WA: 260,
  MA: 320,
  CO: 240,
  NC: 190,
  GA: 180,
  AZ: 210,
};

// Simple annual growth assumption used for history backfill + projections
function assumedAnnualIncreaseRate(state: string) {
  // Keep modest; you can tune per-state later
  if (state === 'TX' || state === 'FL') return 0.045;
  if (state === 'CA' || state === 'NY' || state === 'NJ') return 0.035;
  return 0.03;
}

function toMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function estimateAssessedValueUSD(args: { state: string; propertySize?: number | null }): { value: number; confidence: PropertyTaxConfidence; notes: string[] } {
  const notes: string[] = [];
  const { state, propertySize } = args;

  if (propertySize && Number.isFinite(propertySize) && propertySize > 200) {
    const ppsf = VALUE_PER_SQFT_BY_STATE[state] ?? 200;
    const v = propertySize * ppsf;
    notes.push(`Estimated assessed value using ${ppsf}/sqft heuristic.`);
    return { value: v, confidence: 'MEDIUM', notes };
  }

  // fallback
  notes.push('Estimated assessed value using generic fallback (no property size).');
  return { value: 350000, confidence: 'LOW', notes };
}

function estimateTaxRate(state: string): { rate: number; confidence: PropertyTaxConfidence; notes: string[] } {
  const notes: string[] = [];
  const rate = EFFECTIVE_TAX_RATE_BY_STATE[state] ?? 0.011;
  if (EFFECTIVE_TAX_RATE_BY_STATE[state]) {
    notes.push('Used state-level effective rate heuristic.');
    return { rate, confidence: 'MEDIUM', notes };
  }
  notes.push('Used generic effective rate fallback.');
  return { rate, confidence: 'LOW', notes };
}

function buildProjections(currentAnnualTax: number, state: string) {
  const g = assumedAnnualIncreaseRate(state);

  const mk = (years: 5 | 10 | 20) => ({
    years,
    estimatedAnnualTax: toMoney(currentAnnualTax * Math.pow(1 + g, years)),
    assumptions: [
      `Assumed average annual increase rate of ${(g * 100).toFixed(1)}%.`,
      'Projection is a heuristic (county reassessment rules and exemptions can vary).',
    ],
  });

  return [mk(5), mk(10), mk(20)];
}

type Driver = { factor: string; impact: ImpactLevel; explanation: string };

function buildDriversLocalized(
  args: {
    assessedValueSource: 'HOMEOWNER_REPORTED' | 'PLANNING_ESTIMATE';
    taxRateSource: 'HOMEOWNER_REPORTED' | 'PLANNING_ESTIMATE';
  },
  school?: SchoolInsights | null
): Driver[] {
  const drivers: Driver[] = [
    {
      factor: 'Assessed value input',
      impact: args.assessedValueSource === 'HOMEOWNER_REPORTED' ? 'MEDIUM' : 'HIGH',
      explanation:
        args.assessedValueSource === 'HOMEOWNER_REPORTED'
          ? 'This planning estimate uses the assessed value you entered. It has not been verified against an assessor record or tax notice.'
          : 'No assessed value was confirmed, so this planning estimate uses property size and a state-level price-per-square-foot heuristic.',
    },
    {
      factor: 'Effective tax rate input',
      impact: args.taxRateSource === 'HOMEOWNER_REPORTED' ? 'MEDIUM' : 'HIGH',
      explanation:
        args.taxRateSource === 'HOMEOWNER_REPORTED'
          ? 'This planning estimate uses the effective rate you entered. It has not been verified against jurisdiction rate components.'
          : 'No local rate was confirmed, so this planning estimate uses a state-level effective-rate heuristic.',
    },
  ];

  // ✅ Real-data school signal card (district + per-pupil + confidence)
  const district = school?.districtName || null;
  const ppe = school?.perPupilSpendUsd ?? null;
  const conf = school?.confidence ?? 'LOW';

  const impact: ImpactLevel = conf === 'HIGH' ? 'HIGH' : conf === 'MEDIUM' ? 'MEDIUM' : 'LOW';

  const districtLine = district ? `District: ${district}.` : `District: not resolved.`;
  const ppeLine = ppe ? `Per-pupil spend (est.): ~$${Math.round(ppe).toLocaleString()}.` : `Per-pupil spend: —.`;

  drivers.push({
    factor: 'School district context',
    impact,
    explanation:
      `${districtLine} ${ppeLine} Confidence: ${conf}. ` +
      'This context does not establish the property tax rate or an appeal ground.',
  });

  drivers.push({
    factor: 'Exemptions and caps',
    impact: 'MEDIUM',
    explanation:
      'Eligibility has not been evaluated. Confirm exemptions, caps, classification, and taxable value with the official assessor or collector before acting.',
  });

  return drivers;
}

function lowestConfidence(...values: PropertyTaxConfidence[]): PropertyTaxConfidence {
  const rank: Record<PropertyTaxConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  return values.reduce((lowest, value) => rank[value] < rank[lowest] ? value : lowest, 'HIGH');
}

function buildPropertyTaxNextSteps(args: {
  propertyId: string;
  confidence: PropertyTaxConfidence;
}): PropertyTaxEstimateDTO['nextSteps'] {
  const { propertyId, confidence } = args;
  const steps: PropertyTaxEstimateDTO['nextSteps'] = [];

  if (confidence === 'LOW') {
    steps.push({
      title: 'Complete your property profile',
      detail: 'Add both the assessed value and effective tax rate from the same current bill or notice before using this estimate for budgeting.',
      action: {
        href: `/dashboard/properties/${propertyId}/settings`,
        label: 'Update property profile',
      },
    });
  }

  steps.push({
    title: 'Verify the official record',
    detail: 'Confirm the parcel, assessment year, classification, exemptions, assessed value, taxable value, bill, and current filing information with the official assessor or collector.',
    action: {
      href: `/dashboard/properties/${propertyId}/tools/property-tax?stage=appeal`,
      label: 'Review appeal readiness',
      targetTool: 'property-tax',
    },
  });

  return steps;
}

export class PropertyTaxService {
  async estimate(propertyId: string, opts: PropertyTaxEstimateInput = {}): Promise<PropertyTaxEstimateDTO> {
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
      // propertyAuthMiddleware should prevent this, but keep service safe
      throw new Error('Property not found');
    }

    const state = String(property.state || '').toUpperCase().trim();
    const addressLabel = `${property.address}, ${property.city} ${property.state} ${property.zipCode}`;

    const notes: string[] = [];
    const dataSources: string[] = [
      'Internal property profile (address/state/zip/propertySize)',
      'Heuristic state-level effective tax rate (v1)',
      'Heuristic value-per-sqft estimate (v1)',
    ];

    let assessedValue: number;
    let taxRate: number;

    let assessedValueConfidence: PropertyTaxConfidence;
    let taxRateConfidence: PropertyTaxConfidence;

    if (opts.assessedValue !== undefined) {
      assessedValue = opts.assessedValue;
      notes.push('Assessed value override was provided by the client.');
      assessedValueConfidence = 'HIGH';
    } else {
      const r = estimateAssessedValueUSD({ state, propertySize: property.propertySize });
      assessedValue = r.value;
      notes.push(...r.notes);
      assessedValueConfidence = r.confidence;
    }

    if (opts.taxRate !== undefined) {
      taxRate = opts.taxRate;
      notes.push('Tax rate override was provided by the client.');
      taxRateConfidence = 'HIGH';
    } else {
      const r = estimateTaxRate(state);
      taxRate = r.rate;
      notes.push(...r.notes);
      taxRateConfidence = r.confidence;
    }

    const confidence = lowestConfidence(assessedValueConfidence, taxRateConfidence);
    const source = opts.assessedValue !== undefined && opts.taxRate !== undefined
      ? 'HOMEOWNER_REPORTED' as const
      : 'PLANNING_ESTIMATE' as const;
    const annualTax = toMoney(assessedValue * taxRate);
    const monthlyTax = toMoney(annualTax / 12);

    const projection = buildProjections(annualTax, state);
    // ✅ Real-data school district + finance signals
    const street = String(property.address || '').split(',')[0].trim();

    const schoolInsights = await getSchoolInsights({
      address: {
        street,
        city: String(property.city || '').trim(),
        state,
        zipCode: String(property.zipCode || '').trim(),
      },
    });

    dataSources.push(
      'US Census Geocoder (school district geographies)',
      'Urban Institute Education Data API (CCD finance signals)'
    );
    notes.push(...(schoolInsights.notes || []));

    const drivers = buildDriversLocalized(
      {
        assessedValueSource: opts.assessedValue !== undefined ? 'HOMEOWNER_REPORTED' : 'PLANNING_ESTIMATE',
        taxRateSource: opts.taxRate !== undefined ? 'HOMEOWNER_REPORTED' : 'PLANNING_ESTIMATE',
      },
      schoolInsights
    );
      
    const nextSteps = buildPropertyTaxNextSteps({
      propertyId,
      confidence,
    });

    return {
      input: {
        propertyId,
        addressLabel,
        state,
        zipCode: property.zipCode,
        overrides: {
          assessedValue: opts.assessedValue,
          taxRate: opts.taxRate,
        },
      },
      current: {
        assessedValue: toMoney(assessedValue),
        taxRate,
        annualTax,
        monthlyTax,
        confidence,
        source,
      },
      projection,
      drivers,
      nextSteps,
      meta: {
        generatedAt: new Date().toISOString(),
        dataSources,
        notes,
      },
    };
  }
}
