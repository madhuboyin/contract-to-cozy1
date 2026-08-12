// Bridges Decision Platform lifecycle events into the existing PropertyChange
// / Home Briefing pipeline (Ask Intelligence FRD §16, Phase 9A) rather than
// building a second "what changed" system — PropertyChange already is FRD
// §16's HomeChangeView (typed source/revision identity, materiality
// predicate, dedupe key, supersession, per-user audience state), just never
// fed by RecommendationSnapshot or DecisionPreferenceValue until now. Mirrors
// modules/homeOperations/infrastructure/workItemChangeEmitter.ts's pattern
// exactly: best-effort, never fails the caller's actual write.
//
// Rows carry structural metadata only (ids, enums, codes) -- never a copy of
// a recommendation's verdict text or a preference's actual value -- matching
// PropertyChange's own "own no source truth" design.

import { logger } from '../../lib/logger';
import { emitPropertyChange } from '../../propertyChanges/propertyChange.service';
import type { RecommendationChangeCategory } from './decisionPreferenceService';
import type { DecisionPreferenceSubjectType } from '../../productFramework/decisionPlatform/decisionPlatform.contract';

export interface DecisionRecommendationChangeInput {
  propertyId: string;
  decisionThreadId: string;
  snapshotId: string;
  generatedAt: Date;
  isFirstSnapshot: boolean;
  // null when this is the thread's first-ever snapshot (createHvacDecisionThread) --
  // compareRecommendationSnapshots only runs when a previous snapshot exists.
  category: RecommendationChangeCategory | null;
}

// Deliberately never called for createHvacScenario's snapshot -- FRD §13.3
// scenario isolation means a scenario is a hypothetical, not a real change
// to "what's going on with your home"; emitting one here would misrepresent
// it and echoes the same no-scenario-leakage invariant Phase 8B already
// enforces for preference saves.
export async function emitDecisionRecommendationChange(input: DecisionRecommendationChangeInput): Promise<void> {
  const homeownerRelevant = input.isFirstSnapshot || input.category !== 'UNCHANGED';
  const lifecycleAdvanced = input.isFirstSnapshot || input.category === 'MATERIAL';
  try {
    await emitPropertyChange({
      propertyId: input.propertyId,
      sourceType: 'DECISION_RECOMMENDATION_SNAPSHOT',
      sourceEntityId: input.decisionThreadId,
      sourceRevision: input.snapshotId,
      changeType: input.isFirstSnapshot ? 'SOURCE_RECORD_CREATED' : 'SOURCE_RECORD_REVISED',
      occurredAt: input.generatedAt,
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant,
        lifecycleAdvanced,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    });
  } catch (err) {
    logger.error(
      { err, decisionThreadId: input.decisionThreadId, snapshotId: input.snapshotId },
      '[decisionPlatformChangeEmitter] failed to emit recommendation-change PropertyChange',
    );
  }
}

export interface DecisionPreferenceChangeInput {
  propertyId: string | null;
  definitionId: string;
  subjectType: DecisionPreferenceSubjectType;
  subjectId: string;
  preferenceValueId: string;
  action: 'SAVED_NEW' | 'SAVED_REVISED' | 'REVOKED';
}

// Only emits when propertyId is a concrete property -- PropertyChange.propertyId
// is a required FK, but OWNERSHIP_HORIZON is saved with propertyId: null
// (household-wide, ADR-0001: a household can span properties). Fanning a
// household-wide preference change out to every linked property is real
// complexity with no urgent need today (PREFERENCE_REFERENCE/WHY_NOW/
// RECOMMENDATION_CHANGE already disclose preference-driven shifts per
// decision thread) -- deferred, not silently dropped without explanation.
export async function emitDecisionPreferenceChange(input: DecisionPreferenceChangeInput): Promise<void> {
  if (!input.propertyId) return;
  try {
    await emitPropertyChange({
      propertyId: input.propertyId,
      sourceType: 'DECISION_PREFERENCE_VALUE',
      sourceEntityId: `${input.definitionId}:${input.subjectType}:${input.subjectId}`,
      sourceRevision: input.preferenceValueId,
      changeType: input.action === 'REVOKED' ? 'SOURCE_LIFECYCLE_CHANGED'
        : input.action === 'SAVED_NEW' ? 'SOURCE_RECORD_CREATED' : 'SOURCE_RECORD_REVISED',
      occurredAt: new Date(),
      sourceHealth: 'CURRENT',
      signals: {
        homeownerRelevant: true,
        lifecycleAdvanced: true,
        propertyEffectConfirmed: false,
        urgentSafetyCondition: false,
        canonicalActionPriority: null,
      },
    });
  } catch (err) {
    logger.error(
      { err, definitionId: input.definitionId, preferenceValueId: input.preferenceValueId },
      '[decisionPlatformChangeEmitter] failed to emit preference-change PropertyChange',
    );
  }
}
