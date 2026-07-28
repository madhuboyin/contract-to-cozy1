import { prisma } from '../../lib/prisma';
import { emitNorthStarLineageEvent } from '../analytics/northStarLineage';
import { resolvePropertyAccess } from '../propertyAccess.service';
import {
  OWNERSHIP_COST_CATEGORIES,
  type OwnershipCostCategory,
} from './ownershipCost.contract';
import { OwnershipCostAccessDeniedError } from './ownershipCostObservation.service';

export const OWNERSHIP_COST_DECISION_ACTIONS = [
  'ACCEPT',
  'SAVE',
  'DISMISS',
  'SNOOZE',
  'NO_ACTION',
  'RESOLVE',
  'REOPEN',
] as const;

export type OwnershipCostDecisionAction =
  typeof OWNERSHIP_COST_DECISION_ACTIONS[number];

export const OWNERSHIP_COST_NOTIFICATION_TYPES = [
  'MATERIAL_CHANGE',
  'UPCOMING_EVENT',
  'STALE_SCENARIO',
  'MISSING_HIGH_IMPACT_FACT',
] as const;

export type OwnershipCostNotificationType =
  typeof OWNERSHIP_COST_NOTIFICATION_TYPES[number];

export type OwnershipCostActionDestination = {
  owner:
    | 'PROPERTY_TAX'
    | 'COVERAGE'
    | 'FINANCING'
    | 'ENERGY'
    | 'HOA'
    | 'MAINTENANCE'
    | 'CAPITAL_TIMELINE'
    | 'RESERVE_FUND'
    | 'BUDGET'
    | 'SAVINGS';
  label: string;
  href: string;
  guidanceToolKey: string;
};

const categoryActionOwners: Record<
  OwnershipCostCategory,
  Omit<OwnershipCostActionDestination, 'href'>
> = {
  PROPERTY_TAX: {
    owner: 'PROPERTY_TAX',
    label: 'Review property tax',
    guidanceToolKey: 'property-tax',
  },
  INSURANCE: {
    owner: 'COVERAGE',
    label: 'Review coverage and premium',
    guidanceToolKey: 'coverage-intelligence',
  },
  HOA: {
    owner: 'HOA',
    label: 'Review HOA records',
    guidanceToolKey: 'hoa',
  },
  UTILITIES: {
    owner: 'ENERGY',
    label: 'Review energy savings',
    guidanceToolKey: 'savings-benefits',
  },
  MORTGAGE_PRINCIPAL: {
    owner: 'FINANCING',
    label: 'Review financing',
    guidanceToolKey: 'financing',
  },
  MORTGAGE_INTEREST: {
    owner: 'FINANCING',
    label: 'Review financing',
    guidanceToolKey: 'financing',
  },
  PMI: {
    owner: 'FINANCING',
    label: 'Review financing',
    guidanceToolKey: 'financing',
  },
  RECURRING_HOME_SERVICE: {
    owner: 'SAVINGS',
    label: 'Review recurring savings',
    guidanceToolKey: 'savings-benefits',
  },
  ROUTINE_MAINTENANCE: {
    owner: 'MAINTENANCE',
    label: 'Review maintenance plan',
    guidanceToolKey: 'maintenance',
  },
  KNOWN_REPAIR: {
    owner: 'CAPITAL_TIMELINE',
    label: 'Review capital timeline',
    guidanceToolKey: 'capital-timeline',
  },
  CAPITAL_PROJECT: {
    owner: 'CAPITAL_TIMELINE',
    label: 'Review capital timeline',
    guidanceToolKey: 'capital-timeline',
  },
  RESERVE_CONTRIBUTION: {
    owner: 'RESERVE_FUND',
    label: 'Review reserve plan',
    guidanceToolKey: 'reserve-fund',
  },
};

function propertyTool(propertyId: string, tool: string) {
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/${tool}`;
}

export function resolveOwnershipCostCategoryAction(
  propertyId: string,
  category: OwnershipCostCategory,
): OwnershipCostActionDestination {
  const destination = categoryActionOwners[category];
  const href = destination.owner === 'HOA'
    ? `/dashboard/hoa?propertyId=${encodeURIComponent(propertyId)}`
    : destination.owner === 'MAINTENANCE'
      ? `/dashboard/maintenance?propertyId=${encodeURIComponent(propertyId)}`
      : destination.owner === 'ENERGY'
        ? `${propertyTool(propertyId, 'savings-benefits')}?section=recurring&category=energy`
        : destination.owner === 'SAVINGS'
          ? `${propertyTool(propertyId, 'savings-benefits')}?section=recurring`
          : propertyTool(propertyId, destination.guidanceToolKey);
  return { ...destination, href };
}

export function resolveOwnershipCostPlanningAction(
  propertyId: string,
  target: 'BUDGET' | 'RESERVE_FUND',
): OwnershipCostActionDestination {
  if (target === 'BUDGET') {
    return {
      owner: 'BUDGET',
      label: 'Add to monthly budget',
      href: `/dashboard/budget?propertyId=${encodeURIComponent(propertyId)}`,
      guidanceToolKey: 'budget',
    };
  }
  return {
    owner: 'RESERVE_FUND',
    label: 'Add to reserve plan',
    href: propertyTool(propertyId, 'reserve-fund'),
    guidanceToolKey: 'reserve-fund',
  };
}

type DecisionPayload = {
  contractVersion: 'ownership-cost-decision-v1';
  canonicalKey: string;
  lifecycleState:
    | 'OPEN'
    | 'ACCEPTED'
    | 'SAVED'
    | 'DISMISSED'
    | 'SNOOZED'
    | 'NO_ACTION'
    | 'RESOLVED';
  action: OwnershipCostDecisionAction;
  category: OwnershipCostCategory;
  owner: OwnershipCostActionDestination['owner'];
  destination: OwnershipCostActionDestination;
  reason: string;
  revisitAt: string | null;
  source: {
    snapshotId: string;
    changeId: string | null;
    scenarioId: string | null;
    sourceActionId: string;
    explanation: string;
  };
  recordedAt: string;
};

type StoredDecision = {
  id: string;
  propertyId: string;
  snapshotId: string | null;
  scenarioId: string | null;
  recordedByUserId: string;
  decisionType: string;
  status: 'RECORDED' | 'REVISED' | 'SUPERSEDED';
  payloadJson: unknown;
  sourceActionId: string | null;
  recordedAt: Date;
  supersededById: string | null;
};

type DecisionDependencies = {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  loadLatestSnapshot: (propertyId: string) => Promise<{ id: string } | null>;
  loadChange: (propertyId: string, changeId: string) => Promise<{
    id: string;
    category: OwnershipCostCategory;
    toSnapshotId: string;
    evidenceJson: unknown;
  } | null>;
  loadScenario: (
    propertyId: string,
    scenarioId: string,
  ) => Promise<{ id: string; baseSnapshotId: string } | null>;
  listCurrent: (propertyId: string) => Promise<StoredDecision[]>;
  persistTransition: (input: {
    propertyId: string;
    snapshotId: string;
    scenarioId: string | null;
    userId: string;
    decisionType: string;
    sourceActionId: string;
    payload: DecisionPayload | NotificationPreferencePayload;
  }) => Promise<StoredDecision>;
  now: () => Date;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceExplanation(change: { evidenceJson: unknown } | null) {
  const evidence = objectValue(change?.evidenceJson);
  const explanation = evidence.explanation;
  return typeof explanation === 'string' && explanation.trim()
    ? explanation.trim().slice(0, 1200)
    : null;
}

function lifecycleState(action: OwnershipCostDecisionAction): DecisionPayload['lifecycleState'] {
  if (action === 'REOPEN') return 'OPEN';
  if (action === 'ACCEPT') return 'ACCEPTED';
  if (action === 'SAVE') return 'SAVED';
  if (action === 'DISMISS') return 'DISMISSED';
  if (action === 'SNOOZE') return 'SNOOZED';
  if (action === 'NO_ACTION') return 'NO_ACTION';
  return 'RESOLVED';
}

function validateRevisitAt(action: OwnershipCostDecisionAction, value: string | null | undefined, now: Date) {
  if (action !== 'SNOOZE') return null;
  if (!value) throw new Error('Snoozing an ownership-cost action requires a revisit date.');
  const revisitAt = new Date(value);
  const max = new Date(now);
  max.setUTCFullYear(max.getUTCFullYear() + 1);
  if (Number.isNaN(revisitAt.getTime()) || revisitAt <= now || revisitAt > max) {
    throw new Error('The revisit date must be in the future and within 365 days.');
  }
  return revisitAt.toISOString();
}

function validateReason(action: OwnershipCostDecisionAction, reason: string | null | undefined) {
  const trimmed = reason?.trim();
  if (['DISMISS', 'NO_ACTION', 'RESOLVE'].includes(action) && !trimmed) {
    throw new Error(`${action} requires a homeowner reason.`);
  }
  return (trimmed || action.toLowerCase().replace(/_/g, ' ')).slice(0, 1000);
}

const defaultDependencies: DecisionDependencies = {
  authorize: async (userId, propertyId) =>
    Boolean(await resolvePropertyAccess(userId, propertyId)),
  loadLatestSnapshot: (propertyId) => prisma.ownershipCostSnapshot.findFirst({
    where: { propertyId },
    orderBy: [{ basePeriodEnd: 'desc' }, { computedAt: 'desc' }],
    select: { id: true },
  }),
  loadChange: (propertyId, changeId) => prisma.ownershipCostChange.findFirst({
    where: { id: changeId, propertyId },
    select: {
      id: true,
      category: true,
      toSnapshotId: true,
      evidenceJson: true,
    },
  }),
  loadScenario: (propertyId, scenarioId) => prisma.ownershipCostScenario.findFirst({
    where: { id: scenarioId, propertyId },
    select: { id: true, baseSnapshotId: true },
  }),
  listCurrent: (propertyId) => prisma.ownershipCostDecision.findMany({
    where: { propertyId, status: { not: 'SUPERSEDED' } },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
  }),
  persistTransition: async (input) => prisma.$transaction(async (tx: any) => {
    const previous = await tx.ownershipCostDecision.findFirst({
      where: {
        propertyId: input.propertyId,
        sourceActionId: input.sourceActionId,
        status: { not: 'SUPERSEDED' },
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    const created = await tx.ownershipCostDecision.create({
      data: {
        propertyId: input.propertyId,
        snapshotId: input.snapshotId,
        scenarioId: input.scenarioId,
        recordedByUserId: input.userId,
        decisionType: input.decisionType,
        status: previous ? 'REVISED' : 'RECORDED',
        payloadJson: input.payload as any,
        sourceActionId: input.sourceActionId,
      },
    });
    if (previous) {
      await tx.ownershipCostDecision.update({
        where: { id: previous.id },
        data: { status: 'SUPERSEDED', supersededById: created.id },
      });
    }
    return created;
  }),
  now: () => new Date(),
};

type NotificationPreferencePayload = {
  contractVersion: 'ownership-cost-notification-preferences-v1';
  canonicalKey: 'ownership-cost-notifications';
  preferences: Record<OwnershipCostNotificationType, boolean>;
  source: { snapshotId: string };
  recordedAt: string;
};

const DEFAULT_NOTIFICATION_PREFERENCES: Record<OwnershipCostNotificationType, boolean> = {
  MATERIAL_CHANGE: true,
  UPCOMING_EVENT: true,
  STALE_SCENARIO: true,
  MISSING_HIGH_IMPACT_FACT: false,
};

export class OwnershipCostDecisionService {
  constructor(private readonly dependencies: DecisionDependencies = defaultDependencies) {}

  private async assertAccess(userId: string, propertyId: string) {
    if (!await this.dependencies.authorize(userId, propertyId)) {
      throw new OwnershipCostAccessDeniedError();
    }
  }

  async list(propertyId: string, userId: string) {
    await this.assertAccess(userId, propertyId);
    const rows = await this.dependencies.listCurrent(propertyId);
    const decisions: Array<Record<string, any>> = rows
      .filter((row) => row.decisionType === 'CATEGORY_ACTION')
      .map((row) => {
        const payload = objectValue(row.payloadJson);
        return {
          ...payload,
          id: row.id,
          propertyId: row.propertyId,
          snapshotId: row.snapshotId,
          scenarioId: row.scenarioId,
          recordedByUserId: row.recordedByUserId,
          status: row.status,
          sourceActionId: row.sourceActionId,
          recordedAt: row.recordedAt.toISOString(),
        };
      });
    const notificationRow = rows.find(
      (row) => row.decisionType === 'NOTIFICATION_PREFERENCE',
    );
    const notificationPayload = objectValue(notificationRow?.payloadJson);
    const storedPreferences = objectValue(notificationPayload.preferences);
    const notificationPreferences = Object.fromEntries(
      OWNERSHIP_COST_NOTIFICATION_TYPES.map((type) => [
        type,
        typeof storedPreferences[type] === 'boolean'
          ? storedPreferences[type]
          : DEFAULT_NOTIFICATION_PREFERENCES[type],
      ]),
    ) as Record<OwnershipCostNotificationType, boolean>;
    return {
      contractVersion: 'ownership-cost-decision-read-v1',
      decisions,
      revisitEvents: decisions
        .filter((decision) => decision.lifecycleState === 'SNOOZED' && decision.revisitAt)
        .map((decision) => ({
          decisionId: decision.id,
          sourceActionId: decision.sourceActionId,
          revisitAt: decision.revisitAt,
          category: decision.category,
          reason: decision.reason,
        })),
      notificationPreferences,
      lifecycleRule:
        'Only an explicit homeowner decision or resolution completes an ownership-cost action.',
    };
  }

  async record(propertyId: string, userId: string, input: {
    action: OwnershipCostDecisionAction;
    category?: OwnershipCostCategory;
    sourceChangeId?: string | null;
    scenarioId?: string | null;
    sourceActionId?: string | null;
    explanation?: string | null;
    reason?: string | null;
    revisitAt?: string | null;
  }) {
    await this.assertAccess(userId, propertyId);
    const change = input.sourceChangeId
      ? await this.dependencies.loadChange(propertyId, input.sourceChangeId)
      : null;
    if (input.sourceChangeId && !change) {
      throw new Error('Ownership-cost change was not found for this property.');
    }
    const category = change?.category ?? input.category;
    if (!category || !OWNERSHIP_COST_CATEGORIES.includes(category)) {
      throw new Error('A supported ownership-cost category is required.');
    }
    const scenario = input.scenarioId
      ? await this.dependencies.loadScenario(propertyId, input.scenarioId)
      : null;
    if (input.scenarioId && !scenario) {
      throw new Error('Ownership-cost scenario was not found for this property.');
    }
    const latestSnapshot = change
      ? { id: change.toSnapshotId }
      : scenario
        ? { id: scenario.baseSnapshotId }
        : await this.dependencies.loadLatestSnapshot(propertyId);
    if (!latestSnapshot) throw new Error('No ownership-cost snapshot is available.');

    const now = this.dependencies.now();
    const revisitAt = validateRevisitAt(input.action, input.revisitAt, now);
    const reason = validateReason(input.action, input.reason);
    const destination = resolveOwnershipCostCategoryAction(propertyId, category);
    const sourceActionId = input.sourceActionId?.trim()
      || (change
        ? `ownership-cost-change:${change.id}`
        : `ownership-cost-category:${propertyId}:${category}`);
    const explanation = sourceExplanation(change)
      ?? input.explanation?.trim().slice(0, 1200)
      ?? `${category.toLowerCase().replace(/_/g, ' ')} ownership-cost action.`;
    const payload: DecisionPayload = {
      contractVersion: 'ownership-cost-decision-v1',
      canonicalKey: sourceActionId,
      lifecycleState: lifecycleState(input.action),
      action: input.action,
      category,
      owner: destination.owner,
      destination,
      reason,
      revisitAt,
      source: {
        snapshotId: latestSnapshot.id,
        changeId: change?.id ?? null,
        scenarioId: scenario?.id ?? null,
        sourceActionId,
        explanation,
      },
      recordedAt: now.toISOString(),
    };
    const stored = await this.dependencies.persistTransition({
      propertyId,
      snapshotId: latestSnapshot.id,
      scenarioId: scenario?.id ?? null,
      userId,
      decisionType: 'CATEGORY_ACTION',
      sourceActionId,
      payload,
    });

    const resolved = ['DISMISS', 'NO_ACTION', 'RESOLVE'].includes(input.action);
    emitNorthStarLineageEvent({
      eventType: resolved
        ? 'HOME_ACTION_RESOLUTION_RECORDED'
        : 'HOME_ACTION_ACTED',
      propertyId,
      userId,
      source: 'ownership_cost_decision',
      entryId: `ownership-costs:${propertyId}`,
      triggerId: `trigger:${sourceActionId}`,
      signalId: sourceActionId,
      actionId: sourceActionId,
      decisionId: stored.id,
      recommendationVersion: 'ownership-cost-decision-v1',
      ...(resolved ? {
        resolutionDisposition:
          input.action === 'RESOLVE' ? 'COMPLETED' : 'DELIBERATELY_DISMISSED',
        resolutionReason: reason,
        verificationStatus: input.action === 'RESOLVE' ? 'PENDING' : 'NOT_REQUIRED',
        consequenceAcknowledged: true,
        unresolvedSafetyRequirement: false,
      } : {}),
      nextTriggerAt: revisitAt,
    });

    return {
      ...payload,
      id: stored.id,
      propertyId,
      snapshotId: latestSnapshot.id,
      scenarioId: scenario?.id ?? null,
      recordedByUserId: userId,
      recordedAt: stored.recordedAt.toISOString(),
    };
  }

  async updateNotificationPreferences(
    propertyId: string,
    userId: string,
    preferences: Partial<Record<OwnershipCostNotificationType, boolean>>,
  ) {
    await this.assertAccess(userId, propertyId);
    const latestSnapshot = await this.dependencies.loadLatestSnapshot(propertyId);
    if (!latestSnapshot) throw new Error('No ownership-cost snapshot is available.');
    const current = await this.list(propertyId, userId);
    const merged = { ...current.notificationPreferences, ...preferences };
    const now = this.dependencies.now();
    const payload: NotificationPreferencePayload = {
      contractVersion: 'ownership-cost-notification-preferences-v1',
      canonicalKey: 'ownership-cost-notifications',
      preferences: merged,
      source: { snapshotId: latestSnapshot.id },
      recordedAt: now.toISOString(),
    };
    const stored = await this.dependencies.persistTransition({
      propertyId,
      snapshotId: latestSnapshot.id,
      scenarioId: null,
      userId,
      decisionType: 'NOTIFICATION_PREFERENCE',
      sourceActionId: 'ownership-cost-notifications',
      payload,
    });
    return {
      id: stored.id,
      preferences: merged,
      snapshotId: latestSnapshot.id,
      recordedAt: stored.recordedAt.toISOString(),
    };
  }
}

export const ownershipCostDecisionService = new OwnershipCostDecisionService();
