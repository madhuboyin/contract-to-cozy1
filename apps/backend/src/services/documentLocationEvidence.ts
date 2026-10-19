import { createHash } from 'node:crypto';

// Sole Homeowner Interface Phase 7 (FR-INPUT-003): where in the original a proposed detail came from.
// Two sources, never blended: TEXT_MATCH is deterministic (the value was found in the PDF's own text layer, page by page);
// MODEL_REPORTED is what the AI reader said and is passed on as unverified. A location the reader did not give is null, never guessed.

export type LocationBasis = 'TEXT_MATCH' | 'MODEL_REPORTED';
/** [ymin, xmin, ymax, xmax], each 0-1000 relative to the page. */
export type PageBox = readonly [number, number, number, number];

export interface FieldLocation {
  page: number | null;
  box: PageBox | null;
  excerpt: string | null;
  basis: LocationBasis;
}

const EXCERPT_RADIUS = 60;

export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function excerptHash(excerpt: string): string {
  return createHash('sha256').update(normalizeForMatch(excerpt)).digest('hex');
}

/** A reader-reported page number, or null when it is not a usable 1-based page. */
export function sanitizePage(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5000 ? value : null;
}

/** A reader-reported box, or null unless it is four ordered numbers on the 0-1000 scale. */
export function sanitizeBox(value: unknown): PageBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const numbers = value.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? Math.round(entry) : NaN));
  if (numbers.some((entry) => Number.isNaN(entry) || entry < 0 || entry > 1000)) return null;
  const [ymin, xmin, ymax, xmax] = numbers;
  if (ymax <= ymin || xmax <= xmin) return null;
  return [ymin, xmin, ymax, xmax];
}

/** Text of every page of a PDF, in order. Empty when the PDF has no text layer (a scan), so callers fall back to what the reader reported. */
export async function pdfPageTexts(buffer: Buffer): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse');
  const pages: string[] = [];
  const pagerender = async (pageData: { getTextContent: (options: object) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    let lastY: number | undefined;
    let text = '';
    for (const item of content.items) {
      text += lastY === item.transform[5] || lastY === undefined ? item.str : `\n${item.str}`;
      lastY = item.transform[5];
    }
    pages.push(text);
    return text;
  };
  await pdfParse(buffer, { pagerender });
  return pages.some((page) => page.trim().length > 0) ? pages : [];
}

/** Spellings a number can take in a document, so 1200 is found as "$1,200.00" too. */
function numberVariants(value: number): string[] {
  const plain = String(value);
  const grouped = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fixed = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Array.from(new Set([plain, grouped, fixed, value.toFixed(2)]));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Spellings an ISO date (2026-09-30) can take in a document. */
function dateVariants(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return [iso];
  const [, year, month, day] = match;
  const m = Number(month);
  const d = Number(day);
  const name = MONTHS[m - 1];
  if (!name) return [iso];
  return Array.from(new Set([
    `${year}-${month}-${day}`, `${month}/${day}/${year}`, `${m}/${d}/${year}`, `${m}/${d}/${year.slice(2)}`,
    `${name} ${d}, ${year}`, `${name.slice(0, 3)} ${d}, ${year}`, `${name.slice(0, 3)}. ${d}, ${year}`, `${d} ${name} ${year}`, `${d} ${name.slice(0, 3)} ${year}`, `${name} ${d} ${year}`,
  ]));
}

/** Find a string or number value in the page texts. The first page that contains it wins; null when no page does. */
export function locateValueInPages(pages: readonly string[], value: string | number): FieldLocation | null {
  const needles = typeof value === 'number' ? numberVariants(value) : dateVariants(value);
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const flat = page.replace(/\s+/g, ' ');
    const lower = flat.toLowerCase();
    for (const needle of needles) {
      const normalized = normalizeForMatch(needle);
      if (normalized.length < 2) continue;
      const at = lower.indexOf(normalized);
      if (at === -1) continue;
      const start = Math.max(0, at - EXCERPT_RADIUS);
      const end = Math.min(flat.length, at + normalized.length + EXCERPT_RADIUS);
      return { page: index + 1, box: null, excerpt: flat.slice(start, end).trim(), basis: 'TEXT_MATCH' };
    }
  }
  return null;
}

/**
 * The location to keep for one value. A text match wins; the reader's own page and box are kept only when they agree with it (same page) or
 * when there is no text layer to check against, and are then marked MODEL_REPORTED.
 */
export function resolveLocation(pages: readonly string[], value: string | number | null, reported: { page: number | null; box: PageBox | null } | null): FieldLocation | null {
  const matched = value !== null && pages.length > 0 ? locateValueInPages(pages, value) : null;
  if (matched) return { ...matched, box: reported && reported.page === matched.page ? reported.box : null };
  if (pages.length > 0) return null; // there is a text layer and the value is not in it: do not pass on an unverifiable claim
  if (reported && (reported.page !== null || reported.box !== null)) return { page: reported.page, box: reported.box, excerpt: null, basis: 'MODEL_REPORTED' };
  return null;
}

/** "Page 2, upper left" from a location, for people. */
export function describeLocation(location: { page: number | null; box: readonly number[] | null }): string {
  const parts: string[] = [];
  if (location.page) parts.push(`Page ${location.page}`);
  if (location.box && location.box.length === 4) {
    const [ymin, xmin, ymax, xmax] = location.box;
    const vertical = (ymin + ymax) / 2 < 333 ? 'upper' : (ymin + ymax) / 2 < 667 ? 'middle' : 'lower';
    const horizontal = (xmin + xmax) / 2 < 333 ? 'left' : (xmin + xmax) / 2 < 667 ? 'center' : 'right';
    parts.push(vertical === 'middle' && horizontal === 'center' ? 'center' : vertical === 'middle' ? horizontal : `${vertical} ${horizontal}`);
  }
  return parts.join(', ');
}
