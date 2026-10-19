import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import type { AskArtifactCategory, AskArtifactFreshness, AskArtifactTypeId, AskArtifactVersionBehavior } from './governance/askArtifactTypeRegistry';

export const ASK_SAVED_CONTRACT_VERSION = 'ask-saved-v1' as const;
export const ASK_SAVED_DEFAULT_LIMIT = 25;
export const ASK_SAVED_MAX_LIMIT = 50;

/** What opening a saved artifact finds (separate from freshness, which describes the artifact itself). */
export type AskSavedResolveOutcome = 'AVAILABLE' | 'DELETED' | 'ACCESS_LOST' | 'UNAVAILABLE';

/**
 * FR-SAVED-001: the shared envelope. It is a projection: identity, labels and pointers, never the artifact's own payload. `artifactKey`
 * is `<type prefix>:<canonical id>`.
 */
export interface AskSavedArtifact {
  artifactKey: string;
  artifactType: AskArtifactTypeId;
  category: AskArtifactCategory;
  owner: string;
  entity: { type: string; id: string };
  propertyId: string;
  /** The Ask execution that produced it, when the canonical owner recorded one for the caller. */
  sourceExecutionId: string | null;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  /** When the facts it was built from were true. */
  sourceAsOf: string;
  version: {
    behavior: AskArtifactVersionBehavior;
    /** True when this row is a prior version that a newer one replaced; both stay readable. */
    superseded: boolean;
    supersededBy: string | null;
    supersedes: string | null;
    label: string;
  };
  freshness: { state: AskArtifactFreshness; reason: string | null };
  visibility: { scope: 'HOUSEHOLD' | 'REQUESTER_ONLY'; sensitivity: 'STANDARD' | 'SENSITIVE' };
  /** Archived either by the canonical owner or by this person's own Saved choice; the two are told apart. */
  archived: { byOwner: boolean; byYou: boolean };
  /** Where Ask reopens it. Null with a reason when Ask has no operation to reopen it; the row still shows its state. */
  reopen: { operationId: string; entityType: string; entityId: string; decisionThreadId: string | null; contextVersion: string | null } | null;
  reopenUnavailableReason: string | null;
  capabilities: { export: boolean; share: boolean };
  sortAt: string;
}

export type AskSavedTypeState = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED' | 'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED';

export interface AskSavedTypeStatus {
  artifactType: AskArtifactTypeId;
  label: string;
  state: AskSavedTypeState;
  reason: string | null;
  total: number | null;
  delivered: number;
}

export interface AskSavedFilterOption {
  value: string;
  label: string;
}

export interface AskSavedPage {
  contractVersion: typeof ASK_SAVED_CONTRACT_VERSION;
  propertyId: string;
  generatedAt: string;
  archived: boolean;
  total: number | null;
  totalScope: 'COMPLETE' | 'PARTIAL';
  partial: boolean;
  delivered: number;
  nextCursor: string | null;
  truncated: boolean;
  /** Active and archived totals for the same filters, or null where a type could not count. */
  counts: { active: number | null; archived: number | null };
  sort: { key: 'sortAt'; label: string };
  query: { search: string | null; artifactType: AskArtifactTypeId | null; freshness: AskArtifactFreshness | null };
  filterOptions: { types: AskSavedFilterOption[]; freshness: AskSavedFilterOption[] };
  types: AskSavedTypeStatus[];
  rows: AskSavedArtifact[];
}

export interface AskSavedResolution {
  contractVersion: typeof ASK_SAVED_CONTRACT_VERSION;
  propertyId: string;
  artifactKey: string;
  outcome: AskSavedResolveOutcome;
  artifact: AskSavedArtifact | null;
  /** Why it could not be opened, or null when it opened. */
  message: string;
}

export interface AskSavedReadContext {
  userId: string;
  propertyId: string;
  role: HouseholdRole;
  operatingMode?: AskOperatingMode;
  now: Date;
}

export interface AskSavedReadQuery {
  after: { sortAt: string; artifactKey: string } | null;
  /** Page size plus one, so the service can tell whether more follows. */
  limit: number;
  search: string | null;
  freshness: AskArtifactFreshness | null;
  /** ACTIVE hides anything archived by the owner or by this person; ARCHIVED shows only those. */
  archived: 'ACTIVE' | 'ARCHIVED';
  /** The canonical ids of this type that this person archived in Saved. */
  archivedByYouIds: readonly string[];
  /** Resolve one artifact by its canonical id: every archive state and freshness, no boundary. */
  entityId?: string | null;
}

export interface AskSavedReadResult {
  rows: AskSavedArtifact[];
  /** Matches for this query. */
  total: number | null;
  /** Matches for the same filters in the other archive state. */
  otherTotal: number | null;
}

export type AskSavedTypeReader = (context: AskSavedReadContext, query: AskSavedReadQuery) => Promise<AskSavedReadResult>;

/** (sortAt desc, artifactKey asc). */
export function compareSavedArtifacts(a: { sortAt: string; artifactKey: string }, b: { sortAt: string; artifactKey: string }): number {
  if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt ? 1 : -1;
  return a.artifactKey < b.artifactKey ? -1 : a.artifactKey > b.artifactKey ? 1 : 0;
}
