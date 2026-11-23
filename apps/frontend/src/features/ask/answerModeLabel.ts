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
