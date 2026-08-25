import { prisma } from '../lib/prisma';

// Home Intelligence Functional Completeness FRD §15 Phase 5, HI-DOC-004
// remediation. Single source of truth for "is this property's coverage data
// currently conflicted" — the same detection previously lived only inside
// homeActionSourcePromotion.service.ts's advisory conflict Home Actions.
// Now consumed by three places that must never disagree about the answer:
//   1. The advisory Home Actions themselves (discovery/notification).
//   2. propertyContext's Coverage assembler, so `coverage.insurancePolicies`
//      / `coverage.warranties` report a real, selection-aware CONFLICTED state.
//   3. Material domain readers that bypass Property Context, through
//      assertCoverageConflictFree.
export type CoverageConflictDb = Partial<Pick<typeof prisma, 'insurancePolicyTerm' | 'insurancePolicyFact' | 'warranty'>>;

export interface PolicyFactConflictSnapshot {
  id: string;
  factKey: string;
  valueType: string;
  amountValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  jsonValue: unknown;
  confidence: number | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConflictedInsurancePolicyTerm {
  termId: string;
  policyId: string;
  carrierName: string;
  termCreatedAt: Date;
  termUpdatedAt: Date;
  conflicts: Array<{
    factKey: string;
    pending: PolicyFactConflictSnapshot;
    confirmed: PolicyFactConflictSnapshot;
  }>;
}

export function policyFactEffectiveValue(fact: PolicyFactConflictSnapshot): string | null {
  switch (fact.valueType) {
    case 'AMOUNT': return fact.amountValue != null ? String(fact.amountValue) : null;
    case 'TEXT': return fact.textValue;
    case 'BOOLEAN': return fact.booleanValue != null ? String(fact.booleanValue) : null;
    case 'JSON': return fact.jsonValue != null ? JSON.stringify(fact.jsonValue) : null;
    default: return null;
  }
}

/**
 * A pending (newly extracted, unconfirmed) policy fact that disagrees with
 * the most recent confirmed value for the same fact key on the same policy
 * is a conflict: the property's coverage data cannot be trusted as a single
 * value until a homeowner resolves which is correct.
 */
export async function getConflictedInsurancePolicyTerms(
  propertyId: string,
  db: CoverageConflictDb,
): Promise<ConflictedInsurancePolicyTerm[]> {
  if (!db.insurancePolicyTerm || !db.insurancePolicyFact) return [];
  const pendingTerms = await db.insurancePolicyTerm.findMany({
    where: { propertyId, status: 'PENDING_CONFIRMATION' },
    include: {
      facts: { where: { confirmationStatus: 'PENDING' } },
      insurancePolicy: { select: { id: true, carrierName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  if (pendingTerms.length === 0) return [];

  const policyIds = [...new Set(pendingTerms.map((term) => term.insurancePolicyId))];
  const confirmedFacts = await db.insurancePolicyFact.findMany({
    where: {
      confirmationStatus: 'CONFIRMED',
      policyTerm: { insurancePolicyId: { in: policyIds }, status: { not: 'PENDING_CONFIRMATION' } },
    },
    include: { policyTerm: { select: { insurancePolicyId: true, termStart: true, createdAt: true } } },
  });

  const latestConfirmedByPolicyAndKey = new Map<string, PolicyFactConflictSnapshot & { termTime: number }>();
  for (const fact of confirmedFacts as any[]) {
    const key = `${fact.policyTerm.insurancePolicyId}:${fact.factKey}`;
    const termTime = (fact.policyTerm.termStart ?? fact.policyTerm.createdAt).getTime();
    const existing = latestConfirmedByPolicyAndKey.get(key);
    if (!existing || termTime > existing.termTime) {
      latestConfirmedByPolicyAndKey.set(key, { ...fact, termTime });
    }
  }

  return (pendingTerms as any[]).flatMap((term) => {
    const conflicts = (term.facts as PolicyFactConflictSnapshot[]).flatMap((pendingFact) => {
      const confirmed = latestConfirmedByPolicyAndKey.get(`${term.insurancePolicyId}:${pendingFact.factKey}`);
      if (!confirmed) return [];
      if (policyFactEffectiveValue(pendingFact) === policyFactEffectiveValue(confirmed)) return [];
      return [{ factKey: pendingFact.factKey, pending: pendingFact, confirmed }];
    });
    if (conflicts.length === 0) return [];
    return [{
      termId: term.id as string,
      policyId: term.insurancePolicyId as string,
      carrierName: term.insurancePolicy.carrierName as string,
      termCreatedAt: term.createdAt as Date,
      termUpdatedAt: term.updatedAt as Date,
      conflicts,
    }];
  });
}

export async function isInsurancePolicyConflicted(
  propertyId: string,
  policyId: string,
  db: CoverageConflictDb,
): Promise<boolean> {
  const terms = await getConflictedInsurancePolicyTerms(propertyId, db);
  return terms.some((term) => term.policyId === policyId);
}

export interface ConflictedWarrantyRow {
  id: string;
  category: string;
  providerName: string;
  expiryDate: Date;
  updatedAt: Date;
}

export interface ConflictedWarrantyGroup {
  category: string;
  warranties: ConflictedWarrantyRow[];
}

export const WARRANTY_EXPIRY_CONFLICT_TOLERANCE_DAYS = 30;

/**
 * Two or more active warranties in the same non-OTHER category that disagree
 * on provider, or whose expiry dates spread further apart than the
 * tolerance, are a conflict — most likely a duplicate upload or a stale
 * record that was never removed, not genuinely separate coverage.
 */
export async function getConflictedWarrantyGroups(
  propertyId: string,
  db: CoverageConflictDb,
  now: Date = new Date(),
): Promise<ConflictedWarrantyGroup[]> {
  if (!db.warranty) return [];
  const warranties = await db.warranty.findMany({
    where: { propertyId, expiryDate: { gte: now } },
    select: { id: true, category: true, providerName: true, expiryDate: true, updatedAt: true },
  });

  const byCategory = new Map<string, ConflictedWarrantyRow[]>();
  for (const warranty of warranties as ConflictedWarrantyRow[]) {
    // OTHER is a catch-all category — two OTHER-category warranties aren't
    // necessarily "the same coverage" the way two ROOFING warranties are,
    // so grouping them would risk a false-positive conflict.
    if (warranty.category === 'OTHER') continue;
    const group = byCategory.get(warranty.category) ?? [];
    group.push(warranty);
    byCategory.set(warranty.category, group);
  }

  const groups: ConflictedWarrantyGroup[] = [];
  for (const [category, group] of byCategory) {
    if (group.length < 2) continue;
    const providers = [...new Set(group.map((warranty) => warranty.providerName))];
    const expiryTimes = group.map((warranty) => warranty.expiryDate.getTime());
    const expirySpreadDays = (Math.max(...expiryTimes) - Math.min(...expiryTimes)) / (24 * 60 * 60 * 1000);
    const conflicting = providers.length > 1 || expirySpreadDays > WARRANTY_EXPIRY_CONFLICT_TOLERANCE_DAYS;
    if (!conflicting) continue;
    groups.push({ category, warranties: group });
  }
  return groups;
}

export async function isWarrantyConflicted(
  propertyId: string,
  warrantyId: string,
  db: CoverageConflictDb,
  now?: Date,
): Promise<boolean> {
  const groups = await getConflictedWarrantyGroups(propertyId, db, now);
  return groups.some((group) => group.warranties.some((warranty) => warranty.id === warrantyId));
}

export interface CoverageConflictSelection {
  insurancePolicyId?: string | null;
  warrantyId?: string | null;
  /** Aggregate consumers depend on every active coverage record. */
  requireAllInsurancePolicies?: boolean;
  requireAllWarranties?: boolean;
}

/**
 * Material consumers call this before reading canonical coverage records. It
 * fails closed with the affected identities and a real resolution path instead
 * of allowing each consumer to pick an arbitrary record.
 */
export async function assertCoverageConflictFree(
  propertyId: string,
  db: CoverageConflictDb,
  selection: CoverageConflictSelection,
): Promise<void> {
  const [policyTerms, warrantyGroups] = await Promise.all([
    selection.insurancePolicyId || selection.requireAllInsurancePolicies
      ? getConflictedInsurancePolicyTerms(propertyId, db)
      : Promise.resolve([]),
    selection.warrantyId || selection.requireAllWarranties
      ? getConflictedWarrantyGroups(propertyId, db)
      : Promise.resolve([]),
  ]);
  const policyConflicts = policyTerms.filter((term) =>
    selection.requireAllInsurancePolicies || term.policyId === selection.insurancePolicyId);
  const warrantyConflicts = warrantyGroups.filter((group) =>
    selection.requireAllWarranties
    || group.warranties.some((warranty) => warranty.id === selection.warrantyId));
  if (policyConflicts.length === 0 && warrantyConflicts.length === 0) return;

  throw Object.assign(
    new Error('Resolve conflicting coverage records before using them for this decision.'),
    {
      statusCode: 409,
      code: 'COVERAGE_CONFLICT_REVIEW_REQUIRED',
      details: {
        policyIds: policyConflicts.map((term) => term.policyId),
        warrantyIds: warrantyConflicts.flatMap((group) => group.warranties.map((warranty) => warranty.id)),
        resolutionPath: policyConflicts.length > 0
          ? `/dashboard/insurance?propertyId=${encodeURIComponent(propertyId)}&resolveConflict=1`
          : `/dashboard/warranties?propertyId=${encodeURIComponent(propertyId)}&resolveConflict=1`,
      },
    },
  );
}
