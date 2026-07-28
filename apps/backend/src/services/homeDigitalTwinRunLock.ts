/**
 * Concurrent-run deduplication for Home Digital Twin computation.
 *
 * There is no job queue in front of twin/scenario computation (build and
 * compute run synchronously in the request), so nothing stops a homeowner
 * double-clicking Refresh, or a retried request, from starting two
 * concurrent builds for the same twin. buildComponents is transactional and
 * idempotent, so concurrent runs wouldn't corrupt data, but they would race
 * to write conflicting HomeTwinComputationRun rows and waste work. This
 * checks for an already-RUNNING run of the same kind and refuses to start
 * a second one — see HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_
 * PLAN.md Slice 7: "Deduplicate concurrent runs."
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
