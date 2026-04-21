// apps/backend/src/lib/redis.ts
//
// Shared ioredis client — used for short-lived counters and locks
// (MFA failure tracking, future token blacklist, etc.).
//
// BullMQ manages its own connections internally; this client is for
// application-level Redis operations only.

import Redis from 'ioredis';
import { logger } from './logger';

// Robust parsing for Redis connection parameters
// Handles Kubernetes service environment variables that might collide (e.g. REDIS_PORT=tcp://...)
const rawPort = process.env.REDIS_PORT || '6379';
const redisPort = /^\d+$/.test(rawPort) ? parseInt(rawPort, 10) : 6379;

const rawDb = process.env.REDIS_DB || '0';
const redisDb = /^\d+$/.test(rawDb) ? parseInt(rawDb, 10) : 0;

const client = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: redisPort,
  password: process.env.REDIS_PASSWORD || undefined,
  db: redisDb,
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
