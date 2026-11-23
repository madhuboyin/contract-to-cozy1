import { answerModeLabel } from '@/features/ask/answerModeLabel';
import type { AskExecutionResponse } from '@/features/ask/types';
import { formatAskDateOnly } from '@/features/ask/dateFormatting';

/** BICC-ANS-001/007: the kind of answer, in words. Renders nothing when the server declared no mode or the answer is unavailable (it states its own reason). */
export function AnswerModeBadge({ mode, facetLabel = null, asOf = null }: { mode: AskExecutionResponse['answerMode']; /** For one part of a composed answer: the part of the question it answers. */ facetLabel?: string | null; /** That part's own oldest known observation time (ANS-002). */ asOf?: string | null }) {
  const label = answerModeLabel(mode);
  const observed = formatAskDateOnly(asOf);
  if (!label) return null;
  return (
    <p data-ask-answer-mode={mode ?? undefined} title={label.description} className="text-[11px] font-medium text-slate-500">
      <span className="sr-only">{facetLabel ? `Answer type for “${facetLabel}”: ` : 'Answer type: '}</span>{label.text}{observed ? ` · as of ${observed}` : ''}<span className="sr-only">. {label.description}{observed ? ` The evidence for this part is as of ${observed}.` : ''}</span>
    </p>
  );
}
