// Ask Cozy Stage 3, Phase 3 (implementation plan §9; FRD §13).
//
// Deterministic, cheap, no LLM call, pure function (no I/O) -- gates whether
// the bounded structured-extraction LLM call (extractionContract.ts) ever
// happens for a turn. Per FRD §13's explicit fail-safe requirement: a missed
// trigger (false negative) only loses conversational capture for that turn,
// never blocks the routed answer; a false trigger only costs one extra
// bounded LLM call, never a wrong write (extraction only ever produces
// proposals, gated behind confirmation regardless of this filter's outcome).
// That asymmetry is why every pattern below is written to prefer a false
// trigger over a missed one when genuinely ambiguous.

export type ExtractionPreFilterReason =
  | 'RETROSPECTIVE_ACTION'
  | 'STATE_OF_BEING_FACT'
  | 'THIRD_PARTY_RELAY'
  | 'CORRECTION_MARKER'
  | 'HEDGE_MARKER'
  | 'COST_MENTION'
  | 'GOAL_STATEMENT'
  | 'ACTIVE_GOAL_FOLLOW_UP';

export interface ExtractionPreFilterDecision {
  shouldExtract: boolean;
  matchedReasons: ExtractionPreFilterReason[];
}

// A sentence that is ONLY a forward-looking/hypothetical question never
// reports something that already happened -- excluding it from triggering is
// what keeps "Should I replace my roof?" and "How much does it cost to
// replace a roof?" (false-positive traps, FRD §15) from firing on a bare
// present-tense/infinitive verb match elsewhere in this file. This exclusion
// is per-sentence, not per-message: a message that mixes a hypothetical
// question with a genuine statement (FRD §8.3) still fires on the statement
// sentence.
const HYPOTHETICAL_ONLY_SENTENCE = /^\s*(should i|should we|is it worth|do i need to|do we need to|would it help|can i|can we|will i need to|will we need to|what if i|what if we|when should i|when should we|how much (does|would) it cost|how much (do|would) .* cost)\b/i;

// Something already happened, stated in past tense. "had X done/redone/..."
// covers the common "we had the roof redone" passive-causative phrasing that
// a simple past-tense verb list would miss.
const RETROSPECTIVE_ACTION = /\b(replaced|installed|fixed|repaired|serviced|painted|upgraded|added|removed|cleaned|renovated|remodeled|inspected|bought|purchased|hired|paid|swapped)\b|\bhad\b.{0,40}\b(done|redone|replaced|installed|repaired|serviced|fixed)\b/i;

// A declarative "my/our/the X is/was/has/had Y" -- deliberately requires
// declarative word order (subject before the copula) so an inverted
// question ("Is my roof at risk?") never matches this pattern.
const STATE_OF_BEING_FACT = /\b(my|our|the)\s+[a-z][a-z ]{1,40}\s+(is|was|has|had)\s+[a-z0-9$]/i;

const THIRD_PARTY_RELAY = /\b(inspector|contractor|plumber|electrician|technician|provider|agent|realtor|lender|appraiser|adjuster)\b.{0,20}\b(said|told me|told us|mentioned|noted|recommended|advised|estimated|quoted)\b/i;

const CORRECTION_MARKER = /\b(actually|correction|i meant|we meant|not\s+\d|instead of|to correct (myself|what i said))\b/i;

const HEDGE_MARKER = /\b(i think|we think|pretty sure|i believe|we believe|not (totally |100% )?(certain|sure)|if i remember|if i recall)\b/i;

const COST_MENTION = /\$\s?\d|\b\d+(\.\d+)?\s?(dollars|bucks)\b/i;

// FRD §21: a life-event/goal statement (§8.5's "thinking about selling next
// year") also needs the pre-filter to fire before extraction can ever
// produce a GOAL candidate, even though Phase 3 itself doesn't yet act on
// GOAL candidates (implementation plan §9 scopes Phase 3 to FACT/EVENT
// only) -- the filter is shared infrastructure Phase 6 will reuse unchanged.
const GOAL_STATEMENT = /\b(thinking about|planning to|considering|might|may)\b.{0,30}\b(sell|selling|refinance|refinancing|renovat(e|ing)|remodel(ing)?|move|moving)\b/i;

function splitSentences(message: string): string[] {
  return message
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function evaluateExtractionPreFilter(message: string, hasActiveGoal = false): ExtractionPreFilterDecision {
  const trimmed = message.trim();
  if (!trimmed) return { shouldExtract: false, matchedReasons: [] };

  const reasons = new Set<ExtractionPreFilterReason>();
  // A short reply may depend entirely on the active decision. Extraction
  // resolves it against that context; the filter does not infer or save facts.
  if (hasActiveGoal && trimmed.length <= 240 && !/^(thanks?|thank you|ok(?:ay)?|got it|bye)[.! ]*$/i.test(trimmed)) {
    reasons.add('ACTIVE_GOAL_FOLLOW_UP');
  }
  for (const sentence of splitSentences(trimmed)) {
    if (HYPOTHETICAL_ONLY_SENTENCE.test(sentence)) continue;
    if (RETROSPECTIVE_ACTION.test(sentence)) reasons.add('RETROSPECTIVE_ACTION');
    if (STATE_OF_BEING_FACT.test(sentence)) reasons.add('STATE_OF_BEING_FACT');
    if (THIRD_PARTY_RELAY.test(sentence)) reasons.add('THIRD_PARTY_RELAY');
    if (CORRECTION_MARKER.test(sentence)) reasons.add('CORRECTION_MARKER');
    if (HEDGE_MARKER.test(sentence)) reasons.add('HEDGE_MARKER');
    if (COST_MENTION.test(sentence)) reasons.add('COST_MENTION');
    if (GOAL_STATEMENT.test(sentence)) reasons.add('GOAL_STATEMENT');
  }

  return { shouldExtract: reasons.size > 0, matchedReasons: [...reasons] };
}
