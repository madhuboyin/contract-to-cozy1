// Ask Intelligence FRD §14/§21.4. Shared, family-generic DecisionThread
// presentation-block builders -- moved out of askOrchestrator.service.ts
// (Ask Cozy Stage 3, Phase 6: implementation plan §12) so both the
// orchestrator's own HVAC dispatch AND conversationalCapture.ts's new GOAL
// candidate processing (Phase 6) can render a thread's progress without
// creating a circular import: conversationalCapture.ts is imported BY
// askOrchestrator.service.ts one-directionally (see that file's own header
// comment), so it cannot import anything defined inside
// askOrchestrator.service.ts. These three functions were purely pure/no-I/O
// (operate only on already-fetched thread/snapshot data), so this is a
// mechanical move, not a behavior change -- verified nothing else in the
// repo referenced them before moving (grep confirmed askOrchestrator.service.ts
// was the only consumer).
import type { AskPresentationBlock } from '../../productFramework/ask/ask.contract';
import type * as decisionPreferenceService from '../decisionPlatform/decisionPreferenceService';

export type DecisionProgressThread = { id: string; lifecycleStatus: string; contextStatus: string; contextIssueCodes: string[] };
export type DecisionProgressSnapshot = { verdictCode: string; reasonCodes: string[]; limitationCodes: string[]; confidenceBreakdown: unknown; generatedAt: Date } | null;

export function decisionProgressBlock(
  id: string, title: string, thread: DecisionProgressThread, snapshot: DecisionProgressSnapshot,
  actions: { id: string; label: string; href?: string; style: 'PRIMARY' | 'SECONDARY' | 'QUIET' }[],
): AskPresentationBlock {
  return {
    type: 'DECISION_PROGRESS', id, title,
    decisionThreadId: thread.id,
    lifecycleStatus: thread.lifecycleStatus as any,
    contextStatus: thread.contextStatus as any,
    verdict: snapshot?.verdictCode ?? null,
    reasonCodes: snapshot?.reasonCodes ?? [],
    limitationCodes: snapshot?.limitationCodes ?? [],
    contextIssueCodes: thread.contextIssueCodes,
    confidenceLabel: (snapshot?.confidenceBreakdown as { label?: 'HIGH' | 'MEDIUM' | 'LOW' } | undefined)?.label ?? null,
    generatedAt: snapshot?.generatedAt ? snapshot.generatedAt.toISOString() : null,
    actions,
  };
}

export type ResolvedDecisionProgressSnapshot = NonNullable<DecisionProgressSnapshot>;

export function whyNowBlock(id: string, snapshot: ResolvedDecisionProgressSnapshot, triggerReasonCodes: string[]): AskPresentationBlock {
  return {
    type: 'WHY_NOW', id, title: 'Why now',
    triggerCodes: triggerReasonCodes.length ? triggerReasonCodes : snapshot.reasonCodes,
    evidenceCodes: snapshot.reasonCodes,
    timingNote: triggerReasonCodes.length ? 'Recalculated after a recorded fact changed.' : null,
    confidenceLabel: (snapshot.confidenceBreakdown as { label?: 'HIGH' | 'MEDIUM' | 'LOW' } | undefined)?.label ?? null,
  };
}

export function recommendationChangeBlock(id: string, decisionThreadId: string, change: decisionPreferenceService.RecommendationChangeDiff): AskPresentationBlock {
  return {
    type: 'RECOMMENDATION_CHANGE', id, title: 'What changed', decisionThreadId,
    previousVerdict: change.previousVerdict, currentVerdict: change.currentVerdict,
    category: change.category, changedFactors: change.changedFactors,
    changedAt: new Date().toISOString(),
  };
}

// D01 fix (docs/architecture/ASK_COZY_PHASE7_DECISIONS_ACCEPTANCE_VERIFICATION.md):
// HVAC_DECISION_START/CONTINUE's own registry entries declare EVIDENCE and
// ASSUMPTIONS as allowed block types, but neither function ever pushed one --
// the audit found this by direct grep. RecommendationSnapshot.canonicalFactReferences
// only stores {entityType, entityId, fieldPath} references, not the values
// themselves (by design -- a snapshot is immutable, but "current...evidence
// loaded" per the FRD's own wording means CURRENT values, resolved against
// the live InventoryItem passed in here, not what the values were when the
// snapshot was generated). Pure and exported for direct unit testing --
// callers resolve the live item and pass it in rather than this function
// reading the database itself.
export type CanonicalFactReference = { entityType?: unknown; entityId?: unknown; fieldPath?: unknown };
export type HvacEvidenceSourceItem = { condition: string; installedOn: Date | string | null; updatedAt: Date | string };

export function evidenceItemsForCanonicalFacts(
  canonicalFactReferences: unknown,
  item: HvacEvidenceSourceItem,
): { label: string; source: string | null; observedAt: string | null }[] {
  const references = Array.isArray(canonicalFactReferences) ? canonicalFactReferences as CanonicalFactReference[] : [];
  const observedAt = typeof item.updatedAt === 'string' ? item.updatedAt : item.updatedAt.toISOString();
  const items: { label: string; source: string | null; observedAt: string | null }[] = [];
  for (const reference of references) {
    if (reference.fieldPath === 'condition' && !items.some((existing) => existing.label.startsWith('Recorded condition'))) {
      items.push({ label: `Recorded condition: ${item.condition.replace(/_/g, ' ').toLowerCase()}`, source: 'Home inventory record', observedAt });
    } else if (reference.fieldPath === 'installedOn' && !items.some((existing) => existing.label.startsWith('Installed') || existing.label.startsWith('Install date'))) {
      const installedOn = item.installedOn ? (typeof item.installedOn === 'string' ? item.installedOn : item.installedOn.toISOString()).slice(0, 10) : null;
      items.push({ label: installedOn ? `Installed on ${installedOn}` : 'Install date not recorded', source: 'Home inventory record', observedAt });
    }
  }
  return items;
}

// The recurring gap this fix's design deliberately avoids: PREFERENCE_REFERENCE
// blocks only render when a preference was actually used, so a homeowner
// with no saved preference sees nothing telling them none was assumed. This
// makes that state explicit, from the same preferenceReferenceIds-resolved
// detail set already fetched for PREFERENCE_REFERENCE (not a second,
// independent preference read) -- plus the engine version, so a resumed
// decision discloses which calibration produced it.
export function assumptionsItemsForSnapshot(
  preferenceDetails: readonly { definitionId: string }[],
  engineVersion: string,
): string[] {
  const hasOwnershipHorizon = preferenceDetails.some((detail) => detail.definitionId === 'OWNERSHIP_HORIZON');
  const hasApproach = preferenceDetails.some((detail) => detail.definitionId === 'REPAIR_REPLACE_APPROACH');
  return [
    hasOwnershipHorizon
      ? 'Uses your saved ownership-horizon plan, shown below.'
      : 'No ownership-horizon preference on file — this calculation does not assume any planned sale timeline.',
    hasApproach
      ? 'Uses your confirmed repair/replace approach, shown below.'
      : 'No cost-preference on file — this calculation does not weight toward minimizing upfront cost or maximizing reliability.',
    `Calculated using HVAC decision engine version ${engineVersion}.`,
  ];
}
