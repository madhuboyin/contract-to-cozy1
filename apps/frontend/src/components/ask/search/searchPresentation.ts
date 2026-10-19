import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskSearchGroupId, AskSearchResult } from '@/features/ask/types';

export const SEARCH_MIN_QUERY = 2;
export const SEARCH_DEBOUNCE_MS = 300;

export const GROUP_ORDER: readonly AskSearchGroupId[] = ['RECORD', 'WORK', 'SAVED', 'HISTORY', 'CAPABILITY'];

/**
 * The exact canonical place a result opens. Built here from the server's typed destination, never from a URL the server sent. The
 * Work and Saved routes reopen through their own resolve step, so a removed or no-longer-accessible item says so there.
 */
export function searchResultHref(result: AskSearchResult, propertyId: string): string {
  const destination = result.destination;
  const home = encodeURIComponent(propertyId);
  switch (destination.kind) {
    case 'RECORD': return `/dashboard/ask/record?propertyId=${home}&section=${encodeURIComponent(destination.sectionId)}&recordId=${encodeURIComponent(destination.recordId)}`;
    case 'WORK': return `/dashboard/ask/work?propertyId=${home}&open=${encodeURIComponent(destination.workKey)}`;
    case 'SAVED': return `/dashboard/ask/saved?propertyId=${home}&open=${encodeURIComponent(destination.artifactKey)}`;
    case 'HISTORY': return buildAskWorkspaceHref({ propertyId: result.propertyId || propertyId, sessionId: destination.sessionId, executionId: destination.executionId });
    case 'CAPABILITY': return buildAskWorkspaceHref({ propertyId, question: destination.question, from: 'search' });
  }
}

export function formatSearchDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
