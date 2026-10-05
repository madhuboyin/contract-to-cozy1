// Plan C.15.4 / FRD §27.7a "Four-action availability and degraded state": the bounded exact-four outcome diagnostic. Labels are
// registered tokens only; no homeowner text, action labels or entity ids ever reach a metric or log.
//
// Two counters on purpose: `..._total{result}` increments exactly once per execution, so summing it measures answers; the reason
// counter increments once per reason and a single execution may add several, so it must never be summed as an answer count.
import { askSuggestedActionsExactFourReasonsTotal, askSuggestedActionsExactFourTotal } from '../../../lib/metrics';
import type { ExactFourDiagnostics } from './suggestedNextActionExactFourPolicy';

export interface ExactFourOutcomeSample {
  result: 'FULL' | 'DEGRADED' | 'EXEMPT';
  /** Zero or more bounded reasons: exempt reason, shortage reasons, and COMPLETENESS_UNKNOWN / SLOT_CLASS_DENIED / SIGNAL_CLAIM_DENIED when they occurred. */
  reasons: string[];
}

export function exactFourOutcome(diagnostics: ExactFourDiagnostics): ExactFourOutcomeSample {
  if (diagnostics.applicability === 'EXEMPT') return { result: 'EXEMPT', reasons: [diagnostics.exemptReason] };
  const reasons = new Set<string>(diagnostics.shortageReasons);
  if (diagnostics.completenessUnknown) reasons.add('COMPLETENESS_UNKNOWN');
  if (diagnostics.slotClassDenied > 0) reasons.add('SLOT_CLASS_DENIED');
  if (diagnostics.signalClaimsDenied > 0) reasons.add('SIGNAL_CLAIM_DENIED');
  if (diagnostics.shortage === 0) return { result: 'FULL', reasons: [...reasons] };
  if (reasons.size === 0) reasons.add('UNEXPLAINED');
  return { result: 'DEGRADED', reasons: [...reasons] };
}

export function recordExactFourDiagnostics(diagnostics: ExactFourDiagnostics): ExactFourOutcomeSample {
  const outcome = exactFourOutcome(diagnostics);
  askSuggestedActionsExactFourTotal.inc({ result: outcome.result });
  for (const reason of outcome.reasons) askSuggestedActionsExactFourReasonsTotal.inc({ result: outcome.result, reason });
  return outcome;
}
