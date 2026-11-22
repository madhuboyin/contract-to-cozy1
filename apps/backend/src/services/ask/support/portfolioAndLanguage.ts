// BICC-PORT-003 and BICC-UX-009 (docs/product/ASK_COZY_BEST_IN_CLASS_CONVERSATIONAL_CONCIERGE_FRD.md): two honest boundaries that must not fall through
// to a property answer.
//
//  - A question about several homes at once ("which of my homes has overdue maintenance?") is a portfolio question. Ask answers for ONE selected home, so
//    answering it for the selected home as if it represented the portfolio is wrong. The boundary says so and offers to choose a home.
//  - English is the supported understanding language in v1. A message in another language gets a respectful, non-destructive recovery, not a guess.
//
// Both are deterministic and conservative: a false positive blocks a real question, so each detector is tested against every English corpus prompt.

const HOME_NOUN = '(?:homes|houses|properties|rentals|condos|townhomes|apartments)';
const PORTFOLIO_PATTERNS: readonly RegExp[] = [
  // "which of my homes ...", "any of my houses ...", "how many of my properties ..."
  new RegExp(`\\b(?:which|what|how many|any|do any|does any|are any|is any|none|all|each|every|both)\\b[^.?!]{0,20}\\bof\\s+(?:my|our)\\s+${HOME_NOUN}\\b`, 'i'),
  // "across all my homes", "for every one of my properties", "between my two homes"
  new RegExp(`\\b(?:across|between|among|over|for)\\s+(?:all|each|every|both|my two|my three|my multiple)\\s*(?:of\\s+)?(?:my|our|the)?\\s*(?:one of )?${HOME_NOUN}\\b`, 'i'),
  new RegExp(`\\b(?:all|each|every)\\s+(?:of\\s+)?(?:my|our)\\s+${HOME_NOUN}\\b`, 'i'),
  new RegExp(`\\bcompare\\b[^.?!]{0,30}\\b(?:my|our)\\s+(?:\\w+\\s+)?${HOME_NOUN}\\b`, 'i'),
  new RegExp(`\\b(?:my|our)\\s+(?:two|three|four|several|multiple|both)\\s+${HOME_NOUN}\\b`, 'i'),
  new RegExp(`\\b(?:my|our)\\s+(?:other|second|third|rental|investment|vacation)\\s+(?:home|house|property)s?\\b[^.?!]{0,30}\\b(?:and|versus|vs|compared)\\b`, 'i'),
];

export function isPortfolioQuestion(message: string): boolean {
  return PORTFOLIO_PATTERNS.some((pattern) => pattern.test(message));
}

// ---------------- language ----------------
const NON_LATIN_LETTER = /[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-鿿가-힯]/g;
const LETTER = /\p{L}/gu;

const ENGLISH = new Set(['the', 'is', 'are', 'was', 'my', 'our', 'what', 'when', 'where', 'who', 'which', 'how', 'do', 'does', 'did', 'i', 'we', 'of', 'to', 'and', 'for', 'in', 'on', 'it', 'have', 'has', 'can', 'should', 'would', 'a', 'an', 'me', 'much', 'many', 'any', 'this', 'that', 'with', 'about', 'home', 'house', 'need', 'show', 'tell', 'list']);
// Function words that are distinctive for Spanish, French, German, Portuguese and Italian and are not English words.
const FOREIGN = new Set([
  'cuándo', 'cuando', 'qué', 'cómo', 'cuánto', 'cuántos', 'dónde', 'cuál', 'mi', 'mis', 'casa', 'tengo', 'está', 'tiene', 'los', 'las', 'una', 'del', 'para', 'por', 'que', 'quiero', 'necesito', 'mantenimiento',
  'quand', 'comment', 'combien', 'où', 'ma', 'mes', 'maison', 'est', 'les', 'des', 'du', 'une', 'pour', 'je', 'j’ai', 'quel', 'quelle', 'dois', 'avoir',
  'wann', 'wie', 'wo', 'ist', 'mein', 'meine', 'haus', 'das', 'der', 'und', 'habe', 'brauche', 'wieviel', 'welche', 'wartung', 'nicht', 'ich',
  'quando', 'como', 'quanto', 'onde', 'meu', 'minha', 'casa', 'tenho', 'está', 'uma', 'preciso', 'qual', 'manutenção', 'sono', 'ho', 'dove', 'il', 'della', 'perché',
]);

export interface LanguageVerdict { unsupported: boolean; reason: 'NON_LATIN_SCRIPT' | 'FOREIGN_FUNCTION_WORDS' | null }

export function detectUnsupportedLanguage(message: string): LanguageVerdict {
  const letters = message.match(LETTER)?.length ?? 0;
  if (!letters) return { unsupported: false, reason: null };
  const nonLatin = message.match(NON_LATIN_LETTER)?.length ?? 0;
  if (nonLatin >= 2 && nonLatin / letters >= 0.3) return { unsupported: true, reason: 'NON_LATIN_SCRIPT' };
  const tokens = message.toLowerCase().normalize('NFC').split(/[^\p{L}’']+/u).filter(Boolean);
  let foreign = 0; let english = 0;
  for (const token of tokens) { if (ENGLISH.has(token)) english += 1; else if (FOREIGN.has(token)) foreign += 1; }
  return foreign >= 2 && foreign > english ? { unsupported: true, reason: 'FOREIGN_FUNCTION_WORDS' } : { unsupported: false, reason: null };
}
