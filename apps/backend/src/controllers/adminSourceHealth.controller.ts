// apps/backend/src/controllers/adminSourceHealth.controller.ts
//
// Home Intelligence Functional Completeness FRD Phase 7 (HI-SRC-002) — the
// one admin-reachable read for the unified source-health projection.

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { getUnifiedSourceHealth, summarizeSourceHealth } from '../services/intelligence/sourceHealthProjection.service';

export async function getSourceHealthHandler(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const sources = await getUnifiedSourceHealth();
    res.json({ success: true, data: { sources, summary: summarizeSourceHealth(sources) } });
  } catch (err) {
    logger.error({ err }, '[ADMIN-SOURCE-HEALTH] Failed to load unified source health');
    res.status(500).json({ success: false, error: { message: 'Failed to load source health' } });
  }
}
