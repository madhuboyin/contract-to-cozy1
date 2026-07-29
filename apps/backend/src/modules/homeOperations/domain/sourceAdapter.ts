import type {
  OperationalObligationType,
  OperationalWorkEvidenceType,
  OperationalWorkItemPriority,
  OperationalWorkSourceRole,
  OperationalWorkSourceType,
  RecommendationSafetyTier,
} from '@prisma/client';
import type { WorkKeyOccurrence, WorkSubject } from './workKey';

export interface ProposedWorkItemSource {
  sourceType: OperationalWorkSourceType;
  sourceEntityId: string;
  sourceVersion: string | null;
  sourceRole: OperationalWorkSourceRole;
}

/**
 * What a source adapter asserts about one obligation. resolveWorkItem
 * .usecase.ts turns this into a durable OperationalWorkItem (creating it on
 * first sight, or reconciling it against an existing one with the same
 * workKey) — the adapter itself never touches Prisma.
 */
export interface ProposedWorkItem {
  propertyId: string;
  subject: WorkSubject;
  obligationType: OperationalObligationType;
  occurrence: WorkKeyOccurrence;

  title: string;
  homeownerReason: string;
  expectedOutcome: string;
  priority: OperationalWorkItemPriority;
  safetyTier: RecommendationSafetyTier;

  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
  confidence?: number | null;
  missingContext?: string[];

  source: ProposedWorkItemSource;
}

export interface ProposedWorkEvidence {
  evidenceType: OperationalWorkEvidenceType;
  evidenceEntityId: string;
  observedAt: Date;
}

/**
 * Contract a future slice's source adapters (Maintenance, Project, Incident,
 * Recall, Coverage, Inspection Finding, ...) implement to propose work items
 * from their own domain records. Slice 1 ships this contract plus one
 * worked example (guidanceJourney.adapter.ts) to prove the identity
 * resolver end to end — it does not wire any adapter into a live feed or
 * job (see docs/product/HOME_OPERATIONS_SLICE_1_* non-goals).
 */
export interface WorkItemSourceAdapter<TSourceRecord> {
  readonly sourceType: OperationalWorkSourceType;
  /**
   * Returns null when this record does not currently represent open work —
   * not every source row is an obligation (e.g. a completed/aborted
   * journey, a task with no matching risk condition).
   */
  propose(record: TSourceRecord, propertyId: string): ProposedWorkItem | null;
}
