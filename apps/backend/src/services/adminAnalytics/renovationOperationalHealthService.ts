import { prisma } from '../../config/database';
import { getConfiguredAuthorityIntegrations } from '../renovationAuthorityIntegration.service';

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
    scopeVersionId?: string;
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
    writeBackAppliedAt?: Date | null;
  }>;
  projectionErrors: Array<{
    projectId: string;
    reconciliationStatus: string;
  }>;
  caseEvents?: Array<{
    renovationCaseId: string;
    eventType: string;
    fromLifecycle: string | null;
    toLifecycle: string | null;
    occurredAt: Date;
  }>;
  scopeVersions?: Array<{
    id: string;
    renovationCaseId: string;
    version: number;
    downstreamInvalidation: unknown;
  }>;
  materials?: Array<{
    lifecycleStatus: string;
    verificationConfidence: string;
    manufacturer: string | null;
    productName: string | null;
    quantityInstalled: string | null;
    installedAt: Date | null;
  }>;
  writeBacks?: Array<{ projectId: string }>;
  authoritySources?: AuthoritySourceSnapshot[];
};

export type AuthoritySourceSnapshot = {
  family: 'PERMIT' | 'TAX' | 'LICENSING' | 'ZONING';
  sourceId: string;
  name: string;
  adapterType: string;
  status: string;
  coverageType: string;
  coverageKey: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
  latencyMs: number | null;
};

function readinessState(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'NOT_EVALUATED';
  const state = (value as Record<string, unknown>).state;
  return typeof state === 'string' ? state : 'NOT_EVALUATED';
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}

function average(values: number[]): number | null {
  return values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
}

function sourceOperationalView(source: AuthoritySourceSnapshot, now: Date) {
  const freshnessAgeHours = source.lastSuccessAt
    ? Math.round(((now.getTime() - source.lastSuccessAt.getTime()) / 3_600_000) * 10) / 10
    : null;
  const freshness = freshnessAgeHours == null
    ? 'NEVER'
    : freshnessAgeHours <= 24 * 7 ? 'FRESH' : 'STALE';
  const health = source.status !== 'ACTIVE'
    ? 'DISABLED'
    : source.lastError
      ? 'DEGRADED'
      : freshness === 'FRESH'
        ? 'HEALTHY'
        : 'STALE';
  return {
    ...source,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    freshness,
    freshnessAgeHours,
    health,
  };
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
  const caseEvents = snapshot.caseEvents ?? [];
  const approvalDurationsMs: number[] = [];
  const eventsByCase = new Map<string, typeof caseEvents>();
  for (const event of caseEvents) {
    const events = eventsByCase.get(event.renovationCaseId) ?? [];
    events.push(event);
    eventsByCase.set(event.renovationCaseId, events);
  }
  for (const events of eventsByCase.values()) {
    const ordered = [...events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    let approvalStartedAt: Date | null = null;
    for (const event of ordered) {
      if (event.eventType !== 'LIFECYCLE_CHANGED') continue;
      if (event.toLifecycle === 'APPROVALS_IN_PROGRESS') {
        approvalStartedAt = event.occurredAt;
      } else if (approvalStartedAt && event.fromLifecycle === 'APPROVALS_IN_PROGRESS') {
        approvalDurationsMs.push(event.occurredAt.getTime() - approvalStartedAt.getTime());
        approvalStartedAt = null;
      }
    }
  }
  const changedScopes = (snapshot.scopeVersions ?? []).filter(scope => scope.version > 1);
  const scopeRechecksComplete = changedScopes.filter(scope => {
    const requirements = currentRequirements.filter(
      requirement => requirement.scopeVersionId === scope.id,
    );
    return requirements.length > 0 && requirements.every(
      requirement =>
        requirement.applicability !== 'UNKNOWN'
        && requirement.determination !== 'UNDETERMINED',
    );
  });
  const installedMaterials = (snapshot.materials ?? []).filter(material =>
    ['INSTALLED', 'AS_BUILT'].includes(material.lifecycleStatus),
  );
  const completeInstalledMaterials = installedMaterials.filter(material =>
    Boolean(
      material.manufacturer
      && material.productName
      && material.quantityInstalled
      && material.installedAt
      && ['DOCUMENTED', 'VERIFIED'].includes(material.verificationConfidence),
    ),
  );
  const completedProjects = snapshot.projects.filter(project => project.status === 'COMPLETED');
  const projectsWithWriteBackLedger = new Set((snapshot.writeBacks ?? []).map(item => item.projectId));
  const successfulWriteBackProjects = completedProjects.filter(project =>
    Boolean(project.writeBackAppliedAt && projectsWithWriteBackLedger.has(project.id)),
  );
  const authoritySources = (snapshot.authoritySources ?? []).map(source =>
    sourceOperationalView(source, now),
  );
  const sourceFamilySummary = (['PERMIT', 'TAX', 'LICENSING', 'ZONING'] as const).map(family => {
    const sources = authoritySources.filter(source => source.family === family);
    return {
      family,
      configuredSources: sources.length,
      activeSources: sources.filter(source => source.status === 'ACTIVE').length,
      healthySources: sources.filter(source => source.health === 'HEALTHY').length,
      degradedSources: sources.filter(source => ['DEGRADED', 'STALE'].includes(source.health)).length,
      lastSuccessAt: sources
        .map(source => source.lastSuccessAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    };
  });
  const unhealthyAuthoritySources = authoritySources.filter(source =>
    source.status === 'ACTIVE' && source.health !== 'HEALTHY',
  );
  const unconfiguredAuthorityFamilies = snapshot.authoritySources === undefined
    ? []
    : sourceFamilySummary.filter(family => family.configuredSources === 0);

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
    {
      key: 'authority_source_health',
      severity: 'HIGH' as const,
      count: unhealthyAuthoritySources.length,
      label: 'Active authority sources needing attention',
      exactNextAction: 'Inspect adapter latency, freshness, and the latest recorded source error.',
    },
    {
      key: 'authority_family_coverage',
      severity: 'MEDIUM' as const,
      count: unconfiguredAuthorityFamilies.length,
      label: 'Authority families without a configured live source',
      exactNextAction: 'Add a verified permit, tax, licensing, or zoning source; keep guidance marked heuristic until then.',
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
      approvalCycleTime: {
        completedCycles: approvalDurationsMs.length,
        averageHours: average(approvalDurationsMs.map(value => value / 3_600_000)),
      },
      scopeChangeRechecks: {
        changedScopes: changedScopes.length,
        completedRechecks: scopeRechecksComplete.length,
        completionRate: percent(scopeRechecksComplete.length, changedScopes.length),
      },
      installedMaterialCompleteness: {
        installedMaterials: installedMaterials.length,
        completeMaterials: completeInstalledMaterials.length,
        completenessRate: percent(completeInstalledMaterials.length, installedMaterials.length),
      },
      downstreamWriteBack: {
        completedProjects: completedProjects.length,
        successfulProjects: successfulWriteBackProjects.length,
        successRate: percent(successfulWriteBackProjects.length, completedProjects.length),
      },
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
      authoritySources,
      authoritySourceFamilies: sourceFamilySummary,
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
  const [
    cases,
    requirements,
    conditions,
    projects,
    projectionErrors,
    caseEvents,
    scopeVersions,
    materials,
    writeBacks,
    permitSources,
    taxSources,
    latestPermitJobs,
  ] = await Promise.all([
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
        scopeVersionId: true,
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
        writeBackAppliedAt: true,
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
    prisma.renovationCaseEvent.findMany({
      where: {
        eventType: 'LIFECYCLE_CHANGED',
        ...(from || to ? {
          occurredAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        } : {}),
      },
      select: {
        renovationCaseId: true,
        eventType: true,
        fromLifecycle: true,
        toLifecycle: true,
        occurredAt: true,
      },
    }),
    prisma.renovationScopeVersion.findMany({
      where: {
        version: { gt: 1 },
        ...(from || to ? {
          createdAt: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        } : {}),
      },
      select: {
        id: true,
        renovationCaseId: true,
        version: true,
        downstreamInvalidation: true,
      },
    }),
    prisma.materialSpec.findMany({
      where: {
        lifecycleStatus: { in: ['INSTALLED', 'AS_BUILT'] },
        project: { renovationCaseId: { not: null } },
        ...filter,
      },
      select: {
        lifecycleStatus: true,
        verificationConfidence: true,
        manufacturer: true,
        productName: true,
        quantityInstalled: true,
        installedAt: true,
      },
    }),
    prisma.projectWriteBack.findMany({
      where: {
        project: {
          renovationCaseId: { not: null },
          ...(from || to ? {
            updatedAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          } : {}),
        },
      },
      select: { projectId: true },
    }),
    prisma.permitDataSource.findMany({
      select: {
        id: true,
        name: true,
        adapterType: true,
        status: true,
        coverageType: true,
        normalizedCoverageKey: true,
        lastFetchAt: true,
        lastFetchError: true,
      },
    }),
    prisma.taxAssessorDataSource.findMany({
      select: {
        id: true,
        name: true,
        adapterType: true,
        status: true,
        coverageType: true,
        normalizedCoverageKey: true,
        lastFetchAt: true,
        lastFetchError: true,
      },
    }),
    prisma.permitFetchJob.findMany({
      where: { dataSourceId: { not: null } },
      orderBy: { startedAt: 'desc' },
      distinct: ['dataSourceId'],
      select: {
        dataSourceId: true,
        durationMs: true,
        errorMessage: true,
        status: true,
      },
    }),
  ]);

  const permitJobBySource = new Map(
    latestPermitJobs
      .filter(job => job.dataSourceId)
      .map(job => [job.dataSourceId as string, job]),
  );
  const configuredRemoteSources: AuthoritySourceSnapshot[] = getConfiguredAuthorityIntegrations()
    .map((item, index) => ({
    family: item.family,
    sourceId: `env-${item.family.toLowerCase()}-${index}`,
    name: item.label,
    adapterType: 'REMOTE_JSON',
    status: 'ACTIVE',
    coverageType: 'CONFIGURED_ENDPOINT',
    coverageKey: item.coverage,
    lastSuccessAt: item.observation?.lastSuccessAt ?? null,
    lastError: item.observation?.lastError ?? null,
    latencyMs: item.observation?.latencyMs ?? null,
  }));
  const authoritySources: AuthoritySourceSnapshot[] = [
    ...permitSources.map(source => {
      const latestJob = permitJobBySource.get(source.id);
      return {
        family: 'PERMIT' as const,
        sourceId: source.id,
        name: source.name,
        adapterType: source.adapterType,
        status: source.status,
        coverageType: source.coverageType,
        coverageKey: source.normalizedCoverageKey,
        lastSuccessAt: source.lastFetchAt,
        lastError: source.lastFetchError || latestJob?.errorMessage || null,
        latencyMs: latestJob?.durationMs ?? null,
      };
    }),
    ...taxSources.map(source => ({
      family: 'TAX' as const,
      sourceId: source.id,
      name: source.name,
      adapterType: source.adapterType,
      status: source.status,
      coverageType: source.coverageType,
      coverageKey: source.normalizedCoverageKey,
      lastSuccessAt: source.lastFetchAt,
      lastError: source.lastFetchError,
      latencyMs: null,
    })),
    ...configuredRemoteSources,
  ];

  return summarizeRenovationOperationalHealth({
    cases,
    requirements,
    conditions,
    projects,
    projectionErrors,
    caseEvents,
    scopeVersions,
    materials,
    writeBacks,
    authoritySources,
  });
}
