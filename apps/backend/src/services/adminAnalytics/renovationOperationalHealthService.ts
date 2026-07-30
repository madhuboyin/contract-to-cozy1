import { prisma } from '../../config/database';

const ACTIVE_LIFECYCLES = new Set([
  'IDEA',
  'FEASIBILITY',
  'SCOPE_DEFINITION',
  'REQUIREMENTS_RESEARCH',
  'APPROVALS_IN_PROGRESS',
  'PREPARING_TO_START',
  'READY_TO_START',
  'IN_EXECUTION',
  'INSPECTION_AND_CLOSEOUT',
  'ON_HOLD',
  'HISTORICAL_RESEARCH',
]);

type RenovationOperationalSnapshot = {
  cases: Array<{
    id: string;
    lifecycle: string;
    currentScopeVersionId: string | null;
    readinessSummary: unknown;
  }>;
  requirements: Array<{
    renovationCaseId: string;
    family: string;
    recordStatus: string;
    applicability: string;
    determination: string;
    sourceFreshUntil: Date | null;
    expiresAt: Date | null;
  }>;
  conditions: Array<{
    renovationCaseId: string;
    status: string;
    isBlocking: boolean;
    dueAt: Date | null;
    expiresAt: Date | null;
  }>;
  projects: Array<{
    id: string;
    renovationCaseId: string | null;
    status: string;
    permitApplicability: string;
    hoaApplicability: string;
  }>;
  projectionErrors: Array<{
    projectId: string;
    reconciliationStatus: string;
  }>;
};

function readinessState(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'NOT_EVALUATED';
  const state = (value as Record<string, unknown>).state;
  return typeof state === 'string' ? state : 'NOT_EVALUATED';
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

export function summarizeRenovationOperationalHealth(
  snapshot: RenovationOperationalSnapshot,
  now = new Date(),
) {
  const byLifecycle = snapshot.cases.reduce<Record<string, number>>((counts, renovationCase) => {
    counts[renovationCase.lifecycle] = (counts[renovationCase.lifecycle] ?? 0) + 1;
    return counts;
  }, {});
  const activeCases = snapshot.cases.filter(item => ACTIVE_LIFECYCLES.has(item.lifecycle));
  const verifiedComplete = byLifecycle.VERIFIED_COMPLETE ?? 0;
  const completedWithOpenItems = byLifecycle.COMPLETED_WITH_OPEN_ITEMS ?? 0;
  const completedCases = verifiedComplete + completedWithOpenItems;
  const readinessNotEvaluated = activeCases.filter(
    item => readinessState(item.readinessSummary) === 'NOT_EVALUATED',
  ).length;
  const readinessBlocked = activeCases.filter(
    item => readinessState(item.readinessSummary) === 'NOT_READY',
  ).length;
  const currentRequirements = snapshot.requirements.filter(
    requirement => requirement.recordStatus === 'CURRENT',
  );
  const unresolvedRequirements = currentRequirements.filter(
    requirement =>
      requirement.applicability === 'UNKNOWN'
      || requirement.determination === 'UNDETERMINED',
  );
  const staleRequirements = snapshot.requirements.filter(
    requirement =>
      requirement.recordStatus === 'STALE_SCOPE'
      || (requirement.sourceFreshUntil != null && requirement.sourceFreshUntil < now)
      || (requirement.expiresAt != null && requirement.expiresAt < now),
  );
  const openBlockingConditions = snapshot.conditions.filter(
    condition => condition.isBlocking && condition.status === 'OPEN',
  );
  const overdueBlockingConditions = openBlockingConditions.filter(
    condition =>
      (condition.dueAt != null && condition.dueAt < now)
      || (condition.expiresAt != null && condition.expiresAt < now),
  );
  const activeProjects = snapshot.projects.filter(project =>
    ['PLANNING', 'IN_PROGRESS', 'PAUSED', 'DISPUTED'].includes(project.status),
  );
  const unknownProjectApplicability = activeProjects.filter(project =>
    project.permitApplicability === 'UNKNOWN' || project.hoaApplicability === 'UNKNOWN',
  );
  const projectionErrorProjects = new Set(
    snapshot.projectionErrors
      .filter(item => item.reconciliationStatus === 'ERROR')
      .map(item => item.projectId),
  );
  const casesWithoutScope = activeCases.filter(item => !item.currentScopeVersionId);

  const alerts = [
    {
      key: 'projection_errors',
      severity: 'CRITICAL' as const,
      count: projectionErrorProjects.size,
      label: 'Execution projection errors',
      exactNextAction: 'Retry reconciliation and inspect the latest Permit or HOA source transition.',
    },
    {
      key: 'overdue_conditions',
      severity: 'HIGH' as const,
      count: overdueBlockingConditions.length,
      label: 'Overdue blocking conditions',
      exactNextAction: 'Review condition ownership, evidence, and authoritative due dates.',
    },
    {
      key: 'unknown_project_applicability',
      severity: 'HIGH' as const,
      count: unknownProjectApplicability.length,
      label: 'Projects with unknown applicability',
      exactNextAction: 'Resolve permit and HOA applicability before completion is evaluated.',
    },
    {
      key: 'stale_requirements',
      severity: 'MEDIUM' as const,
      count: staleRequirements.length,
      label: 'Stale or expired requirements',
      exactNextAction: 'Refresh the authority source and re-determine the affected requirement.',
    },
    {
      key: 'missing_scope',
      severity: 'MEDIUM' as const,
      count: casesWithoutScope.length,
      label: 'Active cases without a current scope',
      exactNextAction: 'Repair the case scope pointer before allowing lifecycle advancement.',
    },
  ].filter(alert => alert.count > 0);

  return {
    generatedAt: now.toISOString(),
    funnel: {
      totalCases: snapshot.cases.length,
      activeCases: activeCases.length,
      byLifecycle,
      verifiedComplete,
      completedWithOpenItems,
      verifiedCloseoutRate: percent(verifiedComplete, completedCases),
    },
    trust: {
      readinessNotEvaluated,
      readinessBlocked,
      unresolvedRequirements: unresolvedRequirements.length,
      staleRequirements: staleRequirements.length,
      openBlockingConditions: openBlockingConditions.length,
      overdueBlockingConditions: overdueBlockingConditions.length,
      activeProjectsWithUnknownApplicability: unknownProjectApplicability.length,
      activeCasesWithoutScope: casesWithoutScope.length,
    },
    operations: {
      activeExecutionProjects: activeProjects.length,
      projectionErrorProjects: projectionErrorProjects.size,
      alertCount: alerts.length,
      alerts,
    },
    guardrails: {
      officialStatusInferredFromMissingData: false,
      readinessWithoutEvaluationCount: readinessNotEvaluated,
      completionWithOpenItemsCount: completedWithOpenItems,
    },
  };
}

function dateFilter(from?: Date, to?: Date) {
  return from || to ? {
    updatedAt: {
      ...(from && { gte: from }),
      ...(to && { lte: to }),
    },
  } : {};
}

export async function getRenovationOperationalHealth(from?: Date, to?: Date) {
  const filter = dateFilter(from, to);
  const [cases, requirements, conditions, projects, projectionErrors] = await Promise.all([
    prisma.renovationCase.findMany({
      where: { archivedAt: null, ...filter },
      select: {
        id: true,
        lifecycle: true,
        currentScopeVersionId: true,
        readinessSummary: true,
      },
    }),
    prisma.renovationRequirement.findMany({
      where: filter,
      select: {
        renovationCaseId: true,
        family: true,
        recordStatus: true,
        applicability: true,
        determination: true,
        sourceFreshUntil: true,
        expiresAt: true,
      },
    }),
    prisma.renovationComplianceCondition.findMany({
      where: filter,
      select: {
        renovationCaseId: true,
        status: true,
        isBlocking: true,
        dueAt: true,
        expiresAt: true,
      },
    }),
    prisma.projectRecord.findMany({
      where: { renovationCaseId: { not: null }, ...filter },
      select: {
        id: true,
        renovationCaseId: true,
        status: true,
        permitApplicability: true,
        hoaApplicability: true,
      },
    }),
    prisma.projectMilestone.findMany({
      where: {
        reconciliationStatus: 'ERROR',
        project: { renovationCaseId: { not: null } },
        ...filter,
      },
      select: { projectId: true, reconciliationStatus: true },
    }),
  ]);

  return summarizeRenovationOperationalHealth({
    cases,
    requirements,
    conditions,
    projects,
    projectionErrors,
  });
}
