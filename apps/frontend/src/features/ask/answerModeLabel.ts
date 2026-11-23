import type { AskExecutionResponse } from '@/features/ask/types';

// BICC-ANS-001/005/006/007: every substantive answer declares what kind of answer it is, and the person sees it. The mode comes from the server (assigned by the
// operation, never by a model); this file only words it. UNAVAILABLE has no label because the answer already says why in its own words, and a missing mode (a
// pending turn, a command receipt, a social reply) shows nothing rather than a guess.
export type AnswerMode = NonNullable<AskExecutionResponse['answerMode']>;

export interface AnswerModeLabel { text: string; /** A sentence for assistive technology and the hover title. */ description: string }

const LABELS: Readonly<Record<Exclude<AnswerMode, 'UNAVAILABLE'>, AnswerModeLabel>> = {
  HOME_RECORD: { text: 'From your home record', description: 'This answer comes from the records saved for your home.' },
  USER_DOCUMENT: { text: 'From your documents', description: 'This answer quotes a document you added; the citation shows where.' },
  CALCULATION: { text: 'Calculated', description: 'This is a calculation from figures you gave or that are recorded, shown with the inputs it used.' },
  ESTIMATE: { text: 'Estimate', description: 'This figure rests on assumed, predicted or approximate inputs, so treat it as a planning estimate, not a quote.' },
  RECOMMENDATION: { text: 'Recommendation', description: 'This is advice based on the evidence and assumptions shown with it. A professional can confirm it.' },
  GENERAL_GUIDANCE: { text: 'General guidance · not from your home record', description: 'This is general advice. It is not based on your home’s records and is not an inspection or a diagnosis.' },
};

export function answerModeLabel(mode: AskExecutionResponse['answerMode']): AnswerModeLabel | null {
  if (!mode || mode === 'UNAVAILABLE') return null;
  return LABELS[mode] ?? null;
}

export interface FacetMode { blockIdPrefix: string; operationId: string; mode: AnswerMode | null; clause: string }

/**
 * BICC-ANS-001/002: for a composed answer, the mode to show above a block, or null. The badge goes on the FIRST block of each facet only (a facet's later blocks
 * stay unlabelled), and a facet with no mode shows nothing.
 */
export function facetBadgeFor(facetModes: readonly FacetMode[] | undefined, blocks: ReadonlyArray<{ id: string }>, block: { id: string }): AnswerMode | null {
  if (!facetModes?.length) return null;
  const facet = facetModes.find((candidate) => block.id.startsWith(candidate.blockIdPrefix));
  if (!facet?.mode) return null;
  const first = blocks.find((candidate) => candidate.id.startsWith(facet.blockIdPrefix));
  return first && first.id === block.id ? facet.mode : null;
}

/** The part of the question this facet answers, for the badge's assistive text. */
export function facetClauseFor(facetModes: readonly FacetMode[] | undefined, block: { id: string }): string | null {
  return facetModes?.find((candidate) => block.id.startsWith(candidate.blockIdPrefix))?.clause || null;
}
