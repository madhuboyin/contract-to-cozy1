// Live prompt #20: "compare Harbor and UnknownFakeBuilder" got "Which detail do you mean? ... the serial number of my refrigerator", an example about something the
// homeowner never asked. When a compare request names two things nothing recognised, the answer says that, with examples of what can be compared. Pure.
export interface CompareSubjects { left: string; right: string }

const COMPARE = /^\s*(?:please\s+)?(?:(?:can|could|would) you\s+)?compare\s+(.+?)\s+(?:and|with|to|vs\.?|versus)\s+(.+?)\s*[?.!]*\s*$/i;
// A phrase that points at the homeowner's own things ("my furnace", "these two quotes") is a reference to a record, not an unrecognised name.
const REFERENCE_START = /^(?:my|our|the|this|that|these|those|both|all|any|each|every|a|an)\b/i;
const MAX_WORDS = 4;
const MAX_LENGTH = 60;

const acceptable = (phrase: string) => phrase.length > 0 && phrase.length <= MAX_LENGTH && phrase.split(/\s+/).length <= MAX_WORDS && !REFERENCE_START.test(phrase);

/** The two names of a "compare X and Y" request, or null when it is not that shape or either side is a reference to the homeowner's own records. */
export function parseCompareSubjects(message: string): CompareSubjects | null {
  const match = COMPARE.exec(message);
  if (!match) return null;
  const left = match[1].trim(); const right = match[2].trim();
  return acceptable(left) && acceptable(right) ? { left, right } : null;
}

export function unresolvedCompareCopy(subjects: CompareSubjects): { title: string; body: string } {
  return {
    title: 'I couldn’t tell what to compare',
    body: `I didn’t recognize “${subjects.left}” or “${subjects.right}” in your home records, so I haven’t compared anything. `
      + 'Tell me what you want to compare, for example two contractor quotes or two inspection reports, or check how the names are spelled in your records.',
  };
}
