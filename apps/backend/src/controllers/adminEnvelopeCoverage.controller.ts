import type { Response } from 'express';
import type { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { getAdminEnvelopeCoverageReport } from '../services/adminEnvelopeCoverage.service';

export async function getAdminEnvelopeCoverageHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeRetired = req.query.includeRetired === 'true';
    const parsedLimit = Number.parseInt(String(req.query.runLimit ?? '20'), 10);
    const report = await getAdminEnvelopeCoverageReport({
      includeRetired,
      runLimit: Number.isFinite(parsedLimit) ? parsedLimit : 20,
    });
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error({ err }, '[ADMIN-ENVELOPE-COVERAGE] Failed to load coverage report');
    res.status(500).json({ success: false, error: { message: 'Failed to load Envelope coverage report' } });
  }
}
