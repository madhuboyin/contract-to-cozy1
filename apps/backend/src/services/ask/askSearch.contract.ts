import type { HouseholdRole } from '@prisma/client';
import type { AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';

export const ASK_SEARCH_CONTRACT_VERSION = 'ask-search-v1' as const;
export const ASK_SEARCH_MIN_QUERY = 2;
export const ASK_SEARCH_MAX_QUERY = 80;
/** Results one provider may return, and the most any group shows; the rest are reported as `more` with a path to the full list. */
export const ASK_SEARCH_PER_PROVIDER = 5;
export const ASK_SEARCH_PER_GROUP = 12;
/** FR-SEARCH-004 / deliverable 1: no provider may hold the response longer than this. */
export const ASK_SEARCH_PROVIDER_TIMEOUT_MS = 3000;

export type AskSearchGroup = 'RECORD' | 'WORK' | 'SAVED' | 'HISTORY' | 'CAPABILITY';
export const ASK_SEARCH_GROUPS: readonly AskSearchGroup[] = Object.freeze(['RECORD', 'WORK', 'SAVED', 'HISTORY', 'CAPABILITY']);

/** The exact canonical place a result opens. The client builds the route from this; the server never sends a free-form URL. */
export type AskSearchDestination =
  | { kind: 'RECORD'; sectionId: string; recordId: string }
  | { kind: 'WORK'; workKey: string }
  | { kind: 'SAVED'; artifactKey: string }
  | { kind: 'HISTORY'; sessionId: string; executionId: string }
  | { kind: 'CAPABILITY'; question: string; entryId: string };

export interface AskSearchResult {
  resultKey: string;
  group: AskSearchGroup;
  providerId: string;
  /** The kind of thing it is ("Rooms", "Claim", "Quote comparison"). */
  typeLabel: string;
  title: string;
  /** Only text the owning list already shows to this person; never a field the owner's reader withholds. Null where the owner has none. */
  snippet: string | null;
  propertyId: string;
  status: string | null;
  /** When its facts were last true or it last changed (ISO), and the owner's own freshness word when it has one. */
  asOf: string | null;
  freshness: string | null;
  destination: AskSearchDestination;
}

export type AskSearchProviderState = 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED' | 'TIMED_OUT' | 'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED';

export interface AskSearchProviderStatus {
  providerId: string;
  group: AskSearchGroup;
  label: string;
  state: AskSearchProviderState;
  reason: string | null;
  returned: number;
  more: boolean;
}

export interface AskSearchGroupResults {
  group: AskSearchGroup;
  label: string;
  results: AskSearchResult[];
  /** True when providers in this group had more than are shown. */
  more: boolean;
}

export interface AskSearchResponse {
  contractVersion: typeof ASK_SEARCH_CONTRACT_VERSION;
  propertyId: string;
  generatedAt: string;
  /** Some provider could not answer; the groups that did are still complete for what they cover. */
  partial: boolean;
  totalResults: number;
  groups: AskSearchGroupResults[];
  providers: AskSearchProviderStatus[];
}

export interface AskSearchContext {
  userId: string;
  propertyId: string;
  role: HouseholdRole;
  operatingMode: AskOperatingMode;
  now: Date;
}

export interface AskSearchProviderOutput {
  results: AskSearchResult[];
  more: boolean;
}

/** One searchable source. It must apply its owner's own authorization and visibility; the service only applies the shared gate. */
export interface AskSearchProvider {
  id: string;
  group: AskSearchGroup;
  label: string;
  /** Set when the source cannot be searched yet; it is reported UNAVAILABLE with this reason and never omitted. */
  unavailableReason?: string;
  /** The role / lifecycle gate; returning anything but APPLICABLE reports that state without calling `search`. */
  applicability?: (context: AskSearchContext) => 'APPLICABLE' | 'RESTRICTED' | 'NOT_APPLICABLE' | 'CONTEXT_REQUIRED';
  search?: (context: AskSearchContext, query: string, limit: number) => Promise<AskSearchProviderOutput>;
}
