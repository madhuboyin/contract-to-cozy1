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
    fields.push({ field, value, ...sourceOf(provKey) }); // a source is claimed only when the candidate recorded one
  };
  add('address', trimmed(candidate.addressLine), 'addressLine'); add('city', trimmed(candidate.city)); add('state', trimmed(candidate.state)); add('zipCode', trimmed(candidate.postalCode), 'postalCode');
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
/** A same-address home can stand in for the promotion only while it is itself in the buying lifecycle; an owned or sold home is not "under contract". */
const LINKABLE_OWNERSHIP = ['SHOPPING', 'UNDER_CONTRACT'];
/** A reservation younger than this blocks another promotion of the same candidate; an older one is treated as abandoned. */
export const RESERVATION_WINDOW_MS = 2 * 60 * 1000;

export type ExistingHome = { propertyId: string; name: string | null; address: string; linkable: boolean };

async function findExistingHome(userId: string, property: NonNullable<PromotionProposal['property']>): Promise<ExistingHome | null> {
  const profile = await prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  const rows = await prisma.property.findMany({ where: { homeownerProfileId: profile.id, city: { equals: property.city, mode: 'insensitive' }, state: { equals: property.state, mode: 'insensitive' } }, select: { id: true, name: true, address: true, zipCode: true, onboarding: { select: { ownershipState: true } } }, take: 50 });
  const row = rows.find((r) => norm(r.address) === norm(property.address) && norm(r.zipCode).slice(0, 5) === norm(property.zipCode).slice(0, 5));
  return row ? { propertyId: row.id, name: row.name, address: row.address, linkable: LINKABLE_OWNERSHIP.includes(row.onboarding?.ownershipState ?? '') } : null;
}

/** The property an earlier interrupted attempt of this same promotion created is not a duplicate; the retry resumes it. */
const ignoreOwnInterruptedAttempt = (found: ExistingHome | null, candidate: { promotedPropertyId?: string | null }) => (found && found.propertyId === candidate.promotedPropertyId ? null : found);

const notFound = () => new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');

async function loadPromotable(userId: string, candidateId: string) {
  const candidate = await candidatePropertyService.get(userId, candidateId);
  if (!candidate) throw notFound();
  if (candidate.status === 'PROMOTED') throw new APIError('That home was already moved to your homes.', 409, 'CANDIDATE_ALREADY_PROMOTED');
  if (candidate.status !== 'ACTIVE') throw new APIError('Restore that home before moving it to your homes.', 409, 'CANDIDATE_NOT_ACTIVE');
  return candidate as unknown as CandidateRow & { promotedPropertyId?: string | null };
}

export const candidatePromotionService = {
  /** Step 1: nothing is written. */
  async review(userId: string, candidateId: string) {
    const candidate = await loadPromotable(userId, candidateId);
    const proposal = buildPromotionProposal(candidate);
    const existingHome = proposal.property ? ignoreOwnInterruptedAttempt(await findExistingHome(userId, proposal.property), candidate) : null;
    const blockedReason = existingHome && !existingHome.linkable ? 'You already own a home at this address that is not marked as under contract, so this candidate cannot be moved onto it.' : null;
    return { proposal, token: proposalToken(proposal), existingHome, blockedReason, canPromote: Boolean(proposal.property) && !blockedReason };
  },

  /**
   * Step 2: needs the token from a review. Order matters: the candidate is reserved first (one winner), the created property is recorded on the candidate the moment it exists, and the
   * candidate is marked PROMOTED only after the journey is in place. A failure at any step releases the reservation and keeps the recorded property, so a retry resumes with that
   * property instead of creating a second one. A same-address home is never duplicated, and is linked only if it is itself in the buying lifecycle.
   */
  async confirm(userId: string, candidateId: string, input: { token: string; linkToExistingHome?: boolean; targetCloseDate?: string | null }, now: Date = new Date()) {
    const candidate = await loadPromotable(userId, candidateId);
    const proposal = buildPromotionProposal(candidate);
    if (!proposal.property) throw new APIError(`Add the ${proposal.missingRequired.join(', ')} first.`, 400, 'CANDIDATE_PROMOTION_INCOMPLETE');
    if (!input.token || input.token !== proposalToken(proposal)) throw new APIError('This home changed after you reviewed it. Review it again.', 409, 'CANDIDATE_PROMOTION_STALE');
    const existing = ignoreOwnInterruptedAttempt(await findExistingHome(userId, proposal.property), candidate);
    if (existing && !existing.linkable) throw new APIError('You already own a home at this address that is not marked as under contract.', 409, 'CANDIDATE_EXISTING_HOME_NOT_LINKABLE');
    if (existing && !input.linkToExistingHome) throw new APIError('You already have a home at this address. Choose to link to it instead.', 409, 'CANDIDATE_DUPLICATE_PROPERTY');

    const reserved = await prisma.candidateProperty.updateMany({
      where: { id: candidate.id, userId, status: 'ACTIVE', OR: [{ promotionReservedAt: null }, { promotionReservedAt: { lt: new Date(now.getTime() - RESERVATION_WINDOW_MS) } }] },
      data: { promotionReservedAt: now },
    });
    if (reserved.count !== 1) throw new APIError('This home is already being moved. Try again in a moment.', 409, 'CANDIDATE_PROMOTION_IN_PROGRESS');

    try {
      let propertyId: string; let created = false;
      if (existing) propertyId = existing.propertyId;
      else {
        const resumed = candidate.promotedPropertyId ? await resumableProperty(userId, candidate.promotedPropertyId) : null;
        if (resumed) { propertyId = resumed; created = true; }
        else {
          propertyId = (await createProperty(userId, { ...proposal.property, isPrimary: false })).id; created = true;
          await prisma.candidateProperty.updateMany({ where: { id: candidate.id, userId, status: 'ACTIVE' }, data: { promotedPropertyId: propertyId } });
        }
      }
      if (created) {
        await captureEntryContext(propertyId, userId, {
          entryPath: 'EXISTING_HOME_PURCHASE', ownershipState: 'UNDER_CONTRACT', propertyOrigin: 'EXISTING_HOME',
          activeTrigger: { type: 'OTHER', label: 'Under contract on a home I was considering', entityType: 'PROPERTY', entityId: propertyId, source: 'USER_SELECTED' },
          buyer: { purchaseStage: 'UNDER_CONTRACT', inspectionStatus: 'NOT_SCHEDULED', ...(input.targetCloseDate ? { targetCloseDate: input.targetCloseDate } : {}) },
          consentContext: 'Explicit candidate promotion in Ask',
          sourceMetadata: { promotedFromCandidateId: candidate.id, promotedAt: now.toISOString(), fieldProvenance: Object.fromEntries(proposal.fields.map((f) => [f.field, { source: f.source, asOf: f.asOf }])) },
        });
      }
      const done = await prisma.candidateProperty.updateMany({ where: { id: candidate.id, userId, status: 'ACTIVE' }, data: { status: 'PROMOTED', promotedPropertyId: propertyId, promotionReservedAt: null } });
      if (done.count !== 1) throw new APIError('That home was already moved to your homes.', 409, 'CANDIDATE_ALREADY_PROMOTED');
      return { propertyId, created, linkedExisting: !created, candidateId: candidate.id };
    } catch (error) {
      await prisma.candidateProperty.updateMany({ where: { id: candidate.id, userId, status: 'ACTIVE' }, data: { promotionReservedAt: null } }).catch(() => undefined);
      throw error;
    }
  },
};

/** The property an earlier, interrupted attempt created for this candidate, if it still exists in the person's own profile. */
async function resumableProperty(userId: string, propertyId: string): Promise<string | null> {
  const profile = await prisma.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  const row = await prisma.property.findFirst({ where: { id: propertyId, homeownerProfileId: profile.id }, select: { id: true } });
  return row?.id ?? null;
}
