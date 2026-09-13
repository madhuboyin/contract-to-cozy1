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
