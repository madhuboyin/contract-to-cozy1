// The ONE writer of the persisted financing profile (owner ruling 2026-10-13, FRD v1.332).
//
// The profile holds the household's mortgage and purchase facts. It is owner-only as a whole: lender and account facts, the balance, the rate, the
// payment, the second mortgage, PMI, and the purchase price and date, which feed equity, appreciation and the sale analysis. What-if assumptions that a
// contributor may try are NOT in this record and are never written here.
//
// Authorization is enforced HERE, not only at the routes, so every surface (the desktop route, property create and edit, refinance completion, the
// mortgage captures, Ask) gets the same answer. A trusted background synchronization may write as a SYSTEM actor, and must say why.
//
// Rules every write follows:
//   - an owner (or a stated SYSTEM actor) is required;
//   - a write may be bound to the version the caller read (`expectedUpdatedAt`) and is refused when the profile has moved;
//   - NO_MORTGAGE clears every loan fact in the same write, atomically, and a loan fact is never written over NO_MORTGAGE (the stronger guard the rate
//     and status captures already had); a loan fact written to a profile that is not yet MORTGAGED promotes it, as the page always did;
//   - a current balance above the original is a CAUTION that must be explicitly acknowledged (capitalization and negative amortization make it
//     legitimate), not a rejection;
//   - purchase price and date have one authoritative record: this profile (Property carries no copy);
//   - every changed field is logged with actor, time, source surface, and the before and after values, in the same transaction.
import { randomUUID } from 'node:crypto';
import { HouseholdRole, Prisma, PropertyMortgageStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { APIError } from '../../middleware/error.middleware';
import { resolvePropertyAccess } from '../propertyAccess.service';

export const FINANCING_PROFILE_FIELDS = [
  'mortgageStatus', 'purchasePriceCents', 'purchaseDate', 'mortgageType', 'originalMortgageBalanceCents', 'currentMortgageBalanceCents', 'mortgageBalanceAsOfDate',
  'interestRateBps', 'remainingTermMonths', 'monthlyPaymentCents', 'hasSecondMortgage', 'secondMortgageBalanceCents', 'hasPMI',
] as const;
export type FinancingProfileField = typeof FINANCING_PROFILE_FIELDS[number];

/** Loan facts: contradicted by NO_MORTGAGE, cleared by it. */
export const LOAN_FACT_FIELDS = [
  'mortgageType', 'originalMortgageBalanceCents', 'currentMortgageBalanceCents', 'mortgageBalanceAsOfDate', 'interestRateBps', 'remainingTermMonths',
  'monthlyPaymentCents', 'hasSecondMortgage', 'secondMortgageBalanceCents', 'hasPMI',
] as const satisfies readonly FinancingProfileField[];
/** What the page has always treated as "this home has a mortgage": writing one of these to a profile not yet MORTGAGED promotes it. */
const PROMOTING_FIELDS = [
  'mortgageType', 'originalMortgageBalanceCents', 'currentMortgageBalanceCents', 'interestRateBps', 'remainingTermMonths', 'monthlyPaymentCents',
] as const satisfies readonly FinancingProfileField[];
/** The loan facts whose presence contradicts NO_MORTGAGE (a flag set to false does not). The same set the status capture refuses to wipe. */
const LOAN_EVIDENCE_FIELDS = [
  'mortgageType', 'originalMortgageBalanceCents', 'currentMortgageBalanceCents', 'mortgageBalanceAsOfDate', 'interestRateBps', 'remainingTermMonths',
  'monthlyPaymentCents', 'secondMortgageBalanceCents',
] as const satisfies readonly FinancingProfileField[];

export type FinancingProfileChanges = Partial<{
  mortgageStatus: PropertyMortgageStatus;
  purchasePriceCents: number | null;
  purchaseDate: Date | null;
  mortgageType: Prisma.PropertyFinancingProfileUncheckedUpdateInput['mortgageType'];
  originalMortgageBalanceCents: number | null;
  currentMortgageBalanceCents: number | null;
  mortgageBalanceAsOfDate: Date | null;
  interestRateBps: number | null;
  remainingTermMonths: number | null;
  monthlyPaymentCents: number | null;
  hasSecondMortgage: boolean;
  secondMortgageBalanceCents: number | null;
  hasPMI: boolean;
}>;

export type FinancingProfileSurface =
  | 'DESKTOP_ROUTE' | 'PROPERTY_CREATE' | 'PROPERTY_EDIT' | 'REFINANCE_COMPLETION' | 'MORTGAGE_STATUS_CAPTURE' | 'MORTGAGE_RATE_CAPTURE' | 'ASK' | 'SYSTEM';
export type FinancingActor =
  | { kind: 'USER'; userId: string; role?: HouseholdRole }
  | { kind: 'SYSTEM'; reason: string };

export interface FinancingFieldChange { field: FinancingProfileField; before: unknown; after: unknown }

const db = (tx?: Prisma.TransactionClient) => (tx ?? prisma) as Prisma.TransactionClient;
const jsonValue = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (value instanceof Date) return value.toISOString();
  return value as Prisma.InputJsonValue;
};
const comparable = (value: unknown) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Owner, or a SYSTEM actor with a reason. Throws a 403 APIError otherwise. */
export async function assertFinancingProfileWriteAllowed(propertyId: string, actor: FinancingActor): Promise<void> {
  if (actor.kind === 'SYSTEM') {
    if (!actor.reason?.trim()) throw new APIError('A system write to the financing profile must state its reason.', 500, 'FINANCING_PROFILE_SYSTEM_REASON_REQUIRED');
    return;
  }
  const role = actor.role ?? (await resolvePropertyAccess(actor.userId, propertyId))?.role;
  if (role !== HouseholdRole.OWNER) {
    throw new APIError('Only an owner can change the financing profile.', 403, 'FINANCING_PROFILE_OWNER_REQUIRED');
  }
}

const actorColumns = (actor: FinancingActor) => (actor.kind === 'USER'
  ? { actorKind: 'USER', actorUserId: actor.userId, systemReason: null as string | null }
  : { actorKind: 'SYSTEM', actorUserId: null as string | null, systemReason: actor.reason });

/** Logs field changes inside the caller's transaction. Used by the writer and by the two captures that keep their own conditional SQL. */
export async function recordFinancingProfileChanges(tx: Prisma.TransactionClient, input: {
  propertyId: string; profileId: string; actor: FinancingActor; surface: FinancingProfileSurface; changes: readonly FinancingFieldChange[]; batchId?: string;
}): Promise<void> {
  if (!input.changes.length) return;
  const batchId = input.batchId ?? randomUUID();
  await tx.propertyFinancingProfileChange.createMany({
    data: input.changes.map((change) => ({
      propertyId: input.propertyId, profileId: input.profileId, batchId, fieldKey: change.field,
      beforeValue: jsonValue(change.before), afterValue: jsonValue(change.after), sourceSurface: input.surface, ...actorColumns(input.actor),
    })),
  });
}

export interface UpdateFinancingProfileInput {
  propertyId: string;
  actor: FinancingActor;
  surface: FinancingProfileSurface;
  /** undefined leaves a field alone; null clears a nullable one. */
  changes: FinancingProfileChanges;
  /** The `updatedAt` of the profile the caller read. A write over a newer profile is refused. */
  expectedUpdatedAt?: Date | string | null;
  /** Explicit acknowledgement that a current balance above the original balance is intended. */
  acknowledgeBalanceExceedsOriginal?: boolean;
  tx?: Prisma.TransactionClient;
}

export class FinancingProfileConflictError extends APIError {
  constructor(message: string, code: string, details?: Record<string, unknown>) { super(message, 409, code, details); }
}

/** What a set of changes would do to a profile, without writing: the next values, the field diff and any caution. Pure. */
export function planFinancingProfileChange(
  current: Partial<Record<FinancingProfileField, unknown>> | null,
  changes: FinancingProfileChanges,
  options: { acknowledgeBalanceExceedsOriginal?: boolean } = {},
): { next: Record<string, unknown>; diff: FinancingFieldChange[]; cautions: string[] } {
  const base: Record<string, unknown> = { mortgageStatus: PropertyMortgageStatus.UNKNOWN, hasSecondMortgage: false, hasPMI: false, ...(current ?? {}) };
  const incoming = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) as Record<string, unknown>;
  const statusGiven = incoming.mortgageStatus !== undefined;
  const loanEvidenceGiven = LOAN_EVIDENCE_FIELDS.some((field) => incoming[field] !== undefined && incoming[field] !== null);
  const promotingGiven = PROMOTING_FIELDS.some((field) => incoming[field] !== undefined && incoming[field] !== null);
  const currentStatus = base.mortgageStatus as PropertyMortgageStatus;

  const next: Record<string, unknown> = { ...base, ...incoming };
  if (statusGiven && incoming.mortgageStatus === PropertyMortgageStatus.NO_MORTGAGE) {
    // Atomic clearing: the status and every loan fact it contradicts change in the same write.
    for (const field of LOAN_FACT_FIELDS) next[field] = field === 'hasSecondMortgage' || field === 'hasPMI' ? false : null;
    if (loanEvidenceGiven) throw new FinancingProfileConflictError('A profile with no mortgage cannot carry loan details. Choose one.', 'NO_MORTGAGE_WITH_LOAN_FACTS');
  } else if (!statusGiven && loanEvidenceGiven) {
    // Loan facts are never written over NO_MORTGAGE; elsewhere they promote a profile with no recorded mortgage, as the page always did.
    if (currentStatus === PropertyMortgageStatus.NO_MORTGAGE) {
      throw new FinancingProfileConflictError('This home is recorded as having no mortgage. Change that first to record loan details.', 'LOAN_FACTS_OVER_NO_MORTGAGE');
    }
    if (promotingGiven) next.mortgageStatus = PropertyMortgageStatus.MORTGAGED;
  } else if (statusGiven && incoming.mortgageStatus !== PropertyMortgageStatus.NO_MORTGAGE && currentStatus === PropertyMortgageStatus.NO_MORTGAGE && !loanEvidenceGiven) {
    next.mortgageStatus = incoming.mortgageStatus;
  }

  const cautions: string[] = [];
  const current$ = next.currentMortgageBalanceCents as number | null | undefined;
  const original$ = next.originalMortgageBalanceCents as number | null | undefined;
  if (typeof current$ === 'number' && typeof original$ === 'number' && current$ > original$) {
    cautions.push('BALANCE_EXCEEDS_ORIGINAL');
    if (!options.acknowledgeBalanceExceedsOriginal) {
      throw new FinancingProfileConflictError(
        'The current balance is higher than the original balance. That can be right (for example capitalized interest), so confirm it is intended.',
        'BALANCE_EXCEEDS_ORIGINAL', { caution: true },
      );
    }
  }

  const diff: FinancingFieldChange[] = [];
  for (const field of FINANCING_PROFILE_FIELDS) {
    const before = (current as Record<string, unknown> | null)?.[field] ?? (field === 'mortgageStatus' ? PropertyMortgageStatus.UNKNOWN : field === 'hasSecondMortgage' || field === 'hasPMI' ? false : null);
    const after = next[field] ?? (field === 'hasSecondMortgage' || field === 'hasPMI' ? false : null);
    if (comparable(before) !== comparable(after)) diff.push({ field, before: before ?? null, after: after ?? null });
  }
  return { next, diff, cautions };
}

export async function updateFinancingProfile(input: UpdateFinancingProfileInput) {
  await assertFinancingProfileWriteAllowed(input.propertyId, input.actor);
  const run = async (tx: Prisma.TransactionClient) => {
    const current = await tx.propertyFinancingProfile.findUnique({ where: { propertyId: input.propertyId } });
    if (input.expectedUpdatedAt && current && new Date(input.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
      throw new FinancingProfileConflictError('The financing profile changed since you opened it. Review the latest values and try again.', 'FINANCING_PROFILE_STALE');
    }
    const { next, diff } = planFinancingProfileChange(current as never, input.changes, { acknowledgeBalanceExceedsOriginal: input.acknowledgeBalanceExceedsOriginal });
    if (current && !diff.length) return { profile: current, changedFields: [] as FinancingFieldChange[] };

    const data = Object.fromEntries(FINANCING_PROFILE_FIELDS.map((field) => [field, next[field] ?? (field === 'hasSecondMortgage' || field === 'hasPMI' ? false : null)])) as Prisma.PropertyFinancingProfileUncheckedUpdateInput;
    let profile;
    if (!current) {
      profile = await tx.propertyFinancingProfile.create({ data: { propertyId: input.propertyId, ...(data as object) } as Prisma.PropertyFinancingProfileUncheckedCreateInput });
    } else {
      // The version is part of the write itself (not a read followed by a write).
      const updated = await tx.propertyFinancingProfile.updateMany({ where: { propertyId: input.propertyId, updatedAt: current.updatedAt }, data });
      if (updated.count !== 1) throw new FinancingProfileConflictError('The financing profile changed while it was being saved. Try again.', 'FINANCING_PROFILE_STALE');
      profile = await tx.propertyFinancingProfile.findUniqueOrThrow({ where: { propertyId: input.propertyId } });
    }
    await recordFinancingProfileChanges(tx, { propertyId: input.propertyId, profileId: profile.id, actor: input.actor, surface: input.surface, changes: diff });
    return { profile, changedFields: diff };
  };
  return input.tx ? run(input.tx) : prisma.$transaction(run);
}

/** Owner-only read of the field-level history, newest first. */
export async function listFinancingProfileChanges(propertyId: string, options: { limit?: number } = {}) {
  return prisma.propertyFinancingProfileChange.findMany({
    where: { propertyId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(options.limit ?? 50, 1), 200),
    select: { id: true, batchId: true, fieldKey: true, beforeValue: true, afterValue: true, actorKind: true, actorUserId: true, systemReason: true, sourceSurface: true, createdAt: true },
  });
}
