import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { EnvelopeCoverageFindingProjection } from './envelopeCoverageAudit.service';
import {
  reconcileEnvelopeCoverageFindingsInTransaction,
  type EnvelopeCoverageReconciliationResult,
} from './envelopeCoverageFinding.repository';

const MAX_DIAGNOSTIC_CODES = 50;
const MAX_CERTIFICATION_ISSUES = 100;
const MAX_METADATA_LENGTH = 500;
const MAX_FAILURE_SUMMARY_LENGTH = 1_000;

export const COVERAGE_AUDIT_WORKER_JOB_KEY = 'envelope-promotion-coverage-audit';

export type CoverageAuditRunTriggerValue = 'SCHEDULED' | 'MANUAL';
export type CoverageAuditRunTerminalStatus = 'COMPLETE' | 'PARTIAL';

export type CoverageAuditRunSummary = Readonly<{
  status: CoverageAuditRunTerminalStatus;
  evaluationStatus: 'NOT_MEASURED';
  propertiesExamined: number;
  propertiesAudited: number;
  ownerUnresolved: number;
  propertyFailures: number;
  adapterFailures: number;
  envelopePagesRead: number;
  observedCapabilities: number;
  findings: number;
  reviewRequired: number;
  declarationDrift: number;
  certificationIssues: readonly string[];
  diagnostics: readonly string[];
}>;

type CoverageAuditDb = Pick<typeof prisma, 'coverageAuditRun' | '$transaction'>;

function bounded(values: readonly string[], maximum: number): string[] {
  return [...new Set(values)]
    .slice(0, maximum)
    .map((value) => value.slice(0, MAX_METADATA_LENGTH));
}

/** Persist categories and counts, never property IDs, principals, or raw errors. */
export function boundedCoverageDiagnosticCodes(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const code = value.split(':', 1)[0]?.replace(/[^A-Z0-9_]/g, '') || 'UNKNOWN';
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_DIAGNOSTIC_CODES)
    .map(([code, count]) => `${code}:${count}`);
}

export async function createCoverageAuditRun(
  input: Readonly<{
    idempotencyKey: string;
    trigger: CoverageAuditRunTriggerValue;
    correlationId: string;
    auditInputsDigest: string;
    taxonomyVersion: string;
    deploymentRevision: string;
    evaluationContractVersion?: string | null;
  }>,
  db: CoverageAuditDb = prisma,
): Promise<Readonly<{ created: boolean; run: Awaited<ReturnType<CoverageAuditDb['coverageAuditRun']['findUniqueOrThrow']>> }>> {
  const existing = await db.coverageAuditRun.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { created: false, run: existing };

  try {
    const run = await db.coverageAuditRun.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        trigger: input.trigger,
        workerJobKey: COVERAGE_AUDIT_WORKER_JOB_KEY,
        correlationId: input.correlationId,
        auditInputsDigest: input.auditInputsDigest,
        taxonomyVersion: input.taxonomyVersion,
        deploymentRevision: input.deploymentRevision,
        evaluationContractVersion: input.evaluationContractVersion ?? null,
        evaluationStatus: 'NOT_MEASURED',
        diagnostics: [],
        certificationIssues: [],
      },
    });
    return { created: true, run };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        created: false,
        run: await db.coverageAuditRun.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } }),
      };
    }
    throw error;
  }
}

export async function finalizeCoverageAuditRun(
  input: Readonly<{
    runId: string;
    auditedAt: Date;
    finishedAt: Date;
    findings: readonly EnvelopeCoverageFindingProjection[];
    summary: CoverageAuditRunSummary;
  }>,
  db: CoverageAuditDb = prisma,
): Promise<EnvelopeCoverageReconciliationResult> {
  return db.$transaction(async (tx) => {
    const reconciliation = await reconcileEnvelopeCoverageFindingsInTransaction(
      tx,
      input.findings,
      { complete: input.summary.status === 'COMPLETE', auditedAt: input.auditedAt },
    );
    const transition = await tx.coverageAuditRun.updateMany({
      where: { id: input.runId, status: 'RUNNING' },
      data: {
        status: input.summary.status,
        evaluationStatus: input.summary.evaluationStatus,
        finishedAt: input.finishedAt,
        propertiesExamined: input.summary.propertiesExamined,
        propertiesAudited: input.summary.propertiesAudited,
        ownerUnresolved: input.summary.ownerUnresolved,
        propertyFailures: input.summary.propertyFailures,
        adapterFailures: input.summary.adapterFailures,
        envelopePagesRead: input.summary.envelopePagesRead,
        observedCapabilities: input.summary.observedCapabilities,
        findings: input.summary.findings,
        reviewRequired: input.summary.reviewRequired,
        declarationDrift: input.summary.declarationDrift,
        certificationIssueCount: input.summary.certificationIssues.length,
        findingsCreated: reconciliation.created,
        findingsUpdated: reconciliation.updated,
        findingsRetired: reconciliation.retired,
        diagnostics: boundedCoverageDiagnosticCodes(input.summary.diagnostics),
        certificationIssues: bounded(input.summary.certificationIssues, MAX_CERTIFICATION_ISSUES),
      },
    });
    if (transition.count !== 1) {
      throw new Error(`CoverageAuditRun ${input.runId} is not RUNNING; terminal transition rejected`);
    }
    return reconciliation;
  });
}

export async function failCoverageAuditRun(
  runId: string,
  input: Readonly<{ failureCode: string; failureSummary: string; finishedAt?: Date }>,
  db: Pick<typeof prisma, 'coverageAuditRun'> = prisma,
): Promise<boolean> {
  const transition = await db.coverageAuditRun.updateMany({
    where: { id: runId, status: 'RUNNING' },
    data: {
      status: 'FAILED',
      finishedAt: input.finishedAt ?? new Date(),
      failureCode: input.failureCode.slice(0, MAX_METADATA_LENGTH),
      failureSummary: input.failureSummary.slice(0, MAX_FAILURE_SUMMARY_LENGTH),
    },
  });
  return transition.count === 1;
}
