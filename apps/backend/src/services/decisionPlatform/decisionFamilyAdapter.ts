// Decision-family adapter contract — Home Intelligence Functional
// Completeness FRD Phase 3A (HI-DEC-002, work item 1): "Extract a
// decision-family adapter contract around the existing Decision Platform
// services rather than treating the HVAC-specific service as a universal
// entry point." Every material Home Action that needs Decision Thread
// lineage resolves through this contract instead of a caller importing the
// HVAC engine directly. Only one concrete adapter exists today
// (decisionThreadService.ts's hvacDecisionFamilyAdapter, registered in
// decisionFamilyAdapterRegistry.ts) — this file only defines the shape.

import type {
  DecisionThreadContextStatus,
  DecisionThreadLifecycleStatus,
} from '../../productFramework/decisionPlatform/decisionPlatform.contract';
import type { DecisionDefinitionId } from './decisionDefinitionRegistry';
import type { ThreadSelection } from './decisionThreadService';

export interface DecisionFamilyThreadLineage {
  decisionThreadId: string;
  lifecycleStatus: DecisionThreadLifecycleStatus;
  contextStatus: DecisionThreadContextStatus;
  currentRecommendationSnapshotId: string | null;
}

export class DecisionFamilyAmbiguousThreadError extends Error {
  constructor(public readonly decisionDefinitionId: DecisionDefinitionId, public readonly primaryEntityId: string) {
    super(`Multiple active decision threads exist for ${decisionDefinitionId}/${primaryEntityId}; cannot resolve one to resume.`);
    this.name = 'DecisionFamilyAmbiguousThreadError';
  }
}

export interface DecisionFamilyAdapter {
  decisionDefinitionId: DecisionDefinitionId;
  primaryEntityType: string;

  /**
   * Fail-closed eligibility check (e.g. "is this InventoryItem actually a
   * recorded HVAC system on this property") — read-only, never creates
   * anything. Callers use this to distinguish "not applicable to this
   * decision family" from "no adapter registered."
   */
  isEligiblePrimaryEntity(propertyId: string, primaryEntityId: string): Promise<boolean>;

  /** Read-only lookup of any existing active thread. Never creates. */
  selectThread(propertyId: string, primaryEntityId: string): Promise<ThreadSelection<DecisionFamilyThreadLineage>>;

  /**
   * HI-DEC-002: "Starting a material recommendation shall create or resume
   * a Decision Thread and persist an immutable Recommendation Snapshot
   * before external commitment." Creates exactly one thread + snapshot the
   * first time; resumes (recomputing first if stale) on every later call.
   * Throws DecisionFamilyAmbiguousThreadError if more than one active
   * thread already exists for this primary entity.
   */
  createOrResumeThread(input: {
    propertyId: string;
    userId: string;
    primaryEntityId: string;
    askExecutionId?: string;
  }): Promise<DecisionFamilyThreadLineage>;
}
