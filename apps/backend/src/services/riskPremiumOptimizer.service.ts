import {
  ClaimType,
  MitigationActionType,
  MitigationPeril,
  MitigationPlanStatus,
  MitigationPriority,
  Prisma,
  RiskMitigationPlanItem,
  RiskPremiumOptimizationAnalysis,
  RiskPremiumOptimizationConfidence,
  RiskPremiumOptimizationStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type RecommendationType = 'MITIGATE' | 'POLICY_LEVER' | 'DOCUMENTATION';

type Peril = 'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER';

export type RiskPremiumOptimizerOverrides = {
  annualPremium?: number;
  deductibleAmount?: number;
  cashBuffer?: number;
  riskTolerance?: RiskTolerance;
  assumeBundled?: boolean;
  assumeNewMitigations?: string[];
};

export type UpdateRiskMitigationPlanItemInput = {
  status?: 'RECOMMENDED' | 'PLANNED' | 'DONE' | 'SKIPPED';
  completedAt?: string | null;
  evidenceDocumentId?: string | null;
  linkedHomeEventId?: string | null;
};

export type RiskPremiumOptimizationDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summary?: string;
  estimatedSavingsMin?: number | null;
  estimatedSavingsMax?: number | null;
  inputs: {
    annualPremium?: number | null;
    deductibleAmount?: number | null;
    cashBuffer?: number | null;
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH' | null;
    policyId?: string | null;
  };
  premiumDrivers: Array<{
    code: string;
    title: string;
    detail: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    relatedPerils?: Array<'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER'>;
  }>;
  recommendations: Array<{
    code: string;
    title: string;
    detail: string;
    type: 'MITIGATE' | 'POLICY_LEVER' | 'DOCUMENTATION';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    targetPeril?: 'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER';
    estimatedCost?: number | null;
    estimatedSavingsMin?: number | null;
    estimatedSavingsMax?: number | null;
    whyThisMatters: string;
  }>;
  planItems: Array<{
    id: string;
    actionType: string;
    status: 'RECOMMENDED' | 'PLANNED' | 'DONE' | 'SKIPPED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    targetPeril?: string | null;
    title?: string | null;
    why: string;
    estimatedCost?: number | null;
    estimatedSavingsMin?: number | null;
    estimatedSavingsMax?: number | null;
    evidenceDocumentId?: string | null;
    linkedHomeEventId?: string | null;
    completedAt?: string | null;
  }>;
  computedAt: string;
};

type PremiumDriver = RiskPremiumOptimizationDTO['premiumDrivers'][number];

type Recommendation = RiskPremiumOptimizationDTO['recommendations'][number] & {
  actionType: MitigationActionType;
};

type LatestAnalysisRecord = RiskPremiumOptimizationAnalysis & {
  planItems: RiskMitigationPlanItem[];
};

const STORM_EXPOSURE_STATES = new Set(['FL', 'TX', 'LA', 'AL', 'MS', 'SC', 'NC', 'GA', 'NJ']);
const FIRE_EXPOSURE_STATES = new Set(['CA', 'CO', 'AZ', 'NM', 'OR', 'WA', 'ID', 'MT']);

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const decimalValue = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(decimalValue)) return decimalValue;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function safeArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function severityWeight(severity: Severity): number {
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function priorityWeight(priority: MitigationPriority): number {
  if (priority === MitigationPriority.HIGH) return 3;
  if (priority === MitigationPriority.MEDIUM) return 2;
  return 1;
}

function reduceSeverity(severity: Severity): Severity {
  if (severity === 'HIGH') return 'MEDIUM';
  if (severity === 'MEDIUM') return 'LOW';
  return 'LOW';
}

function inferItemAgeYears(item: { installedOn: Date | null; purchasedOn: Date | null }): number | null {
  const source = item.installedOn ?? item.purchasedOn;
  if (!source) return null;
  const years = (Date.now() - source.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (!Number.isFinite(years) || years < 0) return null;
  return years;
}

function mapClaimTypeToPeril(type: ClaimType): Peril {
  if (type === ClaimType.WATER_DAMAGE || type === ClaimType.PLUMBING) return 'WATER';
  if (type === ClaimType.FIRE_SMOKE) return 'FIRE';
  if (type === ClaimType.STORM_WIND_HAIL) return 'WIND_HAIL';
  if (type === ClaimType.THEFT_VANDALISM) return 'THEFT';
  if (type === ClaimType.LIABILITY) return 'LIABILITY';
  if (type === ClaimType.ELECTRICAL) return 'ELECTRICAL';
  return 'OTHER';
}

function inferInputSnapshot(
  value: Prisma.JsonValue | null | undefined
): RiskPremiumOptimizationDTO['inputs'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      annualPremium: null,
      deductibleAmount: null,
      cashBuffer: null,
      riskTolerance: null,
      policyId: null,
    };
  }

  const root = value as Record<string, unknown>;
  const inputs = (root.inputs ?? root) as Record<string, unknown>;

  const riskTolerance = String(inputs.riskTolerance ?? '').toUpperCase();
  const normalizedTolerance: RiskTolerance | null =
    riskTolerance === 'LOW' || riskTolerance === 'MEDIUM' || riskTolerance === 'HIGH'
      ? (riskTolerance as RiskTolerance)
      : null;

  const policyId = inputs.policyId;
  return {
    annualPremium: asNumber(inputs.annualPremium) ?? null,
    deductibleAmount: asNumber(inputs.deductibleAmount) ?? null,
    cashBuffer: asNumber(inputs.cashBuffer) ?? null,
    riskTolerance: normalizedTolerance,
    policyId: typeof policyId === 'string' ? policyId : null,
  };
}

function mapPlanItemToDto(item: RiskMitigationPlanItem): RiskPremiumOptimizationDTO['planItems'][number] {
  return {
    id: item.id,
    actionType: item.actionType,
    status: item.status,
    priority: item.priority,
    targetPeril: item.targetPeril ?? null,
    title: item.title ?? null,
    why: item.why,
    estimatedCost: asNumber(item.estimatedCost) ?? null,
    estimatedSavingsMin: asNumber(item.estimatedSavingsMin) ?? null,
    estimatedSavingsMax: asNumber(item.estimatedSavingsMax) ?? null,
    evidenceDocumentId: item.evidenceDocumentId ?? null,
    linkedHomeEventId: item.linkedHomeEventId ?? null,
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
  };
}

function mapAnalysisToDto(record: LatestAnalysisRecord): RiskPremiumOptimizationDTO {
  const planItems = [...record.planItems].sort((a, b) => {
    const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return {
    id: record.id,
    propertyId: record.propertyId,
    homeownerProfileId: record.homeownerProfileId,
    status: record.status,
    confidence: record.confidence,
    summary: record.summary ?? undefined,
    estimatedSavingsMin: asNumber(record.estimatedSavingsMin) ?? null,
    estimatedSavingsMax: asNumber(record.estimatedSavingsMax) ?? null,
    inputs: inferInputSnapshot(record.inputsSnapshot),
    premiumDrivers: safeArray<PremiumDriver>(record.premiumDrivers),
    recommendations: safeArray<RiskPremiumOptimizationDTO['recommendations'][number]>(
      record.recommendations
    ),
    planItems: planItems.map(mapPlanItemToDto),
    computedAt: record.computedAt.toISOString(),
  };
}

async function assertPropertyForUser(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      homeownerProfileId: true,
      state: true,
      yearBuilt: true,
      roofReplacementYear: true,
      hasDrainageIssues: true,
      hasSecuritySystem: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      electricalPanelAge: true,
      riskReport: {
        select: {
          riskScore: true,
          details: true,
        },
      },
      homeownerProfile: {
        select: {
          totalBudget: true,
          spentAmount: true,
        },
      },
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

function mapPerilToActionType(peril: Peril, strategy: 'PRIMARY' | 'SECONDARY'): MitigationActionType {
  if (peril === 'WATER') {
    return strategy === 'PRIMARY'
      ? MitigationActionType.AUTO_SHUTOFF_VALVE
      : MitigationActionType.LEAK_SENSORS;
  }
  if (peril === 'WIND_HAIL') return MitigationActionType.ROOF_INSPECTION_OR_REPAIR;
  if (peril === 'FIRE' || peril === 'ELECTRICAL') {
    return strategy === 'PRIMARY'
      ? MitigationActionType.SMOKE_CO_DETECTORS
      : MitigationActionType.ELECTRICAL_PANEL_INSPECTION;
  }
  if (peril === 'THEFT') return MitigationActionType.SECURITY_SYSTEM;
  return MitigationActionType.REVIEW_DISCOUNTS;
}

export class RiskPremiumOptimizerService {
  async getLatest(propertyId: string, userId: string) {
    await assertPropertyForUser(propertyId, userId);

    const latest = await prisma.riskPremiumOptimizationAnalysis.findFirst({
      where: { propertyId },
      include: {
        planItems: true,
      },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latest) {
      return { exists: false as const };
    }

    return {
      exists: true as const,
      analysis: mapAnalysisToDto(latest),
    };
  }

  async run(propertyId: string, userId: string, overrides?: RiskPremiumOptimizerOverrides) {
    const property = await assertPropertyForUser(propertyId, userId);
    const now = new Date();
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 36);

    const [policies, claims, inventoryItems, propertyDocuments] = await Promise.all([
      prisma.insurancePolicy.findMany({
        where: { propertyId },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          premiumAmount: true,
          deductibleAmount: true,
          coverageJson: true,
          startDate: true,
          expiryDate: true,
        },
      }),
      prisma.claim.findMany({
        where: {
          propertyId,
          OR: [{ incidentAt: { gte: lookback } }, { createdAt: { gte: lookback } }],
        },
        select: {
          id: true,
          type: true,
          status: true,
          estimatedLossAmount: true,
          createdAt: true,
          incidentAt: true,
        },
      }),
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: {
          id: true,
          category: true,
          condition: true,
          name: true,
          installedOn: true,
          purchasedOn: true,
          replacementCostCents: true,
          tags: true,
        },
      }),
      prisma.document.findMany({
        where: { propertyId },
        orderBy: [{ createdAt: 'desc' }],
        take: 120,
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          createdAt: true,
        },
      }),
    ]);

    const activePolicy =
      policies.find((policy) => policy.startDate <= now && policy.expiryDate >= now) ?? policies[0] ?? null;

    const annualPremium =
      overrides?.annualPremium ?? (activePolicy ? asNumber(activePolicy.premiumAmount) : undefined);
    const deductibleAmount =
      overrides?.deductibleAmount ?? (activePolicy ? asNumber(activePolicy.deductibleAmount) : undefined);

    const inferredCashBuffer = (() => {
      const totalBudget = asNumber(property.homeownerProfile.totalBudget);
      const spentAmount = asNumber(property.homeownerProfile.spentAmount) ?? 0;
      if (totalBudget === undefined) return undefined;
      const available = Math.max(0, totalBudget - spentAmount);
      return Number.isFinite(available) ? available : undefined;
    })();

    const cashBuffer = overrides?.cashBuffer ?? inferredCashBuffer;
    const riskTolerance: RiskTolerance = overrides?.riskTolerance ?? 'MEDIUM';
    const assumeBundled = Boolean(overrides?.assumeBundled);
    const assumedMitigations = new Set(
      (overrides?.assumeNewMitigations ?? []).map((value) => String(value).toUpperCase())
    );

    const riskScore = property.riskReport?.riskScore ?? null;
    const state = String(property.state || '').toUpperCase();

    const claimsByPeril = claims.reduce<Record<Peril, number>>(
      (acc, claim) => {
        const peril = mapClaimTypeToPeril(claim.type);
        acc[peril] += 1;
        return acc;
      },
      {
        WATER: 0,
        FIRE: 0,
        WIND_HAIL: 0,
        THEFT: 0,
        LIABILITY: 0,
        ELECTRICAL: 0,
        OTHER: 0,
      }
    );

    const waterItems = inventoryItems.filter((item) => {
      const label = `${item.name} ${(item.tags || []).join(' ')}`.toLowerCase();
      return (
        item.category === 'PLUMBING' ||
        label.includes('water heater') ||
        label.includes('sump') ||
        label.includes('pipe')
      );
    });

    const oldWaterSystems = waterItems.filter((item) => {
      const ageYears = inferItemAgeYears(item);
      return ageYears !== null && ageYears >= 8;
    }).length;

    const roofItems = inventoryItems.filter((item) => item.category === 'ROOF_EXTERIOR');
    const roofAgeEstimate = (() => {
      if (property.roofReplacementYear) {
        return now.getFullYear() - property.roofReplacementYear;
      }
      const roofItemAges = roofItems
        .map((item) => inferItemAgeYears(item))
        .filter((value): value is number => value !== null);
      if (roofItemAges.length === 0) return null;
      return Math.round(Math.max(...roofItemAges));
    })();

    const hasRoofInspectionDoc = propertyDocuments.some((doc) => {
      const text = `${doc.name ?? ''} ${doc.description ?? ''}`.toLowerCase();
      return text.includes('roof') && (text.includes('inspect') || text.includes('cert'));
    });

    const hasMitigationReceipt = propertyDocuments.some((doc) => {
      const text = `${doc.name ?? ''} ${doc.description ?? ''}`.toLowerCase();
      return text.includes('sensor') || text.includes('mitigation') || text.includes('inspection');
    });

    const drivers: PremiumDriver[] = [];
    const driverCodes = new Set<string>();
    const pushDriver = (driver: PremiumDriver) => {
      if (driverCodes.has(driver.code)) return;
      driverCodes.add(driver.code);
      drivers.push(driver);
    };

    if (riskScore !== null && riskScore < 45) {
      pushDriver({
        code: 'RISK_SCORE_ELEVATED',
        title: 'Property risk score is elevated',
        detail: `Current risk score is ${riskScore.toFixed(0)}. Elevated risk often increases premium pressure.`,
        severity: 'HIGH',
        relatedPerils: ['OTHER'],
      });
    } else if (riskScore !== null && riskScore < 65) {
      pushDriver({
        code: 'RISK_SCORE_MODERATE',
        title: 'Property risk score is moderate',
        detail: `Current risk score is ${riskScore.toFixed(0)}. There may be room for mitigation-led premium improvements.`,
        severity: 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    let waterSeverity: Severity = 'LOW';
    if (property.hasDrainageIssues || claimsByPeril.WATER >= 2 || oldWaterSystems >= 2) {
      waterSeverity = 'HIGH';
    } else if (claimsByPeril.WATER >= 1 || oldWaterSystems >= 1) {
      waterSeverity = 'MEDIUM';
    }
    if (assumedMitigations.has(MitigationActionType.LEAK_SENSORS) || assumedMitigations.has(MitigationActionType.AUTO_SHUTOFF_VALVE)) {
      waterSeverity = reduceSeverity(waterSeverity);
    }
    if (waterSeverity !== 'LOW') {
      pushDriver({
        code: 'WATER_EXPOSURE',
        title: 'Water damage exposure is a premium driver',
        detail:
          claimsByPeril.WATER > 0
            ? `${claimsByPeril.WATER} recent water/plumbing claim signal(s) plus system profile increase exposure.`
            : 'Water system age and property drainage signals suggest higher leak-related risk.',
        severity: waterSeverity,
        relatedPerils: ['WATER'],
      });
    }

    let windSeverity: Severity = 'LOW';
    if ((STORM_EXPOSURE_STATES.has(state) && (roofAgeEstimate === null || roofAgeEstimate >= 16)) || claimsByPeril.WIND_HAIL >= 1) {
      windSeverity = claimsByPeril.WIND_HAIL >= 2 || (roofAgeEstimate !== null && roofAgeEstimate >= 20) ? 'HIGH' : 'MEDIUM';
    }
    if (assumedMitigations.has(MitigationActionType.ROOF_INSPECTION_OR_REPAIR)) {
      windSeverity = reduceSeverity(windSeverity);
    }
    if (windSeverity !== 'LOW') {
      pushDriver({
        code: 'WIND_HAIL_EXPOSURE',
        title: 'Wind/hail exposure can influence premium',
        detail:
          roofAgeEstimate === null
            ? 'Roof age evidence is limited in a storm-prone profile, reducing premium confidence.'
            : `Estimated roof age is ${roofAgeEstimate} years with regional wind/hail exposure signals.`,
        severity: windSeverity,
        relatedPerils: ['WIND_HAIL'],
      });
    }

    let fireElectricalSeverity: Severity = 'LOW';
    const electricalRiskSignals =
      (property.electricalPanelAge ?? 0) >= 25 ||
      property.hasSmokeDetectors === false ||
      property.hasCoDetectors === false ||
      claimsByPeril.FIRE > 0 ||
      claimsByPeril.ELECTRICAL > 0 ||
      FIRE_EXPOSURE_STATES.has(state);
    if (electricalRiskSignals) {
      fireElectricalSeverity =
        claimsByPeril.FIRE + claimsByPeril.ELECTRICAL >= 2 || (property.electricalPanelAge ?? 0) >= 30
          ? 'HIGH'
          : 'MEDIUM';
    }
    if (
      assumedMitigations.has(MitigationActionType.SMOKE_CO_DETECTORS) ||
      assumedMitigations.has(MitigationActionType.ELECTRICAL_PANEL_INSPECTION)
    ) {
      fireElectricalSeverity = reduceSeverity(fireElectricalSeverity);
    }
    if (fireElectricalSeverity !== 'LOW') {
      pushDriver({
        code: 'FIRE_ELECTRICAL_EXPOSURE',
        title: 'Fire/electrical resilience can improve premium posture',
        detail:
          property.electricalPanelAge && property.electricalPanelAge >= 25
            ? `Electrical panel age is ${property.electricalPanelAge} years; resilience upgrades can reduce loss probability.`
            : 'Detector coverage and electrical claim signals indicate a resilience opportunity.',
        severity: fireElectricalSeverity,
        relatedPerils: ['FIRE', 'ELECTRICAL'],
      });
    }

    const theftSignals = !property.hasSecuritySystem || claimsByPeril.THEFT > 0;
    if (theftSignals) {
      pushDriver({
        code: 'THEFT_EXPOSURE',
        title: 'Security posture may affect premium pressure',
        detail:
          claimsByPeril.THEFT > 0
            ? 'Recent theft/vandalism claim activity detected for this property.'
            : 'No active security system signal found on the property profile.',
        severity: claimsByPeril.THEFT > 0 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['THEFT'],
      });
    }

    if (deductibleAmount !== undefined && cashBuffer !== undefined && cashBuffer > 0) {
      const ratio = deductibleAmount / cashBuffer;
      if (ratio > 0.4) {
        pushDriver({
          code: 'DEDUCTIBLE_BUFFER_MISMATCH',
          title: 'Deductible may be high for your current cash buffer',
          detail: `Deductible is ${Math.round(ratio * 100)}% of cash buffer; this can increase out-of-pocket stress.`,
          severity: 'HIGH',
          relatedPerils: ['OTHER'],
        });
      } else if (ratio > 0.25) {
        pushDriver({
          code: 'DEDUCTIBLE_BUFFER_TIGHT',
          title: 'Deductible-to-buffer ratio is moderately tight',
          detail: `Deductible is ${Math.round(ratio * 100)}% of cash buffer; monitor liquidity for claim events.`,
          severity: 'MEDIUM',
          relatedPerils: ['OTHER'],
        });
      } else if (ratio < 0.1 && (annualPremium ?? 0) >= 3200 && riskTolerance !== 'LOW') {
        pushDriver({
          code: 'DEDUCTIBLE_LEVER_AVAILABLE',
          title: 'Deductible lever may be available',
          detail: 'Current deductible appears conservative relative to available cash buffer.',
          severity: 'LOW',
          relatedPerils: ['OTHER'],
        });
      }
    }

    const claimsCount = claims.length;
    if (claimsCount >= 2) {
      pushDriver({
        code: 'CLAIMS_FREQUENCY',
        title: 'Recent claim frequency can influence premium',
        detail: `${claimsCount} claim records found in the last 36 months.`,
        severity: claimsCount >= 4 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (!hasRoofInspectionDoc || !hasMitigationReceipt) {
      pushDriver({
        code: 'DOCUMENTATION_GAPS',
        title: 'Mitigation documentation is limited',
        detail: 'Missing inspection or mitigation proof can make discount eligibility harder to validate.',
        severity: 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if ((annualPremium ?? 0) >= 4500) {
      pushDriver({
        code: 'PREMIUM_PRESSURE_HIGH',
        title: 'Current annual premium pressure is high',
        detail: `Estimated annual premium is $${annualPremium?.toFixed(0)} before optimization.`,
        severity: 'HIGH',
        relatedPerils: ['OTHER'],
      });
    } else if ((annualPremium ?? 0) >= 2800) {
      pushDriver({
        code: 'PREMIUM_PRESSURE_MODERATE',
        title: 'Current annual premium pressure is moderate',
        detail: `Estimated annual premium is $${annualPremium?.toFixed(0)}.`,
        severity: 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (drivers.length === 0) {
      pushDriver({
        code: 'BASELINE_STABLE',
        title: 'Current risk-to-premium profile appears stable',
        detail: 'No major premium drivers were detected from available data.',
        severity: 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    const recommendations: Recommendation[] = [];
    const recommendationCodes = new Set<string>();
    const pushRecommendation = (recommendation: Recommendation) => {
      if (recommendationCodes.has(recommendation.code)) return;
      recommendationCodes.add(recommendation.code);
      recommendations.push(recommendation);
    };

    const getDriverSeverity = (code: string): Severity | null =>
      drivers.find((driver) => driver.code === code)?.severity ?? null;

    const waterDriverSeverity = getDriverSeverity('WATER_EXPOSURE');
    if (waterDriverSeverity) {
      if (!assumedMitigations.has(MitigationActionType.LEAK_SENSORS)) {
        pushRecommendation({
          code: 'LEAK_SENSOR_DEPLOYMENT',
          title: 'Install leak sensors in high-risk zones',
          detail: 'Prioritize kitchen, laundry, and water heater areas to reduce non-weather water losses.',
          type: 'MITIGATE',
          priority: waterDriverSeverity === 'HIGH' ? 'HIGH' : 'MEDIUM',
          targetPeril: 'WATER',
          estimatedCost: 120,
          estimatedSavingsMin: 60,
          estimatedSavingsMax: 220,
          whyThisMatters: 'Early leak detection can reduce claim severity and supports mitigation-based underwriting reviews.',
          actionType: MitigationActionType.LEAK_SENSORS,
        });
      }

      if (
        waterDriverSeverity === 'HIGH' &&
        !assumedMitigations.has(MitigationActionType.AUTO_SHUTOFF_VALVE)
      ) {
        pushRecommendation({
          code: 'AUTO_SHUTOFF_UPGRADE',
          title: 'Consider automatic water shutoff valve',
          detail: 'An automatic shutoff can cap leak duration and reduce catastrophic water damage potential.',
          type: 'MITIGATE',
          priority: 'HIGH',
          targetPeril: 'WATER',
          estimatedCost: 450,
          estimatedSavingsMin: 120,
          estimatedSavingsMax: 360,
          whyThisMatters: 'High-severity water losses are a common premium driver; shutoff controls directly reduce exposure.',
          actionType: MitigationActionType.AUTO_SHUTOFF_VALVE,
        });
      }
    }

    const windDriverSeverity = getDriverSeverity('WIND_HAIL_EXPOSURE');
    if (
      windDriverSeverity &&
      !assumedMitigations.has(MitigationActionType.ROOF_INSPECTION_OR_REPAIR)
    ) {
      pushRecommendation({
        code: 'ROOF_DOCUMENTED_INSPECTION',
        title: 'Schedule roof inspection/repair documentation',
        detail: 'Capture inspection findings and completed repairs for premium review conversations.',
        type: 'MITIGATE',
        priority: windDriverSeverity,
        targetPeril: 'WIND_HAIL',
        estimatedCost: 275,
        estimatedSavingsMin: 70,
        estimatedSavingsMax: 250,
        whyThisMatters: 'Roof condition quality directly affects wind and hail loss expectations.',
        actionType: MitigationActionType.ROOF_INSPECTION_OR_REPAIR,
      });
    }

    const fireElectricalDriverSeverity = getDriverSeverity('FIRE_ELECTRICAL_EXPOSURE');
    if (fireElectricalDriverSeverity) {
      if (
        (property.hasSmokeDetectors === false || property.hasCoDetectors === false) &&
        !assumedMitigations.has(MitigationActionType.SMOKE_CO_DETECTORS)
      ) {
        pushRecommendation({
          code: 'SMOKE_CO_HARDENING',
          title: 'Upgrade smoke/CO detection coverage',
          detail: 'Ensure detectors are present in sleeping areas and utility-adjacent spaces.',
          type: 'MITIGATE',
          priority: fireElectricalDriverSeverity,
          targetPeril: 'FIRE',
          estimatedCost: 140,
          estimatedSavingsMin: 25,
          estimatedSavingsMax: 110,
          whyThisMatters: 'Life-safety hardening can reduce severe fire claim risk and support premium efficiency.',
          actionType: MitigationActionType.SMOKE_CO_DETECTORS,
        });
      }

      if (
        (property.electricalPanelAge ?? 0) >= 25 &&
        !assumedMitigations.has(MitigationActionType.ELECTRICAL_PANEL_INSPECTION)
      ) {
        pushRecommendation({
          code: 'ELECTRICAL_PANEL_REVIEW',
          title: 'Book an electrical panel inspection',
          detail: 'Document panel condition and any remediation recommendations.',
          type: 'MITIGATE',
          priority: fireElectricalDriverSeverity,
          targetPeril: 'ELECTRICAL',
          estimatedCost: 220,
          estimatedSavingsMin: 40,
          estimatedSavingsMax: 170,
          whyThisMatters: 'Aging electrical systems can increase fire risk and create underwriting uncertainty.',
          actionType: MitigationActionType.ELECTRICAL_PANEL_INSPECTION,
        });
      }
    }

    if (getDriverSeverity('THEFT_EXPOSURE') && !assumedMitigations.has(MitigationActionType.SECURITY_SYSTEM)) {
      pushRecommendation({
        code: 'SECURITY_SYSTEM_REVIEW',
        title: 'Evaluate monitored security setup',
        detail: 'A monitored security baseline can lower theft exposure over time.',
        type: 'MITIGATE',
        priority: claimsByPeril.THEFT > 0 ? 'MEDIUM' : 'LOW',
        targetPeril: 'THEFT',
        estimatedCost: 260,
        estimatedSavingsMin: 50,
        estimatedSavingsMax: 200,
        whyThisMatters: 'Security controls can reduce theft frequency and support premium optimization discussions.',
        actionType: MitigationActionType.SECURITY_SYSTEM,
      });
    }

    const deductibleDriverHigh = getDriverSeverity('DEDUCTIBLE_BUFFER_MISMATCH');
    const deductibleDriverLever = getDriverSeverity('DEDUCTIBLE_LEVER_AVAILABLE');
    if (deductibleDriverHigh) {
      pushRecommendation({
        code: 'DEDUCTIBLE_BUFFER_ALIGNMENT',
        title: 'Rebalance deductible with emergency buffer',
        detail: 'Current deductible appears high for available liquidity. Consider policy lever adjustments before renewal.',
        type: 'POLICY_LEVER',
        priority: 'HIGH',
        targetPeril: 'OTHER',
        estimatedCost: 0,
        estimatedSavingsMin: 0,
        estimatedSavingsMax: 120,
        whyThisMatters: 'Deductible stress can increase financial risk during claims even when premium appears efficient.',
        actionType: MitigationActionType.REVIEW_DISCOUNTS,
      });
    } else if (deductibleDriverLever && riskTolerance !== 'LOW') {
      pushRecommendation({
        code: 'DEDUCTIBLE_INCREASE_SCENARIO',
        title: 'Model a higher deductible scenario',
        detail: 'With current cash buffer, a moderate deductible increase may reduce annual premium pressure.',
        type: 'POLICY_LEVER',
        priority: 'MEDIUM',
        targetPeril: 'OTHER',
        estimatedCost: 0,
        estimatedSavingsMin: 120,
        estimatedSavingsMax: 520,
        whyThisMatters: 'Deductible alignment is one of the largest non-carrier-specific premium levers.',
        actionType: MitigationActionType.RAISE_DEDUCTIBLE,
      });
    }

    if (getDriverSeverity('DOCUMENTATION_GAPS')) {
      pushRecommendation({
        code: 'DISCOUNT_DOCUMENTATION_REVIEW',
        title: 'Consolidate mitigation and inspection documents',
        detail: 'Prepare inspection and mitigation receipts to support discount reviews during renewal.',
        type: 'DOCUMENTATION',
        priority: 'MEDIUM',
        targetPeril: 'OTHER',
        estimatedCost: 0,
        estimatedSavingsMin: 40,
        estimatedSavingsMax: 180,
        whyThisMatters: 'Document quality often determines whether premium credits can be validated.',
        actionType: MitigationActionType.REVIEW_DISCOUNTS,
      });
    }

    if (recommendations.length === 0) {
      pushRecommendation({
        code: 'BASELINE_MONITORING',
        title: 'Maintain current risk controls and monitor quarterly',
        detail: 'No urgent premium pressure levers detected. Refresh after any policy or risk change.',
        type: 'POLICY_LEVER',
        priority: 'LOW',
        targetPeril: 'OTHER',
        estimatedCost: 0,
        estimatedSavingsMin: 0,
        estimatedSavingsMax: 80,
        whyThisMatters: 'Periodic monitoring keeps coverage efficiency aligned with changing property risk.',
        actionType: MitigationActionType.REVIEW_DISCOUNTS,
      });
    }

    const prioritySortValue = (priority: MitigationPriority) => {
      if (priority === MitigationPriority.HIGH) return 3;
      if (priority === MitigationPriority.MEDIUM) return 2;
      return 1;
    };

    const sortedRecommendations = [...recommendations].sort((a, b) => {
      const priorityDelta = prioritySortValue(b.priority as MitigationPriority) - prioritySortValue(a.priority as MitigationPriority);
      if (priorityDelta !== 0) return priorityDelta;

      const aSavings = (a.estimatedSavingsMax ?? 0) - (a.estimatedCost ?? 0);
      const bSavings = (b.estimatedSavingsMax ?? 0) - (b.estimatedCost ?? 0);
      return bSavings - aSavings;
    });

    const discountBoost = assumeBundled ? 1.15 : 1;
    const totalSavingsMinRaw = sortedRecommendations.reduce(
      (sum, recommendation) => sum + (recommendation.estimatedSavingsMin ?? 0),
      0
    ) * discountBoost;
    const totalSavingsMaxRaw = sortedRecommendations.reduce(
      (sum, recommendation) => sum + (recommendation.estimatedSavingsMax ?? 0),
      0
    ) * discountBoost;

    const estimatedSavingsMin = Number.isFinite(totalSavingsMinRaw)
      ? Math.round(totalSavingsMinRaw * 100) / 100
      : null;
    const estimatedSavingsMax = Number.isFinite(totalSavingsMaxRaw)
      ? Math.round(totalSavingsMaxRaw * 100) / 100
      : null;

    const confidenceSignals = [
      annualPremium !== undefined,
      deductibleAmount !== undefined,
      activePolicy?.coverageJson !== null && activePolicy?.coverageJson !== undefined,
      riskScore !== null,
      inventoryItems.length > 0,
      claims.length > 0,
    ].filter(Boolean).length;

    const confidence: RiskPremiumOptimizationConfidence =
      confidenceSignals >= 5
        ? RiskPremiumOptimizationConfidence.HIGH
        : confidenceSignals >= 3
          ? RiskPremiumOptimizationConfidence.MEDIUM
          : RiskPremiumOptimizationConfidence.LOW;

    const topRecommendation = sortedRecommendations[0];
    const summaryParts: string[] = [];
    if (topRecommendation) {
      summaryParts.push(`Top lever: ${topRecommendation.title.toLowerCase()}.`);
    }
    if (estimatedSavingsMin !== null && estimatedSavingsMax !== null) {
      summaryParts.push(
        `Estimated premium pressure reduction range: $${estimatedSavingsMin.toFixed(0)}-$${estimatedSavingsMax.toFixed(0)} per year.`
      );
    }
    summaryParts.push('Educational guidance only; validate assumptions before policy changes.');
    const summary = summaryParts.join(' ');

    const persistedRecommendations = sortedRecommendations.map(({ actionType: _actionType, ...rest }) => rest);
    const planItemInputs = sortedRecommendations
      .filter((recommendation) => recommendation.type === 'MITIGATE' || recommendation.type === 'POLICY_LEVER')
      .slice(0, 7);

    const created = await prisma.$transaction(async (tx) => {
      const analysis = await tx.riskPremiumOptimizationAnalysis.create({
        data: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId,
          status: RiskPremiumOptimizationStatus.READY,
          confidence,
          summary,
          estimatedSavingsMin: estimatedSavingsMin,
          estimatedSavingsMax: estimatedSavingsMax,
          inputsSnapshot: {
            version: 1,
            inputs: {
              annualPremium: annualPremium ?? null,
              deductibleAmount: deductibleAmount ?? null,
              cashBuffer: cashBuffer ?? null,
              riskTolerance,
              policyId: activePolicy?.id ?? null,
              assumeBundled,
              assumeNewMitigations: Array.from(assumedMitigations.values()),
            },
            signals: {
              riskScore,
              claimsCount,
              inventoryCount: inventoryItems.length,
              hasRoofInspectionDoc,
              hasMitigationReceipt,
              claimsByPeril,
            },
          },
          premiumDrivers: drivers.slice(0, 6),
          recommendations: persistedRecommendations.slice(0, 8),
        },
      });

      if (planItemInputs.length > 0) {
        await tx.riskMitigationPlanItem.createMany({
          data: planItemInputs.map((recommendation) => ({
            analysisId: analysis.id,
            propertyId,
            actionType: recommendation.actionType,
            status: MitigationPlanStatus.RECOMMENDED,
            priority:
              recommendation.priority === 'HIGH'
                ? MitigationPriority.HIGH
                : recommendation.priority === 'LOW'
                  ? MitigationPriority.LOW
                  : MitigationPriority.MEDIUM,
            targetPeril: recommendation.targetPeril as MitigationPeril | undefined,
            title: recommendation.title,
            why: recommendation.whyThisMatters,
            estimatedCost: recommendation.estimatedCost ?? null,
            estimatedSavingsMin: recommendation.estimatedSavingsMin ?? null,
            estimatedSavingsMax: recommendation.estimatedSavingsMax ?? null,
          })),
        });
      }

      const withPlanItems = await tx.riskPremiumOptimizationAnalysis.findUnique({
        where: { id: analysis.id },
        include: { planItems: true },
      });

      if (!withPlanItems) {
        throw new Error('Failed to load saved optimizer analysis.');
      }

      return withPlanItems;
    });

    return mapAnalysisToDto(created);
  }

  private async assertPlanItemAccess(propertyId: string, planItemId: string) {
    const item = await prisma.riskMitigationPlanItem.findFirst({
      where: {
        id: planItemId,
        propertyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!item) {
      throw new Error('Plan item not found for this property.');
    }

    return item;
  }

  private async assertEvidenceDocument(propertyId: string, documentId: string) {
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        propertyId,
      },
      select: { id: true },
    });

    if (!document) {
      throw new Error('Evidence document not found for this property.');
    }
  }

  private async assertLinkedHomeEvent(propertyId: string, homeEventId: string) {
    const event = await prisma.homeEvent.findFirst({
      where: {
        id: homeEventId,
        propertyId,
      },
      select: { id: true },
    });

    if (!event) {
      throw new Error('Linked home event not found for this property.');
    }
  }

  async updatePlanItem(
    propertyId: string,
    planItemId: string,
    userId: string,
    input: UpdateRiskMitigationPlanItemInput
  ) {
    await assertPropertyForUser(propertyId, userId);
    const existing = await this.assertPlanItemAccess(propertyId, planItemId);

    if (input.evidenceDocumentId) {
      await this.assertEvidenceDocument(propertyId, input.evidenceDocumentId);
    }
    if (input.linkedHomeEventId) {
      await this.assertLinkedHomeEvent(propertyId, input.linkedHomeEventId);
    }

    const nextStatus = input.status
      ? (input.status as MitigationPlanStatus)
      : existing.status;

    const shouldAutoCompleteAt =
      input.status === MitigationPlanStatus.DONE &&
      existing.status !== MitigationPlanStatus.DONE &&
      input.completedAt === undefined;

    const planItem = await prisma.riskMitigationPlanItem.update({
      where: { id: planItemId },
      data: {
        status: input.status as MitigationPlanStatus | undefined,
        completedAt:
          input.completedAt !== undefined
            ? input.completedAt
              ? new Date(input.completedAt)
              : null
            : shouldAutoCompleteAt
              ? new Date()
              : undefined,
        evidenceDocumentId:
          input.evidenceDocumentId !== undefined ? input.evidenceDocumentId || null : undefined,
        linkedHomeEventId:
          input.linkedHomeEventId !== undefined ? input.linkedHomeEventId || null : undefined,
      },
    });

    if (
      existing.status !== nextStatus &&
      (nextStatus === MitigationPlanStatus.DONE || nextStatus === MitigationPlanStatus.SKIPPED)
    ) {
      await markRiskPremiumOptimizerStale(propertyId);
    }

    return {
      planItem: mapPlanItemToDto(planItem),
    };
  }
}

export async function markRiskPremiumOptimizerStale(propertyId: string) {
  const latestReady = await prisma.riskPremiumOptimizationAnalysis.findFirst({
    where: {
      propertyId,
      status: RiskPremiumOptimizationStatus.READY,
    },
    orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });

  if (!latestReady) return;

  await prisma.riskPremiumOptimizationAnalysis.update({
    where: { id: latestReady.id },
    data: { status: RiskPremiumOptimizationStatus.STALE },
  });
}
