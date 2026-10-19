import type { HouseholdRole } from '@prisma/client';
import type { AskWorkLifecycleView, AskWorkProviderId, AskWorkType } from './governance/askWorkProviderRegistry';

export const ASK_WORK_CONTRACT_VERSION = 'ask-work-v1' as const;
export const ASK_WORK_DEFAULT_LIMIT = 25;
export const ASK_WORK_MAX_LIMIT = 50;

/**
 * FR-WORK-004: what happens when work is opened. These outcomes are SEPARATE from the lifecycle views: a row lives in exactly one view,
 * and an open attempt yields exactly one outcome. They are never merged into one enum.
 */
export type AskWorkResumeOutcome = 'AVAILABLE' | 'DELETED' | 'COMPLETED' | 'STALE' | 'ACCESS_LOST' | 'SUPERSEDED';

/** The launch context an exact resume carries (see Ask launchContext). The server rereads and reauthorizes before honoring any of it. */
export interface AskWorkLaunch {
  operationId: string | null;
  entityType: string | null;
  entityId: string | null;
  actionId: string | null;
  decisionThreadId: string | null;
  workItemId: string | null;
  journeyId: string | null;
  contextVersion: string | null;
}

/** Where opening a row lands: back in its conversation, at its confirmation, or in the structured workspace of the owning domain. */
export interface AskWorkResume {
  kind: 'CONVERSATION' | 'CONFIRMATION' | 'WORKSPACE';
  executionId: string | null;
  sessionId: string | null;
  launch: AskWorkLaunch;
}

export interface AskWorkNextAction {
  label: string;
  /** The Ask command the action runs, when it is a command; null when the next step is to open the work. */
  operationId: string | null;
  /** Reauthorized per command floor at read time for the caller's current role; the command re-checks at execution. */
  allowed: boolean;
  /** Set when the next action is retrying this failed Ask execution (POST /ask/executions/:id/retry, idempotent per clientRequestId). */
  retryExecutionId?: string;
}

/**
 * FR-WORK-002: a stable identity that is the entity or execution, never a conversation. `workKey` is `<provider kind>:<id>`;
 * `sourceAliases` keep the other keys the same work was known by (for example the OperationalWorkItem key of a project).
 */
export interface AskWorkRow {
  workKey: string;
  sourceAliases: string[];
  providerId: AskWorkProviderId;
  workType: AskWorkType;
  propertyId: string;
  entity: { type: string; id: string };
  title: string;
  summary: string | null;
  /** The owning domain's own status, unchanged; `label` is its homeowner wording. The lifecycle view is derived separately. */
  status: { canonical: string; label: string };
  lifecycleView: AskWorkLifecycleView;
  nextAction: AskWorkNextAction | null;
  /** The ordering timestamp (ISO). Rows are ordered by sortAt descending, then workKey ascending. */
  sortAt: string;
  /** When the work is due or next scheduled to act, when the owner has such a date (ISO). */
  dueAt?: string | null;
  freshness: { version: string; asOf: string };
  sourceOwner: string;
  resume: AskWorkResume;
}

/**
 * Why a provider has no rows in a page. AVAILABLE with zero rows is a real empty result; every other state is never presented as empty
 * or complete.
 */
export type AskWorkProviderState = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED' | 'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED';

export interface AskWorkProviderStatus {
  providerId: AskWorkProviderId;
  label: string;
  workType: AskWorkType;
  state: AskWorkProviderState;
  reason: string | null;
  /** The provider's authoritative count for the requested view, or null when it could not count. */
  total: number | null;
  delivered: number;
  /** Required for Phase 3 exit; a required provider that is UNAVAILABLE keeps the page partial. */
  required: boolean;
}

export interface AskWorkPage {
  contractVersion: typeof ASK_WORK_CONTRACT_VERSION;
  propertyId: string;
  generatedAt: string;
  view: AskWorkLifecycleView;
  /** Authoritative only when `totalScope` is COMPLETE; otherwise null. */
  total: number | null;
  totalScope: 'COMPLETE' | 'PARTIAL';
  /** True when any provider could not contribute. A partial page never claims completeness. */
  partial: boolean;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
  /** Counts for every lifecycle view, or null where a provider could not count. */
  viewCounts: Record<AskWorkLifecycleView, number | null>;
  sort: { key: 'sortAt'; label: string };
  query: { workType: AskWorkType | null; status: string | null };
  providers: AskWorkProviderStatus[];
  rows: AskWorkRow[];
}

export interface AskWorkBoundary {
  sortAt: string;
  workKey: string;
}

export interface AskWorkReadContext {
  userId: string;
  propertyId: string;
  role: HouseholdRole;
}

export interface AskWorkReadQuery {
  view: AskWorkLifecycleView;
  /** Return the next rows strictly after this boundary in (sortAt desc, workKey asc) order; null for the first page. */
  after: AskWorkBoundary | null;
  /** The page size plus one, so the service can tell whether more work follows the page. */
  limit: number;
  status: string | null;
}

export interface AskWorkReadResult {
  rows: AskWorkRow[];
  /** The provider's authoritative count for `view`, or null when it cannot count. */
  total: number | null;
  /** The provider's counts per view, when it can give them. */
  viewCounts: Partial<Record<AskWorkLifecycleView, number>> | null;
}

/** A canonical provider reader. Pure database access: authorization, applicability and merging are the service's. Must have no side effects. */
export type AskWorkProviderReader = (context: AskWorkReadContext, query: AskWorkReadQuery) => Promise<AskWorkReadResult>;

/** (sortAt desc, workKey asc). */
export function compareAskWorkRows(a: AskWorkBoundary, b: AskWorkBoundary): number {
  if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1;
  return a.workKey < b.workKey ? -1 : a.workKey > b.workKey ? 1 : 0;
}
