import { Queue } from 'bullmq';
import { z } from 'zod';
import { DEFAULT_JOB_RETENTION } from '../../../config/queueDefaults';
import type { QueuePort } from '../../../lib/queuePort';
import { createLazyQueue } from '../../../lib/queuePort';
import {
  canonicalRadarObservationSchema,
  type CanonicalRadarObservation,
} from '../contracts';
import {
  radarIngestJobId,
  radarObservationFingerprint,
  radarRevisionIdentity,
  stableRadarJson,
} from '../domain/radarObservationIdentity';

export const RADAR_INGEST_QUEUE_NAME = 'home-event-radar-ingest-queue';
export const RADAR_INGEST_JOB_NAME = 'INGEST_RADAR_OBSERVATION';
export const RADAR_INGEST_PAYLOAD_VERSION = 1;
export const RADAR_INGEST_MAX_PAYLOAD_BYTES = 512 * 1024;
export const RADAR_INGEST_ATTEMPTS = 5;

export function isRadarIngestEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.RADAR_INGEST_ENABLED;
  return value === undefined || value === 'true';
}

export const radarIngestJobPayloadSchema = z.object({
  payloadVersion: z.literal(RADAR_INGEST_PAYLOAD_VERSION),
  observation: canonicalRadarObservationSchema,
  sourceRunId: z.string().trim().min(1),
  correlationId: z.string().trim().min(1),
  enqueuedAt: z.string().datetime({ offset: true }),
  smokeCorrelationId: z.string().trim().min(1).optional(),
});

export type RadarIngestJobPayload = z.infer<typeof radarIngestJobPayloadSchema>;

const rawRedisDb = process.env.REDIS_DB || '0';
const redisDb = /^\d+$/.test(rawRedisDb) ? Number.parseInt(rawRedisDb, 10) : 0;

export const getRadarIngestQueue = createLazyQueue<RadarIngestJobPayload>(
  () =>
    new Queue<RadarIngestJobPayload>(RADAR_INGEST_QUEUE_NAME, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD,
        db: redisDb,
      },
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

export type EnqueueRadarObservationInput = {
  observation: unknown;
  sourceRunId: string;
  correlationId: string;
  enqueuedAt?: string;
  smokeCorrelationId?: string;
};

export type RadarIngestEnqueueResult = {
  jobId: string;
  revisionIdentity: string;
  payloadFingerprint: string;
  lifecycleStatus: CanonicalRadarObservation['lifecycleStatus'];
};

export class RadarIngestPayloadTooLargeError extends Error {
  constructor(readonly payloadBytes: number) {
    super(
      `Canonical Radar ingest payload is ${payloadBytes} bytes; maximum is ${RADAR_INGEST_MAX_PAYLOAD_BYTES}`,
    );
    this.name = 'RadarIngestPayloadTooLargeError';
  }
}

export class RadarIngestDisabledError extends Error {
  constructor() {
    super('Canonical Radar ingestion is disabled by RADAR_INGEST_ENABLED=false');
    this.name = 'RadarIngestDisabledError';
  }
}

export class RadarIngestQueueService {
  constructor(
    private readonly queueProvider: () => QueuePort<RadarIngestJobPayload> = getRadarIngestQueue,
    private readonly now: () => Date = () => new Date(),
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async enqueue(input: EnqueueRadarObservationInput): Promise<RadarIngestEnqueueResult> {
    if (!isRadarIngestEnabled(this.env)) throw new RadarIngestDisabledError();
    const observation = canonicalRadarObservationSchema.parse(input.observation);
    const payloadFingerprint = radarObservationFingerprint(observation);
    const revisionIdentity = radarRevisionIdentity(observation, payloadFingerprint);
    const payload = radarIngestJobPayloadSchema.parse({
      payloadVersion: RADAR_INGEST_PAYLOAD_VERSION,
      observation,
      sourceRunId: input.sourceRunId,
      correlationId: input.correlationId,
      enqueuedAt: input.enqueuedAt ?? this.now().toISOString(),
      ...(input.smokeCorrelationId
        ? { smokeCorrelationId: input.smokeCorrelationId }
        : {}),
    });
    const payloadBytes = Buffer.byteLength(stableRadarJson(payload), 'utf8');
    if (payloadBytes > RADAR_INGEST_MAX_PAYLOAD_BYTES) {
      throw new RadarIngestPayloadTooLargeError(payloadBytes);
    }
    const jobId = radarIngestJobId(
      payload.sourceRunId,
      observation.sourceDefinitionId,
      observation.providerEventId,
      revisionIdentity,
    );
    await this.queueProvider().add(RADAR_INGEST_JOB_NAME, payload, {
      jobId,
      attempts: RADAR_INGEST_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: 5_000,
        jitter: 0.2,
      },
    });
    return {
      jobId,
      revisionIdentity,
      payloadFingerprint,
      lifecycleStatus: observation.lifecycleStatus,
    };
  }
}

export const radarIngestQueueService = new RadarIngestQueueService();
