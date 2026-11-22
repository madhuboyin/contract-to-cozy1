import type { AskPresentationBlock } from '../../../../productFramework/ask/ask.contract';
import type { SemanticReadReceipt } from '../semanticExecutionReceipt';
import { humanizeEnumTokensInCopy, humanizePresentationToken } from '../containment/presentationHumanizer';

/**
 * UI review 2026-11-21, slice 3: an analysis (own-versus-rent, refinance break-even) is a result with a conclusion, key facts, the assumptions behind it and the limits of what it
 * knows. It is not a collection of records, so it is never modelled as a one-row list. The answer leads with the conclusion (or, when the inputs are missing, with what cannot be
 * determined yet); facts are short label/value pairs; assumptions and limitations are separate, quiet blocks.
 */
export interface AnalysisFact { readonly label: string; readonly value: string }

type AnalysisAction = Extract<AskPresentationBlock, { type: 'SUMMARY' }>['actions'][number];

export interface SliceAnalysisInput {
  readonly receipt: SemanticReadReceipt;
  /** One line: the conclusion, or what cannot be determined yet. */
  readonly headline: string;
  /** At most one supporting line (what the conclusion rests on, or what is missing). */
  readonly supportLine?: string;
  /** Up to four key facts. */
  readonly facts?: readonly AnalysisFact[];
  /** What the model assumed, one per line. */
  readonly assumptions?: readonly string[];
  /** Context that is not the answer (for example a different saved analysis). Shown as a quiet note. */
  readonly note?: { readonly title: string; readonly body: string };
  /** True when the analysis could not be worked out: the summary is cautionary. */
  readonly cannotDetermine?: boolean;
  /** At most one next action: supply the missing input, or adjust the assumptions. Opens a governed Ask command; it never calculates or writes by itself. */
  readonly actions?: readonly AnalysisAction[];
}

/** Whole dollars with separators ("$233,001"): a strategic comparison rarely needs cents. */
export function wholeDollars(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

export function buildSliceAnalysisPresentation(input: SliceAnalysisInput): AskPresentationBlock[] {
  const { receipt } = input;
  const headline = humanizeEnumTokensInCopy(input.headline);
  const supportLine = input.supportLine ? humanizeEnumTokensInCopy(input.supportLine) : undefined;
  const facts = (input.facts ?? []).slice(0, 4);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY',
    id: receipt.answerVariantId,
    title: headline,
    body: supportLine ?? headline,
    headline,
    ...(supportLine ? { supportLine } : {}),
    ...(facts.length > 0 ? { bullets: facts.map((fact) => ({ label: humanizeEnumTokensInCopy(fact.label), body: humanizeEnumTokensInCopy(fact.value) })) } : {}),
    tone: input.cannotDetermine ? 'CAUTION' : 'DEFAULT',
    presentationFamily: 'ANALYSIS',
    actions: (input.actions ?? []).slice(0, 1) as AnalysisAction[],
  }];
  if (input.assumptions && input.assumptions.length > 0) {
    blocks.push({ type: 'ASSUMPTIONS', id: `${receipt.answerVariantId}-assumptions`, title: 'What this assumes', items: input.assumptions.map(humanizeEnumTokensInCopy) });
  }
  if (input.note) {
    blocks.push({ type: 'LIMITATION', id: `${receipt.answerVariantId}-note`, title: humanizeEnumTokensInCopy(input.note.title), body: humanizeEnumTokensInCopy(input.note.body), severity: 'INFO' });
  }
  blocks.push({
    type: 'EVIDENCE',
    id: `${receipt.answerVariantId}-evidence`,
    title: 'Where this comes from',
    items: [{ label: 'Your home record', source: humanizePresentationToken(receipt.provenance.sourceType), observedAt: receipt.provenance.observedAt }],
  });
  return blocks;
}
