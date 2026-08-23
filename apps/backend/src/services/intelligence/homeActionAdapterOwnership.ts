import type { HomeActionAdapterOwnershipEntry } from './homeActionAdapterOwnership.contract';
import { HOME_ACTION_PRODUCER_OWNERSHIP } from './homeActionProducerOwnership';

export const HOME_ACTION_ADAPTER_OWNERSHIP: readonly HomeActionAdapterOwnershipEntry[] = [
  {
    sourceKind: 'PERSONALIZATION',
    hasCompletionAdapter: true,
    completionAdapterOwner: 'applyPersonalizationHomeActionLifecycle (modules/personalization/application/applyHomeActionLifecycle.usecase.ts)',
    workKeyEligible: false,
    workItemSourceType: null,
    notes: 'The only source kind with a real COMPLETE/ALREADY_DONE adapter today.',
  },
  {
    sourceKind: 'MAINTENANCE',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'MAINTENANCE',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE. Seasonal-checklist aggregate actions (id prefix "seasonal-checklist:") are excluded from work-item eligibility even though the kind is eligible (isSeasonalAggregate).',
  },
  {
    sourceKind: 'GUIDANCE',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'GUIDANCE',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'PROJECT',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'PROJECT',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'INCIDENT',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'INCIDENT',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'RECALL',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'RECALL',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'COVERAGE',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'COVERAGE',
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'SALE_PREP',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: true,
    workItemSourceType: 'SALE_PREP',
    notes: 'Completion happens by the homeowner updating the self-reported condition on Sale Case, not a COMPLETE command against the promoted work item.',
  },
  {
    sourceKind: 'SYSTEM',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: false,
    workItemSourceType: null,
    notes: 'ACKNOWLEDGE only for most SYSTEM-kind loaders (refinance, capital timeline, tax appeal, home-fact review, ownership-cost projection). Two exceptions are routed to a real completion handler by id prefix directly inside executeHomeActionCommand (homeActions.service.ts), not declared here: "ownership-cost-change:*" and "activation:*". This id-prefix carve-out is exactly the per-loader granularity gap HI-ATT-006 calls out — see the Phase 0 registry report.',
  },
  {
    sourceKind: 'SAVINGS_BENEFITS',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: false,
    workItemSourceType: null,
    notes: 'COMPLETE/ALREADY_DONE not supported; feed offers ACKNOWLEDGE.',
  },
  {
    sourceKind: 'INSPECTION_FINDING',
    hasCompletionAdapter: false,
    completionAdapterOwner: null,
    workKeyEligible: false,
    workItemSourceType: null,
    notes: 'ACKNOWLEDGE only. Not yet promoted into a work item — HI-DOC/Phase 5 work.',
  },
] as const;

export const SOURCE_KINDS_WITHOUT_COMPLETION_ADAPTER: ReadonlySet<HomeActionAdapterOwnershipEntry['sourceKind']> =
  new Set(HOME_ACTION_ADAPTER_OWNERSHIP.filter((entry) => !entry.hasCompletionAdapter).map((entry) => entry.sourceKind));

/**
 * Derived from the producer-level registry (homeActionProducerOwnership.ts)
 * rather than hand-typed here, so a kind can't be marked eligible/ineligible
 * at this table without the underlying producers actually agreeing — a kind
 * is eligible if any of its producers are (e.g. MAINTENANCE stays eligible
 * even though the seasonal-checklist aggregate producer within it is not).
 * Producers with sourceKind: null (dynamic per-action kind) don't
 * contribute here; their eligibility is governed by whichever kind they
 * resolve to at runtime, which this table already covers.
 */
export const WORK_ITEM_ELIGIBLE_SOURCE_KINDS: ReadonlySet<HomeActionAdapterOwnershipEntry['sourceKind']> =
  new Set(
    HOME_ACTION_PRODUCER_OWNERSHIP
      .filter((entry): entry is typeof entry & { sourceKind: HomeActionAdapterOwnershipEntry['sourceKind'] } =>
        entry.sourceKind !== null && entry.workKeyEligible)
      .map((entry) => entry.sourceKind),
  );

export const SOURCE_TYPE_BY_KIND: Partial<Record<HomeActionAdapterOwnershipEntry['sourceKind'], NonNullable<HomeActionAdapterOwnershipEntry['workItemSourceType']>>> =
  Object.fromEntries(
    HOME_ACTION_PRODUCER_OWNERSHIP
      .filter((entry): entry is typeof entry & {
        sourceKind: HomeActionAdapterOwnershipEntry['sourceKind'];
        workItemSourceType: NonNullable<HomeActionAdapterOwnershipEntry['workItemSourceType']>;
      } => entry.sourceKind !== null && entry.workItemSourceType !== null)
      .map((entry) => [entry.sourceKind, entry.workItemSourceType]),
  );
