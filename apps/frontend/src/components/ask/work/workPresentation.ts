import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskWorkLifecycleView, AskWorkResumeOutcome, AskWorkRow, AskWorkType } from '@/features/ask/types';

export const WORK_VIEWS: ReadonlyArray<{ id: AskWorkLifecycleView; label: string; description: string; empty: string }> = [
  { id: 'NEEDS_YOU', label: 'Needs you', description: 'Waiting on a decision, answer, or action from you.', empty: 'Nothing needs you right now.' },
  { id: 'ACTIVE', label: 'Active', description: 'Work that is under way.', empty: 'No work is under way.' },
  { id: 'WAITING', label: 'Waiting', description: 'Work waiting on someone or something else.', empty: 'Nothing is waiting on someone else.' },
  { id: 'SCHEDULED', label: 'Scheduled', description: 'Work with a date ahead.', empty: 'Nothing is scheduled.' },
  { id: 'COMPLETED', label: 'Completed', description: 'Finished work.', empty: 'No finished work yet.' },
  { id: 'ARCHIVED', label: 'Archived', description: 'Work that was set aside or has lapsed.', empty: 'Nothing is archived.' },
];

export const WORK_TYPE_LABELS: Record<AskWorkType, string> = {
  PENDING_EXECUTION: 'Pending request', HOME_WORK_ITEM: 'Home task', DECISION_THREAD: 'Decision', INCIDENT: 'Incident', CLAIM: 'Claim', PROJECT: 'Project',
  GUIDANCE_JOURNEY: 'Guided plan', DIY_PROJECT: 'DIY guide', RENOVATION_CASE: 'Renovation', REPAIR: 'Repair', MONITOR: 'Monitor', QUEUED_JOB: 'Report',
  RETRYABLE_EXECUTION: 'Request to retry', UNKNOWN_OUTCOME_EXECUTION: 'Unconfirmed request', SCHEDULED_FOLLOW_UP: 'Follow-up',
};

/** What a homeowner is told when opening work finds something other than current, openable work. */
export const WORK_OUTCOME_COPY: Record<Exclude<AskWorkResumeOutcome, 'AVAILABLE'>, string> = {
  DELETED: 'This was removed, so there is nothing to open.',
  COMPLETED: 'This is finished.',
  STALE: 'This changed since you last looked. The latest is shown; review it before acting.',
  ACCESS_LOST: 'You no longer have access to this.',
  SUPERSEDED: 'This was replaced by newer work.',
};

/**
 * Where an Ask-backed row resumes: the operation, the record, and the exact domain identity and version, so Ask continues the same work
 * rather than starting a new conversation about it. Null when the row has no Ask operation (a report job, for example).
 */
export function workResumeHref(row: AskWorkRow, propertyId: string): string | null {
  const { launch } = row.resume;
  if (row.resume.kind === 'WORKSPACE' && launch.operationId && launch.entityType && launch.entityId) {
    return buildAskWorkspaceHref({
      propertyId,
      question: `Continue: ${row.title}`,
      from: 'work',
      backTo: '/dashboard/ask/work',
      launchOperationId: launch.operationId,
      launchEntityType: launch.entityType,
      launchEntityId: launch.entityId,
      launchActionId: launch.actionId,
      launchDecisionThreadId: launch.decisionThreadId,
      launchWorkItemId: launch.workItemId,
      launchJourneyId: launch.journeyId,
      launchContextVersion: launch.contextVersion,
    });
  }
  if (row.resume.executionId && row.resume.sessionId) return buildAskWorkspaceHref({ propertyId, sessionId: row.resume.sessionId, executionId: row.resume.executionId });
  return null;
}

export function formatWorkDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
