// BICC-SAFE-002: an emergency noun in a sentence that is education, history, a hypothetical or a resolved incident is not an active emergency. The check is made per
// clause, so "what should I do, I smell gas in the kitchen" is still active (its second clause is), and it is deliberately narrow: any present-tense cue ("right now",
// "my", "this", "again", "still") keeps a clause active. Where this is unsure it answers "active", because a missed emergency costs more than an extra safety card.
const PRESENT_CUE = /\b(?:right now|now|currently|just|still|again|this|that|these|those|my|our|the (?:kitchen|basement|garage|attic|house|home|bathroom|bedroom|furnace|panel|stove|oven|water heater))\b/i;
const EDUCATIONAL = /^(?:and |but |so |also )?(?:(?:what|how|why)\b|explain\b|tell me (?:about|how|what)\b|signs? of\b|causes? of\b)/i;
const HISTORICAL = /\b(?:last (?:year|month|week|winter|summer|spring|fall|autumn|night)|yesterday|(?:years?|months?|weeks?|days?) ago|in (?:19|20)\d\d|in (?:january|february|march|april|may|june|july|august|september|october|november|december)|previously|earlier this year|back in)\b/i;
const CONDITIONAL = /^(?:and |but |so )?(?:if|what if|suppose|supposing|in case|would|hypothetically)\b/i;
const RESOLVED = /\b(?:was|were|has been|have been|had been|got|is now|been)\s+(?:fixed|repaired|replaced|resolved|cleared|handled|addressed|taken care of|cleaned up|inspected)\b|\b(?:fixed|repaired|replaced|resolved)\s+(?:yesterday|last|earlier|already)\b/i;

/** The clauses of a message: sentences, then commas and dashes, so a framing in one clause never silences an emergency stated in another. */
export function emergencyClauses(message: string): string[] {
  return message.split(/[.!?;\n]+|\s[-–—]\s|,\s*|\s+(?:and|but)\s+(?=(?:i|we|there|it|my|the)\b)/i).map((clause) => clause.trim()).filter(Boolean);
}

/** True when this clause is education, history, a hypothetical or a resolved incident and states nothing happening now. */
export function isNonActiveFraming(clause: string): boolean {
  const text = clause.trim();
  if (/\b(?:right now|currently|at this moment|just now|help)\b/i.test(text)) return false;
  if (RESOLVED.test(text)) return true;
  if (HISTORICAL.test(text) && !/\b(?:now|still|again)\b/i.test(text)) return true;
  if (CONDITIONAL.test(text)) return true;
  // Education needs a generic subject: "what should I do if I smell gas" is education; "what is that gas smell in my kitchen" is not.
  if (EDUCATIONAL.test(text) && !PRESENT_CUE.test(text)) return true;
  return false;
}
