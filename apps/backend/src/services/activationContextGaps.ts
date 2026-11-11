// The facts the activation "complete only the home facts that improve this decision" Home Action can still be missing, in the order they are asked.
// One place for the rule, used by the producer (entryContext.service.ts, which words the action) and by Ask (which asks for each one inline), so
// the two can never disagree about what is missing.

export const ACTIVATION_CONTEXT_SIGNAL = 'Complete only the home facts that improve this decision';

export type ActivationGapKey = 'AFFECTED_ITEM' | 'TRIGGER_DETAILS';

export const ACTIVATION_GAP_LABELS: Readonly<Record<ActivationGapKey, string>> = {
  AFFECTED_ITEM: 'Specific affected item or record',
  TRIGGER_DETAILS: 'Trigger details',
};

export interface ActivationGapInput {
  triggerEntityId: string | null | undefined;
  triggerEntityType: string | null | undefined;
  /** Distinguishes an explicit whole-home choice from onboarding's default PROPERTY scope. */
  triggerScopeConfirmedAt: Date | string | null | undefined;
  /** The trigger's own free-text detail. */
  triggerDetail: string | null | undefined;
  /** True when any stored evidence item carries a detail. */
  evidenceDetailPresent: boolean;
}

export interface ActivationActionabilityInput extends ActivationGapInput {
  triggerLabel: string | null | undefined;
}

/** A generic onboarding category is not a homeowner task until one fact identifies the situation. */
export function hasActionableActivationContext(input: ActivationActionabilityInput): boolean {
  if (input.triggerLabel?.trim().toLowerCase() !== 'something needs repair') return true;
  return Boolean(
    input.triggerScopeConfirmedAt
    || input.triggerEntityId
    || input.triggerDetail?.trim()
    || input.evidenceDetailPresent,
  );
}

export function activationMissingGaps(input: ActivationGapInput): ActivationGapKey[] {
  const gaps: ActivationGapKey[] = [];
  if (!input.triggerScopeConfirmedAt || (!input.triggerEntityId && input.triggerEntityType !== 'PROPERTY')) gaps.push('AFFECTED_ITEM');
  if (!input.triggerDetail && !input.evidenceDetailPresent) gaps.push('TRIGGER_DETAILS');
  return gaps;
}

/** Homeowner-facing copy shared by the activation-context producer and its focused Ask answer. */
export function activationContextActionCopy(triggerLabel: string) {
  return {
    title: `Tell Cozy what prompted this plan: ${triggerLabel}`,
    whyItMatters: `A little more context about “${triggerLabel}” will help Cozy tailor the next steps for this home.`,
    expectedOutcome: 'Get next steps that fit what is happening in your home.',
    timingRationale: 'Add this when convenient, or sooner if the situation changes.',
  } as const;
}

/** Recognises both the current title and already-persisted legacy titles once the action has left the feed. */
export const ACTIVATION_CONTEXT_TITLE_PATTERN = /^(?:Tell Cozy what prompted this plan: .+|Review and correct: .+\. Skip anything that does not change the active decision\.?)$/;
