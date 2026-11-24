// BICC-BUY-007 / FRD D03: promoting a candidate home to an under-contract canonical property. Explicit and two-step: a review shows exactly what would be created, what is missing and any
// existing home at the same address; a confirmation carrying the review's token then creates it. The property is made by the ordinary property workflow and the buyer journey by the ordinary
// entry-context workflow, so a promoted home behaves like any other under-contract home. The candidate is kept, linked and marked PROMOTED, for audit.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { createProperty } from '../../property.service';
import { captureEntryContext } from '../../entryContext.service';
import { candidatePropertyService } from './candidateProperty.service';

type Provenance = Record<string, { source?: string; asOf?: string } | undefined>;
export type CandidateRow = {
  id: string; label: string; addressLine?: string | null; city?: string | null; state?: string | null; postalCode?: string | null;
  bedrooms?: number | null; bathrooms?: number | null; livingAreaSqFt?: number | null; yearBuilt?: number | null; provenance?: unknown; status?: string; updatedAt?: Date | string | null;
};

export type PromotionField = { field: string; value: string | number; source: string | null; asOf: string | null };
export type PromotionProposal = {
  candidateId: string;
  property: { name: string; address: string; city: string; state: string; zipCode: string; bedrooms?: number; bathrooms?: number; propertySize?: number; yearBuilt?: number } | null;
  fields: PromotionField[];
  missingRequired: string[];
  /** Deliberately not carried over: a list price is not a purchase price, and finances stay the buyer's own estimates. */
  notCarriedOver: string[];
};

const REQUIRED: Array<[keyof CandidateRow, string]> = [['addressLine', 'street address'], ['city', 'city'], ['state', 'state'], ['postalCode', 'ZIP code']];
const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Pure: what promoting this candidate would create, with each fact's own source and date from the candidate. */
export function buildPromotionProposal(candidate: CandidateRow): PromotionProposal {
  const provenance = (candidate.provenance && typeof candidate.provenance === 'object' ? candidate.provenance : {}) as Provenance;
  const missingRequired = REQUIRED.filter(([key]) => !trimmed(candidate[key])).map(([, label]) => label);
  const sourceOf = (key: string) => ({ source: provenance[key]?.source ?? null, asOf: provenance[key]?.asOf ?? null });
  const fields: PromotionField[] = [];
  const add = (field: string, value: string | number | null | undefined, provKey = field) => {
    if (value === null || value === undefined || value === '') return;
    fields.push({ field, value, ...(typeof value === 'string' ? { source: 'USER_ENTERED', asOf: null } : sourceOf(provKey)) });
  };
  add('address', trimmed(candidate.addressLine)); add('city', trimmed(candidate.city)); add('state', trimmed(candidate.state)); add('zipCode', trimmed(candidate.postalCode));
  add('bedrooms', candidate.bedrooms); add('bathrooms', candidate.bathrooms); add('propertySize', candidate.livingAreaSqFt, 'livingAreaSqFt'); add('yearBuilt', candidate.yearBuilt);
  const property = missingRequired.length ? null : {
    name: candidate.label.trim(), address: trimmed(candidate.addressLine), city: trimmed(candidate.city), state: trimmed(candidate.state), zipCode: trimmed(candidate.postalCode),
    ...(candidate.bedrooms ? { bedrooms: candidate.bedrooms } : {}), ...(candidate.bathrooms ? { bathrooms: candidate.bathrooms } : {}),
    ...(candidate.livingAreaSqFt ? { propertySize: candidate.livingAreaSqFt } : {}), ...(candidate.yearBuilt ? { yearBuilt: candidate.yearBuilt } : {}),
  };
  return { candidateId: candidate.id, property, fields, missingRequired, notCarriedOver: ['List price (it is not a purchase price)', 'Your financing assumptions and cost estimates', 'Taxes, insurance, HOA and utilities estimates', 'Notes'] };
}

/** Binds a confirmation to the exact facts that were reviewed: if the candidate changed in between, the token no longer matches. */
export function proposalToken(proposal: PromotionProposal): string {
  return createHash('sha256').update(JSON.stringify({ id: proposal.candidateId, property: proposal.property, fields: proposal.fields })).digest('hex').slice(0, 32);
}

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

async function findExistingHome(userId: string, property: NonNullable<PromotionProposal['property']>) {
  const profile = await prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  const rows = await prisma.property.findMany({ where: { homeownerProfileId: profile.id, city: { equals: property.city, mode: 'insensitive' }, state: { equals: property.state, mode: 'insensitive' } }, select: { id: true, name: true, address: true, unit: true, zipCode: true }, take: 50 });
  return rows.find((row) => norm(row.address) === norm(property.address) && norm(row.zipCode).slice(0, 5) === norm(property.zipCode).slice(0, 5)) ?? null;
}

const notFound = () => new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');

async function loadPromotable(userId: string, candidateId: string) {
  const candidate = await candidatePropertyService.get(userId, candidateId);
  if (!candidate) throw notFound();
  if (candidate.status === 'PROMOTED') throw new APIError('That home was already moved to your homes.', 409, 'CANDIDATE_ALREADY_PROMOTED');
  if (candidate.status !== 'ACTIVE') throw new APIError('Restore that home before moving it to your homes.', 409, 'CANDIDATE_NOT_ACTIVE');
  return candidate as unknown as CandidateRow;
}

export const candidatePromotionService = {
  /** Step 1: nothing is written. */
  async review(userId: string, candidateId: string) {
    const proposal = buildPromotionProposal(await loadPromotable(userId, candidateId));
    const existing = proposal.property ? await findExistingHome(userId, proposal.property) : null;
    return { proposal, token: proposalToken(proposal), existingHome: existing ? { propertyId: existing.id, name: existing.name, address: existing.address } : null, canPromote: Boolean(proposal.property) };
  },

  /** Step 2: needs the token from a review. A same-address home that already exists is never duplicated; the buyer must choose to link to it. */
  async confirm(userId: string, candidateId: string, input: { token: string; linkToExistingHome?: boolean; targetCloseDate?: string | null }, now: Date = new Date()) {
    const candidate = await loadPromotable(userId, candidateId);
    const proposal = buildPromotionProposal(candidate);
    if (!proposal.property) throw new APIError(`Add the ${proposal.missingRequired.join(', ')} first.`, 400, 'CANDIDATE_PROMOTION_INCOMPLETE');
    if (!input.token || input.token !== proposalToken(proposal)) throw new APIError('This home changed after you reviewed it. Review it again.', 409, 'CANDIDATE_PROMOTION_STALE');
    const existing = await findExistingHome(userId, proposal.property);
    if (existing && !input.linkToExistingHome) throw new APIError('You already have a home at this address. Choose to link to it instead.', 409, 'CANDIDATE_DUPLICATE_PROPERTY');

    let propertyId: string; let created = false;
    if (existing) propertyId = existing.id;
    else { propertyId = (await createProperty(userId, { ...proposal.property, isPrimary: false })).id; created = true; }

    if (created) {
      await captureEntryContext(propertyId, userId, {
        entryPath: 'EXISTING_HOME_PURCHASE', ownershipState: 'UNDER_CONTRACT', propertyOrigin: 'EXISTING_HOME',
        activeTrigger: { type: 'OTHER', label: 'Under contract on a home I was considering', entityType: 'PROPERTY', entityId: propertyId, source: 'USER_SELECTED' },
        buyer: { purchaseStage: 'UNDER_CONTRACT', inspectionStatus: 'NOT_SCHEDULED', ...(input.targetCloseDate ? { targetCloseDate: input.targetCloseDate } : {}) },
        consentContext: 'Explicit candidate promotion in Ask',
        sourceMetadata: { promotedFromCandidateId: candidate.id, promotedAt: now.toISOString(), fieldProvenance: Object.fromEntries(proposal.fields.map((f) => [f.field, { source: f.source, asOf: f.asOf }])) },
      });
    }

    // The candidate stays, linked, for audit. Only an ACTIVE candidate can be claimed, so two confirmations cannot both win.
    const claimed = await prisma.candidateProperty.updateMany({ where: { id: candidate.id, userId, status: 'ACTIVE' }, data: { status: 'PROMOTED', promotedPropertyId: propertyId } });
    if (claimed.count !== 1) throw new APIError('That home was already moved to your homes.', 409, 'CANDIDATE_ALREADY_PROMOTED');
    return { propertyId, created, linkedExisting: !created, candidateId: candidate.id };
  },
};
