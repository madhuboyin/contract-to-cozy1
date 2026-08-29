import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import type { EnvelopeCoverageFindingProjection } from './envelopeCoverageAudit.service';

export type EnvelopeCoverageReconciliationResult = Readonly<{
  created: number;
  updated: number;
  retired: number;
}>;

function earlier(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function later(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function persistedFindingKey(producerModel: string, domain: string): string {
  return `${producerModel}:${domain}`;
}

/**
 * Upserts the current structural universe. Only a complete global run may
 * retire natural keys that disappeared from both declarations and observed
 * capabilities.
 */
export async function reconcileEnvelopeCoverageFindings(
  findings: readonly EnvelopeCoverageFindingProjection[],
  options: Readonly<{ complete: boolean; auditedAt: Date }>,
  db: Pick<typeof prisma, '$transaction'> = prisma,
): Promise<EnvelopeCoverageReconciliationResult> {
  return db.$transaction((tx) => reconcileEnvelopeCoverageFindingsInTransaction(
    tx,
    findings,
    options,
  ));
}

/** Transaction-scoped variant used to atomically reconcile and terminalize a run. */
export async function reconcileEnvelopeCoverageFindingsInTransaction(
  tx: Pick<Prisma.TransactionClient, 'coverageAuditFinding'>,
  findings: readonly EnvelopeCoverageFindingProjection[],
  options: Readonly<{ complete: boolean; auditedAt: Date }>,
): Promise<EnvelopeCoverageReconciliationResult> {
    const existingRows = await tx.coverageAuditFinding.findMany({
      select: {
        id: true,
        producerModel: true,
        domain: true,
        firstObservedAt: true,
        lastObservedAt: true,
        active: true,
      },
    });
    const existingByKey = new Map(existingRows.map((row) => [
      persistedFindingKey(row.producerModel, row.domain),
      row,
    ]));
    const currentKeys = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const finding of findings) {
      const key = persistedFindingKey(finding.producerModel, finding.domain);
      currentKeys.add(key);
      const existing = existingByKey.get(key);
      const observedFirst = finding.firstObservedAt ? new Date(finding.firstObservedAt) : null;
      const observedLast = finding.lastObservedAt ? new Date(finding.lastObservedAt) : null;
      await tx.coverageAuditFinding.upsert({
        where: { producerModel_domain: { producerModel: finding.producerModel, domain: finding.domain } },
        create: {
          producerModel: finding.producerModel,
          domain: finding.domain,
          determination: finding.determination,
          evidenceBasis: finding.evidenceBasis,
          auditInputsDigest: finding.auditInputsDigest,
          matchedRuleIds: [...finding.matchedRuleIds],
          firstObservedAt: observedFirst,
          lastObservedAt: observedLast,
          active: true,
          lastAuditedAt: new Date(finding.lastAuditedAt),
          retiredAt: null,
        },
        update: {
          determination: finding.determination,
          evidenceBasis: finding.evidenceBasis,
          auditInputsDigest: finding.auditInputsDigest,
          matchedRuleIds: [...finding.matchedRuleIds],
          firstObservedAt: earlier(existing?.firstObservedAt ?? null, observedFirst),
          lastObservedAt: later(existing?.lastObservedAt ?? null, observedLast),
          active: true,
          lastAuditedAt: new Date(finding.lastAuditedAt),
          retiredAt: null,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }

    const retirementIds = options.complete
      ? existingRows
        .filter((row) => row.active && !currentKeys.has(persistedFindingKey(row.producerModel, row.domain)))
        .map(({ id }) => id)
      : [];
    if (retirementIds.length) {
      await tx.coverageAuditFinding.updateMany({
        where: { id: { in: retirementIds }, active: true },
        data: { active: false, retiredAt: options.auditedAt, lastAuditedAt: options.auditedAt },
      });
    }
  return { created, updated, retired: retirementIds.length };
}
