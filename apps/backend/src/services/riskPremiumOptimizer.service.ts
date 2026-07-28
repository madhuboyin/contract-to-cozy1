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
import {
  AssumptionSetService,
  extractAssumptionOverrides,
  hasAssumptionOverrides,
} from './assumptionSet.service';
import { PreferencePostureDefaults, PreferenceProfileService } from './preferenceProfile.service';
import { SharedSignalKey, signalService } from './signal.service';
import { logSharedDataEvent } from './sharedDataObservability.service';
import { getProtectionContextDecisions } from './protection/context';
import type { FeatureDecision } from '../modules/propertyContext';
import { getOrCreateCoverageReview } from './coverageReview.service';

type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type RecommendationType = 'MITIGATE' | 'POLICY_LEVER' | 'DOCUMENTATION';

type Peril = 'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER';

export type RiskPremiumOptimizerOverrides = {
  annualPremium?: number;
  deductibleAmount?: number;
  cashBuffer?: number;
  riskTolerance?: RiskTolerance;
  assumeNewMitigations?: string[];
};

export type RiskPremiumRunOptions = {
  assumptionSetId?: string;
};

export type UpdateRiskMitigationPlanItemInput = {
  status?: 'RECOMMENDED' | 'PLANNED' | 'COMPLETED' | 'SKIPPED' | 'RESTORED';
  completedAt?: string | null;
  evidenceDocumentId?: string | null;
  linkedHomeEventId?: string | null;
};

export type RiskPremiumOptimizationDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  assumptionSetId?: string | null;
  preferenceProfileId?: string | null;
  propertyContext?: {
    contextVersion: string;
    generatedContextVersion: string | null;
    isStale: boolean;
    decision: FeatureDecision;
  };
  sharedSignalsUsed?: string[];
  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summary?: string;
  coverageReviewId?: string | null;
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
    whyThisMatters: string;
  }>;
  planItems: Array<{
    id: string;
    actionType: string;
    status: 'RECOMMENDED' | 'PLANNED' | 'COMPLETED' | 'SKIPPED' | 'RESTORED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    targetPeril?: string | null;
    title?: string | null;
    why: string;
    estimatedCost?: number | null;
    carrierBenefitStatus: 'UNKNOWN' | 'CONFIRMED_ELIGIBLE' | 'CONFIRMED_NOT_ELIGIBLE';
    carrierReviewQuestion: string;
    professionalHelpLevel:
      | 'DIY_ALLOWED'
      | 'PROFESSIONAL_RECOMMENDED'
      | 'QUALIFIED_PROFESSIONAL_REQUIRED'
      | 'ASK_CARRIER';
    handoff: {
      kind: 'DIY' | 'PROVIDER' | 'CARRIER';
      label: string;
      href: string;
      safetyNote: string;
    };
    evidenceDocumentId?: string | null;
    linkedHomeEventId?: string | null;
    completedAt?: string | null;
  }>;
  planRebuildRequired?: boolean;
  suppressedPlanItemCount?: number;
  computedAt: string;
  observedPremiumComparison?: {
    hasCompletedMitigations: boolean;
    completedCount: number;
    baselineComputedAt?: string | null;
    baselineAnnualPremium?: number | null;
    currentAnnualPremium?: number | null;
    observedPremiumDelta?: number | null;
    observedDirection: 'DECREASED' | 'INCREASED' | 'UNCHANGED' | 'UNKNOWN';
    note: string;
  };
};

type PremiumDriver = RiskPremiumOptimizationDTO['premiumDrivers'][number];

type Recommendation = RiskPremiumOptimizationDTO['recommendations'][number] & {
  actionType: MitigationActionType;
};

type LatestAnalysisRecord = RiskPremiumOptimizationAnalysis & {
  planItems: RiskMitigationPlanItem[];
};

type MitigationVerification = NonNullable<RiskPremiumOptimizationDTO['observedPremiumComparison']>;
type MitigationVerificationDirection = MitigationVerification['observedDirection'];

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

function parseSharedMetaFromSnapshot(
  value: Prisma.JsonValue | null | undefined
): { preferenceProfileId: string | null; sharedSignalsUsed: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      preferenceProfileId: null,
      sharedSignalsUsed: [],
    };
  }

  const root = value as Record<string, unknown>;
  const inputs =
    root.inputs && typeof root.inputs === 'object' && !Array.isArray(root.inputs)
      ? (root.inputs as Record<string, unknown>)
      : {};
  const sharedSignals = Array.isArray(root.sharedSignalsUsed)
    ? root.sharedSignalsUsed.map((entry) => String(entry))
    : [];

  return {
    preferenceProfileId:
      typeof inputs.preferenceProfileId === 'string' ? inputs.preferenceProfileId : null,
    sharedSignalsUsed: sharedSignals,
  };
}

function parseMitigationVerificationFromSnapshot(
  value: Prisma.JsonValue | null | undefined
): RiskPremiumOptimizationDTO['observedPremiumComparison'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const root = value as Record<string, unknown>;
  const raw =
    root.observedPremiumComparison &&
    typeof root.observedPremiumComparison === 'object' &&
    !Array.isArray(root.observedPremiumComparison)
      ? (root.observedPremiumComparison as Record<string, unknown>)
      : null;
  if (!raw) return undefined;

  const observedDirection = String(raw.observedDirection ?? '').toUpperCase();
  const normalizedDirection: MitigationVerificationDirection =
    observedDirection === 'DECREASED' ||
    observedDirection === 'INCREASED' ||
    observedDirection === 'UNCHANGED'
      ? (observedDirection as MitigationVerificationDirection)
      : 'UNKNOWN';

  return {
    hasCompletedMitigations: raw.hasCompletedMitigations === true,
    completedCount: Number.isFinite(Number(raw.completedCount)) ? Number(raw.completedCount) : 0,
    baselineComputedAt:
      typeof raw.baselineComputedAt === 'string' ? raw.baselineComputedAt : null,
    baselineAnnualPremium: asNumber(raw.baselineAnnualPremium) ?? null,
    currentAnnualPremium: asNumber(raw.currentAnnualPremium) ?? null,
    observedPremiumDelta: asNumber(raw.observedPremiumDelta) ?? null,
    observedDirection: normalizedDirection,
    note:
      typeof raw.note === 'string' && raw.note.trim()
        ? raw.note.trim()
        : 'Mitigation verification metadata unavailable.',
  };
}

function extractSignalNumber(signal: {
  valueNumber: number | null;
  valueJson: Prisma.JsonValue | null;
}, jsonField?: string): number | null {
  if (signal.valueNumber !== null && signal.valueNumber !== undefined && Number.isFinite(signal.valueNumber)) {
    return signal.valueNumber;
  }

  if (jsonField && signal.valueJson && typeof signal.valueJson === 'object' && !Array.isArray(signal.valueJson)) {
    const value = Number((signal.valueJson as Record<string, unknown>)[jsonField]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function toPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value <= 1 ? Math.round(value * 100) : value;
}

const PROFESSIONAL_HELP_LEVELS = new Set([
  'DIY_ALLOWED',
  'PROFESSIONAL_RECOMMENDED',
  'QUALIFIED_PROFESSIONAL_REQUIRED',
  'ASK_CARRIER',
]);
const HANDOFF_KINDS = new Set(['DIY', 'PROVIDER', 'CARRIER']);

function hasGovernedPlanGuidance(item: RiskMitigationPlanItem): boolean {
  if (!item.carrierReviewQuestion.trim()) return false;
  if (!PROFESSIONAL_HELP_LEVELS.has(item.professionalHelpLevel)) {
    return false;
  }
  if (!item.handoffJson || typeof item.handoffJson !== 'object' || Array.isArray(item.handoffJson)) {
    return false;
  }
  const handoff = item.handoffJson as Record<string, unknown>;
  return HANDOFF_KINDS.has(String(handoff.kind))
    && typeof handoff.label === 'string'
    && handoff.label.trim().length > 0
    && typeof handoff.href === 'string'
    && handoff.href.trim().length > 0
    && typeof handoff.safetyNote === 'string'
    && handoff.safetyNote.trim().length > 0;
}

function mapPlanItemToDto(item: RiskMitigationPlanItem): RiskPremiumOptimizationDTO['planItems'][number] {
  if (!hasGovernedPlanGuidance(item)) {
    throw new Error(`Risk mitigation plan item ${item.id} is missing governed guidance.`);
  }
  return {
    id: item.id,
    actionType: item.actionType,
    status: item.status,
    priority: item.priority,
    targetPeril: item.targetPeril ?? null,
    title: item.title ?? null,
    why: item.why,
    estimatedCost: asNumber(item.estimatedCost) ?? null,
    carrierBenefitStatus: item.carrierBenefitStatus as RiskPremiumOptimizationDTO['planItems'][number]['carrierBenefitStatus'],
    carrierReviewQuestion: item.carrierReviewQuestion,
    professionalHelpLevel:
      item.professionalHelpLevel as RiskPremiumOptimizationDTO['planItems'][number]['professionalHelpLevel'],
    handoff: item.handoffJson as RiskPremiumOptimizationDTO['planItems'][number]['handoff'],
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
  const sharedMeta = parseSharedMetaFromSnapshot(record.inputsSnapshot);
  const observedPremiumComparison = parseMitigationVerificationFromSnapshot(record.inputsSnapshot);
  return {
    id: record.id,
    propertyId: record.propertyId,
    homeownerProfileId: record.homeownerProfileId,
    assumptionSetId: record.assumptionSetId ?? null,
    preferenceProfileId: sharedMeta.preferenceProfileId,
    sharedSignalsUsed: sharedMeta.sharedSignalsUsed,
    status: record.status,
    confidence: record.confidence,
    summary: record.summary ?? undefined,
    coverageReviewId: record.coverageReviewId ?? null,
    inputs: inferInputSnapshot(record.inputsSnapshot),
    premiumDrivers: safeArray<PremiumDriver>(record.premiumDrivers),
    recommendations: safeArray<RiskPremiumOptimizationDTO['recommendations'][number]>(
      record.recommendations
    ),
    planItems: planItems.map(mapPlanItemToDto),
    planRebuildRequired: false,
    suppressedPlanItemCount: 0,
    computedAt: record.computedAt.toISOString(),
    observedPremiumComparison,
  };
}

function generatedContextVersionFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const propertyContext = (snapshot as Record<string, unknown>).propertyContext;
  if (!propertyContext || typeof propertyContext !== 'object' || Array.isArray(propertyContext)) return null;
  const version = (propertyContext as Record<string, unknown>).contextVersion;
  return typeof version === 'string' && version.length > 0 ? version : null;
}

function deductibleFromPreferenceStyle(
  style: PreferencePostureDefaults['deductiblePreferenceStyle']
): number | undefined {
  if (style === 'LOW_DEDUCTIBLE') return 1000;
  if (style === 'BALANCED') return 1500;
  if (style === 'HIGH_DEDUCTIBLE') return 2500;
  return undefined;
}

function cashBufferFromPosture(posture: PreferencePostureDefaults['cashBufferPosture']): number | undefined {
  if (posture === 'TIGHT') return 1500;
  if (posture === 'MODERATE') return 6000;
  if (posture === 'STRONG') return 18000;
  return undefined;
}

function parseRiskPremiumOverrides(value: Record<string, unknown>): RiskPremiumOptimizerOverrides {
  const asFinite = (input: unknown): number | undefined => {
    const numeric = Number(input);
    return Number.isFinite(numeric) ? numeric : undefined;
  };

  const tolerance = String(value.riskTolerance ?? '').toUpperCase();
  const riskTolerance: RiskTolerance | undefined =
    tolerance === 'LOW' || tolerance === 'MEDIUM' || tolerance === 'HIGH'
      ? (tolerance as RiskTolerance)
      : undefined;

  const assumeNewMitigations = Array.isArray(value.assumeNewMitigations)
    ? value.assumeNewMitigations.map((entry) => String(entry)).filter(Boolean)
    : undefined;

  return {
    annualPremium: asFinite(value.annualPremium),
    deductibleAmount: asFinite(value.deductibleAmount),
    cashBuffer: asFinite(value.cashBuffer),
    riskTolerance,
    assumeNewMitigations,
  };
}

function applyPreferenceDefaults(
  overrides: RiskPremiumOptimizerOverrides | undefined,
  posture: PreferencePostureDefaults
): RiskPremiumOptimizerOverrides {
  const base = overrides ?? {};
  const riskTolerance =
    base.riskTolerance ??
    (posture.riskTolerance === 'LOW' || posture.riskTolerance === 'MEDIUM' || posture.riskTolerance === 'HIGH'
      ? posture.riskTolerance
      : undefined);

  return {
    ...base,
    riskTolerance,
    deductibleAmount: base.deductibleAmount ?? deductibleFromPreferenceStyle(posture.deductiblePreferenceStyle),
    cashBuffer: base.cashBuffer ?? cashBufferFromPosture(posture.cashBufferPosture),
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

export function professionalHelpForAction(actionType: MitigationActionType) {
  const qualifiedProfessionalActions = new Set<MitigationActionType>([
    MitigationActionType.AUTO_SHUTOFF_VALVE,
    MitigationActionType.ROOF_INSPECTION_OR_REPAIR,
    MitigationActionType.TREE_TRIMMING,
    MitigationActionType.WIND_HAIL_HARDENING,
    MitigationActionType.ELECTRICAL_PANEL_INSPECTION,
  ]);
  const professionalRecommendedActions = new Set<MitigationActionType>([
    MitigationActionType.SUMP_PUMP_OR_BACKUP,
    MitigationActionType.WATER_HEATER_REPLACEMENT,
  ]);
  if (qualifiedProfessionalActions.has(actionType)) return 'QUALIFIED_PROFESSIONAL_REQUIRED' as const;
  if (professionalRecommendedActions.has(actionType)) return 'PROFESSIONAL_RECOMMENDED' as const;
  return 'DIY_ALLOWED' as const;
}

export function mitigationHandoff(
  propertyId: string,
  actionType: MitigationActionType,
  title: string
) {
  const helpLevel = professionalHelpForAction(actionType);
  if (helpLevel === 'QUALIFIED_PROFESSIONAL_REQUIRED' || helpLevel === 'PROFESSIONAL_RECOMMENDED') {
    return {
      professionalHelpLevel: helpLevel,
      handoff: {
        kind: 'PROVIDER',
        label:
          helpLevel === 'QUALIFIED_PROFESSIONAL_REQUIRED'
            ? 'Find qualified professional help'
            : 'Review professional help',
        href: `/dashboard/providers?propertyId=${encodeURIComponent(propertyId)}&serviceLabel=${encodeURIComponent(title)}`,
        safetyNote:
          helpLevel === 'QUALIFIED_PROFESSIONAL_REQUIRED'
            ? 'Use a properly qualified professional; do not treat this as a DIY task.'
            : 'Check permit, licensing, and safety requirements before starting.',
      },
    };
  }
  return {
    professionalHelpLevel: helpLevel,
    handoff: {
      kind: 'DIY',
      label: 'Review DIY safety steps',
      href: `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/diy`,
      safetyNote: 'Stop and use qualified help if the task exceeds your skills or involves regulated work.',
    },
  };
}

export class RiskPremiumOptimizerService {
  private preferenceProfileService = new PreferenceProfileService();
  private assumptionSetService = new AssumptionSetService();

  async getLatest(propertyId: string, userId: string) {
    await assertPropertyForUser(propertyId, userId);
    const protectionContext = await getProtectionContextDecisions(propertyId, userId, 'RISK_PREMIUM_OPTIMIZER');

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

    const generatedContextVersion = generatedContextVersionFromSnapshot(latest.inputsSnapshot);
    const isContextStale = generatedContextVersion !== protectionContext.contextVersion;
    const dto = mapAnalysisToDto(latest);

    return {
      exists: true as const,
      analysis: {
        ...dto,
        status: isContextStale ? 'STALE' as const : dto.status,
        propertyContext: {
          propertyId,
          contextVersion: protectionContext.contextVersion,
          generatedContextVersion,
          isStale: isContextStale,
          decision: protectionContext.decisions.riskPremiumOptimizer,
        },
      },
    };
  }

  async run(
    propertyId: string,
    userId: string,
    overrides?: RiskPremiumOptimizerOverrides,
    options?: RiskPremiumRunOptions
  ) {
    const protectionContext = await getProtectionContextDecisions(propertyId, userId, 'RISK_PREMIUM_OPTIMIZER');
    const posture = await this.preferenceProfileService.resolvePostureDefaults(propertyId);
    let assumptionSetId: string | null = null;
    let assumptionOverrides: RiskPremiumOptimizerOverrides = {};

    if (options?.assumptionSetId) {
      const existingSet = await this.assumptionSetService.getById(propertyId, options.assumptionSetId);
      if (!existingSet) {
        throw new Error('Assumption set not found for this property.');
      }
      assumptionSetId = existingSet.id;
      assumptionOverrides = parseRiskPremiumOverrides(extractAssumptionOverrides(existingSet.assumptionsJson));
    }

    const mergedOverrides = {
      ...assumptionOverrides,
      ...(overrides ?? {}),
    };
    const effectiveOverrides = applyPreferenceDefaults(mergedOverrides, posture);

    if (
      protectionContext.decisions.riskPremiumOptimizer.status !== 'APPLICABLE' &&
      effectiveOverrides.annualPremium === undefined
    ) {
      throw Object.assign(
        new Error('Add an active property insurance policy or enter an annual premium scenario before running the optimizer.'),
        {
          statusCode: 409,
          code: 'ACTIVE_POLICY_OR_PREMIUM_REQUIRED',
          details: { decision: protectionContext.decisions.riskPremiumOptimizer },
        },
      );
    }

    if (hasAssumptionOverrides(overrides)) {
      const createdSet = await this.assumptionSetService.create({
        propertyId,
        toolKey: 'RISK_PREMIUM_OPTIMIZER',
        scenarioKey: null,
        preferenceProfileId: posture.preferenceProfileId,
        assumptionsJson: {
          version: 1,
          overrides: effectiveOverrides,
          parentAssumptionSetId: assumptionSetId,
        },
        createdByUserId: userId,
      });
      assumptionSetId = createdSet.id;
    }

    const property = await assertPropertyForUser(propertyId, userId);
    const coverageReview = await getOrCreateCoverageReview(propertyId, userId, {
      triggerType: 'LOSS_PREVENTION_PLAN',
    });
    const now = new Date();
    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 36);

    const [policies, claims, inventoryItems, propertyDocuments, sharedSignalLookup, latestAnalysis] = await Promise.all([
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
      signalService.getLatestSignalsByKeyWithFreshFallback(
        propertyId,
        ['MAINT_ADHERENCE', 'RISK_ACCUMULATION'],
        {
          freshOnly: true,
          refreshIfStale: true,
          refreshReason: 'risk-premium-optimizer',
        }
      ),
      prisma.riskPremiumOptimizationAnalysis.findFirst({
        where: { propertyId },
        include: { planItems: true },
        orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);
    const sharedSignals = sharedSignalLookup.signals;
    if (sharedSignalLookup.fallbackUsed) {
      logSharedDataEvent({
        event: 'risk_premium.signal_fallback_used',
        level: 'INFO',
        propertyId,
        toolKey: 'RISK_PREMIUM_OPTIMIZER',
        fallbackPath: 'signal-refresh',
        metadata: {
          refreshedSignals: sharedSignalLookup.refreshSummary?.refreshedSignals ?? [],
          skippedSignals: sharedSignalLookup.refreshSummary?.skippedSignals ?? [],
        },
      });
    }

    const activePolicy =
      policies.find(
        (policy) =>
          policy.startDate != null &&
          policy.expiryDate != null &&
          policy.startDate <= now &&
          policy.expiryDate > now
      ) ?? null;

    const annualPremium =
      effectiveOverrides.annualPremium ?? (activePolicy ? asNumber(activePolicy.premiumAmount) : undefined);
    const deductibleAmount =
      effectiveOverrides.deductibleAmount ?? (activePolicy ? asNumber(activePolicy.deductibleAmount) : undefined);

    const inferredCashBuffer = (() => {
      const totalBudget = asNumber(property.homeownerProfile.totalBudget);
      const spentAmount = asNumber(property.homeownerProfile.spentAmount) ?? 0;
      if (totalBudget === undefined) return undefined;
      const available = Math.max(0, totalBudget - spentAmount);
      return Number.isFinite(available) ? available : undefined;
    })();

    const cashBuffer = effectiveOverrides.cashBuffer ?? inferredCashBuffer;
    const riskTolerance: RiskTolerance = effectiveOverrides.riskTolerance ?? 'MEDIUM';
    const assumedMitigations = new Set(
      (effectiveOverrides.assumeNewMitigations ?? []).map((value) => String(value).toUpperCase())
    );

    const riskScore = property.riskReport?.riskScore ?? null;
    const state = String(property.state || '').toUpperCase();
    const maintenanceAdherenceScore = sharedSignals.MAINT_ADHERENCE
      ? extractSignalNumber(sharedSignals.MAINT_ADHERENCE, 'adherencePercent')
      : null;
    const maintenanceAdherencePercent = toPercent(maintenanceAdherenceScore);
    const riskAccumulationScore = sharedSignals.RISK_ACCUMULATION
      ? extractSignalNumber(sharedSignals.RISK_ACCUMULATION, 'accumulationScore')
      : null;
    const sharedSignalsUsed = (Object.keys(sharedSignals) as SharedSignalKey[]).filter(
      (signalKey) => Boolean(sharedSignals[signalKey])
    );
    const signalInteractionContext = await signalService
      .getSignalInteractionContext(propertyId, {
        freshOnly: true,
        cashBufferAmount: cashBuffer ?? null,
      })
      .catch((error) => {
        logSharedDataEvent({
          event: 'risk_premium.signal_interaction_context_fallback',
          level: 'WARN',
          propertyId,
          toolKey: 'RISK_PREMIUM_OPTIMIZER',
          fallbackPath: 'empty-signal-interaction-context',
          error,
        });
        return {
          signals: {},
          interactions: [],
          staleSignals: [],
        };
      });

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
        detail: `Current risk score is ${riskScore.toFixed(0)}. Review the underlying property risks before choosing work.`,
        severity: 'HIGH',
        relatedPerils: ['OTHER'],
      });
    } else if (riskScore !== null && riskScore < 65) {
      pushDriver({
        code: 'RISK_SCORE_MODERATE',
        title: 'Property risk score is moderate',
        detail: `Current risk score is ${riskScore.toFixed(0)}. Loss-prevention work may reduce specific exposures.`,
        severity: 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }


    if (maintenanceAdherencePercent !== null && maintenanceAdherencePercent < 70) {
      pushDriver({
        code: 'MAINTENANCE_ADHERENCE_LOW',
        title: 'Maintenance adherence signal is below target',
        detail: `Shared maintenance adherence is ${Math.round(maintenanceAdherencePercent)}%, which can increase preventable loss frequency.`,
        severity: maintenanceAdherencePercent < 50 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (riskAccumulationScore !== null && riskAccumulationScore >= 0.58) {
      pushDriver({
        code: 'RISK_ACCUMULATION_PATTERN',
        title: 'Maintenance deferral pattern is accumulating risk',
        detail: `Pattern signal indicates accumulated deferred-risk pressure (${Math.round(riskAccumulationScore * 100)}).`,
        severity: riskAccumulationScore >= 0.78 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (signalInteractionContext.interactions.length > 0) {
      const interaction = signalInteractionContext.interactions[0];
      pushDriver({
        code: `INTERACTION_${interaction.code}`,
        title: interaction.title,
        detail: interaction.reasons.join(' '),
        severity:
          interaction.strength >= 0.78 ? 'HIGH' :
          interaction.strength >= 0.55 ? 'MEDIUM' : 'LOW',
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
        title: 'Water damage exposure deserves prevention work',
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
        title: 'Fire and electrical exposure deserves review',
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
        title: 'Security posture may affect theft exposure',
        detail:
          claimsByPeril.THEFT > 0
            ? 'Recent theft/vandalism claim activity detected for this property.'
            : 'No active security system signal found on the property profile.',
        severity: claimsByPeril.THEFT > 0 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['THEFT'],
      });
    }

    const claimsCount = claims.length;
    if (claimsCount >= 2) {
      pushDriver({
        code: 'CLAIMS_FREQUENCY',
        title: 'Recent claim frequency identifies recurring exposure',
        detail: `${claimsCount} claim records found in the last 36 months.`,
        severity: claimsCount >= 4 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (!hasRoofInspectionDoc || !hasMitigationReceipt) {
      pushDriver({
        code: 'DOCUMENTATION_GAPS',
        title: 'Mitigation documentation is limited',
        detail: 'Add inspection or completion evidence before asking a carrier to review eligibility.',
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
          whyThisMatters: 'Early leak detection can reduce the duration and severity of a water loss.',
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
          whyThisMatters: 'Shutoff controls can reduce exposure to a long-running water loss.',
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
          whyThisMatters: 'Working smoke and carbon-monoxide detection is a life-safety control.',
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
        whyThisMatters: 'Security controls can reduce theft exposure.',
        actionType: MitigationActionType.SECURITY_SYSTEM,
      });
    }

    const maintenanceAdherenceDriver = getDriverSeverity('MAINTENANCE_ADHERENCE_LOW');
    if (maintenanceAdherenceDriver) {
      pushRecommendation({
        code: 'MAINTENANCE_ADHERENCE_RECOVERY',
        title: 'Recover maintenance adherence before renewal',
        detail: 'Complete overdue maintenance actions and capture evidence before policy shopping or renewal modeling.',
        type: 'MITIGATE',
        priority: maintenanceAdherenceDriver,
        targetPeril: 'OTHER',
        estimatedCost: 80,
        whyThisMatters: 'Sustained maintenance completion can reduce repeat incidents.',
        actionType: MitigationActionType.REVIEW_DISCOUNTS,
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
        whyThisMatters: 'Document quality helps a carrier or licensed professional review completed work.',
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
      return a.code.localeCompare(b.code);
    });

    const responsibilityByAction: Partial<Record<MitigationActionType, FeatureDecision>> = {
      [MitigationActionType.LEAK_SENSORS]: protectionContext.decisions.plumbingActions,
      [MitigationActionType.AUTO_SHUTOFF_VALVE]: protectionContext.decisions.plumbingActions,
      [MitigationActionType.SUMP_PUMP_OR_BACKUP]: protectionContext.decisions.plumbingActions,
      [MitigationActionType.WATER_HEATER_REPLACEMENT]: protectionContext.decisions.plumbingActions,
      [MitigationActionType.ROOF_INSPECTION_OR_REPAIR]: protectionContext.decisions.roofActions,
      [MitigationActionType.TREE_TRIMMING]: protectionContext.decisions.exteriorActions,
      [MitigationActionType.WIND_HAIL_HARDENING]: protectionContext.decisions.exteriorActions,
      [MitigationActionType.SMOKE_CO_DETECTORS]: protectionContext.decisions.commonSafetyActions,
      [MitigationActionType.ELECTRICAL_PANEL_INSPECTION]: protectionContext.decisions.commonSafetyActions,
      [MitigationActionType.SECURITY_SYSTEM]: protectionContext.decisions.commonSafetyActions,
    };
    const contextualRecommendations = sortedRecommendations.filter((recommendation) => (
      recommendation.type !== 'POLICY_LEVER' &&
      responsibilityByAction[recommendation.actionType]?.status !== 'NOT_APPLICABLE'
    ));

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

    const completedMitigations =
      latestAnalysis?.planItems.filter((item) => item.status === MitigationPlanStatus.COMPLETED) ?? [];
    const baselineAnnualPremium = latestAnalysis
      ? inferInputSnapshot(latestAnalysis.inputsSnapshot).annualPremium ?? null
      : null;
    const currentAnnualPremium = annualPremium ?? null;
    const observedPremiumDelta =
      baselineAnnualPremium !== null && currentAnnualPremium !== null
        ? Math.round((currentAnnualPremium - baselineAnnualPremium) * 100) / 100
        : null;
    const observedDirection: MitigationVerificationDirection =
      observedPremiumDelta === null
        ? 'UNKNOWN'
        : observedPremiumDelta < -1
          ? 'DECREASED'
          : observedPremiumDelta > 1
            ? 'INCREASED'
            : 'UNCHANGED';
    const observedPremiumComparison: RiskPremiumOptimizationDTO['observedPremiumComparison'] | undefined =
      completedMitigations.length > 0
        ? {
            hasCompletedMitigations: true,
            completedCount: completedMitigations.length,
            baselineComputedAt: latestAnalysis?.computedAt.toISOString() ?? null,
            baselineAnnualPremium,
            currentAnnualPremium,
            observedPremiumDelta,
            observedDirection,
            note:
              observedPremiumDelta !== null
                ? `Observed annual premium difference between recorded runs: $${Math.abs(observedPremiumDelta).toFixed(0)} (${observedDirection.toLowerCase()}). This is observational and does not establish that mitigation caused the change.`
                : 'Completed loss-prevention items were found, but no premium comparison is available. A later observed change would not establish causality.',
          }
        : undefined;

    const topRecommendation = contextualRecommendations[0];
    const summaryParts: string[] = [];
    if (topRecommendation) {
      summaryParts.push(`Top lever: ${topRecommendation.title.toLowerCase()}.`);
    }
    if (observedPremiumComparison) {
      summaryParts.push(observedPremiumComparison.note);
    }
    summaryParts.push('Carrier discount eligibility is unknown unless supported by named carrier evidence.');
    const summary = summaryParts.join(' ');

    const persistedRecommendations = contextualRecommendations.map(({ actionType: _actionType, ...rest }) => rest);
    const planItemInputs = contextualRecommendations
      .filter((recommendation) => recommendation.type === 'MITIGATE')
      .slice(0, 7);

    const created = await prisma.$transaction(async (tx) => {
      const analysis = await tx.riskPremiumOptimizationAnalysis.create({
        data: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId,
          assumptionSetId: assumptionSetId ?? null,
          coverageReviewId: coverageReview.id,
          status: RiskPremiumOptimizationStatus.READY,
          confidence,
          summary,
          inputsSnapshot: {
            version: 1,
            inputs: {
              annualPremium: annualPremium ?? null,
              deductibleAmount: deductibleAmount ?? null,
              cashBuffer: cashBuffer ?? null,
              riskTolerance,
              policyId: activePolicy?.id ?? null,
              assumeNewMitigations: Array.from(assumedMitigations.values()),
              preferenceProfileId: posture.preferenceProfileId,
              assumptionSetId,
            },
            signals: {
              riskScore,
              claimsCount,
              inventoryCount: inventoryItems.length,
              hasRoofInspectionDoc,
              hasMitigationReceipt,
              claimsByPeril,
              maintenanceAdherencePercent,
            },
            sharedSignalsUsed,
            observedPremiumComparison: observedPremiumComparison ?? null,
            propertyContext: {
              propertyId,
              contextVersion: protectionContext.contextVersion,
            },
          },
          premiumDrivers: drivers.slice(0, 6),
          recommendations: persistedRecommendations.slice(0, 8),
        },
      });

      if (planItemInputs.length > 0) {
        await tx.riskMitigationPlanItem.createMany({
          data: planItemInputs.map((recommendation) => {
            const help = mitigationHandoff(propertyId, recommendation.actionType, recommendation.title);
            return {
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
              carrierBenefitStatus: 'UNKNOWN',
              carrierReviewQuestion:
                `Ask your carrier whether documented ${recommendation.title.toLowerCase()} affects eligibility or a policy-specific discount.`,
              professionalHelpLevel: help.professionalHelpLevel,
              handoffJson: help.handoff,
            };
          }),
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

    return {
      ...mapAnalysisToDto(created),
      propertyContext: {
        propertyId,
        contextVersion: protectionContext.contextVersion,
        generatedContextVersion: protectionContext.contextVersion,
        isStale: false,
        decision: effectiveOverrides.annualPremium !== undefined
          ? {
              ...protectionContext.decisions.riskPremiumOptimizer,
              status: 'APPLICABLE' as const,
              reasonCodes: ['SCENARIO_PREMIUM_OVERRIDE'],
            }
          : protectionContext.decisions.riskPremiumOptimizer,
      },
    };
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
        completedAt: true,
        evidenceDocumentId: true,
        linkedHomeEventId: true,
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
      input.status === MitigationPlanStatus.COMPLETED &&
      existing.status !== MitigationPlanStatus.COMPLETED &&
      input.completedAt === undefined;
    const shouldClearCompletedAt =
      input.completedAt === undefined &&
      input.status !== undefined &&
      input.status !== MitigationPlanStatus.COMPLETED;

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
              : shouldClearCompletedAt
                ? null
                : undefined,
        evidenceDocumentId:
          input.evidenceDocumentId !== undefined ? input.evidenceDocumentId || null : undefined,
        linkedHomeEventId:
          input.linkedHomeEventId !== undefined ? input.linkedHomeEventId || null : undefined,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'risk_mitigation_plan_item_updated',
        entityType: 'RiskMitigationPlanItem',
        entityId: planItemId,
        oldValues: {
          status: existing.status,
          completedAt: existing.completedAt?.toISOString() ?? null,
          evidenceDocumentId: existing.evidenceDocumentId,
          linkedHomeEventId: existing.linkedHomeEventId,
        },
        newValues: {
          status: planItem.status,
          completedAt: planItem.completedAt?.toISOString() ?? null,
          evidenceDocumentId: planItem.evidenceDocumentId,
          linkedHomeEventId: planItem.linkedHomeEventId,
        },
      },
    });

    if (
      existing.status !== nextStatus &&
      (
        nextStatus === MitigationPlanStatus.COMPLETED ||
        nextStatus === MitigationPlanStatus.SKIPPED ||
        nextStatus === MitigationPlanStatus.RESTORED
      )
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
