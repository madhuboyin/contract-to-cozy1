import http from 'http';
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from './logger';

export const register = new Registry();

// Collect Node.js default metrics (event loop lag, heap, GC, etc.)
collectDefaultMetrics({ register });

// ─── BullMQ job metrics ──────────────────────────────────────────────────────

export const jobsProcessedTotal = new Counter({
  name: 'bullmq_jobs_processed_total',
  help: 'Total number of BullMQ jobs processed',
  labelNames: ['queue', 'job_name', 'status'] as const,
  registers: [register],
});

export const jobDurationSeconds = new Histogram({
  name: 'bullmq_job_duration_seconds',
  help: 'BullMQ job processing duration in seconds',
  labelNames: ['queue', 'job_name'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

export const jobsActiveGauge = new Gauge({
  name: 'bullmq_jobs_active',
  help: 'Number of BullMQ jobs currently active',
  labelNames: ['queue'] as const,
  registers: [register],
});

// ─── Metrics HTTP server ─────────────────────────────────────────────────────

const METRICS_PORT = Number(process.env.METRICS_PORT) || 9091;

export function startMetricsServer(): void {
  const server = http.createServer(async (_req, res) => {
    if (_req.url !== '/metrics') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  server.listen(METRICS_PORT, () => {
    logger.info(`Workers metrics server listening on :${METRICS_PORT}/metrics`);
  });
}
