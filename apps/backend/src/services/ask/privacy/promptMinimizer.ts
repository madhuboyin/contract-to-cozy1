// Two-pass prompt minimiser (reliability FRD FR-PRV-1/3/7). Pure and offline: nothing here calls a model. It is the code that must exist and pass its tests
// BEFORE any homeowner text may be sent to a provider (D3a). Pass 1 runs on the RAW message (before spelling correction) and replaces identifiers with typed
// placeholders; pass 2 re-checks the FINAL payload more conservatively. Text that looks identifier-like but cannot be classified, or that loses its routing meaning,
// yields `noCall` (FR-PRV-3/7): the local decision applies or the user is asked to rephrase; unredacted text is never a fallback.
export const MINIMIZER_VERSION = '1';

export type PlaceholderRole = 'EMAIL' | 'PHONE' | 'URL' | 'DOB' | 'SSN' | 'ADDRESS' | 'ACCOUNT_NUMBER' | 'CLAIM_NUMBER' | 'POLICY_NUMBER' | 'PERMIT_NUMBER' | 'SERIAL_NUMBER' | 'INSURER' | 'CONTRACTOR' | 'LENDER' | 'PERSON' | 'NAME';
export interface KnownName { readonly name: string; readonly role: 'INSURER' | 'CONTRACTOR' | 'LENDER' | 'PERSON' }
export type MinimizeNoCallReason = 'UNCLASSIFIABLE_IDENTIFIER' | 'UNINTERPRETABLE_AFTER_MINIMISATION';
export interface MinimizeResult { readonly text: string; readonly replaced: ReadonlyArray<{ role: PlaceholderRole; pass: 1 | 2 }>; readonly noCall: MinimizeNoCallReason | null }

/** Certified domain terms that are capitalised in ordinary use and are NOT names (FR-NRM-10). */
const DOMAIN_TERMS = new Set(['HVAC', 'HOA', 'FEMA', 'Home', 'Record', 'Actions', 'Cozy', 'Ask', 'Home Record', 'Home Actions', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'I', 'AC', 'DIY', 'LED', 'GFCI', 'AFCI']);
const STREET_SUFFIX = '(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place|ter|terrace|cir|circle|pkwy|parkway|hwy|highway)';
const CUE_ROLE: ReadonlyArray<readonly [RegExp, PlaceholderRole]> = [
  [/\b(?:claim)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})/gi, 'CLAIM_NUMBER'],
  [/\b(?:policy)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})/gi, 'POLICY_NUMBER'],
  [/\b(?:permit)\s*(?:no\.?|number|#|id)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})/gi, 'PERMIT_NUMBER'],
  [/\b(?:serial)\s*(?:no\.?|number|#)?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,})/gi, 'SERIAL_NUMBER'],
  [/\b(?:account|acct)\s*(?:no\.?|number|#)?\s*[:#]?\s*(\d[\d-]{4,})/gi, 'ACCOUNT_NUMBER'],
];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasDigit = (s: string) => /\d/.test(s);

type Marker = (role: PlaceholderRole, original: string) => string;
const placeholderMarker: Marker = (role) => `[${role}]`;

function replaceAll(text: string, re: RegExp, role: PlaceholderRole, pass: 1 | 2, out: Array<{ role: PlaceholderRole; pass: 1 | 2 }>, group = 0, mark: Marker = placeholderMarker): string {
  return text.replace(re, (...args) => {
    out.push({ role, pass });
    const whole = args[0] as string;
    if (group === 0) return mark(role, whole);
    const captured = args[group] as string;
    return whole.replace(captured, mark(role, captured));
  });
}

function pass1(raw: string, known: ReadonlyArray<KnownName>, out: Array<{ role: PlaceholderRole; pass: 1 | 2 }>, mark: Marker = placeholderMarker): string {
  let text = raw;
  // server-known names first, with their typed role (longest first so "State Farm Insurance" wins over "State")
  for (const k of [...known].sort((a, b) => b.name.length - a.name.length)) if (k.name.trim().length >= 3) text = replaceAll(text, new RegExp(`\\b${escapeRe(k.name.trim())}\\b`, 'gi'), k.role, 1, out, 0, mark);
  text = replaceAll(text, /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'EMAIL', 1, out, 0, mark);
  text = replaceAll(text, /\bhttps?:\/\/\S+|\bwww\.\S+/gi, 'URL', 1, out, 0, mark);
  text = replaceAll(text, /\b\d{3}-\d{2}-\d{4}\b/g, 'SSN', 1, out, 0, mark);
  text = replaceAll(text, /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g, 'PHONE', 1, out, 0, mark);
  text = replaceAll(text, /\b(?:dob|date of birth|born)\s*(?:on|:)?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi, 'DOB', 1, out, 0, mark);
  for (const [re, role] of CUE_ROLE) text = replaceAll(text, re, role, 1, out, 1, mark);
  text = replaceAll(text, new RegExp(`\\b\\d{1,6}\\s+(?:[A-Z][\\w'-]*\\s+){0,3}${STREET_SUFFIX}\\b\\.?(?:\\s+(?:apt|unit|suite|ste|#)\\s*\\w+)?`, 'gi'), 'ADDRESS', 1, out, 0, mark);
  return text;
}

/**
 * FR-NRM-1 / FR-PRV-1: pass-1 identifier protection for the ROUTING text. Every pass-1 span (server-known names with their role, emails, phones, URLs, identifiers, addresses) is replaced by an opaque sentinel so spelling
 * correction and framing removal can only touch unprotected text; `restore` puts the original spans back, so routing still reads exactly what was typed. Nothing is sent anywhere by this function.
 */
export function maskProtectedSpans(raw: string, known: ReadonlyArray<KnownName> = []): { masked: string; restore: (text: string) => string; protectedCount: number } {
  const originals: string[] = [];
  const masked = pass1(raw, known, [], (_role, original) => { originals.push(original); return `\uE000${originals.length - 1}\uE001`; });
  return { masked, protectedCount: originals.length, restore: (text) => text.replace(/\uE000(\d+)\uE001/g, (whole, index: string) => originals[Number(index)] ?? whole) };
}

/** Conservative re-check of the final payload. Returns the text and whether something identifier-like could not be classified. */
function pass2(text: string, out: Array<{ role: PlaceholderRole; pass: 1 | 2 }>): { text: string; unclassifiable: boolean } {
  let t = text; let unclassifiable = false;
  t = replaceAll(t, /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'EMAIL', 2, out);
  t = replaceAll(t, /\b\d{3}-\d{2}-\d{4}\b/g, 'SSN', 2, out);
  // a long digit run with no cue (9+ digits, ignoring placeholders) cannot be classified safely
  if (/(?<![\w[])\d[\d\s-]{7,}\d(?![\w\]])/.test(t.replace(/\$[\d,.]+/g, ''))) unclassifiable = true;
  // a capitalised, non-initial, non-domain token next to a number (e.g. "Hendersen 4412") is a possible name + identifier
  const tokens = t.split(/\s+/);
  for (let i = 1; i < tokens.length; i += 1) {
    const w = tokens[i].replace(/[^\w']/g, '');
    if (/^[A-Z][a-z]{2,}$/.test(w) && !DOMAIN_TERMS.has(w)) {
      const neighbour = `${tokens[i - 1] ?? ''} ${tokens[i + 1] ?? ''}`;
      if (hasDigit(neighbour) && !/\[/.test(neighbour)) unclassifiable = true;
      else { tokens[i] = tokens[i].replace(w, '[NAME]'); out.push({ role: 'NAME', pass: 2 }); }
    }
  }
  return { text: tokens.join(' '), unclassifiable };
}

export function minimizePrompt(raw: string, known: ReadonlyArray<KnownName> = []): MinimizeResult {
  const replaced: Array<{ role: PlaceholderRole; pass: 1 | 2 }> = [];
  const afterPass1 = pass1(raw, known, replaced);
  const { text, unclassifiable } = pass2(afterPass1, replaced);
  if (unclassifiable) return { text: '', replaced, noCall: 'UNCLASSIFIABLE_IDENTIFIER' };
  // routing meaning: at least two ordinary words must remain once placeholders are removed
  const remaining = text.replace(/\[[A-Z_]+\]/g, ' ').match(/[A-Za-z]{2,}/g) ?? [];
  if (replaced.length && remaining.length < 2) return { text: '', replaced, noCall: 'UNINTERPRETABLE_AFTER_MINIMISATION' };
  return { text, replaced, noCall: null };
}

/** Scripted check for FR-PRV-5: does any detectable identifier survive in an outbound payload? */
export function detectIdentifiers(payload: string): PlaceholderRole[] {
  const found: PlaceholderRole[] = []; const t = payload;
  if (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(t)) found.push('EMAIL');
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(t)) found.push('SSN');
  if (/(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/.test(t)) found.push('PHONE');
  if (/\bhttps?:\/\/\S+|\bwww\.\S+/i.test(t)) found.push('URL');
  if (new RegExp(`\\b\\d{1,6}\\s+(?:[A-Z][\\w'-]*\\s+){0,3}${STREET_SUFFIX}\\b`, 'i').test(t)) found.push('ADDRESS');
  for (const [re, role] of CUE_ROLE) { re.lastIndex = 0; if (re.test(t.replace(/\[[A-Z_]+\]/g, ''))) found.push(role); }
  return found;
}
