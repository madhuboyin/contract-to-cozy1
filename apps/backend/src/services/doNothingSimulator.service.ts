import {
  ClaimType,
  DoNothingIncidentLikelihood,
  DoNothingScenario,
  DoNothingSimulationConfidence,
  DoNothingSimulationRun,
  DoNothingSimulationStatus,
  MaintenanceTaskPriority,
  MaintenanceTaskStatus,
  Prisma,
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

type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
type DeductibleStrategy = 'KEEP_HIGH' | 'RAISE' | 'LOWER' | 'UNCHANGED';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type Impact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

type Peril = 'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER';

export type DoNothingInputOverrides = {
  skipMaintenance?: boolean;
  skipWarranty?: boolean;
  deductibleStrategy?: DeductibleStrategy;
  cashBufferCents?: number;
  ignoreTopRisks?: string[];
  riskTolerance?: RiskTolerance;
};

export type CreateDoNothingScenarioInput = {
  name: string;
  horizonMonths: number;
  inputOverrides?: DoNothingInputOverrides;
};

export type UpdateDoNothingScenarioInput = {
  name?: string;
  horizonMonths?: number;
  inputOverrides?: DoNothingInputOverrides;
};

export type RunDoNothingSimulationInput = {
  scenarioId?: string;
  assumptionSetId?: string;
  horizonMonths: number;
  inputOverrides?: DoNothingInputOverrides;
};

export type DoNothingScenarioDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  name: string;
  horizonMonths: number;
  inputOverrides: DoNothingInputOverrides;
  createdAt: string;
  updatedAt: string;
};

export type DoNothingRunDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  assumptionSetId?: string | null;
  preferenceProfileId?: string | null;
  sharedSignalsUsed?: string[];
  scenarioId?: string | null;

  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  horizonMonths: number;

  summary?: string;

  riskScoreDelta?: number | null;
  expectedCostDeltaCentsMin?: number | null;
  expectedCostDeltaCentsMax?: number | null;
  incidentLikelihood?: 'LOW' | 'MEDIUM' | 'HIGH' | null;

  outputs: {
    topRiskDrivers: Array<{ code: string; title: string; detail: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }>;
    topCostDrivers: Array<{ code: string; title: string; detail: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }>;
    biggestAvoidableLosses: Array<{
      title: string;
      detail: string;
      estCostCentsMin?: number;
      estCostCentsMax?: number;
    }>;
  };

  nextSteps: Array<{ title: string; detail?: string; priority: 'LOW' | 'MEDIUM' | 'HIGH' }>;
  decisionTrace: Array<{ label: string; detail?: string; impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' }>;

  computedAt: string;
};

type Driver = { code: string; title: string; detail: string; severity: Severity; relatedPerils?: Peril[] };

type AvoidableLoss = {
  title: string;
  detail: string;
  estCostCentsMin?: number;
  estCostCentsMax?: number;
};

type NextStep = { title: string; detail?: string; priority: Severity };
type DecisionTrace = { label: string; detail?: string; impact: Impact };

const HORIZON_CHOICES = new Set([6, 12, 24, 36]);

const CATEGORY_LIFESPAN_YEARS: Record<string, number> = {
  HVAC: 15,
  PLUMBING: 12,
  APPLIANCE: 11,
  ELECTRICAL: 16,
  ROOF_EXTERIOR: 24,
  SAFETY: 8,
  SMART_HOME: 8,
  FURNITURE: 12,
  ELECTRONICS: 8,
  OTHER: 10,
};

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ageYearsFromDate(date?: Date | null): number | null {
  if (!date) return null;
  const years = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (!Number.isFinite(years) || years < 0) return null;
  return years;
}

function severityWeight(severity: Severity): number {
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function normalizeHorizon(horizonMonths: number): number {
  const normalized = Number(horizonMonths);
  if (!Number.isInteger(normalized) || !HORIZON_CHOICES.has(normalized)) {
    throw new Error('horizonMonths must be one of: 6, 12, 24, 36.');
  }
  return normalized;
}

function normalizeOverrides(value: unknown): DoNothingInputOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const obj = value as Record<string, unknown>;
  const deductibleStrategy = String(obj.deductibleStrategy || '').toUpperCase();
  const normalizedDeductible: DeductibleStrategy | undefined =
    deductibleStrategy === 'KEEP_HIGH' ||
    deductibleStrategy === 'RAISE' ||
    deductibleStrategy === 'LOWER' ||
    deductibleStrategy === 'UNCHANGED'
      ? (deductibleStrategy as DeductibleStrategy)
      : undefined;

  const riskTolerance = String(obj.riskTolerance || '').toUpperCase();
  const normalizedTolerance: RiskTolerance | undefined =
    riskTolerance === 'LOW' || riskTolerance === 'MEDIUM' || riskTolerance === 'HIGH'
      ? (riskTolerance as RiskTolerance)
      : undefined;

  const cashBufferCents = Number(obj.cashBufferCents);
  const ignoreTopRisks = Array.isArray(obj.ignoreTopRisks)
    ? obj.ignoreTopRisks.map((entry) => String(entry).toUpperCase()).filter(Boolean)
    : undefined;

  return {
    skipMaintenance: obj.skipMaintenance === true,
    skipWarranty: obj.skipWarranty === true,
    deductibleStrategy: normalizedDeductible,
    cashBufferCents: Number.isFinite(cashBufferCents) && cashBufferCents >= 0 ? Math.round(cashBufferCents) : undefined,
    ignoreTopRisks,
    riskTolerance: normalizedTolerance,
  };
}

function mergeOverrides(
  scenarioOverrides?: DoNothingInputOverrides,
  requestOverrides?: DoNothingInputOverrides
): Required<Pick<DoNothingInputOverrides, 'skipMaintenance' | 'skipWarranty' | 'deductibleStrategy'>> &
  Omit<DoNothingInputOverrides, 'skipMaintenance' | 'skipWarranty' | 'deductibleStrategy'> {
  const merged = {
    ...(scenarioOverrides ?? {}),
    ...(requestOverrides ?? {}),
  };

  return {
    skipMaintenance: Boolean(merged.skipMaintenance),
    skipWarranty: Boolean(merged.skipWarranty),
    deductibleStrategy: merged.deductibleStrategy ?? 'UNCHANGED',
    cashBufferCents: merged.cashBufferCents,
    ignoreTopRisks: merged.ignoreTopRisks ?? [],
    riskTolerance: merged.riskTolerance,
  };
}

function deductibleStrategyFromPreference(
  style: PreferencePostureDefaults['deductiblePreferenceStyle']
): DeductibleStrategy | undefined {
  if (style === 'LOW_DEDUCTIBLE') return 'LOWER';
  if (style === 'HIGH_DEDUCTIBLE') return 'RAISE';
  if (style === 'BALANCED') return 'UNCHANGED';
  return undefined;
}

function cashBufferCentsFromPosture(posture: PreferencePostureDefaults['cashBufferPosture']): number | undefined {
  if (posture === 'TIGHT') return 150000;
  if (posture === 'MODERATE') return 600000;
  if (posture === 'STRONG') return 1800000;
  return undefined;
}

function riskToleranceFromPosture(
  posture: PreferencePostureDefaults['riskTolerance']
): RiskTolerance | undefined {
  if (posture === 'LOW' || posture === 'MEDIUM' || posture === 'HIGH') {
    return posture;
  }
  return undefined;
}

function applyPreferenceDefaults(
  overrides: DoNothingInputOverrides | undefined,
  posture: PreferencePostureDefaults
): DoNothingInputOverrides {
  const base = overrides ?? {};
  return {
    ...base,
    deductibleStrategy:
      base.deductibleStrategy ?? deductibleStrategyFromPreference(posture.deductiblePreferenceStyle),
    cashBufferCents: base.cashBufferCents ?? cashBufferCentsFromPosture(posture.cashBufferPosture),
    riskTolerance: base.riskTolerance ?? riskToleranceFromPosture(posture.riskTolerance),
  };
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

function mapScenarioToDto(scenario: DoNothingScenario): DoNothingScenarioDTO {
  return {
    id: scenario.id,
    propertyId: scenario.propertyId,
    homeownerProfileId: scenario.homeownerProfileId,
    name: scenario.name,
    horizonMonths: scenario.horizonMonths,
    inputOverrides: normalizeOverrides(scenario.inputOverrides),
    createdAt: scenario.createdAt.toISOString(),
    updatedAt: scenario.updatedAt.toISOString(),
  };
}

function parseOutputsSnapshot(value: Prisma.JsonValue | null | undefined): DoNothingRunDTO['outputs'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      topRiskDrivers: [],
      topCostDrivers: [],
      biggestAvoidableLosses: [],
    };
  }

  const root = value as Record<string, unknown>;
  return {
    topRiskDrivers: safeArray<Driver>(root.topRiskDrivers as Prisma.JsonValue),
    topCostDrivers: safeArray<Driver>(root.topCostDrivers as Prisma.JsonValue),
    biggestAvoidableLosses: safeArray<AvoidableLoss>(root.biggestAvoidableLosses as Prisma.JsonValue),
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
  const sharedSignalsUsed = Array.isArray(root.sharedSignalsUsed)
    ? root.sharedSignalsUsed.map((entry) => String(entry))
    : [];

  return {
    preferenceProfileId:
      typeof root.preferenceProfileId === 'string' ? root.preferenceProfileId : null,
    sharedSignalsUsed,
  };
}

function extractSignalNumber(
  signal: { valueNumber: number | null; valueJson: Prisma.JsonValue | null },
  jsonField?: string
): number | null {
  if (signal.valueNumber !== null && Number.isFinite(signal.valueNumber)) {
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

function mapRunToDto(run: DoNothingSimulationRun): DoNothingRunDTO {
  const sharedMeta = parseSharedMetaFromSnapshot(run.inputsSnapshot);
  return {
    id: run.id,
    propertyId: run.propertyId,
    homeownerProfileId: run.homeownerProfileId,
    assumptionSetId: run.assumptionSetId ?? null,
    preferenceProfileId: sharedMeta.preferenceProfileId,
    sharedSignalsUsed: sharedMeta.sharedSignalsUsed,
    scenarioId: run.scenarioId ?? null,
    status: run.status,
    confidence: run.confidence,
    horizonMonths: run.horizonMonths,
    summary: run.summary ?? undefined,
    riskScoreDelta: run.riskScoreDelta ?? null,
    expectedCostDeltaCentsMin: run.expectedCostDeltaCentsMin ?? null,
    expectedCostDeltaCentsMax: run.expectedCostDeltaCentsMax ?? null,
    incidentLikelihood: run.incidentLikelihood ?? null,
    outputs: parseOutputsSnapshot(run.outputsSnapshot),
    nextSteps: safeArray<NextStep>(run.nextSteps),
    decisionTrace: safeArray<DecisionTrace>(run.decisionTrace),
    computedAt: run.computedAt.toISOString(),
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
      zipCode: true,
      yearBuilt: true,
      hasDrainageIssues: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      hasSecuritySystem: true,
      riskReport: {
        select: {
          riskScore: true,
          details: true,
          lastCalculatedAt: true,
        },
      },
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

async function assertScenarioForProperty(propertyId: string, homeownerProfileId: string, scenarioId: string) {
  const scenario = await prisma.doNothingScenario.findFirst({
    where: {
      id: scenarioId,
      propertyId,
      homeownerProfileId,
    },
  });

  if (!scenario) {
    throw new Error('Scenario not found for this property.');
  }

  return scenario;
}

function dedupeByCode<T extends { code: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    out.push(item);
  }
  return out;
}

function dedupeSteps(steps: NextStep[]): NextStep[] {
  const seen = new Set<string>();
  const out: NextStep[] = [];
  for (const step of steps) {
    const key = `${step.title}-${step.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step);
  }
  return out;
}

export class DoNothingSimulatorService {
  private preferenceProfileService = new PreferenceProfileService();
  private assumptionSetService = new AssumptionSetService();

  async listScenarios(propertyId: string, userId: string) {
    const property = await assertPropertyForUser(propertyId, userId);

    const scenarios = await prisma.doNothingScenario.findMany({
      where: {
        propertyId,
        homeownerProfileId: property.homeownerProfileId,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return { scenarios: scenarios.map(mapScenarioToDto) };
  }

  async createScenario(propertyId: string, userId: string, input: CreateDoNothingScenarioInput) {
    const property = await assertPropertyForUser(propertyId, userId);
    const scenarioName = input.name.trim();
    if (!scenarioName) {
      throw new Error('Scenario name is required.');
    }

    const scenario = await prisma.doNothingScenario.create({
      data: {
        homeownerProfileId: property.homeownerProfileId,
        propertyId,
        name: scenarioName,
        horizonMonths: normalizeHorizon(input.horizonMonths),
        inputOverrides: normalizeOverrides(input.inputOverrides),
      },
    });

    return { scenario: mapScenarioToDto(scenario) };
  }

  async updateScenario(
    propertyId: string,
    scenarioId: string,
    userId: string,
    input: UpdateDoNothingScenarioInput
  ) {
    const property = await assertPropertyForUser(propertyId, userId);
    const existing = await assertScenarioForProperty(propertyId, property.homeownerProfileId, scenarioId);

    const data: Prisma.DoNothingScenarioUpdateInput = {};
    if (input.name !== undefined) {
      const scenarioName = input.name.trim();
      if (!scenarioName) {
        throw new Error('Scenario name is required.');
      }
      data.name = scenarioName;
    }
    if (input.horizonMonths !== undefined) {
      data.horizonMonths = normalizeHorizon(input.horizonMonths);
    }
    if (input.inputOverrides !== undefined) {
      data.inputOverrides = normalizeOverrides(input.inputOverrides);
    }

    if (Object.keys(data).length === 0) {
      return { scenario: mapScenarioToDto(existing) };
    }

    const scenario = await prisma.doNothingScenario.update({
      where: { id: scenarioId },
      data,
    });

    return { scenario: mapScenarioToDto(scenario) };
  }

  async deleteScenario(propertyId: string, scenarioId: string, userId: string) {
    const property = await assertPropertyForUser(propertyId, userId);
    await assertScenarioForProperty(propertyId, property.homeownerProfileId, scenarioId);

    await prisma.doNothingScenario.delete({
      where: { id: scenarioId },
    });

    return { success: true as const };
  }

  async getLatestRun(
    propertyId: string,
    userId: string,
    params?: { scenarioId?: string; horizonMonths?: number }
  ) {
    const property = await assertPropertyForUser(propertyId, userId);

    if (params?.scenarioId) {
      await assertScenarioForProperty(propertyId, property.homeownerProfileId, params.scenarioId);
    }

    const latest = await prisma.doNothingSimulationRun.findFirst({
      where: {
        propertyId,
        ...(params?.scenarioId ? { scenarioId: params.scenarioId } : {}),
        ...(params?.horizonMonths ? { horizonMonths: normalizeHorizon(params.horizonMonths) } : {}),
      },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latest) {
      return { exists: false as const };
    }

    return {
      exists: true as const,
      run: mapRunToDto(latest),
    };
  }

  async run(propertyId: string, userId: string, input: RunDoNothingSimulationInput) {
    const property = await assertPropertyForUser(propertyId, userId);
    const horizonMonths = normalizeHorizon(input.horizonMonths);
    const posture = await this.preferenceProfileService.resolvePostureDefaults(propertyId);
    let assumptionSetId: string | null = null;
    let assumptionOverrides: DoNothingInputOverrides = {};

    if (input.assumptionSetId) {
      const existingSet = await this.assumptionSetService.getById(propertyId, input.assumptionSetId);
      if (!existingSet) {
        throw new Error('Assumption set not found for this property.');
      }
      assumptionSetId = existingSet.id;
      assumptionOverrides = normalizeOverrides(extractAssumptionOverrides(existingSet.assumptionsJson));
    }

    let scenario: DoNothingScenario | null = null;
    if (input.scenarioId) {
      scenario = await assertScenarioForProperty(propertyId, property.homeownerProfileId, input.scenarioId);
    }

    const scenarioOverrides = scenario ? normalizeOverrides(scenario.inputOverrides) : {};
    const requestOverrides = normalizeOverrides(input.inputOverrides);
    const mergedRawOverrides = {
      ...scenarioOverrides,
      ...assumptionOverrides,
      ...requestOverrides,
    };
    const preferenceAdjusted = applyPreferenceDefaults(mergedRawOverrides, posture);
    const mergedOverrides = mergeOverrides(undefined, preferenceAdjusted);

    if (hasAssumptionOverrides(requestOverrides as Record<string, unknown>)) {
      const createdSet = await this.assumptionSetService.create({
        propertyId,
        toolKey: 'DO_NOTHING_SIMULATOR',
        scenarioKey: scenario?.id ?? null,
        preferenceProfileId: posture.preferenceProfileId,
        assumptionsJson: {
          version: 1,
          horizonMonths,
          overrides: mergedOverrides,
          parentAssumptionSetId: assumptionSetId,
        },
        createdByUserId: userId,
      });
      assumptionSetId = createdSet.id;
    }

    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 36);

    const [inventoryItems, maintenanceTasks, claims, homeEvents, policies, sharedSignalLookup] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: {
          id: true,
          name: true,
          category: true,
          condition: true,
          installedOn: true,
          purchasedOn: true,
          replacementCostCents: true,
          purchaseCostCents: true,
        },
      }),
      prisma.propertyMaintenanceTask.findMany({
        where: { propertyId },
        select: {
          id: true,
          status: true,
          priority: true,
          nextDueDate: true,
          updatedAt: true,
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
          deductibleAmount: true,
        },
      }),
      prisma.homeEvent.findMany({
        where: {
          propertyId,
          occurredAt: { gte: lookback },
        },
        select: {
          id: true,
          type: true,
          title: true,
          subtype: true,
          inventoryItemId: true,
          amount: true,
        },
      }),
      prisma.insurancePolicy.findMany({
        where: { propertyId },
        select: {
          id: true,
          startDate: true,
          expiryDate: true,
          premiumAmount: true,
          deductibleAmount: true,
          coverageJson: true,
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      }),
      signalService.getLatestSignalsByKeyWithFreshFallback(
        propertyId,
        ['COVERAGE_GAP', 'MAINT_ADHERENCE', 'SAVINGS_REALIZATION', 'RISK_ACCUMULATION', 'FINANCIAL_DISCIPLINE'],
        {
          freshOnly: true,
          refreshIfStale: true,
          refreshReason: 'do-nothing-simulator',
        }
      ),
    ]);
    const sharedSignals = sharedSignalLookup.signals;
    if (sharedSignalLookup.fallbackUsed) {
      logSharedDataEvent({
        event: 'do_nothing.signal_fallback_used',
        level: 'INFO',
        propertyId,
        toolKey: 'DO_NOTHING_SIMULATOR',
        fallbackPath: 'signal-refresh',
        metadata: {
          refreshedSignals: sharedSignalLookup.refreshSummary?.refreshedSignals ?? [],
          skippedSignals: sharedSignalLookup.refreshSummary?.skippedSignals ?? [],
        },
      });
    }

    const now = new Date();
    const activePolicy =
      policies.find((policy) => policy.startDate <= now && policy.expiryDate >= now) ?? policies[0] ?? null;

    const annualPremiumDollars = asNumber(activePolicy?.premiumAmount);
    const deductibleDollars = asNumber(activePolicy?.deductibleAmount);
    const deductibleCentsBase = deductibleDollars !== undefined ? Math.round(deductibleDollars * 100) : undefined;
    const coverageGapCount = sharedSignals.COVERAGE_GAP
      ? extractSignalNumber(sharedSignals.COVERAGE_GAP, 'coverageGapCount')
      : null;
    const maintenanceAdherencePercent = sharedSignals.MAINT_ADHERENCE
      ? toPercent(extractSignalNumber(sharedSignals.MAINT_ADHERENCE, 'adherencePercent'))
      : null;
    const savingsRealizationAnnual = sharedSignals.SAVINGS_REALIZATION
      ? extractSignalNumber(sharedSignals.SAVINGS_REALIZATION, 'estimatedAnnualSavings')
      : null;
    const riskAccumulationScore = sharedSignals.RISK_ACCUMULATION
      ? extractSignalNumber(sharedSignals.RISK_ACCUMULATION, 'accumulationScore')
      : null;
    const financialDisciplineScore = sharedSignals.FINANCIAL_DISCIPLINE
      ? extractSignalNumber(sharedSignals.FINANCIAL_DISCIPLINE, 'disciplineScore')
      : null;
    const sharedSignalsUsed = (Object.keys(sharedSignals) as SharedSignalKey[]).filter(
      (signalKey) => Boolean(sharedSignals[signalKey])
    );
    const signalInteractionContext = await signalService
      .getSignalInteractionContext(propertyId, {
        freshOnly: true,
        cashBufferAmount: (mergedOverrides.cashBufferCents ?? null) !== null && mergedOverrides.cashBufferCents !== undefined
          ? (mergedOverrides.cashBufferCents as number) / 100
          : null,
      })
      .catch((error) => {
        logSharedDataEvent({
          event: 'do_nothing.signal_interaction_context_fallback',
          level: 'WARN',
          propertyId,
          toolKey: 'DO_NOTHING_SIMULATOR',
          fallbackPath: 'empty-signal-interaction-context',
          error,
        });
        return {
          signals: {},
          interactions: [],
          staleSignals: [],
        };
      });

    const openStatuses: MaintenanceTaskStatus[] = [
      MaintenanceTaskStatus.PENDING,
      MaintenanceTaskStatus.IN_PROGRESS,
      MaintenanceTaskStatus.NEEDS_REVIEW,
    ];

    const openTasks = maintenanceTasks.filter((task) => openStatuses.includes(task.status));
    const completedTasks = maintenanceTasks.filter((task) => task.status === MaintenanceTaskStatus.COMPLETED);
    const overdueTasks = openTasks.filter((task) => task.nextDueDate && task.nextDueDate < now);
    const criticalOverdue = overdueTasks.filter(
      (task) => task.priority === MaintenanceTaskPriority.HIGH || task.priority === MaintenanceTaskPriority.URGENT
    );

    const completionRate =
      maintenanceTasks.length > 0 ? completedTasks.length / maintenanceTasks.length : 0;

    const inventoryWithAges = inventoryItems.map((item) => {
      const lifespanYears = CATEGORY_LIFESPAN_YEARS[item.category] ?? CATEGORY_LIFESPAN_YEARS.OTHER;
      const ageYears = ageYearsFromDate(item.installedOn ?? item.purchasedOn);
      const agePct = ageYears !== null ? ageYears / lifespanYears : null;

      return {
        ...item,
        lifespanYears,
        ageYears,
        agePct,
      };
    });

    const nearEolItems = inventoryWithAges.filter((item) => item.agePct !== null && item.agePct >= 0.7);
    const criticalEolItems = inventoryWithAges.filter((item) => item.agePct !== null && item.agePct >= 0.9);

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

    const repairEventCount = homeEvents.filter((event) => {
      const descriptor = `${event.type} ${event.subtype ?? ''} ${event.title ?? ''}`.toUpperCase();
      return (
        descriptor.includes('REPAIR') ||
        descriptor.includes('MAINTEN') ||
        descriptor.includes('INSPECT') ||
        descriptor.includes('REPLACE')
      );
    }).length;

    const waterSystemSignals = inventoryWithAges.filter((item) => {
      const label = `${item.name}`.toLowerCase();
      return (
        item.category === 'PLUMBING' ||
        label.includes('water heater') ||
        label.includes('sump') ||
        label.includes('pipe')
      );
    });

    const highWaterExposure =
      property.hasDrainageIssues || claimsByPeril.WATER >= 1 || waterSystemSignals.some((item) => (item.agePct ?? 0) >= 0.8);

    const roofItems = inventoryWithAges.filter((item) => item.category === 'ROOF_EXTERIOR');
    const roofAging = roofItems.some((item) => (item.agePct ?? 0) >= 0.75);

    const horizonFactor = horizonMonths / 12;

    let riskScoreDelta = 0;

    if (mergedOverrides.skipMaintenance) {
      riskScoreDelta += Math.round((overdueTasks.length * 1.5 + criticalOverdue.length * 2.8 + (1 - completionRate) * 6) * horizonFactor);
    } else {
      riskScoreDelta += Math.round(Math.max(0, overdueTasks.length * 0.4 * Math.max(0.5, horizonFactor - 0.25)));
    }

    riskScoreDelta += Math.round((nearEolItems.length * 1.3 + criticalEolItems.length * 2.4) * Math.max(1, horizonFactor * 0.9));
    riskScoreDelta += Math.round(Math.min(10, claims.length * 1.8 + repairEventCount * 0.35));

    if (coverageGapCount !== null && coverageGapCount > 0) {
      riskScoreDelta += Math.round(Math.min(8, coverageGapCount * Math.max(1, horizonFactor * 0.9)));
    }
    if (maintenanceAdherencePercent !== null) {
      if (maintenanceAdherencePercent < 55) {
        riskScoreDelta += Math.round(Math.min(6, (55 - maintenanceAdherencePercent) / 8));
      } else if (maintenanceAdherencePercent > 80) {
        riskScoreDelta -= 1;
      }
    }

    if (horizonMonths >= 24) {
      riskScoreDelta += 2;
    }
    if (horizonMonths >= 36) {
      riskScoreDelta += 2;
    }

    riskScoreDelta = clamp(riskScoreDelta, 0, 40);

    let deductibleCents = deductibleCentsBase;
    if (deductibleCents !== undefined) {
      if (mergedOverrides.deductibleStrategy === 'RAISE') {
        deductibleCents = Math.round(deductibleCents * 1.3);
      } else if (mergedOverrides.deductibleStrategy === 'LOWER') {
        deductibleCents = Math.round(deductibleCents * 0.8);
      }
    }

    let maintenanceDebtMin = 0;
    let maintenanceDebtMax = 0;
    if (mergedOverrides.skipMaintenance) {
      maintenanceDebtMin = Math.round((overdueTasks.length * 12000 + criticalOverdue.length * 18000) * horizonFactor);
      maintenanceDebtMax = Math.round((overdueTasks.length * 30000 + criticalOverdue.length * 48000) * horizonFactor);
    } else {
      maintenanceDebtMin = Math.round(overdueTasks.length * 3000 * Math.max(1, horizonFactor * 0.65));
      maintenanceDebtMax = Math.round(overdueTasks.length * 9500 * Math.max(1, horizonFactor * 0.8));
    }

    const agingImpactMin = Math.round(
      (nearEolItems.length * 14000 + criticalEolItems.length * 26000) * Math.max(1, horizonFactor * 0.85)
    );
    const agingImpactMax = Math.round(
      (nearEolItems.length * 42000 + criticalEolItems.length * 70000) * Math.max(1, horizonFactor)
    );

    const claimsImpactMin = Math.round(claims.length * 8500 + claimsByPeril.WATER * 12000 + claimsByPeril.WIND_HAIL * 14000);
    const claimsImpactMax = Math.round(claims.length * 26000 + claimsByPeril.WATER * 34000 + claimsByPeril.WIND_HAIL * 48000);

    const warrantyImpactMin = mergedOverrides.skipWarranty
      ? Math.round((nearEolItems.length * 4000 + criticalEolItems.length * 9000) * Math.max(1, horizonFactor * 0.8))
      : 0;
    const warrantyImpactMax = mergedOverrides.skipWarranty
      ? Math.round((nearEolItems.length * 20000 + criticalEolItems.length * 36000) * Math.max(1, horizonFactor))
      : 0;
    const coverageGapImpactMin =
      coverageGapCount !== null && coverageGapCount > 0
        ? Math.round(coverageGapCount * 7000 * Math.max(0.8, horizonFactor))
        : 0;
    const coverageGapImpactMax =
      coverageGapCount !== null && coverageGapCount > 0
        ? Math.round(coverageGapCount * 19000 * Math.max(0.9, horizonFactor))
        : 0;
    const maintenanceAdherenceImpactMin =
      maintenanceAdherencePercent !== null && maintenanceAdherencePercent < 65
        ? Math.round((65 - maintenanceAdherencePercent) * 300 * Math.max(0.8, horizonFactor))
        : 0;
    const maintenanceAdherenceImpactMax =
      maintenanceAdherencePercent !== null && maintenanceAdherencePercent < 65
        ? Math.round((65 - maintenanceAdherencePercent) * 900 * Math.max(0.9, horizonFactor))
        : 0;

    const cashBufferCents = mergedOverrides.cashBufferCents;
    let deductibleStressMin = 0;
    let deductibleStressMax = 0;

    if (deductibleCents !== undefined && cashBufferCents !== undefined && cashBufferCents > 0) {
      const ratio = deductibleCents / cashBufferCents;
      if (ratio >= 0.4) {
        deductibleStressMin = Math.round(deductibleCents * 0.12);
        deductibleStressMax = Math.round(deductibleCents * 0.4);
      } else if (ratio >= 0.25) {
        deductibleStressMin = Math.round(deductibleCents * 0.06);
        deductibleStressMax = Math.round(deductibleCents * 0.24);
      }
    }

    const majorEventCost = (() => {
      if (highWaterExposure) return { min: 120000, max: 350000, title: 'Water damage event from leak or failed fixture' };
      if (roofAging || claimsByPeril.WIND_HAIL > 0) return { min: 160000, max: 420000, title: 'Roof/wind-hail event causing major repairs' };
      if (criticalEolItems.length > 0) return { min: 100000, max: 280000, title: 'Major system failure from aging equipment' };
      return { min: 70000, max: 180000, title: 'Unexpected repair event due to delayed action' };
    })();

    const majorEventScale = horizonMonths === 6 ? 0.55 : horizonMonths === 12 ? 0.75 : horizonMonths === 24 ? 1 : 1.2;

    let expectedCostDeltaCentsMin =
      maintenanceDebtMin +
      agingImpactMin +
      claimsImpactMin +
      warrantyImpactMin +
      deductibleStressMin +
      coverageGapImpactMin +
      maintenanceAdherenceImpactMin;
    let expectedCostDeltaCentsMax =
      maintenanceDebtMax +
      agingImpactMax +
      claimsImpactMax +
      warrantyImpactMax +
      deductibleStressMax +
      coverageGapImpactMax +
      maintenanceAdherenceImpactMax;

    if (savingsRealizationAnnual !== null && savingsRealizationAnnual > 0) {
      const annualSavingsCents = Math.round(savingsRealizationAnnual * 100);
      const savingsOffsetMin = Math.round(annualSavingsCents * 0.25 * Math.max(0.5, horizonFactor * 0.45));
      const savingsOffsetMax = Math.round(annualSavingsCents * 0.45 * Math.max(0.55, horizonFactor * 0.55));
      expectedCostDeltaCentsMin = Math.max(0, expectedCostDeltaCentsMin - savingsOffsetMin);
      expectedCostDeltaCentsMax = Math.max(0, expectedCostDeltaCentsMax - savingsOffsetMax);
    }

    expectedCostDeltaCentsMax += Math.round(majorEventCost.max * majorEventScale);
    expectedCostDeltaCentsMin += Math.round(majorEventCost.min * Math.max(0.4, majorEventScale - 0.2));

    expectedCostDeltaCentsMin = Math.max(0, expectedCostDeltaCentsMin);
    expectedCostDeltaCentsMax = Math.max(expectedCostDeltaCentsMin + 5000, expectedCostDeltaCentsMax);

    const likelihoodScore =
      riskScoreDelta +
      criticalOverdue.length * 2 +
      criticalEolItems.length * 3 +
      claims.length * 2 +
      (horizonMonths >= 24 ? 2 : 0) +
      (mergedOverrides.skipMaintenance ? 2 : 0);

    const incidentLikelihood: DoNothingIncidentLikelihood =
      likelihoodScore >= 18
        ? DoNothingIncidentLikelihood.HIGH
        : likelihoodScore >= 9
          ? DoNothingIncidentLikelihood.MEDIUM
          : DoNothingIncidentLikelihood.LOW;

    const topRiskDriversRaw: Driver[] = [];
    if (mergedOverrides.skipMaintenance && overdueTasks.length > 0) {
      topRiskDriversRaw.push({
        code: 'MAINTENANCE_DEFERRAL',
        title: 'Skipping maintenance increases failure probability',
        detail: `${overdueTasks.length} overdue task(s), including ${criticalOverdue.length} high-priority items, were carried forward.`,
        severity: criticalOverdue.length > 0 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (nearEolItems.length > 0) {
      topRiskDriversRaw.push({
        code: 'AGING_SYSTEMS',
        title: 'Aging systems approach end-of-life',
        detail: `${nearEolItems.length} item(s) are beyond 70% of expected lifespan, with ${criticalEolItems.length} in critical range.`,
        severity: criticalEolItems.length > 0 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (highWaterExposure) {
      topRiskDriversRaw.push({
        code: 'WATER_EXPOSURE',
        title: 'Water-related exposure remains elevated',
        detail:
          claimsByPeril.WATER > 0
            ? `${claimsByPeril.WATER} recent water/plumbing claim signal(s) increase repeat-risk probability.`
            : 'Property and system profile indicate elevated leak/water exposure if no mitigation is applied.',
        severity: claimsByPeril.WATER > 0 || property.hasDrainageIssues ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['WATER'],
      });
    }

    if (roofAging || claimsByPeril.WIND_HAIL > 0) {
      topRiskDriversRaw.push({
        code: 'WIND_HAIL_EXPOSURE',
        title: 'Wind/hail vulnerability accumulates over time',
        detail:
          claimsByPeril.WIND_HAIL > 0
            ? `${claimsByPeril.WIND_HAIL} recent wind/hail claim signal(s) found in the property history.`
            : 'Roof age profile increases weather-loss likelihood over a longer inaction horizon.',
        severity: claimsByPeril.WIND_HAIL > 1 || roofAging ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['WIND_HAIL'],
      });
    }

    if (claims.length > 0) {
      topRiskDriversRaw.push({
        code: 'CLAIM_RECURRENCE',
        title: 'Recent claims indicate recurrence sensitivity',
        detail: `${claims.length} claim(s) in the last 36 months increase baseline incident likelihood sensitivity.`,
        severity: claims.length >= 3 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (coverageGapCount !== null && coverageGapCount > 0) {
      topRiskDriversRaw.push({
        code: 'COVERAGE_GAP_SIGNAL',
        title: 'Coverage gap signal increases downside if no action is taken',
        detail: `${Math.round(coverageGapCount)} active coverage gap signal(s) were reused from Coverage Intelligence.`,
        severity: coverageGapCount >= 3 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (maintenanceAdherencePercent !== null && maintenanceAdherencePercent < 70) {
      topRiskDriversRaw.push({
        code: 'MAINT_ADHERENCE_SIGNAL',
        title: 'Low maintenance adherence increases avoidable failures',
        detail: `Shared maintenance adherence is ${Math.round(maintenanceAdherencePercent)}%, which compounds deferred-risk projections.`,
        severity: maintenanceAdherencePercent < 50 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (riskAccumulationScore !== null && riskAccumulationScore >= 0.58) {
      topRiskDriversRaw.push({
        code: 'RISK_ACCUMULATION_PATTERN',
        title: 'Deferred maintenance pattern compounds simulation downside',
        detail: `Risk accumulation pattern score is ${Math.round(riskAccumulationScore * 100)}.`,
        severity: riskAccumulationScore >= 0.78 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (signalInteractionContext.interactions.length > 0) {
      const interaction = signalInteractionContext.interactions[0];
      topRiskDriversRaw.push({
        code: `INTERACTION_${interaction.code}`,
        title: interaction.title,
        detail: interaction.reasons.join(' '),
        severity:
          interaction.strength >= 0.78 ? 'HIGH' :
          interaction.strength >= 0.55 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    if (topRiskDriversRaw.length === 0) {
      topRiskDriversRaw.push({
        code: 'BASELINE_STABLE',
        title: 'Baseline appears relatively stable',
        detail: 'No single severe risk signal dominates, but delayed action still increases long-horizon exposure.',
        severity: 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    const topRiskDrivers = dedupeByCode(topRiskDriversRaw)
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 5);

    const topCostDriversRaw: Driver[] = [
      {
        code: 'DEFERRED_MAINTENANCE_COST',
        title: 'Deferred maintenance debt',
        detail: `Projected maintenance debt adds ${Math.round(maintenanceDebtMin / 100)}-${Math.round(
          maintenanceDebtMax / 100
        )} USD over ${horizonMonths} months.`,
        severity: maintenanceDebtMax > 180000 ? 'HIGH' : maintenanceDebtMax > 70000 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['OTHER'],
      },
      {
        code: 'AGING_REPAIR_COST',
        title: 'Aging item repair acceleration',
        detail: `Aging systems contribute an additional ${Math.round(agingImpactMin / 100)}-${Math.round(
          agingImpactMax / 100
        )} USD in expected repair pressure.`,
        severity: criticalEolItems.length > 0 ? 'HIGH' : nearEolItems.length > 0 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['OTHER'],
      },
    ];

    if (mergedOverrides.skipWarranty) {
      topCostDriversRaw.push({
        code: 'NO_WARRANTY_BUFFER',
        title: 'No service-plan/warranty buffer',
        detail: 'Skipping warranty assumptions increases out-of-pocket repair exposure for covered failures.',
        severity: warrantyImpactMax > 90000 ? 'MEDIUM' : 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    if (deductibleCents !== undefined) {
      const deductibleDisplay = Math.round(deductibleCents / 100);
      topCostDriversRaw.push({
        code: 'DEDUCTIBLE_PRESSURE',
        title: 'Deductible strategy affects out-of-pocket pressure',
        detail: `Simulated deductible posture (${mergedOverrides.deductibleStrategy}) keeps effective deductible near $${deductibleDisplay}.`,
        severity:
          deductibleStressMax > 100000
            ? 'HIGH'
            : deductibleStressMax > 30000
              ? 'MEDIUM'
              : 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    if (highWaterExposure) {
      topCostDriversRaw.push({
        code: 'WATER_MAJOR_EVENT',
        title: 'Potential major water event cost',
        detail: `A single severe water event can add roughly ${Math.round(majorEventCost.min / 100)}-${Math.round(
          majorEventCost.max / 100
        )} USD.`,
        severity: 'HIGH',
        relatedPerils: ['WATER'],
      });
    }

    if (coverageGapImpactMax > 0) {
      topCostDriversRaw.push({
        code: 'COVERAGE_GAP_COST',
        title: 'Coverage gap spillover risk',
        detail: `Known coverage gaps add an estimated ${Math.round(coverageGapImpactMin / 100)}-${Math.round(
          coverageGapImpactMax / 100
        )} USD of avoidable downside.`,
        severity: coverageGapImpactMax > 120000 ? 'HIGH' : 'MEDIUM',
        relatedPerils: ['OTHER'],
      });
    }

    if (savingsRealizationAnnual !== null && savingsRealizationAnnual > 0) {
      topCostDriversRaw.push({
        code: 'SAVINGS_REALIZATION_BUFFER',
        title: 'Realized savings offsets some downside',
        detail: `Shared savings realization (~${Math.round(savingsRealizationAnnual)} USD/year) lowers projected net downside exposure.`,
        severity: 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    if (financialDisciplineScore !== null && financialDisciplineScore >= 0.6) {
      topCostDriversRaw.push({
        code: 'FINANCIAL_DISCIPLINE_PATTERN',
        title: 'Financial discipline pattern improves projection resilience',
        detail: 'Repeated savings execution suggests sustained ability to offset rising ownership costs.',
        severity: 'LOW',
        relatedPerils: ['OTHER'],
      });
    }

    const topCostDrivers = dedupeByCode(topCostDriversRaw)
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 5);

    const biggestAvoidableLossesRaw: AvoidableLoss[] = [
      {
        title: majorEventCost.title,
        detail: `Most downside comes from an avoidable major incident during the ${horizonMonths}-month horizon.`,
        estCostCentsMin: Math.round(majorEventCost.min * Math.max(0.75, majorEventScale - 0.1)),
        estCostCentsMax: Math.round(majorEventCost.max * majorEventScale),
      },
      {
        title: 'Compounding deferred maintenance backlog',
        detail: 'Critical overdue items can cascade into higher-severity repairs when deferred.',
        estCostCentsMin: maintenanceDebtMin,
        estCostCentsMax: maintenanceDebtMax,
      },
      {
        title: 'Aging-system failure timing risk',
        detail: `${criticalEolItems.length} critical end-of-life item(s) can trigger expensive failure windows.`,
        estCostCentsMin: agingImpactMin,
        estCostCentsMax: agingImpactMax,
      },
    ];

    const biggestAvoidableLosses = biggestAvoidableLossesRaw
      .filter((item) => (item.estCostCentsMax ?? 0) > 0)
      .slice(0, 3);

    const nextStepsRaw: NextStep[] = [];
    if (overdueTasks.length > 0) {
      nextStepsRaw.push({
        title: 'Complete one critical overdue maintenance task this month',
        detail: `Prioritize ${criticalOverdue.length > 0 ? 'high-priority' : 'oldest'} overdue tasks to reduce short-term incident risk quickly.`,
        priority: criticalOverdue.length > 0 ? 'HIGH' : 'MEDIUM',
      });
    }

    if (highWaterExposure) {
      nextStepsRaw.push({
        title: 'Add leak detection at highest-risk points',
        detail: 'Start with water heater, kitchen sink, and laundry to reduce the largest avoidable loss driver.',
        priority: 'HIGH',
      });
    }

    if (roofAging || claimsByPeril.WIND_HAIL > 0) {
      nextStepsRaw.push({
        title: 'Schedule a roof condition inspection',
        detail: 'A documented roof check can reduce uncertainty and prevent weather-driven escalation.',
        priority: 'MEDIUM',
      });
    }

    const firstCriticalEol = criticalEolItems[0] ?? nearEolItems[0] ?? null;
    if (firstCriticalEol) {
      nextStepsRaw.push({
        title: `Plan replacement for ${firstCriticalEol.name} in the next 6-12 months`,
        detail: 'Replacing one near end-of-life system usually removes a large share of projected downside.',
        priority: criticalEolItems.length > 0 ? 'HIGH' : 'MEDIUM',
      });
    }

    if (deductibleCents !== undefined && cashBufferCents !== undefined && cashBufferCents > 0) {
      const ratio = deductibleCents / cashBufferCents;
      if (ratio > 0.25) {
        nextStepsRaw.push({
          title: 'Rebalance deductible with available cash buffer',
          detail: 'Keep deductible exposure within a manageable range for out-of-pocket resilience.',
          priority: ratio > 0.4 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    if (nextStepsRaw.length === 0) {
      nextStepsRaw.push({
        title: 'Run a focused quarterly maintenance check',
        detail: 'A light recurring maintenance rhythm keeps the downside range contained.',
        priority: 'LOW',
      });
    }

    const nextSteps = dedupeSteps(nextStepsRaw).slice(0, 5);

    const decisionTrace: DecisionTrace[] = [
      {
        label: 'Simulation horizon applied',
        detail: `Modeled ${horizonMonths} months of inaction against current property baseline.`,
        impact: 'NEUTRAL',
      },
      {
        label: 'Baseline risk signal used',
        detail:
          property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined
            ? `Current risk score baseline: ${property.riskReport?.riskScore?.toFixed(0)}.`
            : 'No recent risk score available; used neutral baseline assumptions.',
        impact: property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined ? 'NEUTRAL' : 'NEGATIVE',
      },
      {
        label: 'Maintenance posture evaluated',
        detail: `${overdueTasks.length} overdue task(s), ${criticalOverdue.length} critical overdue, completion rate ${Math.round(
          completionRate * 100
        )}%.`,
        impact: mergedOverrides.skipMaintenance ? 'NEGATIVE' : overdueTasks.length > 0 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Inventory lifecycle pressure detected',
        detail: `${nearEolItems.length} near end-of-life item(s), ${criticalEolItems.length} in critical range.`,
        impact: nearEolItems.length > 0 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Claims recurrence sensitivity applied',
        detail: `${claims.length} claim(s) in 36-month lookback; water=${claimsByPeril.WATER}, wind/hail=${claimsByPeril.WIND_HAIL}.`,
        impact: claims.length > 0 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Shared coverage gap signal applied',
        detail:
          coverageGapCount !== null
            ? `${Math.round(coverageGapCount)} coverage gap signal(s) reused from Coverage Intelligence.`
            : 'No fresh coverage gap signal available; used local baseline only.',
        impact:
          coverageGapCount !== null
            ? coverageGapCount > 0
              ? 'NEGATIVE'
              : 'NEUTRAL'
            : 'NEUTRAL',
      },
      {
        label: 'Shared maintenance adherence signal applied',
        detail:
          maintenanceAdherencePercent !== null
            ? `Maintenance adherence signal: ${Math.round(maintenanceAdherencePercent)}%.`
            : 'No fresh maintenance adherence signal available; used task-state baseline only.',
        impact:
          maintenanceAdherencePercent !== null && maintenanceAdherencePercent < 70
            ? 'NEGATIVE'
            : 'NEUTRAL',
      },
      {
        label: 'Shared savings realization signal applied',
        detail:
          savingsRealizationAnnual !== null && savingsRealizationAnnual > 0
            ? `Savings realization offset applied at ~${Math.round(savingsRealizationAnnual)} USD/year.`
            : 'No active savings realization signal offset applied.',
        impact:
          savingsRealizationAnnual !== null && savingsRealizationAnnual > 0
            ? 'POSITIVE'
            : 'NEUTRAL',
      },
      {
        label: 'Home event maintenance history included',
        detail: `${repairEventCount} repair/maintenance-related home event(s) used to tune cost sensitivity.`,
        impact: repairEventCount > 0 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Deductible strategy impact modeled',
        detail: `Strategy set to ${mergedOverrides.deductibleStrategy}${
          deductibleCents !== undefined ? ` with effective deductible ~${Math.round(deductibleCents / 100)} USD.` : '.'
        }`,
        impact: mergedOverrides.deductibleStrategy === 'LOWER' ? 'POSITIVE' : mergedOverrides.deductibleStrategy === 'RAISE' ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Warranty posture applied',
        detail: mergedOverrides.skipWarranty
          ? 'Skip-warranty assumption increases projected out-of-pocket exposure for covered repairs.'
          : 'Warranty/service-plan assumption kept neutral in cost model.',
        impact: mergedOverrides.skipWarranty ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Avoidable major-loss scenario included',
        detail: majorEventCost.title,
        impact: 'NEGATIVE',
      },
      {
        label: 'Minimum intervention path identified',
        detail: `${nextSteps.length} minimum actions capture most downside reduction potential.`,
        impact: 'POSITIVE',
      },
    ];

    const ignoredRisks = (mergedOverrides.ignoreTopRisks ?? []).filter(Boolean);
    if (ignoredRisks.length > 0) {
      decisionTrace.push({
        label: 'Ignored risks preference recorded',
        detail: `Preference to ignore: ${ignoredRisks.join(', ')} (narrative only, not excluded from risk baseline).`,
        impact: 'NEUTRAL',
      });
    }

    const confidenceSignals = [
      property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined,
      inventoryItems.length >= 3,
      nearEolItems.some((item) => item.ageYears !== null),
      maintenanceTasks.length > 0,
      claims.length > 0,
      activePolicy !== null,
    ].filter(Boolean).length;

    const confidence: DoNothingSimulationConfidence =
      confidenceSignals >= 5
        ? DoNothingSimulationConfidence.HIGH
        : confidenceSignals >= 3
          ? DoNothingSimulationConfidence.MEDIUM
          : DoNothingSimulationConfidence.LOW;

    const summary = `Over ${horizonMonths} months, doing nothing is projected to increase risk by ${riskScoreDelta} points and add about ${Math.round(
      expectedCostDeltaCentsMin / 100
    )}-${Math.round(expectedCostDeltaCentsMax / 100)} USD in downside exposure. Focus first on ${
      nextSteps[0]?.title?.toLowerCase() ?? 'one critical maintenance action'
    }.`;

    const inputsSnapshot = {
      version: 1,
      baselineAt: now.toISOString(),
      horizonMonths,
      scenarioId: scenario?.id ?? null,
      assumptionSetId,
      preferenceProfileId: posture.preferenceProfileId,
      sharedSignalsUsed,
      policy: {
        policyId: activePolicy?.id ?? null,
        annualPremium: annualPremiumDollars ?? null,
        deductibleAmount: deductibleDollars ?? null,
      },
      sharedSignals: {
        coverageGapCount,
        maintenanceAdherencePercent,
        savingsRealizationAnnual,
      },
      baseline: {
        riskScore: property.riskReport?.riskScore ?? null,
        overdueTaskCount: overdueTasks.length,
        criticalOverdueCount: criticalOverdue.length,
        maintenanceCompletionRate: Math.round(completionRate * 100),
        inventoryCount: inventoryItems.length,
        nearEolCount: nearEolItems.length,
        criticalEolCount: criticalEolItems.length,
        claimsCount: claims.length,
        repairEventCount,
      },
      overridesApplied: mergedOverrides,
    };

    const outputsSnapshot = {
      topRiskDrivers,
      topCostDrivers,
      biggestAvoidableLosses,
      horizonMonths,
      incidentLikelihood,
      riskScoreDelta,
      expectedCostDeltaCentsMin,
      expectedCostDeltaCentsMax,
    };

    const created = await prisma.doNothingSimulationRun.create({
      data: {
        homeownerProfileId: property.homeownerProfileId,
        propertyId,
        assumptionSetId: assumptionSetId ?? null,
        scenarioId: scenario?.id ?? null,
        status: DoNothingSimulationStatus.READY,
        confidence,
        horizonMonths,
        summary,
        inputsSnapshot,
        outputsSnapshot,
        decisionTrace,
        nextSteps,
        riskScoreDelta,
        expectedCostDeltaCentsMin,
        expectedCostDeltaCentsMax,
        incidentLikelihood,
      },
    });

    return { run: mapRunToDto(created) };
  }
}

export async function markDoNothingRunsStale(propertyId: string) {
  await prisma.doNothingSimulationRun.updateMany({
    where: {
      propertyId,
      status: DoNothingSimulationStatus.READY,
    },
    data: {
      status: DoNothingSimulationStatus.STALE,
    },
  });
}

export async function markDoNothingRunsStaleForScenario(scenarioId: string) {
  await prisma.doNothingSimulationRun.updateMany({
    where: {
      scenarioId,
      status: DoNothingSimulationStatus.READY,
    },
    data: {
      status: DoNothingSimulationStatus.STALE,
    },
  });
}
