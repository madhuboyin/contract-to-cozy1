import { buildAskWorkspaceHref, type AskWorkspaceHrefInput } from '@/lib/navigation/askNavigation';
import type { AskSearchGroupId, AskSearchResult } from '@/features/ask/types';

export const SEARCH_MIN_QUERY = 2;
export const SEARCH_DEBOUNCE_MS = 300;

export const GROUP_ORDER: readonly AskSearchGroupId[] = ['RECORD', 'WORK', 'SAVED', 'HISTORY', 'CAPABILITY'];

/**
 * What choosing a result asks, built from the server's typed destination and never from a URL it sent. A record, work item or saved
 * result asks its own question in this conversation, with the operation and record the server declared, so Ask opens that exact one; a
 * conversation is the one result that is not a question (it is somewhere to go back to).
 */
export function searchResultAsk(result: AskSearchResult, propertyId: string): AskWorkspaceHrefInput | null {
  const destination = result.destination;
  const home = result.propertyId || propertyId;
  switch (destination.kind) {
    case 'RECORD':
    case 'WORK':
    case 'SAVED': {
      const { open } = destination;
      return {
        propertyId: home, question: open.question, from: 'search',
        ...(open.operationId && open.entityType && open.entityId ? { launchOperationId: open.operationId, launchEntityType: open.entityType, launchEntityId: open.entityId, launchContextVersion: open.contextVersion } : {}),
      };
    }
    case 'CAPABILITY': return { propertyId, question: destination.question, from: 'search' };
    case 'HISTORY': return null;
  }
}

export function searchResultHref(result: AskSearchResult, propertyId: string): string {
  const ask = searchResultAsk(result, propertyId);
  if (ask) return buildAskWorkspaceHref(ask);
  const destination = result.destination;
  return destination.kind === 'HISTORY'
    ? buildAskWorkspaceHref({ propertyId: result.propertyId || propertyId, sessionId: destination.sessionId, executionId: destination.executionId })
    : buildAskWorkspaceHref({ propertyId });
}

export function formatSearchDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
