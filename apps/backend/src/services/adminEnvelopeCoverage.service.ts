import { prisma } from '../lib/prisma';

const FINDING_SELECT = {
  id: true,
  producerModel: true,
  domain: true,
  determination: true,
  evidenceBasis: true,
  auditInputsDigest: true,
  matchedRuleIds: true,
  firstObservedAt: true,
  lastObservedAt: true,
  active: true,
  lastAuditedAt: true,
  retiredAt: true,
} as const;

const RUN_SELECT = {
  id: true,
  trigger: true,
  status: true,
  auditInputsDigest: true,
  taxonomyVersion: true,
  deploymentRevision: true,
  evaluationContractVersion: true,
  evaluationStatus: true,
  startedAt: true,
  finishedAt: true,
  propertiesExamined: true,
  propertiesAudited: true,
  ownerUnresolved: true,
  propertyFailures: true,
  adapterFailures: true,
  envelopePagesRead: true,
  observedCapabilities: true,
  findings: true,
  reviewRequired: true,
  declarationDrift: true,
  declarationDriftDetails: true,
  certificationIssueCount: true,
  findingsCreated: true,
  findingsUpdated: true,
  findingsRetired: true,
  diagnostics: true,
  certificationIssues: true,
  failureCode: true,
  failureSummary: true,
} as const;

export async function getAdminEnvelopeCoverageReport(
  input: Readonly<{ includeRetired?: boolean; runLimit?: number }> = {},
  db: Pick<typeof prisma, 'coverageAuditFinding' | 'coverageAuditRun'> = prisma,
) {
  const runLimit = Math.max(1, Math.min(input.runLimit ?? 20, 100));
  const [reviewRequired, declaredOnly, retired, recentRuns, lastComplete] = await Promise.all([
    db.coverageAuditFinding.findMany({
      where: { active: true, determination: 'REVIEW_REQUIRED' },
      select: FINDING_SELECT,
      orderBy: [{ producerModel: 'asc' }, { domain: 'asc' }],
    }),
    db.coverageAuditFinding.findMany({
      where: { active: true, evidenceBasis: 'DECLARED_ONLY' },
      select: FINDING_SELECT,
      orderBy: [{ producerModel: 'asc' }, { domain: 'asc' }],
    }),
    input.includeRetired
      ? db.coverageAuditFinding.findMany({
        where: { active: false },
        select: FINDING_SELECT,
        orderBy: { retiredAt: 'desc' },
        take: 200,
      })
      : Promise.resolve([]),
    db.coverageAuditRun.findMany({
      select: RUN_SELECT,
      orderBy: { startedAt: 'desc' },
      take: runLimit,
    }),
    db.coverageAuditRun.findFirst({
      where: { status: 'COMPLETE' },
      select: RUN_SELECT,
      orderBy: { finishedAt: 'desc' },
    }),
  ]);

  return {
    summary: {
      reviewRequired: reviewRequired.length,
      declaredOnly: declaredOnly.length,
      declarationDrift: recentRuns[0]?.declarationDrift ?? 0,
      recentPartialOrFailed: recentRuns.filter(({ status }) => status === 'PARTIAL' || status === 'FAILED').length,
      evaluationStatus: recentRuns[0]?.evaluationStatus ?? 'NOT_MEASURED',
    },
    reviewRequired,
    declaredOnly,
    retired,
    lastComplete,
    recentRuns,
  };
}
