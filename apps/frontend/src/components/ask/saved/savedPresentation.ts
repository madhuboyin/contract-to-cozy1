import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskArtifactCategory, AskArtifactFreshness, AskSavedArtifact } from '@/features/ask/types';

export const FRESHNESS_LABELS: Record<AskArtifactFreshness, string> = { CURRENT: 'Current', STALE: 'Out of date', EXPIRED: 'Expired', SUPERSEDED: 'Replaced by a newer version' };
export const CATEGORY_LABELS: Record<AskArtifactCategory, string> = { REPORT: 'Report', COMPARISON: 'Comparison', DECISION_OUTPUT: 'Decision', BRIEFING: 'Briefing', CHECKLIST: 'Checklist', ANALYSIS: 'Analysis' };

export const SAVED_EMPTY = { active: 'Nothing is saved for this home yet.', archived: 'Nothing is archived.' } as const;

/** Where Ask reopens a saved result: the operation, the record, and the exact identity and version. Null when Ask has no way to reopen it. */
export function savedReopenHref(artifact: AskSavedArtifact, propertyId: string): string | null {
  const { reopen } = artifact;
  if (!reopen) return null;
  return buildAskWorkspaceHref({
    propertyId,
    question: `Open: ${artifact.title}`,
    from: 'saved',
    backTo: '/dashboard/ask/saved',
    launchOperationId: reopen.operationId,
    launchEntityType: reopen.entityType,
    launchEntityId: reopen.entityId,
    launchDecisionThreadId: reopen.decisionThreadId,
    launchContextVersion: reopen.contextVersion,
  });
}

export function formatSavedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
