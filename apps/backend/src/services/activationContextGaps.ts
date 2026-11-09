// The facts the activation "complete only the home facts that improve this decision" Home Action can still be missing, in the order they are asked.
// One place for the rule, used by the producer (entryContext.service.ts, which words the action) and by Ask (which asks for each one inline), so
// the two can never disagree about what is missing.

export const ACTIVATION_CONTEXT_SIGNAL = 'Complete only the home facts that improve this decision';

export type ActivationGapKey = 'YEAR_BUILT' | 'PROPERTY_SIZE' | 'AFFECTED_ITEM' | 'TRIGGER_DETAILS';

export const ACTIVATION_GAP_LABELS: Readonly<Record<ActivationGapKey, string>> = {
  YEAR_BUILT: 'Year built',
  PROPERTY_SIZE: 'Property size',
  AFFECTED_ITEM: 'Specific affected item or record',
  TRIGGER_DETAILS: 'Trigger details',
};

export interface ActivationGapInput {
  yearBuilt: number | null | undefined;
  propertySize: number | null | undefined;
  triggerEntityId: string | null | undefined;
  triggerEntityType: string | null | undefined;
  /** The trigger's own free-text detail. */
  triggerDetail: string | null | undefined;
  /** True when any stored evidence item carries a detail. */
  evidenceDetailPresent: boolean;
}

export function activationMissingGaps(input: ActivationGapInput): ActivationGapKey[] {
  const gaps: ActivationGapKey[] = [];
  if (!input.yearBuilt) gaps.push('YEAR_BUILT');
  if (!input.propertySize) gaps.push('PROPERTY_SIZE');
  if (!input.triggerEntityId && input.triggerEntityType !== 'PROPERTY') gaps.push('AFFECTED_ITEM');
  if (!input.triggerDetail && !input.evidenceDetailPresent) gaps.push('TRIGGER_DETAILS');
  return gaps;
}

/** The title the Home Action headline is built from; used to recognise the action once it has left the feed. */
export const ACTIVATION_CONTEXT_TITLE_PATTERN = /^Review and correct: .+\. Skip anything that does not change the active decision\.?$/;
