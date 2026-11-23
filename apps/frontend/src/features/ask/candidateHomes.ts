// BICC-4.1 / BUY-002: the form for a buyer's own candidate homes, kept pure so it is tested without a browser. Money is typed in dollars and stored in whole cents, the loan term
// is typed in years and stored in months, percentages stay percentages. A field left blank is "not entered" (null): nothing is defaulted and nothing is guessed, because the
// comparison and cost answers rely on a blank meaning "the buyer has not said".
export interface CandidateHome {
  id: string; label: string; addressLine?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; listingUrl?: string | null; notes?: string | null;
  listPriceCents?: number | null; bedrooms?: number | null; bathrooms?: number | null; livingAreaSqFt?: number | null; yearBuilt?: number | null;
  annualPropertyTaxCents?: number | null; annualInsuranceCents?: number | null; hoaMonthlyCents?: number | null; monthlyUtilitiesCents?: number | null; oneTimeWorkEstimateCents?: number | null;
  downPaymentPercent?: number | null; mortgageRatePercent?: number | null; mortgageTermMonths?: number | null; closingCostPercent?: number | null;
}

export type CandidateFieldKind = 'text' | 'dollars' | 'percent' | 'whole' | 'decimal' | 'years';
export interface CandidateFieldSpec { key: keyof Omit<CandidateHome, 'id'>; label: string; kind: CandidateFieldKind; group: 'HOME' | 'LISTING' | 'COSTS' | 'FINANCING'; required?: boolean; help?: string; min?: number; max?: number }

export const CANDIDATE_FIELDS: readonly CandidateFieldSpec[] = [
  { key: 'label', label: 'Name for this home', kind: 'text', group: 'HOME', required: true, help: 'For example, “Maple Street”.' },
  { key: 'addressLine', label: 'Address', kind: 'text', group: 'HOME' },
  { key: 'city', label: 'City', kind: 'text', group: 'HOME' },
  { key: 'state', label: 'State', kind: 'text', group: 'HOME' },
  { key: 'postalCode', label: 'ZIP code', kind: 'text', group: 'HOME' },
  { key: 'listingUrl', label: 'Listing link', kind: 'text', group: 'HOME', help: 'Starts with http:// or https://' },
  { key: 'bedrooms', label: 'Bedrooms', kind: 'whole', group: 'LISTING', min: 0, max: 50 },
  { key: 'bathrooms', label: 'Bathrooms', kind: 'decimal', group: 'LISTING', min: 0, max: 50 },
  { key: 'livingAreaSqFt', label: 'Living area (sq ft)', kind: 'whole', group: 'LISTING', min: 1, max: 200000 },
  { key: 'yearBuilt', label: 'Year built', kind: 'whole', group: 'LISTING', min: 1600, max: 2200 },
  { key: 'listPriceCents', label: 'Price ($)', kind: 'dollars', group: 'COSTS' },
  { key: 'annualPropertyTaxCents', label: 'Property tax per year ($)', kind: 'dollars', group: 'COSTS' },
  { key: 'annualInsuranceCents', label: 'Insurance per year ($)', kind: 'dollars', group: 'COSTS' },
  { key: 'hoaMonthlyCents', label: 'HOA per month ($)', kind: 'dollars', group: 'COSTS', help: 'Enter 0 if there is none.' },
  { key: 'monthlyUtilitiesCents', label: 'Utilities per month ($)', kind: 'dollars', group: 'COSTS' },
  { key: 'oneTimeWorkEstimateCents', label: 'One-time work you expect ($)', kind: 'dollars', group: 'COSTS' },
  { key: 'downPaymentPercent', label: 'Down payment (%)', kind: 'percent', group: 'FINANCING', min: 0, max: 100 },
  { key: 'mortgageRatePercent', label: 'Mortgage rate (%)', kind: 'percent', group: 'FINANCING', min: 0, max: 30 },
  { key: 'mortgageTermMonths', label: 'Loan term (years)', kind: 'years', group: 'FINANCING', min: 1, max: 50 },
  { key: 'closingCostPercent', label: 'Closing costs (% of price)', kind: 'percent', group: 'FINANCING', min: 0, max: 30 },
  { key: 'notes', label: 'Notes', kind: 'text', group: 'HOME' },
];

export type CandidateForm = Partial<Record<CandidateFieldSpec['key'], string>>;
export type CandidatePayload = Record<string, string | number | null>;

const text = (value: string | null | undefined): string => (value ?? '').toString();
/** Cents to a dollars string without trailing zeros noise: 40000000 -> "400000", 123456 -> "1234.56". */
const dollarsOf = (cents: number): string => { const dollars = cents / 100; return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2); };

/** A stored home as the strings the form shows. A fact that is not entered is an empty string, never "0". */
export function toForm(home: Partial<CandidateHome> | null | undefined): CandidateForm {
  const form: CandidateForm = {};
  for (const field of CANDIDATE_FIELDS) {
    const value = home?.[field.key];
    if (value === null || value === undefined || value === '') { form[field.key] = ''; continue; }
    form[field.key] = field.kind === 'dollars' ? dollarsOf(Number(value)) : field.kind === 'years' ? String(Number(value) / 12) : String(value);
  }
  return form;
}

export type FormIssues = Partial<Record<CandidateFieldSpec['key'], string>>;

/** Parses the form into the API payload, or the problems to show. Nothing is coerced: a value that is not a sensible number is refused with a message naming the field. */
export function parseCandidateForm(form: CandidateForm): { ok: true; payload: CandidatePayload } | { ok: false; issues: FormIssues } {
  const payload: CandidatePayload = {}; const issues: FormIssues = {};
  for (const field of CANDIDATE_FIELDS) {
    const raw = text(form[field.key]).trim();
    if (!raw) {
      if (field.required) issues[field.key] = `${field.label} is required.`;
      else payload[field.key] = null; // blank means "not entered"; sending null clears an earlier value
      continue;
    }
    if (field.kind === 'text') {
      if (raw.length > (field.key === 'notes' ? 2000 : field.key === 'label' ? 120 : 300)) issues[field.key] = `${field.label} is too long.`;
      else if (field.key === 'listingUrl' && !/^https?:\/\//i.test(raw)) issues[field.key] = 'A listing link must start with http:// or https://.';
      else payload[field.key] = raw;
      continue;
    }
    const cleaned = raw.replace(/[$,%\s]/g, '').replace(/,/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(cleaned)) { issues[field.key] = `${field.label} must be a number.`; continue; }
    const value = Number(cleaned);
    if (field.min !== undefined && value < field.min) { issues[field.key] = `${field.label} must be at least ${field.min}.`; continue; }
    if (field.max !== undefined && value > field.max) { issues[field.key] = `${field.label} must be at most ${field.max}.`; continue; }
    if ((field.kind === 'whole') && !Number.isInteger(value)) { issues[field.key] = `${field.label} must be a whole number.`; continue; }
    if (field.kind === 'years' && !Number.isInteger(value * 12)) { issues[field.key] = `${field.label} must be a whole number of months, for example 30 or 7.5.`; continue; }
    payload[field.key] = field.kind === 'dollars' ? Math.round(value * 100) : field.kind === 'years' ? Math.round(value * 12) : value;
  }
  return Object.keys(issues).length ? { ok: false, issues } : { ok: true, payload };
}

/** For a home already saved: only the fields whose parsed value differs from what is stored, so an edit never rewrites (and re-dates) a fact the buyer did not touch. */
export function changedFields(stored: Partial<CandidateHome>, payload: CandidatePayload): CandidatePayload {
  const changed: CandidatePayload = {};
  for (const [key, value] of Object.entries(payload)) {
    const before = (stored as Record<string, unknown>)[key];
    const normalizedBefore = before === undefined || before === '' ? null : before;
    if (normalizedBefore !== value) changed[key] = value;
  }
  return changed;
}

/** One line to identify a home in a list: name, then where it is when known. */
export function homeSummaryLine(home: Pick<CandidateHome, 'label' | 'city' | 'state' | 'listPriceCents'>): string {
  const place = [home.city, home.state].map((part) => text(part).trim()).filter(Boolean).join(', ');
  const price = typeof home.listPriceCents === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(home.listPriceCents / 100) : 'Price not entered';
  return [home.label, place || null, price].filter(Boolean).join(' · ');
}
