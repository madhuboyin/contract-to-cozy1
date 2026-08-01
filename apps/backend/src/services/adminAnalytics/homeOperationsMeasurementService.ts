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
};

type HomeOperationsMeasurementSnapshot = {
  workItems: WorkItemSnapshot[];
  sources: Array<{ workItemId: string; active: boolean }>;
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

  gaps.push('recommendationUnderstoodRate: no item-agnostic "work item viewed/understood" signal exists yet — only the legacy pre-Home-Operations HomeAction command feed tracks an OPENED event, and only for HomeAction-sourced items.');
  gaps.push('duplicatePreventionRate: candidate-stage dedup that never creates a second work item leaves no trace to count against — only *caught* duplicates (disposition=DUPLICATE) are logged, not *prevented* ones.');
  gaps.push('completedWithoutDuplicateClosure: needs a join against PropertyChange/HomeBriefingItem engagement history per canonicalActionId that has not been built.');

  // ── Trust & quality (§14.3) ─────────────────────────────────────────────
  const briefedWithNoEngagement = snapshot.briefingItems.filter(
    (item) => !item.openedAt && !item.seenAt && !item.actedAt && !item.dismissedAt && !item.notUsefulAt,
  );

  const projectIdsWithExecution = [...new Set(snapshot.projectExecutions.map((e) => e.executionEntityId))];
  const trackedProjects = snapshot.projects.filter((project) => projectIdsWithExecution.includes(project.id));
  const completedTrackedProjects = trackedProjects.filter((project) => project.status === 'COMPLETED');
  const writeBackProjectIdSet = new Set(snapshot.writeBackProjectIds);
  const successfulWriteBacks = completedTrackedProjects.filter((project) => writeBackProjectIdSet.has(project.id));

  gaps.push('unresolvedSourceAfterVerifiedOutcome: would require checking the underlying source domain record\'s own state at the moment OUTCOME_VERIFIED fires — no such check/join exists today.');
  gaps.push('workHiddenWhileSourceOpen: no "hidden" concept is tracked on OperationalWorkItem.');
  gaps.push('incorrectMergesAndDuplicateSplits: merges/duplicate dispositions are recorded, but nothing flags a merge as later found incorrect.');
  gaps.push('staleSourcePromotions: OperationalWorkSource has no freshness/expiry field to compare against, unlike RenovationRequirement.sourceFreshUntil.');
  gaps.push('safetyGovernanceViolations: RecommendationIncident exists as a generic cross-capability table, but no confirmed field links an incident back to a specific OperationalWorkItem — not wiring an unverified join.');
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
      sourceReconciliationSuccessRate: percent(activeSources.length, snapshot.sources.length),
      overdueRate: percent(overdueItems.length, openItemsWithDueDate.length),
      reopenRate: percent(snapshot.reopenedEvents.length, everCompletedCount),
      recommendationUnderstoodRate: null,
      duplicatePreventionRate: null,
      completedWithoutDuplicateClosure: null,
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
      unresolvedSourceAfterVerifiedOutcome: null,
      workHiddenWhileSourceOpen: null,
      incorrectMergesAndDuplicateSplits: null,
      staleSourcePromotions: null,
      safetyGovernanceViolations: null,
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
    },
  });
  const workItemIds = workItems.map((item) => item.id);

  const [sources, scheduledEvents, reopenedEvents, briefingItems, projectExecutions] = await Promise.all([
    prisma.operationalWorkSource.findMany({
      where: { workItemId: { in: workItemIds } },
      select: { workItemId: true, active: true },
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
    scheduledEvents,
    reopenedEvents,
    briefingItems,
    projectExecutions,
    projects,
    writeBackProjectIds: writeBacks.map((wb) => wb.projectId),
  });
}
