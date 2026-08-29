import { randomUUID } from 'node:crypto';
import { INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION } from '@worker-shared/productFramework/intelligence';
import { executeEnvelopeCoverageAudit } from '@worker-shared/services/intelligence/envelopeCoverageAuditExecution.service';
import { currentEnvelopeCoverageDigest } from '@worker-shared/services/intelligence/envelopeCoverageDigest';
import {
  createCoverageAuditRun,
  failCoverageAuditRun,
  type CoverageAuditRunTriggerValue,
} from '@worker-shared/services/intelligence/envelopeCoverageRun.repository';
import type { WorkerRunResult } from '../lib/workerRunResult';

export type EnvelopeCoverageJobOptions = Readonly<{
  trigger?: 'MANUAL';
  invocationId?: string;
}>;

/**
 * Injection seam for unit tests. Production code passes nothing and the
 * defaults below wire the real backend repository/service functions.
 */
export type EnvelopeCoverageJobDependencies = Readonly<{
  createRun: typeof createCoverageAuditRun;
  executeAudit: typeof executeEnvelopeCoverageAudit;
  failRun: typeof failCoverageAuditRun;
  digest: typeof currentEnvelopeCoverageDigest;
  taxonomyVersion: string;
  deploymentRevision: () => string;
  now: () => Date;
}>;

function defaultDeploymentRevision(): string {
  return process.env.DEPLOYMENT_REVISION
    ?? process.env.RENDER_GIT_COMMIT
    ?? process.env.GIT_SHA
    ?? 'UNSPECIFIED';
}

const DEFAULT_DEPENDENCIES: EnvelopeCoverageJobDependencies = {
  createRun: createCoverageAuditRun,
  executeAudit: executeEnvelopeCoverageAudit,
  failRun: failCoverageAuditRun,
  digest: currentEnvelopeCoverageDigest,
  taxonomyVersion: INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  deploymentRevision: defaultDeploymentRevision,
  now: () => new Date(),
};

function scheduledInvocationDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function resultFromPersistedRun(run: {
  status: string;
  propertiesExamined: number;
  findingsCreated: number;
  findingsUpdated: number;
  ownerUnresolved: number;
  propertyFailures: number;
  adapterFailures: number;
  failureSummary: string | null;
}): WorkerRunResult {
  if (run.status === 'RUNNING') {
    return { examined: 0, skipped: 1, reason: 'Idempotent coverage-audit invocation is already running' };
  }
  const failed = run.status === 'FAILED'
    ? 1
    : run.ownerUnresolved + run.propertyFailures + run.adapterFailures;
  return {
    examined: run.propertiesExamined,
    created: run.findingsCreated,
    updated: run.findingsUpdated,
    failed,
    skipped: 1,
    reason: run.failureSummary ?? `Idempotent invocation already terminal (${run.status})`,
  };
}

/** Shared scheduled/manual handler; worker.ts supplies the renewable lease. */
export async function runEvaluateEnvelopePromotionCoverageJob(
  options: EnvelopeCoverageJobOptions = {},
  dependencyOverrides: Partial<EnvelopeCoverageJobDependencies> = {},
): Promise<WorkerRunResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const now = dependencies.now();
  const trigger: CoverageAuditRunTriggerValue = options.trigger === 'MANUAL' ? 'MANUAL' : 'SCHEDULED';
  if (trigger === 'MANUAL' && !options.invocationId) {
    throw new Error('Manual coverage-audit invocation requires the durable queue job ID');
  }
  const invocationId = trigger === 'MANUAL' ? options.invocationId! : scheduledInvocationDate(now);
  const idempotencyKey = `envelope-promotion-coverage-audit:${trigger.toLowerCase()}:${invocationId}`;
  const acquired = await dependencies.createRun({
    idempotencyKey,
    trigger,
    correlationId: randomUUID(),
    auditInputsDigest: dependencies.digest(),
    taxonomyVersion: dependencies.taxonomyVersion,
    deploymentRevision: dependencies.deploymentRevision(),
    // IPD-002 is unresolved; no evaluation contract may be implied.
    evaluationContractVersion: null,
  });
  if (!acquired.created) return resultFromPersistedRun(acquired.run);

  try {
    const result = await dependencies.executeAudit({ runId: acquired.run.id });
    return {
      examined: result.propertiesExamined,
      created: result.reconciliation.created,
      updated: result.reconciliation.updated,
      failed: result.ownerUnresolved + result.propertyFailures + result.adapterFailures,
      reason: result.status === 'PARTIAL'
        ? 'Coverage audit completed partially; findings were not retired'
        : undefined,
    };
  } catch (error) {
    await dependencies.failRun(acquired.run.id, {
      failureCode: 'EXECUTION_FAILED',
      // Raw exception text is intentionally excluded from durable audit metadata.
      failureSummary: 'Coverage audit execution failed before atomic reconciliation completed',
    });
    throw error;
  }
}
