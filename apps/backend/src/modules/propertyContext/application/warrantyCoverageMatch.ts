// Warranty duplicate / conflict classification (Actionable Result Enrichment FRD §5.1-5.3).
//
// Pure: no database, no clock. One shared normalization function set is used by the writer, the Ask review step and the tests, so two slightly
// different normalizers can never disagree about whether two records are the same coverage.
import { createHash } from 'node:crypto';

export type WarrantyCoverageOutcome = 'EXACT_DUPLICATE' | 'OVERLAPPING_CONFLICT' | 'EQUIVALENT' | 'NO_MATCH';

export interface WarrantyCoverageSubject {
  readonly providerName: string;
  readonly policyNumber?: string | null;
  readonly category: string;
  /** ITEM_SPECIFIC or PROPERTY_PLAN: the canonical scope. */
  readonly scopeKind: string;
  readonly startDate: Date;
  readonly expiryDate: Date;
}

export interface ExistingWarrantyRecord extends WarrantyCoverageSubject {
  readonly id: string;
  readonly updatedAt: Date;
}

export interface WarrantyCoverageClassification {
  readonly outcome: WarrantyCoverageOutcome;
  /** The existing records that decided the outcome (the exact duplicate, or every equivalent / conflicting record). */
  readonly matches: readonly ExistingWarrantyRecord[];
}

/** Trim, case-fold, strip punctuation and collapse whitespace. */
export function normalizeProvider(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Trim, case-fold and remove every non-alphanumeric character, so "ab-123 4" and "AB1234" are the same policy number. */
export function normalizePolicyNumber(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/** Calendar-day key (UTC): warranty dates are stored as calendar dates, so time of day never decides an overlap. */
const dayKey = (date: Date): number => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Inclusive on both ends: a warranty ending on day D and one starting on day D overlap (FRD §5.2). */
export function warrantyDateRangesOverlap(a: { startDate: Date; expiryDate: Date }, b: { startDate: Date; expiryDate: Date }): boolean {
  return dayKey(a.startDate) <= dayKey(b.expiryDate) && dayKey(b.startDate) <= dayKey(a.expiryDate);
}

function classifyOne(candidate: WarrantyCoverageSubject, existing: ExistingWarrantyRecord): Exclude<WarrantyCoverageOutcome, 'NO_MATCH'> | null {
  const sameProvider = normalizeProvider(candidate.providerName) === normalizeProvider(existing.providerName);
  const candidatePolicy = normalizePolicyNumber(candidate.policyNumber);
  const existingPolicy = normalizePolicyNumber(existing.policyNumber);
  const policiesCompatible = candidatePolicy === existingPolicy || !candidatePolicy || !existingPolicy;
  const sameCategoryAndScope = candidate.category === existing.category && candidate.scopeKind === existing.scopeKind;
  const identicalDates = dayKey(candidate.startDate) === dayKey(existing.startDate) && dayKey(candidate.expiryDate) === dayKey(existing.expiryDate);

  // Exact duplicate: policy numbers match or are both absent (stricter than "compatible": one absent is not identical).
  if (sameProvider && candidatePolicy === existingPolicy && sameCategoryAndScope && identicalDates) return 'EXACT_DUPLICATE';
  if (!warrantyDateRangesOverlap(candidate, existing)) return null;
  // Overlapping conflict: dates overlap and the provider, category or scope differs. A provider difference alone always conflicts.
  if (!sameProvider || !sameCategoryAndScope) return 'OVERLAPPING_CONFLICT';
  // Equivalent: same provider, category and scope, policy numbers match or at least one is absent, dates overlap.
  return policiesCompatible ? 'EQUIVALENT' : null;
}

/**
 * Classifies a candidate against the existing warranties of ONE target (one inventory item, or the property-wide plan target). Precedence, first
 * match wins: exact duplicate, overlapping conflict, equivalent, no match. For the two non-exact outcomes every matching record is returned, so
 * the override fingerprint covers the complete current set (FRD §5.3).
 */
export function classifyWarrantyCoverage(candidate: WarrantyCoverageSubject, existing: readonly ExistingWarrantyRecord[]): WarrantyCoverageClassification {
  const exact: ExistingWarrantyRecord[] = [];
  const conflicts: ExistingWarrantyRecord[] = [];
  const equivalents: ExistingWarrantyRecord[] = [];
  for (const record of existing) {
    const outcome = classifyOne(candidate, record);
    if (outcome === 'EXACT_DUPLICATE') exact.push(record);
    else if (outcome === 'OVERLAPPING_CONFLICT') conflicts.push(record);
    else if (outcome === 'EQUIVALENT') equivalents.push(record);
  }
  if (exact.length > 0) return { outcome: 'EXACT_DUPLICATE', matches: exact };
  if (conflicts.length > 0) return { outcome: 'OVERLAPPING_CONFLICT', matches: [...conflicts, ...equivalents] };
  if (equivalents.length > 0) return { outcome: 'EQUIVALENT', matches: equivalents };
  return { outcome: 'NO_MATCH', matches: [] };
}

/**
 * The single-use override binding (FRD §5.3). Hash input: execution id, user id, property id, item id (or PROPERTY) and the sorted
 * (recordId, updatedAt) pairs of the complete current match set. Never client-supplied: computed and stored server-side only.
 */
export function warrantyOverrideFingerprint(input: {
  readonly executionId: string;
  readonly userId: string;
  readonly propertyId: string;
  readonly inventoryItemId: string | null;
  readonly matches: readonly Pick<ExistingWarrantyRecord, 'id' | 'updatedAt'>[];
}): string {
  const pairs = input.matches.map((match) => `${match.id}@${match.updatedAt.toISOString()}`).sort();
  return createHash('sha256')
    .update(JSON.stringify([input.executionId, input.userId, input.propertyId, input.inventoryItemId ?? 'PROPERTY', pairs]))
    .digest('hex');
}

/** Text hashed into the transaction-scoped advisory lock; property-scoped creation uses the literal sentinel PROPERTY (FRD §5.4). */
export function warrantyCreateLockText(propertyId: string, inventoryItemId: string | null | undefined): string {
  return `warranty-create:${propertyId}:${inventoryItemId ?? 'PROPERTY'}`;
}
