// Shared field handling for the Inline Workspace correction commands (inventory item, timeline event, warranty).
//
// Each correctable field declares a kind that maps to one editable field on the confirmation card. The value the
// homeowner edits is always a string; these helpers validate it, put it in a canonical form (so "850" and "850.00"
// compare equal for the already-applied retry check), and format it for display. They are pure and have no
// dependency on the orchestrator, so each operation's edit and confirm handlers can share one implementation.

export type CorrectionFieldKind = 'DATE' | 'TEXT' | 'TEXTAREA' | 'SELECT' | 'MONEY';

export interface CorrectionOption {
  readonly label: string;
  readonly value: string;
}

export interface CorrectionFieldSpec {
  /** Lower-case noun used in copy, e.g. "purchase cost". */
  readonly label: string;
  readonly kind: CorrectionFieldKind;
  /** Minimum trimmed length for TEXT / TEXTAREA (default 1). */
  readonly min?: number;
  /** Maximum trimmed length for TEXT / TEXTAREA. */
  readonly max?: number;
  /** Allowed values for SELECT. */
  readonly options?: readonly CorrectionOption[];
}

export const MAX_CORRECTION_MONEY_DOLLARS = 10_000_000;

export function isValidCorrectionDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/** A homeowner-facing reason the value is unusable, or null when it is acceptable. */
export function correctionValueError(spec: CorrectionFieldSpec, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return `Enter the corrected ${spec.label} before confirming.`;
  const text = value.trim();
  if (spec.kind === 'DATE') return isValidCorrectionDate(text) ? null : 'Enter a valid date.';
  if (spec.kind === 'SELECT') return (spec.options ?? []).some((option) => option.value === text) ? null : `Choose one of the listed ${spec.label} values.`;
  if (spec.kind === 'MONEY') {
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) return 'Enter an amount in dollars, such as 850 or 850.50.';
    return Number(text) > MAX_CORRECTION_MONEY_DOLLARS ? 'Enter an amount of $10,000,000 or less.' : null;
  }
  const min = spec.min ?? 1;
  if (text.length < min) return `Enter at least ${min} characters for the ${spec.label}.`;
  return spec.max === undefined || text.length <= spec.max ? null : `Use at most ${spec.max} characters.`;
}

/** Canonical string form: trimmed text, money with exactly two decimals. */
export function correctionNormalized(spec: CorrectionFieldSpec, value: string): string {
  const text = value.trim();
  return spec.kind === 'MONEY' ? Number(text).toFixed(2) : text;
}

export function correctionMoneyToCents(normalized: string): number {
  return Math.round(Number(normalized) * 100);
}

/** Dollars from a number or Prisma Decimal, in canonical two-decimal form. */
export function correctionMoneyFromDollars(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const amount = Number(String(raw));
  return Number.isFinite(amount) ? amount.toFixed(2) : null;
}

export function correctionDateString(raw: unknown): string | null {
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** How a canonical value reads to the homeowner ("Not recorded" when absent). */
export function correctionDisplay(spec: CorrectionFieldSpec, value: string | null): string {
  if (!value) return 'Not recorded';
  if (spec.kind === 'MONEY') return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (spec.kind === 'SELECT') return spec.options?.find((option) => option.value === value)?.label ?? value;
  return value;
}
