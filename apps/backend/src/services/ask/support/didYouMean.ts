// Ask handler support: "Did you mean…" in place of a dead end. When the generic fallback finds nothing in the home record (or its answer cannot be
// matched to the question), the local router's own best candidates are shown as choices. On the routing corpus the correct operation is among the local top
// three for 68% of the messages the fallback receives, while the top one alone is right for 46% and loosening the confidence threshold routes about as many
// wrong as right: so the homeowner is asked, which costs one click and no model call. A floor keeps near-zero scores from being offered.
import { getAskOperationDefinition, type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { isAskHonestNoAnswerResult } from '../askRemoteFallbackTypedClaims';
import type { AskRoutingDecision } from '../askRoutingCascade';
import { ASK_DEFAULT_LANGUAGE, type AskLanguageCode } from '../askLanguageRegistry';

/** Calibrated confidence below which a candidate is noise (measured on the corpus: at 0.10, 96% of fallback messages still get options and 59% include the right one). */
export const ASK_DID_YOU_MEAN_FLOOR = 0.1;
export const ASK_DID_YOU_MEAN_LIMIT = 3;
export const ASK_DID_YOU_MEAN_REASON = 'ASK_UNANSWERED_DID_YOU_MEAN';
const EXPIRES_IN_MS = 30 * 60 * 1000;

/** The fallback's own "nothing found" answer, or an answer it prepared but could not match to the question. */
export function isAskUnansweredFallbackResult(operationId: string, result: AskOperationResult): boolean {
  return operationId === 'GROUNDED_GUIDANCE'
    && (isAskHonestNoAnswerResult(operationId, result) || result.reasonCode === 'ASK_ANSWER_UNVERIFIED_NO_ALTERNATIVE');
}

/** The local candidates worth offering: above the floor, eligible here, never a boundary or the fallback itself, best first, at most three. */
export function didYouMeanOptions(candidates: ReadonlyArray<{ operationId: AskOperationId; confidence: number }>, eligible: ReadonlySet<AskOperationId>): AskOperationId[] {
  const seen = new Set<AskOperationId>();
  const options: AskOperationId[] = [];
  for (const candidate of [...candidates].sort((left, right) => right.confidence - left.confidence)) {
    const id = candidate.operationId;
    if (seen.has(id) || candidate.confidence < ASK_DID_YOU_MEAN_FLOOR || !eligible.has(id) || id === 'GROUNDED_GUIDANCE') continue;
    seen.add(id);
    if (getAskOperationDefinition(id).safetyClass.endsWith('_BOUNDARY')) continue;
    options.push(id);
    if (options.length === ASK_DID_YOU_MEAN_LIMIT) break;
  }
  return options;
}

function labelFor(operationId: AskOperationId, language: AskLanguageCode): string {
  if (operationId === 'GUIDANCE_JOURNEY_CONTINUE') return 'View current guided journey steps';
  const definition = getAskOperationDefinition(operationId);
  return definition.semantic.languagePacks[language]?.supportedJobs[0] ?? definition.semantic.supportedJobs[0];
}

export function buildDidYouMeanResult(options: readonly AskOperationId[], language: AskLanguageCode = ASK_DEFAULT_LANGUAGE, now: Date = new Date()): AskOperationResult {
  const expiresAt = new Date(now.getTime() + EXPIRES_IN_MS).toISOString();
  return {
    status: 'NEEDS_CLARIFICATION',
    reasonCode: ASK_DID_YOU_MEAN_REASON,
    blocks: [{
      type: 'SUMMARY', id: 'did-you-mean', title: 'Did you mean one of these?',
      body: 'I couldn’t find an answer to that in your home record. If you meant one of these, pick it and I’ll look it up; otherwise say it another way.',
      tone: 'DEFAULT', actions: [],
    }],
    clarification: {
      version: 1,
      question: 'Which of these did you mean?',
      options: options.map((operationId) => ({ operationId, label: labelFor(operationId, language) })),
      allowFreeText: true,
      expiresAt,
    },
    parameters: { clarification: { version: 1, candidateOperationIds: [...options], expiresAt } },
    suggestions: [],
  };
}

/**
 * The "Did you mean" answer for a fallback that found nothing, or null when the result is not that case or no candidate clears the floor
 * (the plain "nothing found" message then stands).
 */
export function offerDidYouMean(input: {
  operationId: string;
  routingDecision: Pick<AskRoutingDecision, 'stage' | 'candidates' | 'language'>;
  result: AskOperationResult;
  eligibleOperationIds: Iterable<AskOperationId>;
  now?: Date;
}): AskOperationResult | null {
  if (input.routingDecision.stage !== 'REMOTE_FALLBACK' || !isAskUnansweredFallbackResult(input.operationId, input.result)) return null;
  const options = didYouMeanOptions(input.routingDecision.candidates, new Set(input.eligibleOperationIds));
  return options.length ? buildDidYouMeanResult(options, input.routingDecision.language, input.now) : null;
}
