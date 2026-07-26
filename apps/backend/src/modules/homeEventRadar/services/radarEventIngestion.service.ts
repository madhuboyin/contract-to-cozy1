import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { QueuePort } from '../../../lib/queuePort';
import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
  type NormalizedGeography,
} from '../contracts';
import {
  getRadarMatchQueue,
  RADAR_MATCH_JOB_NAME,
  type RadarMatchJobPayload,
} from '../queues/radarMatch.queue';
import {
  normalizeRadarJsonValue,
  radarMatchJobId,
  radarObservationFingerprint,
  radarRevisionIdentity,
  radarValueFingerprint,
} from '../domain/radarObservationIdentity';

export {
  normalizeRadarJsonValue,
  radarMatchJobId,
  radarObservationFingerprint,
  radarRevisionIdentity,
  radarValueFingerprint,
  stableRadarJson,
} from '../domain/radarObservationIdentity';

type IngestionDb = {
  $transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
};
type LifecycleStatus = CanonicalRadarObservation['lifecycleStatus'];

export type RadarIngestionContext = {
  sourceRunId: string;
  correlationId: string;
};

export type RadarIngestionResult = {
  outcome: 'created' | 'updated' | 'duplicate';
  radarEventId: string;
  radarEventRevisionId: string;
  revisionIdentity: string;
  payloadFingerprint: string;
  lifecycleStatus: LifecycleStatus;
  matchJobId: string;
};

export type RadarBatchIngestionItem =
  | { accepted: true; result: RadarIngestionResult }
  | { accepted: false; providerEventId: string | null; error: Error };

export class RadarObservationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RadarObservationConflictError';
  }
}

export class RadarObservationStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RadarObservationStaleError';
  }
}

export class RadarObservationSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RadarObservationSourceError';
  }
}

const TERMINAL_STATUSES = new Set<LifecycleStatus>(['resolved', 'expired', 'retracted']);

export function canonicalLifecycleTransition(
  previous: LifecycleStatus | null,
  requested: LifecycleStatus,
): LifecycleStatus {
  if (!previous) return requested;
  if (TERMINAL_STATUSES.has(previous)) {
    if (requested === previous) return previous;
    throw new RadarObservationConflictError(
      `Radar event cannot transition from terminal status ${previous} to ${requested}; use a new provider event identity`,
    );
  }
  if (requested === 'active' || requested === 'updated') return 'updated';
  return requested;
}

function severityForPersistence(
  severity: CanonicalRadarObservation['severity'],
): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  if (severity === 'moderate') return 'medium';
  if (severity === 'severe' || severity === 'extreme') return 'critical';
  return severity;
}

function geographyForPersistence(geography: NormalizedGeography) {
  switch (geography.type) {
    case 'property':
      return {
        locationType: 'property' as const,
        locationKey: `property:${geography.propertyId}`,
        geoJson: null,
      };
    case 'point':
      return {
        locationType: 'point' as const,
        locationKey: `point:${geography.point.latitude.toFixed(6)},${geography.point.longitude.toFixed(6)}`,
        geoJson: {
          type: 'Point',
          coordinates: [geography.point.longitude, geography.point.latitude],
        },
      };
    case 'radius':
      return {
        locationType: 'radius' as const,
        locationKey: `radius:${geography.center.latitude.toFixed(6)},${geography.center.longitude.toFixed(6)}:${geography.radiusMeters}`,
        geoJson: {
          type: 'Radius',
          center: [geography.center.longitude, geography.center.latitude],
          radiusMeters: geography.radiusMeters,
        },
      };
    case 'postal_code':
      return {
        locationType: 'postal_code' as const,
        locationKey: `${geography.countryCode}:${geography.postalCode.trim().toUpperCase()}`,
        geoJson: null,
      };
    case 'administrative_area':
      return {
        locationType: 'administrative_area' as const,
        locationKey: [
          geography.countryCode,
          geography.level,
          geography.code ?? geography.name.trim().toUpperCase(),
        ].join(':'),
        geoJson: null,
      };
    case 'polygon':
      return {
        locationType: 'polygon' as const,
        locationKey: `polygon:${radarValueFingerprint(geography.geoJson)}`,
        geoJson: geography.geoJson,
      };
  }
}

function normalizedEvidence(observation: CanonicalRadarObservation) {
  const { rawPayload: _rawPayload, ...normalized } = observation;
  return normalized;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return normalizeRadarJsonValue(value) as Prisma.InputJsonValue;
}

function eventWriteData(
  observation: CanonicalRadarObservation,
  source: { sourceType: string },
  context: RadarIngestionContext,
  lifecycleStatus: LifecycleStatus,
  previous?: {
    resolvedAt: Date | null;
    expiredAt: Date | null;
    retractedAt: Date | null;
  },
) {
  const geography = geographyForPersistence(observation.geography);
  const nowForStatus = new Date(observation.observedAt);
  return {
    sourceDefinitionId: observation.sourceDefinitionId,
    sourceRunId: context.sourceRunId,
    providerEventId: observation.providerEventId,
    providerRevision: observation.providerRevision ?? null,
    eventType: observation.eventType as never,
    title: observation.title,
    summary: observation.summary,
    sourceType: source.sourceType as never,
    sourceRef: observation.providerEventId,
    severity: severityForPersistence(observation.severity),
    startAt: new Date(observation.effectiveAt),
    endAt: observation.expiresAt ? new Date(observation.expiresAt) : null,
    locationType: geography.locationType,
    locationKey: geography.locationKey,
    geoJson: geography.geoJson ? jsonInput(geography.geoJson) : Prisma.JsonNull,
    payloadJson: jsonInput(normalizedEvidence(observation)),
    dedupeKey: `source:${observation.sourceDefinitionId}:provider:${observation.providerEventId}`,
    status: lifecycleStatus,
    observedAt: nowForStatus,
    resolvedAt: lifecycleStatus === 'resolved' ? previous?.resolvedAt ?? nowForStatus : null,
    expiredAt: lifecycleStatus === 'expired' ? previous?.expiredAt ?? nowForStatus : null,
    retractedAt: lifecycleStatus === 'retracted' ? previous?.retractedAt ?? nowForStatus : null,
    canonicalUrl: observation.canonicalUrl ?? null,
  };
}

export class RadarEventIngestionService {
  constructor(
    private readonly db: IngestionDb = prisma,
    private readonly queueProvider: () => QueuePort<RadarMatchJobPayload> = getRadarMatchQueue,
  ) {}

  private async transactionWithConcurrencyRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.db.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
        const isConcurrencyConflict = code === 'P2002' || code === 'P2034';
        if (!isConcurrencyConflict || attempt === 3) throw error;
      }
    }
    throw new Error('Unreachable Radar ingestion transaction retry state');
  }

  async ingest(
    rawObservation: unknown,
    context: RadarIngestionContext,
  ): Promise<RadarIngestionResult> {
    if (!context.sourceRunId?.trim()) throw new RadarObservationSourceError('sourceRunId is required');
    if (!context.correlationId?.trim()) throw new RadarObservationSourceError('correlationId is required');

    const observation = canonicalRadarObservationSchema.parse(rawObservation);
    // Normalize first so unsupported/circular raw evidence is rejected before opening a transaction.
    const normalizedRawPayload = jsonInput(observation.rawPayload);
    const payloadFingerprint = radarObservationFingerprint(observation);
    const revisionIdentity = radarRevisionIdentity(observation, payloadFingerprint);

    const persisted = await this.transactionWithConcurrencyRetry(async (tx) => {
      const [source, run] = await Promise.all([
        tx.radarSourceDefinition.findUnique({
          where: { id: observation.sourceDefinitionId },
          select: {
            id: true,
            family: true,
            sourceType: true,
            contractVersion: true,
            supportedEventTypes: true,
          },
        }),
        tx.radarSourceRun.findUnique({
          where: { id: context.sourceRunId },
          select: {
            id: true,
            sourceDefinitionId: true,
            status: true,
            correlationId: true,
          },
        }),
      ]);
      if (!source) {
        throw new RadarObservationSourceError(
          `Unknown Radar source definition: ${observation.sourceDefinitionId}`,
        );
      }
      if (source.contractVersion !== observation.schemaVersion) {
        throw new RadarObservationSourceError(
          `Source contract version ${source.contractVersion} does not accept observation schema ${observation.schemaVersion}`,
        );
      }
      if (source.family !== observation.sourceFamily) {
        throw new RadarObservationSourceError(
          `Observation family ${observation.sourceFamily} does not match source family ${source.family}`,
        );
      }
      if (!source.supportedEventTypes.includes(observation.eventType as never)) {
        throw new RadarObservationSourceError(
          `Source ${source.id} does not support event type ${observation.eventType}`,
        );
      }
      if (!run || run.sourceDefinitionId !== source.id) {
        throw new RadarObservationSourceError(
          `Source run ${context.sourceRunId} does not belong to source ${source.id}`,
        );
      }
      if (run.status !== 'started') {
        throw new RadarObservationSourceError(
          `Source run ${context.sourceRunId} is ${run.status}; observations require a started run`,
        );
      }
      if (run.correlationId !== context.correlationId) {
        throw new RadarObservationSourceError(
          `Correlation ID does not match source run ${context.sourceRunId}`,
        );
      }

      const identity = {
        sourceDefinitionId_providerEventId: {
          sourceDefinitionId: source.id,
          providerEventId: observation.providerEventId,
        },
      };
      const existingEvent = await tx.radarEvent.findUnique({ where: identity });

      if (existingEvent) {
        const duplicateRevision = await tx.radarEventRevision.findUnique({
          where: {
            radarEventId_revisionIdentity: {
              radarEventId: existingEvent.id,
              revisionIdentity,
            },
          },
        });
        if (duplicateRevision) {
          if (duplicateRevision.payloadFingerprint !== payloadFingerprint) {
            throw new RadarObservationConflictError(
              `Revision ${revisionIdentity} was already accepted with a different payload`,
            );
          }
          return {
            outcome: 'duplicate' as const,
            event: existingEvent,
            revision: duplicateRevision,
            lifecycleStatus: duplicateRevision.lifecycleStatus as LifecycleStatus,
          };
        }
        if (new Date(observation.observedAt) < existingEvent.observedAt) {
          throw new RadarObservationStaleError(
            `Observation ${observation.observedAt} predates the current event observation ${existingEvent.observedAt.toISOString()}`,
          );
        }

        const lifecycleStatus = canonicalLifecycleTransition(
          existingEvent.status as LifecycleStatus,
          observation.lifecycleStatus,
        );
        const revision = await tx.radarEventRevision.create({
          data: {
            radarEventId: existingEvent.id,
            sourceRunId: context.sourceRunId,
            revisionIdentity,
            providerRevision: observation.providerRevision ?? null,
            payloadFingerprint,
            lifecycleStatus,
            effectiveAt: new Date(observation.effectiveAt),
            expiresAt: observation.expiresAt ? new Date(observation.expiresAt) : null,
            observedAt: new Date(observation.observedAt),
            normalizedJson: jsonInput(normalizedEvidence(observation)),
            rawPayloadJson: normalizedRawPayload,
          },
        });
        const event = await tx.radarEvent.update({
          where: { id: existingEvent.id },
          data: eventWriteData(observation, source, context, lifecycleStatus, existingEvent),
        });
        return { outcome: 'updated' as const, event, revision, lifecycleStatus };
      }

      const lifecycleStatus = canonicalLifecycleTransition(null, observation.lifecycleStatus);
      const event = await tx.radarEvent.create({
        data: eventWriteData(observation, source, context, lifecycleStatus),
      });
      const revision = await tx.radarEventRevision.create({
        data: {
          radarEventId: event.id,
          sourceRunId: context.sourceRunId,
          revisionIdentity,
          providerRevision: observation.providerRevision ?? null,
          payloadFingerprint,
          lifecycleStatus,
          effectiveAt: new Date(observation.effectiveAt),
          expiresAt: observation.expiresAt ? new Date(observation.expiresAt) : null,
          observedAt: new Date(observation.observedAt),
          normalizedJson: jsonInput(normalizedEvidence(observation)),
          rawPayloadJson: normalizedRawPayload,
        },
      });
      return { outcome: 'created' as const, event, revision, lifecycleStatus };
    });

    const matchJobId = radarMatchJobId(
      observation.sourceDefinitionId,
      observation.providerEventId,
      revisionIdentity,
    );
    await this.queueProvider().add(
      RADAR_MATCH_JOB_NAME,
      {
        radarEventId: persisted.event.id,
        radarEventRevisionId: persisted.revision.id,
        revisionIdentity,
        sourceDefinitionId: observation.sourceDefinitionId,
        sourceRunId: context.sourceRunId,
        lifecycleStatus: persisted.lifecycleStatus,
        correlationId: context.correlationId,
      },
      {
        jobId: matchJobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );

    return {
      outcome: persisted.outcome,
      radarEventId: persisted.event.id,
      radarEventRevisionId: persisted.revision.id,
      revisionIdentity,
      payloadFingerprint,
      lifecycleStatus: persisted.lifecycleStatus,
      matchJobId,
    };
  }

  async ingestMany(
    observations: readonly unknown[],
    context: RadarIngestionContext,
  ): Promise<RadarBatchIngestionItem[]> {
    const results: RadarBatchIngestionItem[] = [];
    for (const observation of observations) {
      try {
        results.push({ accepted: true, result: await this.ingest(observation, context) });
      } catch (error) {
        const providerEventId =
          observation && typeof observation === 'object' &&
          typeof (observation as { providerEventId?: unknown }).providerEventId === 'string'
            ? (observation as { providerEventId: string }).providerEventId
            : null;
        results.push({
          accepted: false,
          providerEventId,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }
    return results;
  }
}

export const radarEventIngestionService = new RadarEventIngestionService();
