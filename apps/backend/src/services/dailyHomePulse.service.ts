import {
  BookingStatus,
  IncidentSeverity,
  IncidentSourceType,
  IncidentStatus,
  MaintenanceTaskPriority,
  MaintenanceTaskStatus,
  MicroActionStatus,
  MicroActionType,
  Prisma,
  PropertyStreakType,
  RecallMatchStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { calculateHealthScore } from '../utils/propertyScore.util';
import { getOwnerLocalUpdates } from '../localUpdates/localUpdates.service';

type SummaryKind = 'HEALTH' | 'RISK' | 'FINANCIAL';
type InsightSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type SnapshotSummaryRow = {
  kind: SummaryKind;
  label: string;
  value: number;
  delta: number;
  reason: string;
};

type MorningHomePulsePayload = {
  title: 'Morning Home Pulse';
  dateLabel: string;
  summary: SnapshotSummaryRow[];
  weatherInsight: {
    headline: string;
    detail: string;
    severity: InsightSeverity;
  };
  microAction: {
    actionId: string;
    title: string;
    detail: string;
    cta: string;
    etaMinutes: number;
  };
  homeWin: {
    headline: string;
    detail: string;
  };
  surprise: {
    headline: string;
    detail: string;
  };
};

type SnapshotScoreJson = Record<
  SummaryKind,
  {
    value: number;
    delta: number;
    reason: string;
  }
> & {
  generatedAt: string;
  timezone: string;
};

type DailySnapshotDTO = {
  id: string;
  propertyId: string;
  snapshotDate: string;
  payload: MorningHomePulsePayload;
  microAction: {
    id: string;
    status: MicroActionStatus;
    title: string;
    description: string | null;
    ctaLabel: string | null;
    etaMinutes: number | null;
    completedAt: string | null;
    dismissedAt: string | null;
  } | null;
  streaks: {
    dailyPulseCheckin: number;
    microActionCompleted: number;
    noOverdueTasks: number;
  };
  generatedAt: string;
};

type MicroActionCandidate = {
  type: MicroActionType;
  title: string;
  description: string;
  ctaLabel: string;
  etaMinutes: number;
  impactScore: number;
  suppressionKey: string;
  sourceType?: string;
  sourceId?: string;
  dueAt?: Date;
  priorityBucket: number;
};

const DEFAULT_TIMEZONE = 'America/New_York';
const SUPPRESSION_LOOKBACK_DAYS = 45;

const PRIORITY_WEIGHT: Record<MaintenanceTaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const COLD_STATES = new Set([
  'ME',
  'NH',
  'VT',
  'MA',
  'CT',
  'RI',
  'NY',
  'NJ',
  'PA',
  'OH',
  'MI',
  'MN',
  'WI',
  'IL',
  'IN',
  'IA',
  'ND',
  'SD',
  'NE',
  'MT',
  'WY',
  'CO',
  'UT',
  'ID',
]);

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const decimalValue = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(decimalValue)) return decimalValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function formatDateKeyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function dateKeyToDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function dateLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function diffDays(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((aUtc - bUtc) / (1000 * 60 * 60 * 24));
}

function daysFromNow(target: Date): number {
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function mapMaintenanceTaskType(task: {
  title: string;
  category: string | null;
  description: string | null;
}): MicroActionType {
  const haystack = `${task.title} ${task.category ?? ''} ${task.description ?? ''}`.toLowerCase();
  if (haystack.includes('gfci')) return MicroActionType.GFCI_TEST;
  if (haystack.includes('smoke') || haystack.includes('co detector')) return MicroActionType.SMOKE_CO_TEST;
  if (haystack.includes('sump')) return MicroActionType.SUMP_PUMP_TEST;
  if (haystack.includes('freeze') || haystack.includes('faucet') || haystack.includes('pipe')) {
    return MicroActionType.PIPE_FREEZE_PREP;
  }
  if (haystack.includes('storm') || haystack.includes('roof')) return MicroActionType.STORM_PREP;
  if (haystack.includes('hvac') || haystack.includes('filter')) return MicroActionType.HVAC_FILTER_CHECK;
  return MicroActionType.HVAC_FILTER_CHECK;
}

function severityToInsight(severity: IncidentSeverity | null | undefined): InsightSeverity {
  if (severity === IncidentSeverity.CRITICAL) return 'HIGH';
  if (severity === IncidentSeverity.WARNING) return 'MEDIUM';
  return 'LOW';
}

function pickWeatherFallback(state: string, month: number): {
  headline: string;
  detail: string;
  severity: InsightSeverity;
  code: 'FREEZE' | 'STORM' | 'NONE';
} {
  if ([11, 0, 1].includes(month) && COLD_STATES.has(state)) {
    return {
      headline: 'Freeze risk in your area',
      detail: 'Protect outdoor faucets and exposed pipes to reduce burst-risk overnight.',
      severity: 'HIGH',
      code: 'FREEZE',
    };
  }

  if ([5, 6, 7, 8].includes(month)) {
    return {
      headline: 'Storm season readiness',
      detail: 'Quickly secure loose outdoor items and verify drainage before the next storm window.',
      severity: 'MEDIUM',
      code: 'STORM',
    };
  }

  return {
    headline: 'No local weather alerts today',
    detail: 'No significant weather trigger detected for your home right now.',
    severity: 'LOW',
    code: 'NONE',
  };
}

function formatScoreReason(
  kind: SummaryKind,
  delta: number,
  ctx: {
    completedTasksLast2Days: number;
    overdueCount: number;
    weatherSeverity: InsightSeverity;
    expiringWarranties: number;
  }
): string {
  if (kind === 'HEALTH') {
    if (delta > 0 && ctx.completedTasksLast2Days > 0) return 'Recent maintenance completion';
    if (ctx.overdueCount > 0) return 'Overdue maintenance needs attention';
    return 'Stable';
  }
  if (kind === 'RISK') {
    if (ctx.weatherSeverity === 'HIGH') return 'Weather trigger elevated risk';
    if (delta < 0) return 'Reduced exposure from recent activity';
    return 'Updated from recent activity';
  }
  if (ctx.expiringWarranties > 0) return 'Renewal decisions pending';
  if (delta > 0) return 'Improved by recent efficiency updates';
  return 'Stable';
}

function toSnapshotDto(snapshot: {
  id: string;
  propertyId: string;
  snapshotDate: Date;
  payloadJson: unknown;
  generatedAt: Date;
  microAction: {
    id: string;
    status: MicroActionStatus;
    title: string;
    description: string | null;
    ctaLabel: string | null;
    etaMinutes: number | null;
    completedAt: Date | null;
    dismissedAt: Date | null;
  } | null;
}): DailySnapshotDTO {
  const payload = safeObject(snapshot.payloadJson) as unknown as MorningHomePulsePayload;
  return {
    id: snapshot.id,
    propertyId: snapshot.propertyId,
    snapshotDate: snapshot.snapshotDate.toISOString(),
    payload,
    microAction: snapshot.microAction
      ? {
          id: snapshot.microAction.id,
          status: snapshot.microAction.status,
          title: snapshot.microAction.title,
          description: snapshot.microAction.description,
          ctaLabel: snapshot.microAction.ctaLabel,
          etaMinutes: snapshot.microAction.etaMinutes,
          completedAt: snapshot.microAction.completedAt?.toISOString() ?? null,
          dismissedAt: snapshot.microAction.dismissedAt?.toISOString() ?? null,
        }
      : null,
    streaks: {
      dailyPulseCheckin: 0,
      microActionCompleted: 0,
      noOverdueTasks: 0,
    },
    generatedAt: snapshot.generatedAt.toISOString(),
  };
}

export class DailyHomePulseService {
  private async assertProperty(propertyId: string, userId: string) {
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        homeownerProfile: { userId },
      },
      include: {
        homeownerProfile: {
          select: { id: true, userId: true },
        },
        homeAssets: true,
        warranties: true,
        riskReport: {
          select: {
            riskScore: true,
            financialExposureTotal: true,
            details: true,
          },
        },
        financialReport: {
          select: {
            financialEfficiencyScore: true,
          },
        },
      },
    });

    if (!property) {
      throw new Error('Property not found or access denied.');
    }

    return property;
  }

  private async getStreakCounts(propertyId: string) {
    const rows = await prisma.propertyStreak.findMany({
      where: {
        propertyId,
        streakType: {
          in: [
            PropertyStreakType.DAILY_PULSE_CHECKIN,
            PropertyStreakType.MICRO_ACTION_COMPLETED,
            PropertyStreakType.NO_OVERDUE_TASKS,
          ],
        },
      },
      select: {
        streakType: true,
        currentCount: true,
      },
    });

    return {
      dailyPulseCheckin:
        rows.find((row) => row.streakType === PropertyStreakType.DAILY_PULSE_CHECKIN)?.currentCount ?? 0,
      microActionCompleted:
        rows.find((row) => row.streakType === PropertyStreakType.MICRO_ACTION_COMPLETED)?.currentCount ?? 0,
      noOverdueTasks:
        rows.find((row) => row.streakType === PropertyStreakType.NO_OVERDUE_TASKS)?.currentCount ?? 0,
    };
  }

  private async bumpStreak(
    propertyId: string,
    userId: string,
    streakType: PropertyStreakType,
    activeDateKey: string
  ) {
    const activeDate = dateKeyToDate(activeDateKey);
    const existing = await prisma.propertyStreak.findUnique({
      where: {
        propertyId_streakType: {
          propertyId,
          streakType,
        },
      },
    });

    if (!existing) {
      await prisma.propertyStreak.create({
        data: {
          propertyId,
          userId,
          streakType,
          currentCount: 1,
          bestCount: 1,
          lastActiveDate: activeDate,
          startedAt: new Date(),
        },
      });
      return;
    }

    if (diffDays(activeDate, existing.lastActiveDate) === 0) {
      return;
    }

    const isConsecutive = diffDays(activeDate, existing.lastActiveDate) === 1;
    const currentCount = isConsecutive ? existing.currentCount + 1 : 1;

    await prisma.propertyStreak.update({
      where: {
        propertyId_streakType: {
          propertyId,
          streakType,
        },
      },
      data: {
        currentCount,
        bestCount: Math.max(existing.bestCount, currentCount),
        lastActiveDate: activeDate,
        startedAt: isConsecutive ? existing.startedAt ?? new Date() : new Date(),
      },
    });
  }

  private async syncNoOverdueStreak(
    propertyId: string,
    userId: string,
    activeDateKey: string,
    hasNoOverdue: boolean
  ) {
    const activeDate = dateKeyToDate(activeDateKey);
    const key = {
      propertyId_streakType: {
        propertyId,
        streakType: PropertyStreakType.NO_OVERDUE_TASKS,
      },
    };

    if (hasNoOverdue) {
      await this.bumpStreak(propertyId, userId, PropertyStreakType.NO_OVERDUE_TASKS, activeDateKey);
      return;
    }

    const existing = await prisma.propertyStreak.findUnique({ where: key });
    if (!existing) {
      await prisma.propertyStreak.create({
        data: {
          propertyId,
          userId,
          streakType: PropertyStreakType.NO_OVERDUE_TASKS,
          currentCount: 0,
          bestCount: 0,
          lastActiveDate: activeDate,
          startedAt: null,
        },
      });
      return;
    }

    if (diffDays(activeDate, existing.lastActiveDate) !== 0) {
      await prisma.propertyStreak.update({
        where: key,
        data: {
          currentCount: 0,
          lastActiveDate: activeDate,
          startedAt: null,
        },
      });
    }
  }

  private actionStillSuppressed(
    candidate: MicroActionCandidate,
    existing: { status: MicroActionStatus; suggestedAt: Date }
  ): boolean {
    const ageDays = Math.floor((Date.now() - existing.suggestedAt.getTime()) / (1000 * 60 * 60 * 24));

    if (candidate.type === MicroActionType.PIPE_FREEZE_PREP || candidate.type === MicroActionType.STORM_PREP) {
      return ageDays <= 2;
    }

    if (candidate.type === MicroActionType.WARRANTY_EXPIRING) {
      return ageDays <= 7;
    }

    if (candidate.type === MicroActionType.RECALL_ALERT) {
      return existing.status !== MicroActionStatus.EXPIRED;
    }

    if (existing.status === MicroActionStatus.PENDING) return true;
    if (existing.status === MicroActionStatus.COMPLETED) return ageDays <= 7;
    if (existing.status === MicroActionStatus.DISMISSED) return ageDays <= 2;
    return false;
  }

  private async selectOrCreateMicroAction(args: {
    propertyId: string;
    userId: string;
    dateKey: string;
    weatherInsight: { headline: string; detail: string; severity: InsightSeverity; code: 'FREEZE' | 'STORM' | 'NONE' };
    overdueTasks: Array<{
      id: string;
      title: string;
      description: string | null;
      category: string | null;
      priority: MaintenanceTaskPriority;
      nextDueDate: Date | null;
    }>;
    dueSoonTasks: Array<{
      id: string;
      title: string;
      description: string | null;
      category: string | null;
      priority: MaintenanceTaskPriority;
      nextDueDate: Date | null;
    }>;
    expiringWarranties: Array<{
      id: string;
      providerName: string;
      expiryDate: Date;
    }>;
    openRecalls: Array<{
      id: string;
      confidencePct: number;
      inventoryItem: { name: string } | null;
      recall: { title: string } | null;
    }>;
  }) {
    const candidates: MicroActionCandidate[] = [];

    if (args.weatherInsight.severity !== 'LOW' && args.weatherInsight.code !== 'NONE') {
      const weatherType =
        args.weatherInsight.code === 'FREEZE'
          ? MicroActionType.PIPE_FREEZE_PREP
          : MicroActionType.STORM_PREP;
      candidates.push({
        type: weatherType,
        title:
          args.weatherInsight.code === 'FREEZE'
            ? 'Protect outdoor faucets'
            : 'Secure outdoor storm risks',
        description: args.weatherInsight.detail,
        ctaLabel: 'Mark complete',
        etaMinutes: 2,
        impactScore: args.weatherInsight.severity === 'HIGH' ? 95 : 78,
        suppressionKey: `WEATHER:${args.propertyId}:${args.weatherInsight.code}`,
        priorityBucket: 600,
      });
    }

    const highestOverdue = [...args.overdueTasks].sort((a, b) => {
      const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (priorityDelta !== 0) return priorityDelta;
      const aDue = a.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    })[0];

    if (highestOverdue) {
      candidates.push({
        type: mapMaintenanceTaskType(highestOverdue),
        title: highestOverdue.title,
        description:
          highestOverdue.description ??
          'Quick maintenance action to reduce risk and avoid larger repair costs.',
        ctaLabel: 'Mark complete',
        etaMinutes: 4,
        impactScore: highestOverdue.priority === MaintenanceTaskPriority.URGENT ? 92 : 84,
        suppressionKey: `MAINT:${highestOverdue.id}:${highestOverdue.nextDueDate?.toISOString().slice(0, 10) ?? 'NA'}`,
        sourceType: 'PROPERTY_MAINTENANCE_TASK',
        sourceId: highestOverdue.id,
        dueAt: highestOverdue.nextDueDate ?? undefined,
        priorityBucket: 500,
      });
    }

    const highestDueSoon = [...args.dueSoonTasks].sort((a, b) => {
      const priorityDelta = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (priorityDelta !== 0) return priorityDelta;
      const aDue = a.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    })[0];

    if (highestDueSoon) {
      candidates.push({
        type: mapMaintenanceTaskType(highestDueSoon),
        title: highestDueSoon.title,
        description:
          highestDueSoon.description ??
          'Small preventive step today helps avoid urgent work later this week.',
        ctaLabel: 'Mark complete',
        etaMinutes: 3,
        impactScore: 72,
        suppressionKey: `MAINT:${highestDueSoon.id}:${highestDueSoon.nextDueDate?.toISOString().slice(0, 10) ?? 'NA'}`,
        sourceType: 'PROPERTY_MAINTENANCE_TASK',
        sourceId: highestDueSoon.id,
        dueAt: highestDueSoon.nextDueDate ?? undefined,
        priorityBucket: 400,
      });
    }

    const nextWarranty = [...args.expiringWarranties].sort(
      (a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()
    )[0];
    if (nextWarranty) {
      candidates.push({
        type: MicroActionType.WARRANTY_EXPIRING,
        title: `Review ${nextWarranty.providerName} warranty`,
        description: `Coverage expires in ${Math.max(0, daysFromNow(nextWarranty.expiryDate))} days.`,
        ctaLabel: 'Mark complete',
        etaMinutes: 2,
        impactScore: 68,
        suppressionKey: `WARRANTY:${nextWarranty.id}`,
        sourceType: 'WARRANTY',
        sourceId: nextWarranty.id,
        dueAt: nextWarranty.expiryDate,
        priorityBucket: 300,
      });
    }

    const topRecall = [...args.openRecalls].sort((a, b) => b.confidencePct - a.confidencePct)[0];
    if (topRecall) {
      const itemName = topRecall.inventoryItem?.name ?? topRecall.recall?.title ?? 'inventory item';
      candidates.push({
        type: MicroActionType.RECALL_ALERT,
        title: `Review recall alert for ${itemName}`,
        description: 'Confirm whether this recall applies and capture your resolution.',
        ctaLabel: 'Mark complete',
        etaMinutes: 2,
        impactScore: Math.max(70, Math.min(95, topRecall.confidencePct)),
        suppressionKey: `RECALL:${topRecall.id}`,
        sourceType: 'RECALL_MATCH',
        sourceId: topRecall.id,
        priorityBucket: 250,
      });
    }

    candidates.push({
      type: MicroActionType.SMOKE_CO_TEST,
      title: 'Test smoke and CO alarms',
      description: 'Takes 2 minutes and improves home safety readiness.',
      ctaLabel: 'Mark complete',
      etaMinutes: 2,
      impactScore: 45,
      suppressionKey: `TIP:SMOKE_CO_TEST:${args.dateKey.slice(0, 7)}`,
      priorityBucket: 100,
    });

    const lookbackStart = new Date(Date.now() - SUPPRESSION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const recentActions = await prisma.propertyMicroAction.findMany({
      where: {
        propertyId: args.propertyId,
        suppressionKey: { not: null },
        suggestedAt: { gte: lookbackStart },
      },
      select: {
        id: true,
        status: true,
        suggestedAt: true,
        suppressionKey: true,
        title: true,
        description: true,
        ctaLabel: true,
        etaMinutes: true,
      },
      orderBy: [{ suggestedAt: 'desc' }],
    });

    const latestBySuppressionKey = new Map<
      string,
      {
        id: string;
        status: MicroActionStatus;
        suggestedAt: Date;
        title: string;
        description: string | null;
        ctaLabel: string | null;
        etaMinutes: number | null;
      }
    >();
    for (const action of recentActions) {
      if (!action.suppressionKey) continue;
      if (!latestBySuppressionKey.has(action.suppressionKey)) {
        latestBySuppressionKey.set(action.suppressionKey, action);
      }
    }

    const ranked = [...candidates].sort((a, b) => {
      const bucketDelta = b.priorityBucket - a.priorityBucket;
      if (bucketDelta !== 0) return bucketDelta;
      return b.impactScore - a.impactScore;
    });

    for (const candidate of ranked) {
      const existing = latestBySuppressionKey.get(candidate.suppressionKey);
      if (!existing) {
        const created = await prisma.propertyMicroAction.create({
          data: {
            propertyId: args.propertyId,
            userId: args.userId,
            type: candidate.type,
            status: MicroActionStatus.PENDING,
            title: candidate.title,
            description: candidate.description,
            ctaLabel: candidate.ctaLabel,
            etaMinutes: candidate.etaMinutes,
            impactScore: candidate.impactScore,
            sourceType: candidate.sourceType,
            sourceId: candidate.sourceId,
            suppressionKey: candidate.suppressionKey,
            dueAt: candidate.dueAt,
            metaJson: {
              source: 'DAILY_HOME_PULSE',
              dateKey: args.dateKey,
            },
          },
        });
        return created;
      }

      if (this.actionStillSuppressed(candidate, existing)) {
        if (existing.status === MicroActionStatus.PENDING) {
          const pendingAction = await prisma.propertyMicroAction.findUnique({
            where: { id: existing.id },
          });
          if (pendingAction) return pendingAction;
        }
        continue;
      }

      const created = await prisma.propertyMicroAction.create({
        data: {
          propertyId: args.propertyId,
          userId: args.userId,
          type: candidate.type,
          status: MicroActionStatus.PENDING,
          title: candidate.title,
          description: candidate.description,
          ctaLabel: candidate.ctaLabel,
          etaMinutes: candidate.etaMinutes,
          impactScore: candidate.impactScore,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          suppressionKey: candidate.suppressionKey,
          dueAt: candidate.dueAt,
          metaJson: {
            source: 'DAILY_HOME_PULSE',
            dateKey: args.dateKey,
          },
        },
      });
      return created;
    }

    return prisma.propertyMicroAction.create({
      data: {
        propertyId: args.propertyId,
        userId: args.userId,
        type: MicroActionType.SMOKE_CO_TEST,
        status: MicroActionStatus.PENDING,
        title: 'Quick home safety check',
        description: 'Run one quick preventive check to keep your home safer today.',
        ctaLabel: 'Mark complete',
        etaMinutes: 2,
        impactScore: 40,
        suppressionKey: `TIP:FALLBACK:${args.dateKey}`,
        metaJson: {
          source: 'DAILY_HOME_PULSE',
          dateKey: args.dateKey,
        },
      },
    });
  }

  async generateSnapshot(propertyId: string, userId: string, date = new Date()): Promise<DailySnapshotDTO> {
    const property = await this.assertProperty(propertyId, userId);
    const timezone = property.timezone || DEFAULT_TIMEZONE;
    const todayKey = formatDateKeyInTimezone(date, timezone);
    const snapshotDate = dateKeyToDate(todayKey);

    const [documentCount, activeBookings, maintenanceTasks, weatherIncident, recalls, localUpdates] =
      await Promise.all([
        prisma.document.count({ where: { propertyId } }),
        prisma.booking.findMany({
          where: {
            propertyId,
            status: {
              in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS],
            },
          },
          select: {
            id: true,
            category: true,
            status: true,
            insightFactor: true,
            insightContext: true,
            propertyId: true,
          },
        }),
        prisma.propertyMaintenanceTask.findMany({
          where: {
            propertyId,
            status: {
              in: [
                MaintenanceTaskStatus.PENDING,
                MaintenanceTaskStatus.IN_PROGRESS,
                MaintenanceTaskStatus.NEEDS_REVIEW,
              ],
            },
          },
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            priority: true,
            nextDueDate: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
        }),
        prisma.incident.findFirst({
          where: {
            propertyId,
            sourceType: IncidentSourceType.WEATHER,
            isSuppressed: false,
            status: {
              in: [
                IncidentStatus.DETECTED,
                IncidentStatus.EVALUATED,
                IncidentStatus.ACTIVE,
                IncidentStatus.ACTIONED,
              ],
            },
          },
          orderBy: [{ severityScore: 'desc' }, { updatedAt: 'desc' }],
          select: {
            title: true,
            summary: true,
            severity: true,
          },
        }),
        prisma.recallMatch.findMany({
          where: {
            propertyId,
            status: RecallMatchStatus.OPEN,
          },
          include: {
            inventoryItem: { select: { name: true } },
            recall: { select: { title: true } },
          },
          orderBy: [{ confidencePct: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        }),
        getOwnerLocalUpdates({
          userId,
          zip: property.zipCode,
          city: property.city,
          state: property.state,
          propertyType: property.propertyType ?? undefined,
        }).catch(() => []),
      ]);

    const completedSince = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const completedTasksLast2Days = await prisma.propertyMaintenanceTask.count({
      where: {
        propertyId,
        status: MaintenanceTaskStatus.COMPLETED,
        OR: [{ lastCompletedDate: { gte: completedSince } }, { updatedAt: { gte: completedSince } }],
      },
    });

    const overdueTasks = maintenanceTasks.filter(
      (task) => task.nextDueDate && task.nextDueDate.getTime() < Date.now()
    );
    const dueSoonTasks = maintenanceTasks.filter((task) => {
      if (!task.nextDueDate) return false;
      const dueDays = daysFromNow(task.nextDueDate);
      return dueDays >= 0 && dueDays <= 7;
    });

    const expiringWarranties = property.warranties
      .filter((warranty) => {
        const dueDays = daysFromNow(warranty.expiryDate);
        return dueDays >= 0 && dueDays <= 30;
      })
      .map((warranty) => ({
        id: warranty.id,
        providerName: warranty.providerName,
        expiryDate: warranty.expiryDate,
      }));

    const healthScore = (() => {
      try {
        return calculateHealthScore(property as never, documentCount, activeBookings as never).totalScore;
      } catch (error) {
        console.warn('[DailyHomePulse] Health score calculation failed, defaulting to 0.', error);
        return 0;
      }
    })();

    const riskValue =
      Math.round(
        asNumber(property.riskReport?.financialExposureTotal) ??
          asNumber(property.riskReport?.riskScore) ??
          0
      ) || 0;
    const financialScore = Math.round(asNumber(property.financialReport?.financialEfficiencyScore) ?? 0);

    const previousSnapshot = await prisma.propertyDailySnapshot.findFirst({
      where: {
        propertyId,
        snapshotDate: { lt: snapshotDate },
      },
      orderBy: [{ snapshotDate: 'desc' }],
      select: {
        scoreJson: true,
      },
    });

    const previousScoreJson = safeObject(previousSnapshot?.scoreJson);

    const previousHealth = asNumber(safeObject(previousScoreJson.HEALTH).value) ?? healthScore;
    const previousRisk = asNumber(safeObject(previousScoreJson.RISK).value) ?? riskValue;
    const previousFinancial = asNumber(safeObject(previousScoreJson.FINANCIAL).value) ?? financialScore;

    const weatherInsight = (() => {
      if (weatherIncident) {
        return {
          headline: weatherIncident.title,
          detail: weatherIncident.summary || 'Weather-driven risk signal detected for your area.',
          severity: severityToInsight(weatherIncident.severity),
          code: weatherIncident.title.toLowerCase().includes('freeze') ? 'FREEZE' : 'STORM',
        } as const;
      }

      return pickWeatherFallback(property.state, date.getMonth());
    })();

    const scoreContext = {
      completedTasksLast2Days,
      overdueCount: overdueTasks.length,
      weatherSeverity: weatherInsight.severity,
      expiringWarranties: expiringWarranties.length,
    };

    const scoreRows: SnapshotSummaryRow[] = [
      {
        kind: 'HEALTH',
        label: 'Health',
        value: healthScore,
        delta: Math.round((healthScore - previousHealth) * 10) / 10,
        reason: formatScoreReason('HEALTH', healthScore - previousHealth, scoreContext),
      },
      {
        kind: 'RISK',
        label: 'Risk',
        value: riskValue,
        delta: Math.round((riskValue - previousRisk) * 10) / 10,
        reason: formatScoreReason('RISK', riskValue - previousRisk, scoreContext),
      },
      {
        kind: 'FINANCIAL',
        label: 'Financial',
        value: financialScore,
        delta: Math.round((financialScore - previousFinancial) * 10) / 10,
        reason: formatScoreReason('FINANCIAL', financialScore - previousFinancial, scoreContext),
      },
    ];

    const microAction = await this.selectOrCreateMicroAction({
      propertyId,
      userId,
      dateKey: todayKey,
      weatherInsight,
      overdueTasks,
      dueSoonTasks,
      expiringWarranties,
      openRecalls: recalls.map((recall) => ({
        id: recall.id,
        confidencePct: recall.confidencePct,
        inventoryItem: recall.inventoryItem ? { name: recall.inventoryItem.name } : null,
        recall: recall.recall ? { title: recall.recall.title } : null,
      })),
    });

    await this.syncNoOverdueStreak(propertyId, userId, todayKey, overdueTasks.length === 0);
    const streaksAfterNoOverdue = await this.getStreakCounts(propertyId);

    const homeWin = (() => {
      if (streaksAfterNoOverdue.noOverdueTasks > 0 && overdueTasks.length === 0) {
        return {
          headline: `${streaksAfterNoOverdue.noOverdueTasks}-day streak: No overdue tasks!`,
          detail: 'Your home is staying in strong shape with consistent care.',
        };
      }
      if (completedTasksLast2Days > 0) {
        return {
          headline: `${completedTasksLast2Days} tasks completed recently`,
          detail: 'Recent maintenance wins are helping your home stay resilient.',
        };
      }
      return {
        headline: 'Steady progress keeps risk lower',
        detail: 'Small preventive actions today avoid larger costs later.',
      };
    })();

    const surprise = (() => {
      const topRecall = recalls[0];
      if (topRecall) {
        const itemName = topRecall.inventoryItem?.name ?? 'an item';
        return {
          headline: 'Recall check: one item may be affected',
          detail: `A quick review for ${itemName} can prevent safety issues.`,
        };
      }

      if (expiringWarranties.length > 0) {
        const soonest = [...expiringWarranties].sort(
          (a, b) => a.expiryDate.getTime() - b.expiryDate.getTime()
        )[0];
        return {
          headline: 'Coverage renewal window is opening',
          detail: `${soonest.providerName} expires in ${Math.max(
            0,
            daysFromNow(soonest.expiryDate)
          )} days.`,
        };
      }

      const update = localUpdates[0];
      if (update) {
        return {
          headline: update.title,
          detail: update.shortDescription,
        };
      }

      return {
        headline: 'Quick tip: 2-minute home reset',
        detail: 'Walk one room today and note anything that needs small preventive care.',
      };
    })();

    const payload: MorningHomePulsePayload = {
      title: 'Morning Home Pulse',
      dateLabel: dateLabel(date, timezone),
      summary: scoreRows,
      weatherInsight: {
        headline: weatherInsight.headline,
        detail: weatherInsight.detail,
        severity: weatherInsight.severity,
      },
      microAction: {
        actionId: microAction.id,
        title: microAction.title,
        detail: microAction.description ?? 'Small action with meaningful home impact.',
        cta: microAction.ctaLabel ?? 'Mark complete',
        etaMinutes: microAction.etaMinutes ?? 2,
      },
      homeWin,
      surprise,
    };

    const scoreJson: SnapshotScoreJson = {
      HEALTH: scoreRows.find((row) => row.kind === 'HEALTH')!,
      RISK: scoreRows.find((row) => row.kind === 'RISK')!,
      FINANCIAL: scoreRows.find((row) => row.kind === 'FINANCIAL')!,
      generatedAt: new Date().toISOString(),
      timezone,
    };

    const weatherJson = {
      source: weatherIncident ? 'INCIDENT_SIGNAL' : 'RULE_FALLBACK',
      timezone,
      triggerCode: weatherInsight.code,
      severity: weatherInsight.severity,
      generatedAt: new Date().toISOString(),
    };

    const snapshot = await prisma.propertyDailySnapshot.create({
      data: {
        propertyId,
        userId,
        snapshotDate,
        payloadJson: payload,
        scoreJson: scoreJson as unknown as Prisma.InputJsonValue,
        weatherJson: weatherJson as unknown as Prisma.InputJsonValue,
        microActionId: microAction.id,
      },
      include: {
        microAction: {
          select: {
            id: true,
            status: true,
            title: true,
            description: true,
            ctaLabel: true,
            etaMinutes: true,
            completedAt: true,
            dismissedAt: true,
          },
        },
      },
    });

    const dto = toSnapshotDto(snapshot);
    dto.streaks = await this.getStreakCounts(propertyId);
    return dto;
  }

  async getOrCreateTodaySnapshot(propertyId: string, userId: string): Promise<DailySnapshotDTO> {
    const property = await this.assertProperty(propertyId, userId);
    const timezone = property.timezone || DEFAULT_TIMEZONE;
    const todayKey = formatDateKeyInTimezone(new Date(), timezone);
    const snapshotDate = dateKeyToDate(todayKey);

    let snapshot = await prisma.propertyDailySnapshot.findUnique({
      where: {
        propertyId_snapshotDate: {
          propertyId,
          snapshotDate,
        },
      },
      include: {
        microAction: {
          select: {
            id: true,
            status: true,
            title: true,
            description: true,
            ctaLabel: true,
            etaMinutes: true,
            completedAt: true,
            dismissedAt: true,
          },
        },
      },
    });

    if (!snapshot) {
      try {
        const generated = await this.generateSnapshot(propertyId, userId);
        await this.bumpStreak(propertyId, userId, PropertyStreakType.DAILY_PULSE_CHECKIN, todayKey);
        generated.streaks = await this.getStreakCounts(propertyId);
        return generated;
      } catch (error) {
        const isUniqueViolation =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isUniqueViolation) {
          throw error;
        }

        snapshot = await prisma.propertyDailySnapshot.findUnique({
          where: {
            propertyId_snapshotDate: {
              propertyId,
              snapshotDate,
            },
          },
          include: {
            microAction: {
              select: {
                id: true,
                status: true,
                title: true,
                description: true,
                ctaLabel: true,
                etaMinutes: true,
                completedAt: true,
                dismissedAt: true,
              },
            },
          },
        });
      }
    }

    if (!snapshot) {
      throw new Error('Failed to generate daily snapshot.');
    }

    await this.bumpStreak(propertyId, userId, PropertyStreakType.DAILY_PULSE_CHECKIN, todayKey);
    const dto = toSnapshotDto(snapshot);
    dto.streaks = await this.getStreakCounts(propertyId);
    return dto;
  }

  async recordCheckin(propertyId: string, userId: string): Promise<{ streaks: DailySnapshotDTO['streaks'] }> {
    const property = await this.assertProperty(propertyId, userId);
    const timezone = property.timezone || DEFAULT_TIMEZONE;
    const todayKey = formatDateKeyInTimezone(new Date(), timezone);
    await this.bumpStreak(propertyId, userId, PropertyStreakType.DAILY_PULSE_CHECKIN, todayKey);
    return { streaks: await this.getStreakCounts(propertyId) };
  }

  async completeMicroAction(propertyId: string, actionId: string, userId: string) {
    const action = await prisma.propertyMicroAction.findFirst({
      where: {
        id: actionId,
        propertyId,
        property: {
          homeownerProfile: { userId },
        },
      },
    });

    if (!action) {
      throw new Error('Micro action not found for this property.');
    }

    if (action.status !== MicroActionStatus.COMPLETED) {
      await prisma.propertyMicroAction.update({
        where: { id: action.id },
        data: {
          status: MicroActionStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      if (action.sourceType === 'PROPERTY_MAINTENANCE_TASK' && action.sourceId) {
        await prisma.propertyMaintenanceTask
          .update({
            where: { id: action.sourceId },
            data: {
              status: MaintenanceTaskStatus.COMPLETED,
              lastCompletedDate: new Date(),
            },
          })
          .catch(() => undefined);
      }

      const property = await this.assertProperty(propertyId, userId);
      const timezone = property.timezone || DEFAULT_TIMEZONE;
      const todayKey = formatDateKeyInTimezone(new Date(), timezone);
      await this.bumpStreak(propertyId, userId, PropertyStreakType.MICRO_ACTION_COMPLETED, todayKey);
    }

    return {
      actionId: action.id,
      status: MicroActionStatus.COMPLETED,
      streaks: await this.getStreakCounts(propertyId),
    };
  }

  async dismissMicroAction(propertyId: string, actionId: string, userId: string) {
    const action = await prisma.propertyMicroAction.findFirst({
      where: {
        id: actionId,
        propertyId,
        property: {
          homeownerProfile: { userId },
        },
      },
    });

    if (!action) {
      throw new Error('Micro action not found for this property.');
    }

    await prisma.propertyMicroAction.update({
      where: { id: action.id },
      data: {
        status: MicroActionStatus.DISMISSED,
        dismissedAt: new Date(),
      },
    });

    return {
      actionId: action.id,
      status: MicroActionStatus.DISMISSED,
      streaks: await this.getStreakCounts(propertyId),
    };
  }
}

export const dailyHomePulseService = new DailyHomePulseService();
