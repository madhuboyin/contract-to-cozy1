import type { HouseholdRole } from '@prisma/client';
import { ASK_OPERATION_DEFINITIONS, type AskOperationId } from './askOperationRegistry';
import type { AskRecordSectionId } from './governance/askRecordSectionRegistry';

export const ASK_RECORD_DETAIL_CONTRACT_VERSION = 'ask-record-detail-v1' as const;

/**
 * FR-REC-004 / FR-REC-005. One record's canonical detail, with its provenance and its correction routes. Every provenance facet states
 * whether it is AVAILABLE, NOT_RECORDED (the canonical owner keeps it and has none for this record), or UNAVAILABLE (the canonical owner
 * has no reader or no such concept). A facet is never omitted and never inferred.
 */
export type AskRecordFacetState = 'AVAILABLE' | 'NOT_RECORDED' | 'UNAVAILABLE';

export interface AskRecordFacet {
  state: AskRecordFacetState;
  /** A plain statement of the fact. Null unless AVAILABLE. */
  value: string | null;
  /** An ISO timestamp, for facets that are a moment in time. */
  at: string | null;
  /** Why the facet is not AVAILABLE. Null when it is. */
  reason: string | null;
}

export interface AskRecordRelated {
  label: string;
  kindLabel: string;
  /** True when the canonical owner reports the link cannot be resolved. Null when its health cannot be determined. */
  broken: boolean | null;
}

export interface AskRecordHistoryEntry {
  at: string;
  label: string;
}

export type AskRecordCorrectionState = 'AVAILABLE' | 'ROLE_REQUIRED' | 'UNAVAILABLE';

export interface AskRecordCorrectionRoute {
  id: string;
  label: string;
  /** The existing Ask command that makes the change; null when no Ask command changes this kind of record. */
  operationId: AskOperationId | null;
  /** Derived from the operation's registered floor; null for an unavailable route. */
  requiredRole: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' | null;
  state: AskRecordCorrectionState;
  /** Why the route cannot be used now. Null when AVAILABLE. */
  reason: string | null;
  /** The Ask question whose answer carries this command's action for this record. Null unless AVAILABLE. */
  openQuestion: string | null;
  /** A limit of the Ask answer that route opens (for example a list cap), or null. */
  note: string | null;
}

export interface AskRecordDetail {
  contractVersion: typeof ASK_RECORD_DETAIL_CONTRACT_VERSION;
  propertyId: string;
  sectionId: AskRecordSectionId;
  recordId: string;
  generatedAt: string;
  title: string;
  facts: Array<{ label: string; value: string }>;
  provenance: {
    source: AskRecordFacet;
    observed: AskRecordFacet;
    verification: AskRecordFacet;
    visibility: AskRecordFacet;
    related: { state: AskRecordFacetState; records: AskRecordRelated[]; reason: string | null };
    history: { state: AskRecordFacetState; entries: AskRecordHistoryEntry[]; reason: string | null };
  };
  corrections: AskRecordCorrectionRoute[];
}

export class AskRecordNotFoundError extends Error {
  code = 'ASK_RECORD_NOT_FOUND';
}

export const NOT_RECORDED = 'Not recorded';
export const available = (value: string, at: string | null = null): AskRecordFacet => ({ state: 'AVAILABLE', value, at, reason: null });
export const notRecorded = (reason: string): AskRecordFacet => ({ state: 'NOT_RECORDED', value: null, at: null, reason });
export const unavailable = (reason: string): AskRecordFacet => ({ state: 'UNAVAILABLE', value: null, at: null, reason });
export const observedAt = (label: string, at: Date): AskRecordFacet => available(label, at.toISOString());

export const readable = (value: string | null | undefined): string | null => (value ? value.toLowerCase().split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ') : null);
export const day = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);
export const fact = (label: string, value: string | null | undefined) => ({ label, value: value && value.trim() ? value : NOT_RECORDED });
/** A recorded-or-not marker for fields the Record never prints (serial number, costs, policy number). */
export const presence = (label: string, value: unknown) => ({ label, value: value === null || value === undefined || value === '' ? NOT_RECORDED : 'Recorded (shown in the Ask answer)' });

/** A date that carries its own precision is never shown as a more exact day than was recorded. */
export function preciseDate(value: Date | null, precision: string | null): string | null {
  if (!value) return null;
  if (!precision || precision === 'EXACT_DATE') return day(value);
  if (precision === 'MONTH') return value.toISOString().slice(0, 7);
  if (precision === 'YEAR') return value.toISOString().slice(0, 4);
  return 'Approximate date';
}

export const ROLE_RANK: Record<HouseholdRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 };

/** The route's role floor is the command's registered floor; nothing here classifies a role on its own. */
export function commandFloor(operationId: AskOperationId): 'VIEWER' | 'CONTRIBUTOR' | 'OWNER' | null {
  return ASK_OPERATION_DEFINITIONS[operationId]?.propertyRoleFloor ?? null;
}

export function route(input: {
  id: string; label: string; operationId: AskOperationId; role: HouseholdRole; openQuestion: string;
  /** Record-specific reason the command cannot apply now, checked after the role. */
  blockedReason?: string | null;
  note?: string | null;
}): AskRecordCorrectionRoute {
  const floor = commandFloor(input.operationId);
  if (floor && ROLE_RANK[input.role] < ROLE_RANK[floor]) {
    return { id: input.id, label: input.label, operationId: input.operationId, requiredRole: floor, state: 'ROLE_REQUIRED', reason: `Your household role cannot change this; it needs ${floor.toLowerCase()} access.`, openQuestion: null, note: null };
  }
  if (input.blockedReason) {
    return { id: input.id, label: input.label, operationId: input.operationId, requiredRole: floor, state: 'UNAVAILABLE', reason: input.blockedReason, openQuestion: null, note: null };
  }
  return { id: input.id, label: input.label, operationId: input.operationId, requiredRole: floor, state: 'AVAILABLE', reason: null, openQuestion: input.openQuestion, note: input.note ?? null };
}

export const unavailableRoute = (id: string, label: string, operationId: AskOperationId | null, reason: string): AskRecordCorrectionRoute => ({
  id, label, operationId, requiredRole: null, state: 'UNAVAILABLE', reason, openQuestion: null, note: null,
});

export const NO_HISTORY = (what: string) => ({ state: 'UNAVAILABLE' as const, entries: [] as AskRecordHistoryEntry[], reason: `No canonical change-history reader is connected for ${what}, so no history is shown and none is inferred.` });

export interface DetailContext { propertyId: string; userId: string; role: HouseholdRole; now: Date }


export type DetailBody = Omit<AskRecordDetail, 'contractVersion' | 'propertyId' | 'sectionId' | 'recordId' | 'generatedAt'>;
export type DetailReader = (context: DetailContext, recordId: string) => Promise<DetailBody>;
export type { AskRecordSectionId };
