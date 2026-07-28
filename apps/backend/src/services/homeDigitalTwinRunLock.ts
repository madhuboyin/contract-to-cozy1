/**
 * Concurrent-run deduplication for Home Digital Twin computation.
 *
 * Twin builds still run in the request, while scenario computation is queued.
 * A homeowner double-clicking Refresh, a retried request, or a queue retry
 * must not start two concurrent runs for the same twin or scenario.
 * buildComponents is transactional and idempotent, so concurrent runs
 * wouldn't corrupt data, but they could race to write conflicting
 * HomeTwinComputationRun rows and waste work. This checks for an already
 * RUNNING run of the same kind and refuses to start a second one — see
 * HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md Slice 7:
 * "Deduplicate concurrent runs."
 *
 * A RUNNING row is only honored as "in progress" for a bounded window. If
 * the process died mid-run (crash, OOM kill) before reaching its catch
 * block, the row would otherwise stay RUNNING forever and permanently lock
 * out that twin/scenario. Treating anything older than the window as
 * abandoned makes this self-healing without needing a cleanup job.
 */

import { HomeTwinRunType } from '@prisma/client';
import { prisma } from '../lib/prisma';

const RUN_LOCK_STALE_MS = 5 * 60 * 1000;

export async function findInFlightRun(
  digitalTwinId: string,
  runType: HomeTwinRunType,
  scenarioId?: string,
): Promise<{ id: string; startedAt: Date } | null> {
  return prisma.homeTwinComputationRun.findFirst({
    where: {
      digitalTwinId,
      runType,
      status: 'RUNNING',
      startedAt: { gte: new Date(Date.now() - RUN_LOCK_STALE_MS) },
      ...(scenarioId ? { scenarioId } : {}),
    },
    select: { id: true, startedAt: true },
    orderBy: { startedAt: 'desc' },
  });
}
