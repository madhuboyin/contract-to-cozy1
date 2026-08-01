import { prisma } from '../../config/database';

/**
 * Item #23 (§14 "Measurement"). Same shape as renovationOperationalHealthService.ts's
 * summarize(snapshot, now) / get() split — computed entirely from existing
 * OperationalWorkItem/OperationalWorkEvent/OperationalWorkSource/
 * HomeBriefingItem/ProjectRecord rows, no new event emission.
 *
 * Not every metric §14 names is computable today (no item-agnostic "viewed"
 * signal, no candidate-suppression counter, no source-freshness tracking,
 * no confirmed RecommendationIncident<->work-item linkage). Those come back
 * `null` with a matching entry in `gaps` — never a fabricated number.
 */

type WorkItemSnapshot = {
  id: string;
  propertyId: string;
  state: string;
  acceptanceState: string;
  disposition: string | null;
  priority: string;
  dueAt: Date | null;
  createdAt: Date;
  acceptedAt: Date | null;
  startedAt: Date | null;
  reportedCompletedAt: Date | null;
  verifiedAt: Date | null;
  understoodAt: Date | null;
  safetyTier: string;
};

type HomeOperationsMeasurementSnapshot = {
  workItems: WorkItemSnapshot[];
  sources: Array<{ workItemId: string; active: boolean; lastObservedAt: Date; reconciledAt: Date | null }>;
  events: Array<{ workItemId: string; eventType: string; occurredAt: Date }>;
  evidence: Array<{ workItemId: string; verificationStatus: string }>;
  scheduledEvents: Array<{ workItemId: string; occurredAt: Date }>;
  reopenedEvents: Array<{ workItemId: string; occurredAt: Date }>;
  briefingItems: Array<{
    openedAt: Date | null;
    seenAt: Date | null;
    actedAt: Date | null;
    dismissedAt: Date | null;
    notUsefulAt: Date | null;
  }>;
  projectExecutions: Array<{ workItemId: string; executionEntityId: string }>;
  projects: Array<{ id: string; status: string; outcomeStatus: string | null }>;
  writeBackProjectIds: string[];
};

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

function averageHours(diffsMs: number[]): number | null {
  if (diffsMs.length === 0) return null;
  const avgMs = diffsMs.reduce((sum, value) => sum + value, 0) / diffsMs.length;
  return Math.round((avgMs / 3_600_000) * 10) / 10;
}

function stageDuration<T>(
  items: WorkItemSnapshot[],
  fromAt: (item: WorkItemSnapshot) => Date | null,
  toAt: (item: WorkItemSnapshot) => Date | null,
): { count: number; averageHours: number | null } {
  const diffs: number[] = [];
  for (const item of items) {
    const from = fromAt(item);
    const to = toAt(item);
    if (from && to && to.getTime() >= from.getTime()) diffs.push(to.getTime() - from.getTime());
  }
  return { count: diffs.length, averageHours: averageHours(diffs) };
}

const OPEN_STATES = new Set(['CANDIDATE', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE', 'IN_PROJECT', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'REOPENED', 'FOLLOW_UP_DUE']);

export function summarizeHomeOperationsMeasurement(
  snapshot: HomeOperationsMeasurementSnapshot,
  now = new Date(),
) {
  const gaps: string[] = [];

  const scheduledAtByWorkItem = new Map<string, Date>();
  for (const event of snapshot.scheduledEvents) {
    const existing = scheduledAtByWorkItem.get(event.workItemId);
    if (!existing || event.occurredAt < existing) scheduledAtByWorkItem.set(event.workItemId, event.occurredAt);
  }

  // ── North star (§14.1) ────────────────────────────────────────────────
  const importantVerified = snapshot.workItems.filter(
    (item) => item.state === 'VERIFIED' && (item.priority === 'NOW' || item.priority === 'SOON'),
  );
  const activePropertyIds = new Set(snapshot.workItems.map((item) => item.propertyId));

  // ── Funnel (§14.2) ───────────────────────────────────────────────────
  const candidateCount = snapshot.sources.length;
  const uniqueWorkItemCount = snapshot.workItems.length;
  const acceptedItems = snapshot.workItems.filter((item) => item.acceptanceState === 'ACCEPTED');
  const declinedItems = snapshot.workItems.filter((item) => item.acceptanceState === 'DECLINED');

  const acceptedToScheduled = stageDuration(
    snapshot.workItems,
    (item) => item.acceptedAt,
    (item) => scheduledAtByWorkItem.get(item.id) ?? null,
  );
  const scheduledToStarted = stageDuration(
    snapshot.workItems,
    (item) => scheduledAtByWorkItem.get(item.id) ?? null,
    (item) => item.startedAt,
  );
  const startedToReportedComplete = stageDuration(
    snapshot.workItems,
    (item) => item.startedAt,
    (item) => item.reportedCompletedAt,
  );
  const reportedToVerified = stageDuration(
    snapshot.workItems,
    (item) => item.reportedCompletedAt,
    (item) => item.verifiedAt,
  );

  const activeSources = snapshot.sources.filter((source) => source.active);
  const openItemsWithDueDate = snapshot.workItems.filter(
    (item) => item.dueAt != null && OPEN_STATES.has(item.state),
  );
  const overdueItems = openItemsWithDueDate.filter((item) => item.dueAt! < now);
  const everCompletedCount = snapshot.workItems.filter(
    (item) => item.reportedCompletedAt != null || item.verifiedAt != null,
  ).length;

  const understoodItems = snapshot.workItems.filter((item) => item.understoodAt != null);
  const verifiedItems = snapshot.workItems.filter((item) => item.state === 'VERIFIED');
  const activeSourceWorkItemIds = new Set(snapshot.sources.filter((source) => source.active).map((source) => source.workItemId));
  const completedWithSourcesReconciled = verifiedItems.filter((item) => !activeSourceWorkItemIds.has(item.id));
  const lifecycleCount = (eventType: string) => new Set(
    snapshot.events.filter((event) => event.eventType === eventType).map((event) => event.workItemId),
  ).size;

  // ── Trust & quality (§14.3) ─────────────────────────────────────────────
  const briefedWithNoEngagement = snapshot.briefingItems.filter(
    (item) => !item.openedAt && !item.seenAt && !item.actedAt && !item.dismissedAt && !item.notUsefulAt,
  );

  const projectIdsWithExecution = [...new Set(snapshot.projectExecutions.map((e) => e.executionEntityId))];
  const trackedProjects = snapshot.projects.filter((project) => projectIdsWithExecution.includes(project.id));
  const completedTrackedProjects = trackedProjects.filter((project) => project.status === 'COMPLETED');
  const writeBackProjectIdSet = new Set(snapshot.writeBackProjectIds);
  const successfulWriteBacks = completedTrackedProjects.filter((project) => writeBackProjectIdSet.has(project.id));

  const unresolvedSourceAfterVerifiedOutcome = verifiedItems.filter((item) => activeSourceWorkItemIds.has(item.id)).length;
  gaps.push('workHiddenWhileSourceOpen: no "hidden" concept is tracked on OperationalWorkItem.');
  gaps.push('incorrectMergesAndDuplicateSplits: merges/duplicate dispositions are recorded, but nothing flags a merge as later found incorrect.');
  const staleSourceCutoff = new Date(now.getTime() - 30 * 86_400_000);
  const staleSourcePromotions = snapshot.sources.filter((source) => source.active && source.lastObservedAt < staleSourceCutoff).length;
  const verifiedEvidenceWorkItemIds = new Set(snapshot.evidence.filter((entry) => entry.verificationStatus === 'VERIFIED').map((entry) => entry.workItemId));
  const safetyGovernanceViolations = verifiedItems.filter(
    (item) => item.safetyTier === 'SAFETY_EMERGENCY' && !verifiedEvidenceWorkItemIds.has(item.id),
  ).length;
  gaps.push('factCorrectionCompletion: no fact-correction tracking model was found linked to Home Operations work items.');
  gaps.push('accessibilityDefects: not an automated signal anywhere in this codebase — would be manually/QA-logged, not computed.');

  // ── Guardrail context (§14.4) — explicitly not success metrics ────────
  const dismissedItems = snapshot.workItems.filter((item) => item.state === 'CLOSED' && item.disposition === 'DISMISSED');
  const projectsWithoutVerifiedOutcome = snapshot.projects.filter((project) => project.outcomeStatus !== 'VERIFIED_SUCCESS');
  gaps.push('guardrailContext.remindersSent: no per-property reminder-sent counter is persisted anywhere (the reminder cron\'s run result is a log line, not a stored per-property count) — omitted rather than approximated from an unrelated count.');

  return {
    generatedAt: now.toISOString(),
    northStar: {
      verifiedImportantOutcomes: importantVerified.length,
      activeProperties: activePropertyIds.size,
      perPropertyRate: percent(importantVerified.length, activePropertyIds.size),
    },
    funnel: {
      actionableCandidatesDetected: candidateCount,
      uniqueWorkItemsAfterReconciliation: uniqueWorkItemCount,
      reconciliationRatio: percent(uniqueWorkItemCount, candidateCount),
      acceptanceRate: percent(acceptedItems.length, acceptedItems.length + declinedItems.length),
      acceptedToScheduledHours: acceptedToScheduled,
      scheduledToStartedHours: scheduledToStarted,
      startedToReportedCompleteHours: startedToReportedComplete,
      reportedToVerifiedHours: reportedToVerified,
      sourceReconciliationSuccessRate: percent(snapshot.sources.filter((source) => source.reconciledAt != null).length, snapshot.sources.length),
      overdueRate: percent(overdueItems.length, openItemsWithDueDate.length),
      reopenRate: percent(snapshot.reopenedEvents.length, everCompletedCount),
      recommendationUnderstoodRate: percent(understoodItems.length, snapshot.workItems.length),
      duplicatePreventionRate: percent(Math.max(0, candidateCount - uniqueWorkItemCount), candidateCount),
      completedWithoutDuplicateClosure: percent(completedWithSourcesReconciled.length, verifiedItems.length),
      stages: {
        candidateDetected: lifecycleCount('WORK_CANDIDATE_DETECTED'),
        homeownerUnderstood: lifecycleCount('WORK_UNDERSTOOD'),
        workAccepted: lifecycleCount('WORK_ACCEPTED'),
        scheduledOrAssigned: new Set(snapshot.events.filter((event) => ['WORK_SCHEDULED', 'WORK_ASSIGNED'].includes(event.eventType)).map((event) => event.workItemId)).size,
        executionStarted: lifecycleCount('EXECUTION_STARTED'),
        reportedComplete: lifecycleCount('WORK_REPORTED_COMPLETE'),
        evidenceReceived: new Set(snapshot.evidence.map((entry) => entry.workItemId)).size,
        outcomeVerified: lifecycleCount('OUTCOME_VERIFIED'),
        sourceConditionReconciled: snapshot.sources.filter((source) => source.reconciledAt != null).length,
        recurrenceOrFollowUpCreated: lifecycleCount('FOLLOW_UP_CREATED'),
      },
    },
    trust: {
      falseCompletionIncidents: snapshot.reopenedEvents.length,
      notificationsWithoutActionableChange: {
        count: briefedWithNoEngagement.length,
        rate: percent(briefedWithNoEngagement.length, snapshot.briefingItems.length),
      },
      projectWriteBackFailures: {
        completedProjects: completedTrackedProjects.length,
        successfulWriteBacks: successfulWriteBacks.length,
        failureRate: percent(completedTrackedProjects.length - successfulWriteBacks.length, completedTrackedProjects.length),
      },
      unresolvedSourceAfterVerifiedOutcome,
      workHiddenWhileSourceOpen: null,
      incorrectMergesAndDuplicateSplits: null,
      staleSourcePromotions,
      safetyGovernanceViolations,
      factCorrectionCompletion: null,
      accessibilityDefects: null,
    },
    guardrailContext: {
      workItemsCreated: uniqueWorkItemCount,
      dismissalsRecorded: dismissedItems.length,
      projectsCreatedWithoutVerifiedOutcome: projectsWithoutVerifiedOutcome.length,
    },
    gaps,
  };
}

function dateFilter(field: string, from?: Date, to?: Date) {
  return from || to ? {
    [field]: {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    },
  } : {};
}

export async function getHomeOperationsMeasurement(from?: Date, to?: Date) {
  const itemFilter = dateFilter('createdAt', from, to);

  const workItems = await prisma.operationalWorkItem.findMany({
    where: itemFilter,
    select: {
      id: true,
      propertyId: true,
      state: true,
      acceptanceState: true,
      disposition: true,
      priority: true,
      dueAt: true,
      createdAt: true,
      acceptedAt: true,
      startedAt: true,
      reportedCompletedAt: true,
      verifiedAt: true,
      understoodAt: true,
      safetyTier: true,
    },
  });
  const workItemIds = workItems.map((item) => item.id);

  const [sources, events, evidence, scheduledEvents, reopenedEvents, briefingItems, projectExecutions] = await Promise.all([
    prisma.operationalWorkSource.findMany({
      where: { workItemId: { in: workItemIds } },
      select: { workItemId: true, active: true, lastObservedAt: true, reconciledAt: true },
    }),
    prisma.operationalWorkEvent.findMany({
      where: { workItemId: { in: workItemIds }, ...dateFilter('occurredAt', from, to) },
      select: { workItemId: true, eventType: true, occurredAt: true },
    }),
    prisma.operationalWorkEvidence.findMany({
      where: { workItemId: { in: workItemIds } },
      select: { workItemId: true, verificationStatus: true },
    }),
    prisma.operationalWorkEvent.findMany({
      where: { workItemId: { in: workItemIds }, eventType: 'WORK_SCHEDULED' },
      select: { workItemId: true, occurredAt: true },
    }),
    prisma.operationalWorkEvent.findMany({
      where: { workItemId: { in: workItemIds }, eventType: 'WORK_REOPENED', ...dateFilter('occurredAt', from, to) },
      select: { workItemId: true, occurredAt: true },
    }),
    prisma.homeBriefingItem.findMany({
      where: dateFilter('createdAt', from, to),
      select: { openedAt: true, seenAt: true, actedAt: true, dismissedAt: true, notUsefulAt: true },
    }),
    prisma.operationalWorkExecution.findMany({
      where: { workItemId: { in: workItemIds }, executionType: 'PROJECT' },
      select: { workItemId: true, executionEntityId: true },
    }),
  ]);

  const projectIds = [...new Set(projectExecutions.map((e) => e.executionEntityId))];
  const [projects, writeBacks] = await Promise.all([
    prisma.projectRecord.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, status: true, outcomeStatus: true },
    }),
    prisma.projectWriteBack.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true },
    }),
  ]);

  return summarizeHomeOperationsMeasurement({
    workItems,
    sources,
    events,
    evidence,
    scheduledEvents,
    reopenedEvents,
    briefingItems,
    projectExecutions,
    projects,
    writeBackProjectIds: writeBacks.map((wb) => wb.projectId),
  });
}
