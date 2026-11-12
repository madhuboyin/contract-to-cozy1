// Ask routing normalisation (reliability FRD FR-NRM). Routing reads the message as typed, so greeting/politeness framing, trailing punctuation and one-letter typos
// each moved correct prompts to a clarification card. This module produces the text ROUTING reads; handlers, storage and display keep the original message.
// Order: closed misspelling list -> framing strip -> generic one-edit spelling correction toward a versioned vocabulary (routingVocabulary.generated.ts).
// Safety is evaluated on the raw text by the caller before this runs (FR-NRM-9), so normalisation can never remove a safety signal.
import { correctKnownMisspellings } from './commonMisspellings';
import { ROUTING_VOCABULARY, ROUTING_VOCABULARY_VERSION } from './routingVocabulary.generated';

export { ROUTING_VOCABULARY_VERSION };

const GREETING = /^\s*(?:(?:hey|hi|hello|yo|ok(?:ay)?|so|hmm+)\b[\s,.!:-]*)*(?:cozy\b[\s,.!:-]*)?/i;
const CAN_YOU_TELL_ME = /^\s*(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:just\s+)?tell\s+me\s+(?!when\b|whenever\b)/i;
const POLITE_LEAD = /^\s*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:just\s+)?(?:quickly\s+)?(?:let\s+me\s+know\s+)?)|^\s*please\s+/i;
// "tell me" is only framing in front of a question word; "tell me about my house" and "tell me when ..." keep it (they are phrasings the rules know).
const TELL_ME_LEAD = /^\s*tell\s+me\s+(?=(?:how|what|which|who|where|why|if|whether)\b)/i;
const POLITE_TAIL = /[\s,.!?;:]*(?:(?:please|pls|thanks|thank\s+you|thx)\b[\s,.!?;:]*)*$/i;

/** Words that are real vocabulary for homes but sit one edit from a registry word; never "corrected" (FR-NRM-10 domain allowlist). */
const DOMAIN_ALLOWLIST = new Set(['boiler', 'heater', 'dryer', 'washer', 'sealer', 'filter', 'gutter', 'gutters', 'shutter', 'shutters', 'planter', 'faucet', 'sewer', 'siding', 'stove', 'oven', 'range', 'roofer', 'plumber', 'painter', 'cooler', 'router', 'heated', 'heats', 'cools', 'costs', 'owner', 'owners', 'fence', 'fences', 'paint', 'tiles', 'floor', 'floors', 'ceiling', 'attic', 'garage']);

export function stripFraming(message: string): string {
  let text = message.replace(GREETING, '').replace(CAN_YOU_TELL_ME, '').replace(POLITE_LEAD, '').replace(TELL_ME_LEAD, '').replace(POLITE_TAIL, '');
  text = text.replace(/\s{2,}/g, ' ').trim();
  return text.length ? text : message.trim();
}

/** 'transposition' | 'deletion' (typo is missing a letter) | 'insertion' (typo has an extra letter) | 'substitution' | null (not one edit apart). */
export function oneEditKind(typo: string, target: string): 'transposition' | 'deletion' | 'insertion' | 'substitution' | null {
  if (typo === target) return null;
  const dl = typo.length - target.length;
  if (Math.abs(dl) > 1) return null;
  if (dl === 0) {
    const diffs: number[] = [];
    for (let i = 0; i < typo.length && diffs.length < 3; i += 1) if (typo[i] !== target[i]) diffs.push(i);
    if (diffs.length === 1) return 'substitution';
    if (diffs.length === 2 && diffs[1] === diffs[0] + 1 && typo[diffs[0]] === target[diffs[1]] && typo[diffs[1]] === target[diffs[0]]) return 'transposition';
    return null;
  }
  const [shorter, longer] = dl < 0 ? [typo, target] : [target, typo];
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i += 1;
  if (shorter.slice(i) !== longer.slice(i + 1)) return null;
  return dl < 0 ? 'deletion' : 'insertion';
}

function hasDoubledLetterAtExtra(typo: string, target: string): boolean {
  for (let i = 1; i < typo.length; i += 1) if (typo[i] === typo[i - 1] && typo.slice(0, i) + typo.slice(i + 1) === target) return true;
  return false;
}

const MIN_LENGTH = 5;
const MIN_TARGET_COUNT = 2;
const VOCAB_ENTRIES = Object.entries(ROUTING_VOCABULARY);

/** The unique vocabulary word a lowercase token is one safe edit from, or null. Substitutions are only trusted on long words. */
export function correctToken(token: string): string | null {
  if (token.length < MIN_LENGTH || token in ROUTING_VOCABULARY || DOMAIN_ALLOWLIST.has(token)) return null;
  const targets = new Set<string>();
  for (const [word, count] of VOCAB_ENTRIES) {
    if (count < MIN_TARGET_COUNT || word[0] !== token[0] || Math.abs(word.length - token.length) > 1) continue;
    const kind = oneEditKind(token, word);
    if (!kind) continue;
    // Only edits that are typing slips: a swapped pair, a missing letter, or a doubled letter. Substitutions and other extra letters are real words ("insured"/"insurer",
    // "serviced"/"service", plurals) and are never corrected.
    if (kind === 'substitution') continue;
    if (kind === 'insertion' && !hasDoubledLetterAtExtra(token, word)) continue;
    // A missing letter is only trusted on words of 7+ letters: shorter words are usually real words ("plans"/"plants").
    if (kind === 'deletion' && token.length < 7) continue;
    if (kind === 'deletion' && /s$/.test(word) !== /s$/.test(token)) continue;
    targets.add(word);
  }
  return targets.size === 1 ? [...targets][0] : null;
}

/** Spans that must never be edited: tokens touching digits, @, /, _, -, ., or a capitalised word that is not sentence-initial (names, addresses). */
export function correctSpelling(message: string): string {
  let first = true;
  return message.replace(/(?<![\w@./_-])([A-Za-z]+)(?![\w@./_-])/g, (match, word: string, offset: number) => {
    const initial = first && message.slice(0, offset).trim() === ''; first = false;
    if (word[0] !== word[0].toLowerCase() && !initial && word !== word.toUpperCase()) return match;
    if (word === word.toUpperCase() && word.length > 1) return match;
    const fixed = correctToken(word.toLowerCase());
    if (!fixed) return match;
    return word[0] !== word[0].toLowerCase() ? fixed[0].toUpperCase() + fixed.slice(1) : fixed;
  });
}

/** The text routing reads. Never throws; falls back to the raw message. */
export function normalizeForRouting(rawMessage: string): string {
  try { return correctSpelling(stripFraming(correctKnownMisspellings(rawMessage))); } catch { return rawMessage; }
}
