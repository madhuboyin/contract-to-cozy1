// apps/workers/src/jobs/purgeAgentRuntime.job.ts
//
// C2C Intelligence & Agentic Evolution Phase 2 / PR 9 (IPD-003). Daily
// retention sweep for the agent runtime tables. Pure retention: it deletes
// only rows whose creation-stamped expiresAt has passed and never touches
// homeowner-facing state. The batched delete logic lives in the backend
// agentRetention.service so it is unit-tested there and reused by the
// account-deletion erasure path.

import { purgeExpiredAgentRuntime } from '@worker-shared/services/agents/agentRetention.service';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';

export interface PurgeAgentRuntimeDeps {
  purge: typeof purgeExpiredAgentRuntime;
  now: () => Date;
}

const defaultDeps: PurgeAgentRuntimeDeps = {
  purge: purgeExpiredAgentRuntime,
  now: () => new Date(),
};

export async function runPurgeAgentRuntimeJob(
  deps: PurgeAgentRuntimeDeps = defaultDeps,
): Promise<WorkerRunResult> {
  const result = await deps.purge(deps.now());
  logger.info(
    `[PURGE-AGENT-RUNTIME] Deleted ${result.total} expired rows `
    + `(${Object.entries(result.deleted).map(([table, n]) => `${table}=${n}`).join(', ')})`,
  );
  return {
    examined: result.total,
    updated: result.total,
    reason: result.total === 0 ? 'No agent-runtime rows past retention' : undefined,
  };
}
