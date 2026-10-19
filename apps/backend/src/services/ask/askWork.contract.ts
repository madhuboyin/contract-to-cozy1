import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import type { AskWorkLifecycleView, AskWorkProviderId, AskWorkType } from './governance/askWorkProviderRegistry';

export const ASK_WORK_CONTRACT_VERSION = 'ask-work-v1' as const;
export const ASK_WORK_DEFAULT_LIMIT = 25;
export const ASK_WORK_MAX_LIMIT = 50;

/**
 * FR-WORK-004: what happens when work is opened. These outcomes are SEPARATE from the lifecycle views: a row lives in exactly one view,
 * and an open attempt yields exactly one outcome. They are never merged into one enum.
 */
export type AskWorkResumeOutcome = 'AVAILABLE' | 'DELETED' | 'COMPLETED' | 'STALE' | 'ACCESS_LOST' | 'SUPERSEDED';

/**
 * The result of opening one piece of work (FR-WORK-004). The server reauthorizes and rereads current canonical state; `row` is the
 * current row for AVAILABLE, COMPLETED and STALE, and null when the work is gone, superseded, or no longer visible to the caller.
 */
export interface AskWorkResolution {
  contractVersion: typeof ASK_WORK_CONTRACT_VERSION;
  propertyId: string;
  workKey: string;
  outcome: AskWorkResumeOutcome;
  row: AskWorkRow | null;
  /** The version the client should hold now (the row's freshness version), or null when there is no row. */
  currentVersion: string | null;
  /** For SUPERSEDED: the workKey of the work that took its place, when one exists. */
  supersededBy: string | null;
  message: string;
}

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
  /** Set when the work is real and visible but Ask has no operation to continue it; the plain reason is shown instead of a dead action. */
  unavailableReason?: string | null;
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
  /** Null only for a pending request that has no home yet (the account-scoped bucket). */
  propertyId: string | null;
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
  /** Server-authoritative filter choices: the kinds of work that answered and, for each, every status it can have. */
  filterOptions: { workTypes: AskWorkFilterOption[]; statusesByWorkType: Record<string, AskWorkFilterOption[]> };
  /**
   * The caller's own pending requests that belong to no home yet (a request still asking which home). Account-scoped, so they are never
   * attached to a property; present only when the caller can act on them in this view.
   */
  unscopedPending: AskWorkRow[];
  rows: AskWorkRow[];
}

export interface AskWorkFilterOption {
  value: string;
  label: string;
}

export interface AskWorkBoundary {
  sortAt: string;
  workKey: string;
}

export interface AskWorkReadContext {
  userId: string;
  propertyId: string;
  role: HouseholdRole;
  /** The home's operating mode, when the caller knows it; sources with their own applicability gate use it. */
  operatingMode?: AskOperatingMode;
}

export interface AskWorkReadQuery {
  view: AskWorkLifecycleView;
  /** Return the next rows strictly after this boundary in (sortAt desc, workKey asc) order; null for the first page. */
  after: AskWorkBoundary | null;
  /** The page size plus one, so the service can tell whether more work follows the page. */
  limit: number;
  status: string | null;
  /** Resolve one work row by its source id instead of listing: every view, no boundary. Used only by the resume resolver. */
  entityId?: string | null;
  /** Global search: only rows whose own text matches, across every lifecycle view. */
  search?: string | null;
  allViews?: boolean;
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
