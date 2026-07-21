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

// ─── node-cron job metrics ───────────────────────────────────────────────────
// Registry-driven cron jobs (scheduleCronJobs() in worker.ts) don't run
// through BullMQ, so they get none of the metrics above. These cover every
// job in workerJobRegistry.ts generically, not just the weather jobs.

export const cronJobRunsTotal = new Counter({
  name: 'cron_job_runs_total',
  help: 'Total number of node-cron job runs, by outcome',
  labelNames: ['job_key', 'status'] as const, // status: success|failure
  registers: [register],
});

export const cronJobDurationSeconds = new Histogram({
  name: 'cron_job_duration_seconds',
  help: 'node-cron job run duration in seconds',
  labelNames: ['job_key'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

// Unix timestamp (seconds) of each job's last successful run — the standard
// "dead man's switch" metric: alert on
// `time() - cron_job_last_success_timestamp_seconds{job_key="..."} > threshold`
// to catch a job that has silently stopped succeeding (e.g. an upstream API
// rejecting our requests, a regression that always throws) well before
// anyone notices on the dashboard.
export const cronJobLastSuccessTimestamp = new Gauge({
  name: 'cron_job_last_success_timestamp_seconds',
  help: 'Unix timestamp of each cron job\'s last successful run',
  labelNames: ['job_key'] as const,
  registers: [register],
});

// ─── Severe weather alerts job metrics ───────────────────────────────────────

export const nwsFetchOutcomeTotal = new Counter({
  name: 'nws_fetch_outcome_total',
  help: 'Outcome of each NWS alerts/active fetch call',
  labelNames: ['outcome'] as const, // ok|http_error|timeout|error
  registers: [register],
});

export const severeWeatherIncidentsTotal = new Counter({
  name: 'severe_weather_incidents_total',
  help: 'Severe-weather incidents created/updated or resolved by severeWeatherAlertsJob',
  labelNames: ['action'] as const, // created_or_updated|resolved
  registers: [register],
});

// ─── Metrics HTTP server ─────────────────────────────────────────────────────

const METRICS_PORT = Number(process.env.METRICS_PORT) || 9091;

export function startMetricsServer(): http.Server {
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

  // W5 item 7 (graceful shutdown): returning the server lets the caller
  // close it on SIGTERM instead of leaving the listener open indefinitely.
  return server;
}
