import type { AskExecutionResponse } from './types';

type SkillHandoff = NonNullable<AskExecutionResponse['skillHandoff']>;

// The message sent when the handoff card is clicked. Derived from the registered goal slug because
// those exact phrasings are verified to route deterministically to the target operation -- a
// handler-nominated label is display-only and must never change what Ask is asked.
export function handoffPrompt(handoff: Pick<SkillHandoff, 'suggestedGoal'>): string {
  return handoff.suggestedGoal.replace(/[-_]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

// The button text. A handler-nominated label when present (executions persisted before
// FRD v1.166 have none), otherwise the same text as the prompt.
export function handoffLabel(handoff: Pick<SkillHandoff, 'suggestedGoal' | 'suggestedLabel'>): string {
  return handoff.suggestedLabel?.trim() || handoffPrompt(handoff);
}
