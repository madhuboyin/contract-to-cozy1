// apps/backend/src/routes/cspReport.routes.ts
//
// Receives Content Security Policy violation reports from browsers.
//
// Browsers send reports as POST with Content-Type: application/csp-report
// (old CSP Level 2 format) or application/reports+json (new Reporting API).
// Both are tiny JSON payloads; the body limit is capped at 4 KB.
//
// This route MUST be mounted BEFORE the CSRF middleware in index.ts because
// violation reports are browser-automated POSTs with no CSRF token or
// Authorization header.

import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger';

const router = Router();

// Accept both the old csp-report content-type and the new reports+json type
router.post(
  '/csp-report',
  (req: Request, res: Response) => {
    try {
      const body = req.body;

      // New Reporting API sends an array; old CSP Level 2 sends a single object
      const reports: any[] = Array.isArray(body) ? body : [body];

      for (const report of reports) {
        const violation = report?.['csp-report'] ?? report?.body ?? report;
        logger.warn(
          {
            type: 'CSP_VIOLATION',
            documentUri:       violation?.['document-uri']       ?? violation?.documentURL,
            blockedUri:        violation?.['blocked-uri']        ?? violation?.blockedURL,
            violatedDirective: violation?.['violated-directive'] ?? violation?.effectiveDirective,
            originalPolicy:    violation?.['original-policy'],
            disposition:       violation?.disposition,
            statusCode:        violation?.['status-code']        ?? violation?.statusCode,
            referrer:          violation?.referrer,
            // Omit sample/sourceFile — can contain user-specific path info
          },
          'CSP violation report received'
        );
      }
    } catch {
      // Never let a malformed report body crash the server
    }

    // 204 No Content — browsers don't process the response
    res.status(204).end();
  }
);

export default router;
