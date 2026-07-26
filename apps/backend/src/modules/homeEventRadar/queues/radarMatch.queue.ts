import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { DEFAULT_JOB_RETENTION } from '../../../config/queueDefaults';
import type { QueuePort } from '../../../lib/queuePort';
import { createLazyQueue } from '../../../lib/queuePort';
import { radarMatchJobId } from '../domain/radarObservationIdentity';

export const RADAR_MATCH_QUEUE_NAME = 'home-event-radar-match-queue';
export const RADAR_MATCH_JOB_NAME = 'MATCH_RADAR_EVENT_REVISION';
export const RADAR_MATCH_PAYLOAD_VERSION = 1;
export const RADAR_MATCH_ATTEMPTS = 5;
export const RADAR_MATCH_DEFAULT_PAGE_SIZE = 100;
export const RADAR_MATCH_MAX_PAGE_SIZE = 500;

const radarMatchBasePayloadSchema = z.object({
  payloadVersion: z.literal(RADAR_MATCH_PAYLOAD_VERSION),
  radarEventId: z.string().trim().min(1),
  radarEventRevisionId: z.string().trim().min(1),
  revisionIdentity: z.string().trim().min(1),
  sourceDefinitionId: z.string().trim().min(1),
  sourceRunId: z.string().trim().min(1),
  lifecycleStatus: z.enum(['active', 'updated', 'resolved', 'expired', 'retracted']),
  correlationId: z.string().trim().min(1),
  enqueuedAt: z.string().datetime({ offset: true }),
});

export const radarMatchJobPayloadSchema = z.discriminatedUnion('scopeType', [
  radarMatchBasePayloadSchema.extend({
    scopeType: z.literal('scan'),
    afterPropertyId: z.string().trim().min(1).optional(),
    pageSize: z.number().int().min(1).max(RADAR_MATCH_MAX_PAGE_SIZE),
  }),
  radarMatchBasePayloadSchema.extend({
    scopeType: z.literal('property'),
    propertyId: z.string().trim().min(1),
  }),
]);

export type RadarMatchJobPayload = z.infer<typeof radarMatchJobPayloadSchema>;
export type RadarMatchRootInput = Omit<
  z.infer<typeof radarMatchBasePayloadSchema>,
  'payloadVersion' | 'enqueuedAt'
>;

const rawRedisDb = process.env.REDIS_DB || '0';
const redisDb = /^\d+$/.test(rawRedisDb) ? Number.parseInt(rawRedisDb, 10) : 0;

export const getRadarMatchQueue = createLazyQueue<RadarMatchJobPayload>(
  () =>
    new Queue<RadarMatchJobPayload>(RADAR_MATCH_QUEUE_NAME, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: 6379,
        password: process.env.REDIS_PASSWORD,
        db: redisDb,
      },
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

export function isRadarMatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.RADAR_MATCH_ENABLED;
  return value === undefined || value === 'true';
}

export function configuredRadarMatchPageSize(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.RADAR_MATCH_PAGE_SIZE ?? '';
  if (!/^\d+$/.test(raw)) return RADAR_MATCH_DEFAULT_PAGE_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return RADAR_MATCH_DEFAULT_PAGE_SIZE;
  return Math.min(RADAR_MATCH_MAX_PAGE_SIZE, Math.max(1, parsed));
}

function childJobId(
  prefix: 'scan' | 'property',
  payload: Pick<
    RadarMatchJobPayload,
    'sourceDefinitionId' | 'radarEventId' | 'radarEventRevisionId' | 'revisionIdentity'
  >,
  scopeIdentity: string,
): string {
  return `radar-match-${prefix}-${createHash('sha256')
    .update(
      `${payload.sourceDefinitionId}\n${payload.radarEventId}\n` +
      `${payload.radarEventRevisionId}\n${payload.revisionIdentity}\n${scopeIdentity}`,
    )
    .digest('hex')}`;
}

export function radarMatchJobOptions(jobId: string) {
  return {
    jobId,
    attempts: RADAR_MATCH_ATTEMPTS,
    backoff: {
      type: 'exponential' as const,
      delay: 5_000,
      jitter: 0.2,
    },
  };
}

export function createRadarMatchRootPayload(
  input: RadarMatchRootInput,
  now: Date = new Date(),
  pageSize = RADAR_MATCH_DEFAULT_PAGE_SIZE,
): Extract<RadarMatchJobPayload, { scopeType: 'scan' }> {
  return radarMatchJobPayloadSchema.parse({
    payloadVersion: RADAR_MATCH_PAYLOAD_VERSION,
    ...input,
    enqueuedAt: now.toISOString(),
    scopeType: 'scan',
    pageSize,
  }) as Extract<RadarMatchJobPayload, { scopeType: 'scan' }>;
}

export function radarMatchRootJobId(
  payload: Pick<RadarMatchJobPayload, 'sourceDefinitionId' | 'revisionIdentity'> & {
    providerEventId: string;
  },
): string {
  return radarMatchJobId(
    payload.sourceDefinitionId,
    payload.providerEventId,
    payload.revisionIdentity,
  );
}

export function createRadarMatchContinuation(
  payload: RadarMatchJobPayload,
  afterPropertyId: string,
  now: Date = new Date(),
): {
  data: Extract<RadarMatchJobPayload, { scopeType: 'scan' }>;
  jobId: string;
} {
  const data = radarMatchJobPayloadSchema.parse({
    ...payload,
    enqueuedAt: now.toISOString(),
    scopeType: 'scan',
    afterPropertyId,
    pageSize:
      payload.scopeType === 'scan'
        ? payload.pageSize
        : RADAR_MATCH_DEFAULT_PAGE_SIZE,
    propertyId: undefined,
  }) as Extract<RadarMatchJobPayload, { scopeType: 'scan' }>;
  return {
    data,
    jobId: childJobId('scan', payload, afterPropertyId),
  };
}

export function createRadarMatchPropertyScope(
  payload: RadarMatchJobPayload,
  propertyId: string,
  now: Date = new Date(),
): {
  data: Extract<RadarMatchJobPayload, { scopeType: 'property' }>;
  jobId: string;
} {
  const data = radarMatchJobPayloadSchema.parse({
    ...payload,
    enqueuedAt: now.toISOString(),
    scopeType: 'property',
    propertyId,
    afterPropertyId: undefined,
    pageSize: undefined,
  }) as Extract<RadarMatchJobPayload, { scopeType: 'property' }>;
  return {
    data,
    jobId: childJobId('property', payload, propertyId),
  };
}

export async function enqueueRadarMatchRoot(
  queue: QueuePort<RadarMatchJobPayload>,
  input: RadarMatchRootInput & { providerEventId: string },
  now: Date = new Date(),
): Promise<string> {
  const { providerEventId, ...payloadInput } = input;
  const data = createRadarMatchRootPayload(
    payloadInput,
    now,
    configuredRadarMatchPageSize(),
  );
  const jobId = radarMatchRootJobId({ ...data, providerEventId });
  await queue.add(RADAR_MATCH_JOB_NAME, data, radarMatchJobOptions(jobId));
  return jobId;
}
