import { HomeSavingsOpportunityStatus, MaintenanceTaskStatus, Prisma, Signal } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type SharedSignalKey = 'MAINT_ADHERENCE' | 'COVERAGE_GAP' | 'SAVINGS_REALIZATION';

const SIGNAL_OWNER_BY_KEY: Record<SharedSignalKey, string> = {
  MAINT_ADHERENCE: 'MaintenanceOrchestrationService',
  COVERAGE_GAP: 'CoverageAnalysisService',
  SAVINGS_REALIZATION: 'HomeSavingsService',
};

export type SignalDTO = {
  id: string;
  propertyId: string;
  roomId: string | null;
  homeItemId: string | null;
  signalKey: string;
  valueNumber: number | null;
  valueText: string | null;
  valueJson: Prisma.JsonValue | null;
  unit: string | null;
  confidence: number | null;
  sourceModel: string;
  sourceId: string;
  capturedAt: string;
  validUntil: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PublishSignalInput = {
  propertyId: string;
  signalKey: SharedSignalKey;
  sourceModel: string;
  sourceId: string;
  roomId?: string | null;
  homeItemId?: string | null;
  valueNumber?: number | null;
  valueText?: string | null;
  valueJson?: Record<string, unknown> | null;
  unit?: string | null;
  confidence?: number | null;
  capturedAt?: Date;
  validUntil?: Date | null;
};

export type SignalListFilters = {
  signalKey?: string;
  roomId?: string;
  homeItemId?: string;
  freshOnly?: boolean;
  limit?: number;
};

export type LatestSharedSignals = Partial<Record<SharedSignalKey, SignalDTO>>;

function mapSignal(signal: Signal): SignalDTO {
  return {
    id: signal.id,
    propertyId: signal.propertyId,
    roomId: signal.roomId,
    homeItemId: signal.homeItemId,
    signalKey: signal.signalKey,
    valueNumber: signal.valueNumber,
    valueText: signal.valueText,
    valueJson: signal.valueJson,
    unit: signal.unit,
    confidence: signal.confidence,
    sourceModel: signal.sourceModel,
    sourceId: signal.sourceId,
    capturedAt: signal.capturedAt.toISOString(),
    validUntil: signal.validUntil ? signal.validUntil.toISOString() : null,
    version: signal.version,
    createdAt: signal.createdAt.toISOString(),
    updatedAt: signal.updatedAt.toISOString(),
  };
}

function clamp01(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

export function computeMaintenanceAdherenceScore(input: {
  totalTasks: number;
  completedTasks: number;
  activeSnoozes: number;
  recentCompletions: number;
  overdueTasks: number;
}): number {
  const totalTasks = Math.max(0, input.totalTasks);
  const completedTasks = Math.max(0, input.completedTasks);
  const activeSnoozes = Math.max(0, input.activeSnoozes);
  const recentCompletions = Math.max(0, input.recentCompletions);
  const overdueTasks = Math.max(0, input.overdueTasks);

  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0.5;
  const completionBoost = Math.min(0.2, recentCompletions * 0.03);
  const snoozePenalty = Math.min(0.2, activeSnoozes * 0.04);
  const overduePenalty = Math.min(0.25, overdueTasks * 0.03);

  return Math.max(0, Math.min(1, completionRate + completionBoost - snoozePenalty - overduePenalty));
}

export class SignalService {
  async listSignals(propertyId: string, filters?: SignalListFilters): Promise<SignalDTO[]> {
    const now = new Date();
    const signals = await prisma.signal.findMany({
      where: {
        propertyId,
        ...(filters?.signalKey ? { signalKey: filters.signalKey } : {}),
        ...(filters?.roomId ? { roomId: filters.roomId } : {}),
        ...(filters?.homeItemId ? { homeItemId: filters.homeItemId } : {}),
        ...(filters?.freshOnly
          ? {
              OR: [
                { validUntil: null },
                { validUntil: { gt: now } },
              ],
            }
          : {}),
      },
      orderBy: [{ capturedAt: 'desc' }, { createdAt: 'desc' }],
      take: filters?.limit ?? 100,
    });

    return signals.map(mapSignal);
  }

  async getLatestSignalsByKey(
    propertyId: string,
    keys: SharedSignalKey[],
    options?: { freshOnly?: boolean }
  ): Promise<LatestSharedSignals> {
    if (keys.length === 0) return {};

    const rows = await this.listSignals(propertyId, {
      freshOnly: options?.freshOnly ?? true,
      limit: 200,
    });

    const keySet = new Set(keys);
    const latest: LatestSharedSignals = {};

    for (const row of rows) {
      if (!keySet.has(row.signalKey as SharedSignalKey)) continue;
      const typedKey = row.signalKey as SharedSignalKey;
      if (!latest[typedKey]) {
        latest[typedKey] = row;
      }
    }

    return latest;
  }

  async publishSignal(input: PublishSignalInput): Promise<SignalDTO> {
    const expectedOwner = SIGNAL_OWNER_BY_KEY[input.signalKey];
    if (expectedOwner && input.sourceModel !== expectedOwner) {
      throw new Error(
        `Signal ownership mismatch for ${input.signalKey}. Expected ${expectedOwner}, received ${input.sourceModel}.`
      );
    }

    const capturedAt = input.capturedAt ?? new Date();
    const confidence = clamp01(input.confidence);

    const latest = await prisma.signal.findFirst({
      where: {
        propertyId: input.propertyId,
        signalKey: input.signalKey,
        roomId: input.roomId ?? null,
        homeItemId: input.homeItemId ?? null,
      },
      orderBy: [{ version: 'desc' }, { capturedAt: 'desc' }],
    });

    const data: Prisma.SignalUncheckedCreateInput = {
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
      homeItemId: input.homeItemId ?? null,
      signalKey: input.signalKey,
      valueNumber: input.valueNumber ?? null,
      valueText: input.valueText ?? null,
      valueJson:
        input.valueJson === undefined
          ? Prisma.JsonNull
          : input.valueJson === null
            ? Prisma.JsonNull
            : (input.valueJson as Prisma.InputJsonValue),
      unit: input.unit ?? null,
      confidence,
      sourceModel: input.sourceModel,
      sourceId: input.sourceId,
      capturedAt,
      validUntil: input.validUntil ?? null,
      version: latest ? latest.version + 1 : 1,
    };

    if (
      latest &&
      latest.sourceModel === input.sourceModel &&
      latest.sourceId === input.sourceId
    ) {
      const updated = await prisma.signal.update({
        where: { id: latest.id },
        data: {
          valueNumber: data.valueNumber,
          valueText: data.valueText,
          valueJson: data.valueJson,
          unit: data.unit,
          confidence: data.confidence,
          capturedAt: data.capturedAt,
          validUntil: data.validUntil,
        },
      });

      return mapSignal(updated);
    }

    const created = await prisma.signal.create({ data });
    return mapSignal(created);
  }

  async publishCoverageGapSignal(params: {
    propertyId: string;
    coverageAnalysisId: string;
    gapCount: number;
    confidence?: number | null;
    verdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  }): Promise<SignalDTO> {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'COVERAGE_GAP',
      sourceModel: SIGNAL_OWNER_BY_KEY.COVERAGE_GAP,
      sourceId: params.coverageAnalysisId,
      valueNumber: params.gapCount,
      valueText: params.gapCount > 0 ? 'GAP_PRESENT' : 'NO_GAP',
      unit: 'count',
      confidence: params.confidence ?? null,
      valueJson: {
        coverageGapCount: params.gapCount,
        verdict: params.verdict,
      },
      validUntil,
    });
  }

  async publishSavingsRealizationSignal(params: {
    propertyId: string;
    opportunityId: string;
    status: HomeSavingsOpportunityStatus;
    estimatedAnnualSavings: number | null;
    estimatedMonthlySavings: number | null;
    currency: string;
  }): Promise<SignalDTO> {
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 90);

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'SAVINGS_REALIZATION',
      sourceModel: SIGNAL_OWNER_BY_KEY.SAVINGS_REALIZATION,
      sourceId: params.opportunityId,
      valueNumber: params.estimatedAnnualSavings ?? params.estimatedMonthlySavings ?? 0,
      valueText: params.status,
      unit: params.currency,
      confidence: 0.85,
      valueJson: {
        status: params.status,
        estimatedMonthlySavings: params.estimatedMonthlySavings,
        estimatedAnnualSavings: params.estimatedAnnualSavings,
        currency: params.currency,
      },
      validUntil,
    });
  }

  async publishMaintenanceAdherenceSignal(params: {
    propertyId: string;
    sourceId: string;
  }): Promise<SignalDTO> {
    const now = new Date();
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - 90);

    const [totalTasks, completedTasks, overdueTasks, recentCompletions, activeSnoozes] = await Promise.all([
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: { not: MaintenanceTaskStatus.CANCELLED },
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: MaintenanceTaskStatus.COMPLETED,
        },
      }),
      prisma.propertyMaintenanceTask.count({
        where: {
          propertyId: params.propertyId,
          status: {
            in: [
              MaintenanceTaskStatus.PENDING,
              MaintenanceTaskStatus.IN_PROGRESS,
              MaintenanceTaskStatus.NEEDS_REVIEW,
            ],
          },
          nextDueDate: { lt: now },
        },
      }),
      prisma.orchestrationActionCompletion.count({
        where: {
          propertyId: params.propertyId,
          completedAt: { gte: lookback },
        },
      }),
      prisma.orchestrationActionSnooze.count({
        where: {
          propertyId: params.propertyId,
          endedAt: null,
          snoozeUntil: { gt: now },
        },
      }),
    ]);

    const adherenceScore = computeMaintenanceAdherenceScore({
      totalTasks,
      completedTasks,
      activeSnoozes,
      recentCompletions,
      overdueTasks,
    });

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 14);

    return this.publishSignal({
      propertyId: params.propertyId,
      signalKey: 'MAINT_ADHERENCE',
      sourceModel: SIGNAL_OWNER_BY_KEY.MAINT_ADHERENCE,
      sourceId: params.sourceId,
      valueNumber: adherenceScore,
      unit: 'ratio',
      confidence: 0.8,
      valueJson: {
        totalTasks,
        completedTasks,
        overdueTasks,
        recentCompletions,
        activeSnoozes,
        adherencePercent: Math.round(adherenceScore * 100),
      },
      validUntil,
    });
  }
}

export const signalService = new SignalService();
