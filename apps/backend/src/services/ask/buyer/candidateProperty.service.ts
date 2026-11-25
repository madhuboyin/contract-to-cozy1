// BICC-BUY-002 / BUY-003 / FRD D03: candidate properties for a prospective buyer. Every read and write is scoped by the owning user in the database query itself, a candidate
// that is not the caller's is indistinguishable from one that does not exist, and nothing here touches Property, a household, a monitor or a homeowner calculation.
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';

export const MAX_ACTIVE_CANDIDATES_PER_USER = 25;
const FACT_FIELDS = ['listPriceCents', 'bedrooms', 'bathrooms', 'livingAreaSqFt', 'yearBuilt', 'annualPropertyTaxCents', 'annualInsuranceCents', 'hoaMonthlyCents', 'monthlyUtilitiesCents', 'oneTimeWorkEstimateCents', 'downPaymentPercent', 'mortgageRatePercent', 'mortgageTermMonths', 'closingCostPercent'] as const;
export type CandidateFactField = typeof FACT_FIELDS[number];
export const ADDRESS_FIELDS = ['addressLine', 'city', 'state', 'postalCode'] as const;
const TEXT_FIELDS = ['addressLine', 'city', 'state', 'postalCode', 'listingUrl', 'notes'] as const;

export type CandidateInput = { label: string } & Partial<Record<CandidateFactField, number | null>> & Partial<Record<typeof TEXT_FIELDS[number], string | null>>;
export type CandidatePatch = Partial<CandidateInput>;
export type FactSource = 'USER_ENTERED' | 'LISTING';

const invalid = (message: string, code = 'CANDIDATE_INVALID') => new APIError(message, 400, code);
const RANGES: Partial<Record<CandidateFactField, [number, number]>> = {
  bedrooms: [0, 50], bathrooms: [0, 50], livingAreaSqFt: [1, 200000], yearBuilt: [1600, 2200], downPaymentPercent: [0, 100], mortgageRatePercent: [0, 30], mortgageTermMonths: [1, 600], closingCostPercent: [0, 30],
};

/** Validates only what is present. A fact is a finite, non-negative number inside its range (money in whole cents); null clears it. Anything else is refused, never coerced. */
export function validateCandidateFacts(input: CandidatePatch): void {
  if ('label' in input && (typeof input.label !== 'string' || !input.label.trim() || input.label.trim().length > 120)) throw invalid('Give the home a short name (up to 120 characters).');
  for (const field of FACT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw invalid(`${field} must be a number that is zero or more.`);
    const range = RANGES[field];
    if (range && (value < range[0] || value > range[1])) throw invalid(`${field} must be between ${range[0]} and ${range[1]}.`);
    if (field.endsWith('Cents') && !Number.isInteger(value)) throw invalid(`${field} must be a whole number of cents.`);
    if ((field === 'bedrooms' || field === 'yearBuilt' || field === 'livingAreaSqFt' || field === 'mortgageTermMonths') && !Number.isInteger(value)) throw invalid(`${field} must be a whole number.`);
  }
  for (const field of TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length > (field === 'notes' ? 2000 : 300)) throw invalid(`${field} is too long.`);
  }
  if (input.listingUrl && !/^https?:\/\//i.test(input.listingUrl)) throw invalid('A listing link must start with http:// or https://.');
}

/** The provenance map after a write: each fact that was supplied now carries its source and date; a cleared fact loses its entry; untouched facts keep theirs. */
export function nextProvenance(existing: unknown, input: CandidatePatch, source: FactSource, now: Date): Record<string, { source: FactSource | string; asOf: string }> {
  const current = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, { source: string; asOf: string }>) } : {};
  for (const field of FACT_FIELDS) {
    if (!(field in input)) continue;
    if (input[field] === null) delete current[field]; else if (input[field] !== undefined) current[field] = { source, asOf: now.toISOString() };
  }
  // The address parts carry their source too (promotion shows it); a blank or cleared part loses its entry.
  for (const field of ADDRESS_FIELDS) {
    if (!(field in input)) continue;
    const value = input[field];
    if (value === null || (typeof value === 'string' && !value.trim())) delete current[field]; else if (value !== undefined) current[field] = { source, asOf: now.toISOString() };
  }
  return current;
}

const publicSelect = undefined; // every column of the owner's own row is returned to the owner

export const candidatePropertyService = {
  async create(userId: string, input: CandidateInput, source: FactSource = 'USER_ENTERED', now: Date = new Date()) {
    validateCandidateFacts(input);
    const active = await prisma.candidateProperty.count({ where: { userId, status: 'ACTIVE' } });
    if (active >= MAX_ACTIVE_CANDIDATES_PER_USER) throw new APIError(`You can keep up to ${MAX_ACTIVE_CANDIDATES_PER_USER} homes at a time. Archive or delete one first.`, 409, 'CANDIDATE_LIMIT_REACHED');
    return prisma.candidateProperty.create({ data: { ...input, label: input.label.trim(), userId, provenance: nextProvenance({}, input, source, now) }, select: publicSelect });
  },

  async list(userId: string, status: 'ACTIVE' | 'ARCHIVED' | 'PROMOTED' = 'ACTIVE') {
    return prisma.candidateProperty.findMany({ where: { userId, status }, orderBy: { updatedAt: 'desc' }, take: MAX_ACTIVE_CANDIDATES_PER_USER * 2 });
  },

  /** Null for a candidate that is not this person's, exactly as for one that does not exist. */
  async get(userId: string, id: string) {
    return prisma.candidateProperty.findFirst({ where: { id, userId } });
  },

  async update(userId: string, id: string, patch: CandidatePatch, source: FactSource = 'USER_ENTERED', now: Date = new Date()) {
    validateCandidateFacts(patch);
    const existing = await prisma.candidateProperty.findFirst({ where: { id, userId, status: { not: 'PROMOTED' } } });
    if (!existing) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
    const data = { ...patch, ...(patch.label !== undefined ? { label: patch.label.trim() } : {}), provenance: nextProvenance(existing.provenance, patch, source, now) };
    const result = await prisma.candidateProperty.updateMany({ where: { id, userId, status: { not: 'PROMOTED' } }, data });
    if (result.count !== 1) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
    return prisma.candidateProperty.findFirst({ where: { id, userId } });
  },

  async archive(userId: string, id: string) {
    const result = await prisma.candidateProperty.updateMany({ where: { id, userId, status: 'ACTIVE' }, data: { status: 'ARCHIVED' } });
    if (result.count !== 1) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
  },

  /** Explicit deletion removes the candidate (D03). A promoted candidate is kept: it is the audit link to the property it became. */
  async remove(userId: string, id: string) {
    const result = await prisma.candidateProperty.deleteMany({ where: { id, userId, status: { not: 'PROMOTED' } } });
    if (result.count !== 1) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
  },

  /**
   * BUY-007: deletes a PROMOTED candidate record by the owner's explicit choice. The record and its link are removed entirely; the property it became, its journey and every other
   * record are not touched (nothing here references them). Only the owner's own PROMOTED candidate qualifies.
   */
  async removePromotedRecord(userId: string, id: string) {
    const result = await prisma.candidateProperty.deleteMany({ where: { id, userId, status: 'PROMOTED' } });
    if (result.count !== 1) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
  },

  /** Removes every candidate of one person (workspace deletion, D03). */
  async removeAll(userId: string) {
    const result = await prisma.candidateProperty.deleteMany({ where: { userId, status: { not: 'PROMOTED' } } });
    return result.count;
  },
};
