import { HOME_ACTION_SOURCE_KINDS, type HomeAction } from '../../productFramework/homeAction.contract';
import type { OperationalWorkSourceType } from '@prisma/client';

/**
 * Home Intelligence Functional Completeness FRD §8.1 (HI-ATT-006/HI-ATT-007)
 * — one declared table of completion-adapter and work-key ownership per
 * HomeAction source kind. Before this, the same information lived in three
 * separate, independently-maintained structures:
 *   - SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER (homeActions.service.ts)
 *   - WORK_ITEM_ELIGIBLE_SOURCE_KINDS (homeActionWorkItem.adapter.ts)
 *   - SOURCE_TYPE_BY_KIND (homeActionWorkItem.adapter.ts)
 *
 * This is declared at source-kind granularity because that is the real
 * granularity of today's ownership decisions (adaptHomeActionSource is
 * itself keyed only by source.kind). Several distinct loaders in
 * homeActionSourcePromotion.service.ts share one kind (e.g. the ~7
 * SYSTEM-kind loaders) and are indistinguishable at this granularity — the
 * FRD's report (docs/product/HOME_INTELLIGENCE_PHASE0_REGISTRY_REPORT.md)
 * lists them individually. Moving to per-loader ownership is a later-phase
 * refactor, not part of Phase 0.
 */
export interface HomeActionAdapterOwnershipEntry {
  sourceKind: HomeAction['source']['kind'];
  hasCompletionAdapter: boolean;
  completionAdapterOwner: string | null;
  workKeyEligible: boolean;
  workItemSourceType: OperationalWorkSourceType | null;
  notes: string;
}

export function validateHomeActionAdapterOwnership(
  entries: readonly HomeActionAdapterOwnershipEntry[],
): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.sourceKind)) {
      issues.push(`Duplicate homeActionAdapterOwnership entry for source kind "${entry.sourceKind}".`);
    }
    seen.add(entry.sourceKind);
    if (entry.hasCompletionAdapter && !entry.completionAdapterOwner) {
      issues.push(`homeActionAdapterOwnership entry "${entry.sourceKind}" has a completion adapter but declares no owner.`);
    }
    if (!entry.hasCompletionAdapter && entry.completionAdapterOwner) {
      issues.push(`homeActionAdapterOwnership entry "${entry.sourceKind}" declares a completion adapter owner but hasCompletionAdapter is false.`);
    }
    if (entry.workKeyEligible && !entry.workItemSourceType) {
      issues.push(`homeActionAdapterOwnership entry "${entry.sourceKind}" is workKeyEligible but declares no workItemSourceType.`);
    }
    if (!entry.workKeyEligible && entry.workItemSourceType) {
      issues.push(`homeActionAdapterOwnership entry "${entry.sourceKind}" declares a workItemSourceType but is not workKeyEligible.`);
    }
  }
  for (const kind of HOME_ACTION_SOURCE_KINDS) {
    if (!seen.has(kind)) {
      issues.push(`No homeActionAdapterOwnership entry declared for source kind "${kind}".`);
    }
  }
  return issues;
}
