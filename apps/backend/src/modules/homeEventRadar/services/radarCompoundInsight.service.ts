import { prisma } from '../../../lib/prisma';
import {
  evaluateRadarCompoundRules,
  type RadarCompoundEventInput,
  type RadarCompoundPropertyFacts,
} from '../domain/radarCompoundRules';

const OPEN_TASK_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW']);
const FILTER_CURRENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000;

type MaintenanceTaskSnapshot = {
  title?: string | null;
  actionKey?: string | null;
  assetType?: string | null;
  category?: string | null;
  serviceCategory?: string | null;
  status?: string | null;
  nextDueDate?: Date | string | null;
  lastCompletedDate?: Date | string | null;
};

function normalizedTaskText(task: MaintenanceTaskSnapshot): string {
  return [
    task.title,
    task.actionKey,
    task.assetType,
    task.category,
    task.serviceCategory,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .trim()
    .toLowerCase();
}

function taskDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function compoundMaintenanceFacts(
  tasks: MaintenanceTaskSnapshot[],
  evaluatedAt: Date,
): Pick<RadarCompoundPropertyFacts, 'hvacFilterState' | 'unresolvedRoofIssue' | 'unresolvedGutterOrDrainageIssue'> {
  const filterTasks = tasks.filter((task) => {
    const text = normalizedTaskText(task);
    return text.includes('filter') && (
      text.includes('hvac')
      || text.includes('furnace')
      || text.includes('air handler')
      || text.includes('air conditioning')
    );
  });
  const openFilterTask = filterTasks.find((task) =>
    OPEN_TASK_STATUSES.has(String(task.status)));
  let hvacFilterState: RadarCompoundPropertyFacts['hvacFilterState'] = 'unknown';
  if (openFilterTask) {
    const dueAt = taskDate(openFilterTask.nextDueDate);
    hvacFilterState =
      String(openFilterTask.status) === 'NEEDS_REVIEW'
      || !dueAt
      || dueAt.getTime() <= evaluatedAt.getTime()
        ? 'due'
        : 'current';
  } else {
    const lastCompletedAt = filterTasks
      .map((task) => taskDate(task.lastCompletedDate))
      .filter((value): value is Date => value !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0];
    if (
      lastCompletedAt
      && evaluatedAt.getTime() - lastCompletedAt.getTime() <= FILTER_CURRENT_WINDOW_MS
    ) {
      hvacFilterState = 'current';
    }
  }

  const unresolvedRoofIssue = tasks.some((task) => {
    if (!OPEN_TASK_STATUSES.has(String(task.status))) return false;
    const text = normalizedTaskText(task);
    return text.includes('roof') || text.includes('shingle') || text.includes('flashing');
  });

  const unresolvedGutterOrDrainageIssue = tasks.some((task) => {
    if (!OPEN_TASK_STATUSES.has(String(task.status))) return false;
    const text = normalizedTaskText(task);
    return text.includes('gutter')
      || text.includes('downspout')
      || text.includes('drain')
      || text.includes('grading');
  });

  return { hvacFilterState, unresolvedRoofIssue, unresolvedGutterOrDrainageIssue };
}

function compoundEventInput(match: any): RadarCompoundEventInput {
  const event = match.radarEvent;
  return {
    matchId: String(match.id),
    eventId: String(event.id),
    eventType: String(event.eventType),
    eventSubType: event.eventSubType ?? null,
    severity: String(event.severity),
    effectiveAt: event.startAt,
    expiresAt: event.endAt ?? null,
    lifecycleStatus: String(match.lifecycleStatus),
    sourceFreshnessStatus: String(match.sourceFreshnessStatus),
    sourceDefinitionId: event.sourceDefinitionId ?? null,
    sourceName: event.sourceDefinition?.name ?? null,
    provider: event.sourceDefinition?.provider ?? null,
    canonicalUrl: event.canonicalUrl ?? null,
  };
}
export type RadarCompoundReconciliationResult = {
  propertyId: string;
  active: number;
  resolved: number;
  correlationKeys: string[];
};

/**
 * Recomputes the complete reviewed compound-insight set for one property.
 * Absent insights are resolved only from this complete local database view;
 * provider fetch failures remain represented by stale constituent matches and
 * are excluded without manufacturing a provider resolution.
 */
export async function reconcileRadarCompoundInsightsForProperty(
  propertyId: string,
  dbOverride: any = prisma,
  evaluatedAt: Date = new Date(),
): Promise<RadarCompoundReconciliationResult> {
  if (!Number.isFinite(evaluatedAt.getTime())) {
    throw new TypeError('Compound Radar reconciliation time must be valid');
  }
  const db = dbOverride as any;
  const [property, matches, tasks] = await Promise.all([
    db.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        hasSumpPump: true,
        hasSumpPumpBackup: true,
        primaryHeatingFuel: true,
      },
    }),
    db.propertyRadarMatch.findMany({
      where: {
        propertyId,
        isVisible: true,
        lifecycleStatus: { in: ['now', 'upcoming'] },
        sourceFreshnessStatus: 'fresh',
        radarEvent: {
          status: { in: ['active', 'updated'] },
        },
      },
      include: {
        radarEvent: {
          include: {
            sourceDefinition: {
              select: {
                name: true,
                provider: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    db.propertyMaintenanceTask.findMany({
      where: { propertyId },
      select: {
        title: true,
        actionKey: true,
        assetType: true,
        category: true,
        serviceCategory: true,
        status: true,
        nextDueDate: true,
        lastCompletedDate: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 250,
    }),
  ]);
  if (!property) {
    return { propertyId, active: 0, resolved: 0, correlationKeys: [] };
  }

  const maintenanceFacts = compoundMaintenanceFacts(tasks, evaluatedAt);
  const insights = evaluateRadarCompoundRules({
    propertyId,
    events: matches.map(compoundEventInput),
    facts: {
      hasSumpPump: property.hasSumpPump,
      hasSumpPumpBackup: property.hasSumpPumpBackup,
      primaryHeatingFuel: property.primaryHeatingFuel,
      ...maintenanceFacts,
    },
    evaluatedAt,
  });
  const correlationKeys = insights.map((candidate) => candidate.correlationKey);

  for (const candidate of insights) {
    await db.propertyRadarCompoundInsight.upsert({
      where: { correlationKey: candidate.correlationKey },
      create: {
        propertyId,
        ruleCode: candidate.ruleCode,
        ruleVersion: candidate.ruleVersion,
        correlationKey: candidate.correlationKey,
        status: 'active',
        title: candidate.title,
        summary: candidate.summary,
        sourceMatchIdsJson: candidate.sourceMatchIds,
        sourceEventIdsJson: candidate.sourceEventIds,
        sourceEvidenceJson: candidate.sourceEvidence,
        factEvidenceJson: candidate.factEvidence,
        recommendedActionsJson: { actions: candidate.recommendedActions },
        evaluatedAt,
        resolvedAt: null,
      },
      update: {
        ruleVersion: candidate.ruleVersion,
        status: 'active',
        title: candidate.title,
        summary: candidate.summary,
        sourceMatchIdsJson: candidate.sourceMatchIds,
        sourceEventIdsJson: candidate.sourceEventIds,
        sourceEvidenceJson: candidate.sourceEvidence,
        factEvidenceJson: candidate.factEvidence,
        recommendedActionsJson: { actions: candidate.recommendedActions },
        evaluatedAt,
        resolvedAt: null,
      },
    });
  }

  const resolved = await db.propertyRadarCompoundInsight.updateMany({
    where: {
      propertyId,
      status: 'active',
      evaluatedAt: { lt: evaluatedAt },
      ...(correlationKeys.length > 0
        ? { correlationKey: { notIn: correlationKeys } }
        : {}),
    },
    data: {
      status: 'resolved',
      resolvedAt: evaluatedAt,
    },
  });
  return {
    propertyId,
    active: insights.length,
    resolved: Number(resolved?.count ?? 0),
    correlationKeys,
  };
}
