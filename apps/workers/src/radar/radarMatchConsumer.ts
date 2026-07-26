import type { Job } from 'bullmq';
import type { QueuePort } from '@worker-shared/lib/queuePort';
import {
  createRadarMatchContinuation,
  createRadarMatchPropertyScope,
  configuredRadarMatchPageSize,
  radarMatchJobOptions,
  radarMatchJobPayloadSchema,
  RADAR_MATCH_JOB_NAME,
  type RadarMatchJobPayload,
} from '@worker-shared/modules/homeEventRadar/queues/radarMatch.queue';
import type { RadarPropertyPageResult } from '@worker-shared/modules/homeEventRadar/services/radarMatchDiscovery.service';
import {
  radarMatchDurationSeconds,
  radarMatchFailuresTotal,
  radarMatchLagSeconds,
  radarMatchOutcomesTotal,
  radarMatchPropertiesTotal,
} from '../lib/metrics';

type MatchPagePort = (
  eventId: string,
  radarEventRevisionId: string,
  afterPropertyId: string | undefined,
  pageSize: number,
) => Promise<RadarPropertyPageResult>;
type MatchPropertyPort = (
  eventId: string,
  propertyIds: string[],
) => Promise<{ matched: number; skipped: number; failedPropertyIds: string[] }>;

export type RadarMatchConsumerDeps = {
  queue: QueuePort<RadarMatchJobPayload>;
  listPage: MatchPagePort;
  matchProperties: MatchPropertyPort;
  now(): Date;
};

export type RadarMatchConsumerResult =
  | {
      outcome: 'page_dispatched';
      dispatchedProperties: number;
      continuationQueued: boolean;
      nextCursor: string | null;
    }
  | {
      outcome: 'scan_terminal';
      reason: string;
      dispatchedProperties: 0;
      continuationQueued: false;
      nextCursor: null;
    }
  | {
      outcome: 'property_matched' | 'property_no_longer_eligible';
      propertyId: string;
      matched: number;
    };

export class RadarPropertyMatchError extends Error {
  constructor(readonly propertyId: string) {
    super(`Radar matching failed for property scope ${propertyId}`);
    this.name = 'RadarPropertyMatchError';
  }
}

export function radarMatchConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RADAR_MATCH_CONCURRENCY ?? '';
  if (!/^\d+$/.test(raw)) return 8;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return 8;
  return Math.min(40, Math.max(1, parsed));
}

export function radarMatchPageSize(env: NodeJS.ProcessEnv = process.env): number {
  return configuredRadarMatchPageSize(env);
}

export function radarMatchErrorClass(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'ZodError' || name === 'TypeError') return 'validation';
  if (name === 'RadarPropertyMatchError') return 'property';
  if (
    name === 'PrismaClientKnownRequestError' ||
    name === 'PrismaClientInitializationError' ||
    name === 'ReplyError' ||
    name === 'MaxRetriesPerRequestError'
  ) return 'transient';
  return 'unknown';
}

export function isFinalRadarMatchAttempt(
  job: Pick<Job<RadarMatchJobPayload>, 'attemptsMade' | 'opts'> | undefined,
): boolean {
  if (!job) return true;
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade >= attempts;
}

export async function processRadarMatchJob(
  job: Pick<Job<RadarMatchJobPayload>, 'name' | 'data'>,
  deps: RadarMatchConsumerDeps,
): Promise<RadarMatchConsumerResult> {
  if (job.name !== RADAR_MATCH_JOB_NAME) {
    throw new Error(`[RADAR-MATCH] Unknown job name: ${job.name}`);
  }
  const started = process.hrtime();
  try {
    const payload = radarMatchJobPayloadSchema.parse(job.data);
    const now = deps.now();
    radarMatchLagSeconds.observe(
      Math.max(0, (now.getTime() - new Date(payload.enqueuedAt).getTime()) / 1_000),
    );

    if (payload.scopeType === 'scan') {
      const page = await deps.listPage(
        payload.radarEventId,
        payload.radarEventRevisionId,
        payload.afterPropertyId,
        payload.pageSize,
      );
      if (page.outcome !== 'ready') {
        radarMatchOutcomesTotal.inc({ scope: 'scan', outcome: page.outcome });
        return {
          outcome: 'scan_terminal',
          reason: page.outcome,
          dispatchedProperties: 0,
          continuationQueued: false,
          nextCursor: null,
        };
      }

      for (const propertyId of page.propertyIds) {
        const child = createRadarMatchPropertyScope(payload, propertyId, now);
        await deps.queue.add(
          RADAR_MATCH_JOB_NAME,
          child.data,
          radarMatchJobOptions(child.jobId),
        );
      }
      if (page.nextCursor) {
        const continuation = createRadarMatchContinuation(payload, page.nextCursor, now);
        await deps.queue.add(
          RADAR_MATCH_JOB_NAME,
          continuation.data,
          radarMatchJobOptions(continuation.jobId),
        );
      }
      radarMatchOutcomesTotal.inc({ scope: 'scan', outcome: 'dispatched' });
      return {
        outcome: 'page_dispatched',
        dispatchedProperties: page.propertyIds.length,
        continuationQueued: page.nextCursor !== null,
        nextCursor: page.nextCursor,
      };
    }

    const result = await deps.matchProperties(payload.radarEventId, [payload.propertyId]);
    if (result.skipped > 0 || result.failedPropertyIds.includes(payload.propertyId)) {
      radarMatchPropertiesTotal.inc({ outcome: 'failed' });
      throw new RadarPropertyMatchError(payload.propertyId);
    }
    radarMatchPropertiesTotal.inc({ outcome: result.matched > 0 ? 'matched' : 'not_eligible' });
    const outcome = result.matched > 0
      ? 'property_matched' as const
      : 'property_no_longer_eligible' as const;
    radarMatchOutcomesTotal.inc({ scope: 'property', outcome });
    return { outcome, propertyId: payload.propertyId, matched: result.matched };
  } catch (error) {
    radarMatchFailuresTotal.inc({ error_class: radarMatchErrorClass(error) });
    throw error;
  } finally {
    const [seconds, nanoseconds] = process.hrtime(started);
    radarMatchDurationSeconds.observe(seconds + nanoseconds / 1e9);
  }
}
