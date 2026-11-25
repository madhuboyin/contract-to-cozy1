// BICC-3.2 / MM-006 / MM-012 (deterministic slice): finding the passages of a document that mention what the person asked about. Pure. The question is the ONLY thing that
// decides what is searched for; the document's text is data to be matched and quoted, never read as an instruction, an operation, a tool or a property. Every passage is a
// verbatim slice of one page, with its page and passage number, so a claim can always be checked against the source.
import type { PdfPage } from './pdfText';

export interface Passage { id: string; page: number; index: number; text: string }
export interface PassageMatch extends Passage { score: number; matched: string[] }

const TARGET_CHARS = 700;
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'it', 'this', 'that', 'my', 'me', 'i', 'does', 'do', 'say', 'says', 'about', 'with', 'any', 'what', 'which', 'who', 'how', 'when', 'where', 'there', 'document', 'pdf', 'file', 'attachment', 'attached', 'uploaded', 'policy', 'report', 'paperwork']);

/** Splits each page into passages of about 700 characters on paragraph, then sentence, boundaries. Verbatim: nothing is rewritten. */
export function passagesFromPages(pages: readonly PdfPage[]): Passage[] {
  const out: Passage[] = [];
  for (const { page, text } of pages) {
    const units = text.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/).map((u) => u.trim()).filter(Boolean);
    let current = ''; let index = 0;
    const flush = () => { if (current.trim()) { index += 1; out.push({ id: `p${page}-c${index}`, page, index, text: current.trim() }); } current = ''; };
    for (const unit of units) {
      if (current && current.length + unit.length + 1 > TARGET_CHARS) flush();
      current = current ? `${current} ${unit}` : unit;
    }
    flush();
  }
  return out;
}

const stem = (word: string): string => (/(?:ing|ed)$/.test(word) && word.length > 5 ? word.replace(/(?:ing|ed)$/, '') : /[^s]s$/.test(word) && word.length > 3 ? word.slice(0, -1) : word);
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().normalize('NFKC').replace(/[^a-z0-9$%\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
  return [...new Set(words.map(stem))];
}

export const MAX_PASSAGES_SHOWN = 3;
/** The best passages for the terms: each term counted once per passage, rarer terms worth more. A passage must match at least half the terms (and at least one). */
export function findPassages(passages: readonly Passage[], query: string): PassageMatch[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const lowered = passages.map((p) => p.text.toLowerCase());
  const docFreq = terms.map((term) => lowered.filter((t) => t.includes(term)).length);
  const need = Math.max(1, Math.ceil(terms.length / 2));
  const matches: PassageMatch[] = [];
  passages.forEach((passage, i) => {
    const matched = terms.filter((term) => lowered[i].includes(term));
    if (matched.length < need) return;
    const score = matched.reduce((sum, term) => sum + 1 / (1 + docFreq[terms.indexOf(term)]), 0) + matched.length;
    matches.push({ ...passage, score, matched });
  });
  return matches.sort((a, b) => b.score - a.score || a.page - b.page || a.index - b.index).slice(0, MAX_PASSAGES_SHOWN);
}
