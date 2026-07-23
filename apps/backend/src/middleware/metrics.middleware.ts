import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../lib/metrics';

function normalizedMetricPath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

/**
 * Express middleware that records HTTP request count and duration.
 * Route label uses the matched Express route pattern (e.g. /api/properties/:id)
 * rather than the raw URL to avoid high cardinality from path parameters.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime();

  res.on('finish', () => {
    const [sec, ns] = process.hrtime(start);
    const duration = sec + ns / 1e9;

    // Use the matched route pattern when available, otherwise fall back to the
    // normalised path with numeric segments replaced so cardinality stays low.
    const route =
      req.route?.path
        ? `${req.baseUrl ?? ''}${req.route.path}`
        : normalizedMetricPath(req.path);

    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, duration);
  });

  next();
}
