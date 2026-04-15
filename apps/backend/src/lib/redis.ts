// apps/backend/src/lib/redis.ts
//
// Shared ioredis client — used for short-lived counters and locks
// (MFA failure tracking, future token blacklist, etc.).
//
// BullMQ manages its own connections internally; this client is for
// application-level Redis operations only.

import Redis from 'ioredis';
import { logger } from './logger';

const client = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  // Reconnect automatically on connection loss
  retryStrategy: (times) => Math.min(times * 200, 5_000),
  // Don't block the event loop while reconnecting
  enableReadyCheck: true,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

client.on('error', (err) => {
  logger.error({ err }, 'Redis client error');
});

client.on('connect', () => {
  logger.info('Redis client connected');
});

export { client as redis };
