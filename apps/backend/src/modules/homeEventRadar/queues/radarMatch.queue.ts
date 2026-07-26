import { Queue } from 'bullmq';
import { DEFAULT_JOB_RETENTION } from '../../../config/queueDefaults';
import { createLazyQueue } from '../../../lib/queuePort';

export const RADAR_MATCH_QUEUE_NAME = 'home-event-radar-match-queue';
export const RADAR_MATCH_JOB_NAME = 'MATCH_RADAR_EVENT_REVISION';

export type RadarMatchJobPayload = {
  radarEventId: string;
  radarEventRevisionId: string;
  revisionIdentity: string;
  sourceDefinitionId: string;
  sourceRunId: string;
  lifecycleStatus: 'active' | 'updated' | 'resolved' | 'expired' | 'retracted';
  correlationId: string;
};

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
