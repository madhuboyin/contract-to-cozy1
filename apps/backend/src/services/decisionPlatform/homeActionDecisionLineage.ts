// Home Intelligence Functional Completeness FRD Phase 3A (HI-DEC-002,
// work items 2-6) — resolves a material Home Action to its decision
// family and Decision Thread lineage through the adapter registry, and
// creates/resumes that thread before a homeowner proceeds to compare or
// commit.
//
// The only Home Action producer that maps to a registered decision family
// today is loadRepairReplaceDecisionActions
// (homeActionSourcePromotion.service.ts), whose lineageId is
// `repair-replace:${inventoryItemId}` (see that function). Extend
// resolveDecisionFamilyRef here, not in homeActions.service.ts itself, when
// a second decision-family-eligible producer is registered — this keeps
// every id-prefix-to-decision-family mapping in one place, the same way
// OWNERSHIP_COST_CHANGE_ID_PREFIX/ACTIVATION_ID_PREFIX are centralized in
// homeActionProducerOwnership.ts for command routing.

import { logger } from '../../lib/logger';
import type { DecisionFamilyThreadLineage } from './decisionFamilyAdapter';
import { DecisionFamilyAmbiguousThreadError } from './decisionFamilyAdapter';
import { getDecisionFamilyAdapter } from './decisionFamilyAdapterRegistry';
import type { DecisionDefinitionId } from './decisionDefinitionRegistry';

const REPAIR_REPLACE_ID_PREFIX = 'repair-replace:';

export interface HomeActionDecisionFamilyRef {
  decisionDefinitionId: DecisionDefinitionId;
  primaryEntityId: string;
}

/**
 * Returns null for the overwhelming majority of Home Actions — those with
 * no registered decision family at all. That is not the fail-closed
 * "UNAVAILABLE" case below; it means this action is simply out of scope for
 * Decision Thread lineage.
 */
export function resolveDecisionFamilyRef(action: { lineageId: string }): HomeActionDecisionFamilyRef | null {
  if (action.lineageId.startsWith(REPAIR_REPLACE_ID_PREFIX)) {
    const primaryEntityId = action.lineageId.slice(REPAIR_REPLACE_ID_PREFIX.length);
    if (!primaryEntityId) return null;
    return { decisionDefinitionId: 'HVAC_REPAIR_REPLACE', primaryEntityId };
  }
  return null;
}

export type HomeActionDecisionLineage =
  | { status: 'LINKED'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string; thread: DecisionFamilyThreadLineage }
  | { status: 'NOT_STARTED'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  | { status: 'AMBIGUOUS'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  // The primary entity does not qualify for this decision family (e.g. a
  // non-HVAC appliance under the HVAC_REPAIR_REPLACE family) — not a
  // registry gap, just out of scope for this specific item.
  | { status: 'NOT_APPLICABLE'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string }
  // HI-DEC-002 work item 6: no registered decision-family adapter exists
  // for this action's decisionDefinitionId — fail closed rather than
  // pretend lineage is available.
  | { status: 'UNAVAILABLE'; decisionDefinitionId: DecisionDefinitionId; primaryEntityId: string; reason: string };

/** Read-only. Never creates a thread — safe to call while rendering the Home feed. */
export async function resolveHomeActionDecisionLineage(
  propertyId: string,
  ref: HomeActionDecisionFamilyRef,
): Promise<HomeActionDecisionLineage> {
  const adapter = getDecisionFamilyAdapter(ref.decisionDefinitionId);
  if (!adapter) {
    return { status: 'UNAVAILABLE', ...ref, reason: `No decision-family adapter is registered for ${ref.decisionDefinitionId}.` };
  }
  const eligible = await adapter.isEligiblePrimaryEntity(propertyId, ref.primaryEntityId);
  if (!eligible) return { status: 'NOT_APPLICABLE', ...ref };
  const selection = await adapter.selectThread(propertyId, ref.primaryEntityId);
  if (selection.kind === 'NONE') return { status: 'NOT_STARTED', ...ref };
  if (selection.kind === 'AMBIGUOUS') return { status: 'AMBIGUOUS', ...ref };
  return { status: 'LINKED', ...ref, thread: selection.thread };
}

/**
 * HI-DEC-002: "Starting a material recommendation shall create or resume a
 * Decision Thread and persist an immutable Recommendation Snapshot before
 * external commitment." Called when a homeowner opens a decision-family-
 * eligible Home Action (recordHomeActionOpened) — genuine engagement, not
 * merely a Home feed render, so listing Home never writes.
 */
export async function startOrResumeHomeActionDecisionThread(input: {
  propertyId: string;
  userId: string;
  ref: HomeActionDecisionFamilyRef;
  askExecutionId?: string;
}): Promise<HomeActionDecisionLineage> {
  const { propertyId, userId, ref, askExecutionId } = input;
  const adapter = getDecisionFamilyAdapter(ref.decisionDefinitionId);
  if (!adapter) {
    return { status: 'UNAVAILABLE', ...ref, reason: `No decision-family adapter is registered for ${ref.decisionDefinitionId}.` };
  }
  const eligible = await adapter.isEligiblePrimaryEntity(propertyId, ref.primaryEntityId);
  if (!eligible) return { status: 'NOT_APPLICABLE', ...ref };
  try {
    const thread = await adapter.createOrResumeThread({ propertyId, userId, primaryEntityId: ref.primaryEntityId, askExecutionId });
    return { status: 'LINKED', ...ref, thread };
  } catch (error) {
    if (error instanceof DecisionFamilyAmbiguousThreadError) return { status: 'AMBIGUOUS', ...ref };
    logger.warn({ err: error, propertyId, ref }, 'Decision thread create-or-resume failed; Home Action opened without decision lineage this request');
    return { status: 'UNAVAILABLE', ...ref, reason: 'Unable to start or resume the decision at this time.' };
  }
}
