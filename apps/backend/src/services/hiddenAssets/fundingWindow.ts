import { HiddenAssetFundingStatus, Prisma } from '@prisma/client';

/**
 * Pure spec for whether a program's funding/application-window state
 * permits recommending it right now — fail-closed per the audit's section
 * 9.2: never recommend a program with KNOWN-closed funding. UNKNOWN never
 * excludes a program by itself, and an unset application window never
 * excludes it either (the window is independent of, and narrower than,
 * expiresAt — a program can remain generally in effect while a specific
 * year's application cycle hasn't opened yet or has already closed).
 *
 * fetchCandidatePrograms in hiddenAssets.service.ts expresses this same
 * logic as a Prisma where-clause so it filters at the database level; this
 * function exists so the decision itself has a single, unit-testable
 * source of truth instead of only living inside a SQL predicate.
 */
export function isFundingAvailable(
  program: {
    fundingStatus: HiddenAssetFundingStatus;
    applicationWindowOpensAt: Date | null;
    applicationWindowClosesAt: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (program.fundingStatus === HiddenAssetFundingStatus.CLOSED) return false;
  if (program.applicationWindowOpensAt && program.applicationWindowOpensAt > now) return false;
  if (program.applicationWindowClosesAt && program.applicationWindowClosesAt < now) return false;
  return true;
}

/**
 * Prisma where-fragments expressing the same rule as isFundingAvailable, as
 * an array of conditions meant to be spread into an existing AND array (so
 * callers with their own AND/OR clauses — like fetchCandidatePrograms's
 * expiresAt and region-pair filters — can compose them without a key
 * collision).
 */
export function fundingAvailableWhereConditions(
  now: Date,
): Prisma.HiddenAssetProgramWhereInput[] {
  return [
    { fundingStatus: { not: HiddenAssetFundingStatus.CLOSED } },
    { OR: [{ applicationWindowOpensAt: null }, { applicationWindowOpensAt: { lte: now } }] },
    { OR: [{ applicationWindowClosesAt: null }, { applicationWindowClosesAt: { gte: now } }] },
  ];
}
