import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskNotificationDestination, AskNotificationOpenResult, AskSavedArtifact, AskWorkResumeOutcome, AskWorkRow } from '@/features/ask/types';

export const OPEN_OUTCOME_COPY: Record<Exclude<AskNotificationOpenResult['outcome'], 'AVAILABLE'>, string> = {
  DELETED: 'What this was about has been removed, so there is nothing to open.',
  ACCESS_LOST: 'You no longer have access to the home this is about.',
  UNAVAILABLE: 'There is nothing to open for this notification.',
};

export const CONTINUATION_LABELS: Record<AskNotificationDestination['kind'] | 'NONE', string> = {
  WORK: 'Continue this', SAVED: 'Open this', CONVERSATION: 'Open conversation', QUESTION: 'Ask about this', LEGACY_LINK: 'Open', NONE: 'No action',
};

/** What a homeowner is told when the work a notification points at is not current, openable work. */
export const WORK_OUTCOME_COPY: Record<Exclude<AskWorkResumeOutcome, 'AVAILABLE'>, string> = {
  DELETED: 'This was removed, so there is nothing to open.',
  COMPLETED: 'This is finished.',
  STALE: 'This changed since you last looked. Review the latest before acting.',
  ACCESS_LOST: 'You no longer have access to this.',
  SUPERSEDED: 'This was replaced by newer work.',
};

/** Where Ask continues a work item: its own operation and record in the conversation; its own conversation when it is a pending request; otherwise the work question. */
export function workContinuationHref(row: AskWorkRow, propertyId: string): string {
  const { launch } = row.resume;
  if (row.resume.kind === 'WORKSPACE' && launch.operationId && launch.entityType && launch.entityId) {
    return buildAskWorkspaceHref({
      propertyId, question: `Continue: ${row.title}`, from: 'notification', launchOperationId: launch.operationId, launchEntityType: launch.entityType, launchEntityId: launch.entityId,
      launchActionId: launch.actionId, launchDecisionThreadId: launch.decisionThreadId, launchWorkItemId: launch.workItemId, launchJourneyId: launch.journeyId, launchContextVersion: launch.contextVersion,
    });
  }
  if (row.resume.executionId && row.resume.sessionId) return buildAskWorkspaceHref({ propertyId, sessionId: row.resume.sessionId, executionId: row.resume.executionId, from: 'notification' });
  return buildAskWorkspaceHref({ propertyId, question: 'What needs me?', from: 'notification' });
}

/** Where Ask reopens a saved result: its own operation at the exact record and version; otherwise the saved-results question. */
export function savedContinuationHref(artifact: AskSavedArtifact, propertyId: string): string {
  const { reopen } = artifact;
  if (!reopen) return buildAskWorkspaceHref({ propertyId, question: 'Show my saved results', from: 'notification' });
  return buildAskWorkspaceHref({
    propertyId, question: `Open ${artifact.title}`, from: 'notification', launchOperationId: reopen.operationId, launchEntityType: reopen.entityType, launchEntityId: reopen.entityId,
    launchDecisionThreadId: reopen.decisionThreadId, launchContextVersion: reopen.contextVersion,
  });
}

/** The conversation a notification continues, for the destinations that need no re-read (a conversation, a question, a stored link). Work and Saved re-read first. */
export function notificationDestinationHref(destination: AskNotificationDestination, propertyId: string): string {
  switch (destination.kind) {
    case 'WORK': return buildAskWorkspaceHref({ propertyId, question: 'What needs me?', from: 'notification' });
    case 'SAVED': return buildAskWorkspaceHref({ propertyId, question: 'Show my saved results', from: 'notification' });
    case 'CONVERSATION': return buildAskWorkspaceHref({ propertyId, sessionId: destination.sessionId, executionId: destination.executionId, from: 'notification' });
    case 'QUESTION': return buildAskWorkspaceHref({ propertyId, question: destination.question, from: 'notification' });
    case 'LEGACY_LINK': return destination.path;
  }
}

export const SNOOZE_CHOICES: ReadonlyArray<{ id: string; label: string; days: number }> = [
  { id: '1', label: 'Snooze for 1 day', days: 1 }, { id: '3', label: 'Snooze for 3 days', days: 3 }, { id: '7', label: 'Snooze for 1 week', days: 7 }, { id: '30', label: 'Snooze for 30 days', days: 30 },
];

export function formatNotificationDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
