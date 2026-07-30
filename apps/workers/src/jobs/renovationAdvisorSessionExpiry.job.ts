import { prisma } from '../lib/prisma';
import type { WorkerRunResult } from '../lib/workerRunResult';

export interface RenovationSessionExpiryDeps {
  prisma: Pick<typeof prisma, 'homeRenovationAdvisorSession'>;
  now: () => Date;
}

const defaultDeps: RenovationSessionExpiryDeps = {
  prisma,
  now: () => new Date(),
};

export async function renovationAdvisorSessionExpiryJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: RenovationSessionExpiryDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const now = deps.now();
  const where = {
    archivedAt: null,
    sessionExpiresAt: { lte: now },
    status: { not: 'ARCHIVED' as const },
    ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
  };
  const examined = await deps.prisma.homeRenovationAdvisorSession.count({ where });
  if (opts?.dryRun || examined === 0) {
    return { examined, updated: 0, skipped: opts?.dryRun ? examined : 0, failed: 0 };
  }
  const result = await deps.prisma.homeRenovationAdvisorSession.updateMany({
    where,
    data: {
      status: 'ARCHIVED',
      archivedAt: now,
    },
  });
  return { examined, updated: result.count, skipped: examined - result.count, failed: 0 };
}
