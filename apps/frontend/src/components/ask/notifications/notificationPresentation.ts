import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskNotificationDestination, AskNotificationOpenResult } from '@/features/ask/types';

export const OPEN_OUTCOME_COPY: Record<Exclude<AskNotificationOpenResult['outcome'], 'AVAILABLE'>, string> = {
  DELETED: 'What this was about has been removed, so there is nothing to open.',
  ACCESS_LOST: 'You no longer have access to the home this is about.',
  UNAVAILABLE: 'There is nothing to open for this notification.',
};

export const CONTINUATION_LABELS: Record<AskNotificationDestination['kind'] | 'NONE', string> = {
  WORK: 'Open in Work', SAVED: 'Open in Saved', CONVERSATION: 'Open conversation', QUESTION: 'Ask about this', LEGACY_LINK: 'Open', NONE: 'No action',
};

/**
 * The exact current place a notification opens, built from the server's typed destination after it reread the live record. A stored
 * dashboard link is the only destination outside Ask, and the server has already limited it to a same-site path.
 */
export function notificationDestinationHref(destination: AskNotificationDestination, propertyId: string): string {
  const home = encodeURIComponent(propertyId);
  switch (destination.kind) {
    case 'WORK': return `/dashboard/ask/work?propertyId=${home}&open=${encodeURIComponent(destination.workKey)}`;
    case 'SAVED': return `/dashboard/ask/saved?propertyId=${home}&open=${encodeURIComponent(destination.artifactKey)}`;
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
