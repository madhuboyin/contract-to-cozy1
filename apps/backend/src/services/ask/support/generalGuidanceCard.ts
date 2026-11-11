// Decision 4 (audit, owner 2026-11-09): when a property is selected and nothing in the home record answers a question, and no useful "Did you mean?"
// exists, offer APPROVED general guidance as a separately badged card rather than a bare dead end. Order: grounded answer, "Did you mean?", this card,
// the plain limitation. The card makes no claim about this home and is skipped for wording that would read as eligibility, coverage, compliance, safety
// or financial outcomes. The limitation text and the professional boundary stay in the result, so the card only adds to them.
import type { AskOperationResult } from '../askOperationRegistry';
import { isAskHonestNoAnswerResult } from '../askRemoteFallbackTypedClaims';

export const ASK_GENERAL_GUIDANCE_CARD_ID = 'general-guidance-card';
export const ASK_GENERAL_GUIDANCE_CARD_TITLE = 'General guidance — not based on your home record';

// Guidance that asserts or implies an outcome for a particular home is not eligible for this card.
const OUTCOME_CLAIM_WORDING = /\b(eligible|eligibility|qualif(?:y|ies|ied)\s+for|covered|coverage|insured|insurance|claim|warranty|compliant|compliance|code[- ]compliant|legal(?:ly)?|permit|guarantee[sd]?|safe to|mortgage|loan|tax(?:es)?|worth|save[sd]? you|your home|your house|your property)\b|[$€£]\s?\d|\d\s?%|\byour\s+(?:\w+\s+){0,2}(?:is|are|was|were|has|have|must|will)\b/i;

export interface GeneralGuidanceCardSource { id: string; title: string; text: string; source: string }

export function isEligibleGeneralGuidance(guidance: GeneralGuidanceCardSource | null): guidance is GeneralGuidanceCardSource {
  return Boolean(guidance && guidance.text.trim() && !OUTCOME_CLAIM_WORDING.test(`${guidance.title} ${guidance.text}`));
}

/** Adds the badged card after the limitation summary. Returns the result unchanged unless it is the honest "nothing in your home record" answer. */
export function withGeneralGuidanceCard(operationId: string, result: AskOperationResult, guidance: GeneralGuidanceCardSource | null): AskOperationResult {
  if (!isAskHonestNoAnswerResult(operationId, result) || !isEligibleGeneralGuidance(guidance)) return result;
  if (result.blocks.some((block) => block.type === 'SUMMARY' && block.id === ASK_GENERAL_GUIDANCE_CARD_ID)) return result;
  const card = {
    type: 'SUMMARY' as const, id: ASK_GENERAL_GUIDANCE_CARD_ID, title: ASK_GENERAL_GUIDANCE_CARD_TITLE,
    body: `${guidance.title}: ${guidance.text.trim()} This is general information from ${guidance.source}. It does not use your home record, so add the relevant details about your home if you want an answer specific to it.`,
    tone: 'DEFAULT' as const, actions: [],
  };
  const summaryIndex = result.blocks.findIndex((block) => block.type === 'SUMMARY' && block.id === 'grounded-guidance');
  const blocks = [...result.blocks];
  blocks.splice(summaryIndex + 1, 0, card);
  return { ...result, blocks };
}
