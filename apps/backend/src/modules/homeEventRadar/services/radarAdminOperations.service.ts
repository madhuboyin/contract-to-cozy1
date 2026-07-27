import { prisma } from '../../../lib/prisma';
import { triggerJob } from '../../../services/adminWorkerJobs.service';
import { redactRadarSourceConfig } from './radarSourceRegistry.service';

const SOURCE_JOB_KEYS: Readonly<Record<string, string>> = {
  'nws-active-alerts': 'severe-weather-alerts',
  'open-meteo-freeze-forecast': 'freeze-risk-incidents',
  'epa-airnow-air-quality': 'airnow-air-quality',
  'usgs-earthquakes': 'usgs-earthquakes',
  'tax-assessment-ingest': 'tax-assessment-ingest',
};

export class RadarAdminNotFoundError extends Error {}
export class RadarAdminOperationError extends Error {}

function jobKeyFor(sourceKey: string): string {
  const jobKey = SOURCE_JOB_KEYS[sourceKey];
  if (!jobKey) {
    throw new RadarAdminOperationError(
      `Source ${sourceKey} has no reviewed worker-job mapping`,
    );
  }
  return jobKey;
}

function effectiveStatus(source: {
  isEnabled: boolean;
  operationsPausedAt: Date | null;
  freshnessSeconds: number;
  health: { status: string; dataFreshThrough: Date | null } | null;
}) {
  if (!source.isEnabled) return { status: 'disabled', stale: false };
  if (source.operationsPausedAt) return { status: 'paused', stale: false };
  const freshThrough = source.health?.dataFreshThrough;
  const stale = Boolean(
    freshThrough &&
      Date.now() - freshThrough.getTime() > source.freshnessSeconds * 1_000,
  );
  return { status: stale ? 'stale' : source.health?.status ?? 'unknown', stale };
}

const sourceInclude = {
  health: true,
  coverage: { orderBy: [{ priority: 'desc' as const }, { createdAt: 'asc' as const }] },
  runs: { orderBy: { startedAt: 'desc' as const }, take: 20 },
  _count: { select: { events: true, runs: true, propertyCoverage: true } },
};

function presentSource(source: any) {
  const { configJson, ...safe } = source;
  return {
    ...safe,
    safeConfig: redactRadarSourceConfig(configJson),
    effectiveHealth: effectiveStatus(source),
    workerJobKey: SOURCE_JOB_KEYS[source.key] ?? null,
    operationsSupported: Boolean(SOURCE_JOB_KEYS[source.key]),
  };
}

export class RadarAdminOperationsService {
  async listSources() {
    const sources = await prisma.radarSourceDefinition.findMany({
      include: sourceInclude,
      orderBy: [{ family: 'asc' }, { key: 'asc' }],
    });
    return sources.map(presentSource);
  }

  async getSource(sourceKey: string) {
    const source = await prisma.radarSourceDefinition.findUnique({
      where: { key: sourceKey },
      include: sourceInclude,
    });
    if (!source) throw new RadarAdminNotFoundError(`Unknown Radar source: ${sourceKey}`);
    return presentSource(source);
  }

  async testFetch(sourceKey: string, propertyId?: string) {
    await this.requireRunnableSource(sourceKey);
    return triggerJob(jobKeyFor(sourceKey), { dryRun: true, propertyId });
  }

  async runScoped(sourceKey: string, propertyId: string) {
    await this.requireRunnableSource(sourceKey);
    if (!propertyId.trim()) {
      throw new RadarAdminOperationError('propertyId is required for a scoped run');
    }
    return triggerJob(jobKeyFor(sourceKey), { propertyId: propertyId.trim() });
  }

  async replayRun(runId: string, propertyId?: string) {
    const run = await prisma.radarSourceRun.findUnique({
      where: { id: runId },
      include: { sourceDefinition: true },
    });
    if (!run) throw new RadarAdminNotFoundError(`Unknown Radar source run: ${runId}`);
    await this.requireRunnableSource(run.sourceDefinition.key);
    const metadata = run.metadataJson && typeof run.metadataJson === 'object'
      ? run.metadataJson as Record<string, unknown>
      : {};
    const priorPropertyId =
      typeof metadata.propertyId === 'string' ? metadata.propertyId : undefined;
    const scope = propertyId?.trim() || priorPropertyId;
    return {
      ...(await triggerJob(jobKeyFor(run.sourceDefinition.key), { propertyId: scope })),
      replayOfRunId: run.id,
      sourceKey: run.sourceDefinition.key,
      propertyId: scope ?? null,
    };
  }

  async setPaused(
    sourceKey: string,
    paused: boolean,
    actorId: string,
    reason: string,
  ) {
    const existing = await prisma.radarSourceDefinition.findUnique({
      where: { key: sourceKey },
      include: { health: true },
    });
    if (!existing) throw new RadarAdminNotFoundError(`Unknown Radar source: ${sourceKey}`);
    if (!paused && !existing.isEnabled) {
      throw new RadarAdminOperationError(
        'A disabled source cannot be resumed; enable its reviewed registration first',
      );
    }

    await prisma.$transaction([
      prisma.radarSourceDefinition.update({
        where: { id: existing.id },
        data: paused
          ? {
              operationsPausedAt: new Date(),
              operationsPausedBy: actorId,
              operationsPauseReason: reason,
            }
          : {
              operationsPausedAt: null,
              operationsPausedBy: null,
              operationsPauseReason: null,
            },
      }),
      prisma.radarSourceHealth.upsert({
        where: { sourceDefinitionId: existing.id },
        create: {
          sourceDefinitionId: existing.id,
          status: paused ? 'disabled' : 'unknown',
          message: paused ? `Operator pause: ${reason}` : 'Operator pause removed; awaiting next run',
        },
        update: {
          status: paused ? 'disabled' : 'unknown',
          message: paused ? `Operator pause: ${reason}` : 'Operator pause removed; awaiting next run',
        },
      }),
    ]);
    return this.getSource(sourceKey);
  }

  async getEventLineage(eventId: string) {
    const event = await prisma.radarEvent.findUnique({
      where: { id: eventId },
      include: {
        sourceDefinition: {
          select: { id: true, key: true, name: true, provider: true, adapterVersion: true },
        },
        sourceRun: true,
        revisions: {
          orderBy: { observedAt: 'desc' },
          include: { _count: { select: { notificationDecisions: true } } },
        },
        propertyMatches: {
          orderBy: { createdAt: 'desc' },
          include: {
            property: { select: { id: true, address: true, city: true, state: true, zipCode: true } },
            incident: { select: { id: true, status: true, severity: true, openedAt: true, resolvedAt: true } },
            _count: {
              select: {
                states: true,
                actions: true,
                taskLinks: true,
                notificationDecisions: true,
              },
            },
          },
        },
      },
    });
    if (!event) throw new RadarAdminNotFoundError(`Unknown Radar event: ${eventId}`);
    return event;
  }

  async listAnomalies() {
    const [sources, stuckRuns] = await Promise.all([
      prisma.radarSourceDefinition.findMany({
        include: { health: true, coverage: { select: { id: true } } },
        orderBy: { key: 'asc' },
      }),
      prisma.radarSourceRun.findMany({
        where: { status: 'started', startedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
        include: { sourceDefinition: { select: { key: true, name: true } } },
        orderBy: { startedAt: 'asc' },
        take: 100,
      }),
    ]);

    const anomalies: Array<Record<string, unknown>> = [];
    for (const source of sources) {
      const effective = effectiveStatus(source);
      if (!source.coverage.length && source.isEnabled) {
        anomalies.push({
          type: 'missing_coverage',
          severity: 'high',
          sourceKey: source.key,
          detail: 'Enabled source has no coverage definition',
        });
      }
      if (['failed', 'degraded', 'stale'].includes(effective.status)) {
        anomalies.push({
          type: `source_${effective.status}`,
          severity: effective.status === 'failed' ? 'high' : 'medium',
          sourceKey: source.key,
          detail: source.health?.message ?? `Source is ${effective.status}`,
          consecutiveFailures: source.health?.consecutiveFailures ?? 0,
        });
      }
    }
    for (const run of stuckRuns) {
      anomalies.push({
        type: 'stuck_run',
        severity: 'high',
        sourceKey: run.sourceDefinition.key,
        runId: run.id,
        startedAt: run.startedAt,
        detail: 'Source run has remained started for more than 30 minutes',
      });
    }
    return { generatedAt: new Date(), anomalies };
  }

  private async requireRunnableSource(sourceKey: string) {
    const source = await prisma.radarSourceDefinition.findUnique({ where: { key: sourceKey } });
    if (!source) throw new RadarAdminNotFoundError(`Unknown Radar source: ${sourceKey}`);
    if (!source.isEnabled) throw new RadarAdminOperationError('Source is disabled');
    if (source.operationsPausedAt) throw new RadarAdminOperationError('Source is paused by an operator');
    return source;
  }
}

export const radarAdminOperationsService = new RadarAdminOperationsService();
