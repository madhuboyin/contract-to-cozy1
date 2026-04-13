import { Request, Response } from 'express';
import { sharedDataBackfillService } from '../services/sharedDataBackfill.service';
import { signalService } from '../services/signal.service';
import { logger } from '../lib/logger';

function parseScope(req: Request): { propertyId?: string; limit?: number; startAfterPropertyId?: string } {
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
  const startAfterPropertyId =
    typeof req.query.startAfterPropertyId === 'string' ? req.query.startAfterPropertyId : undefined;
  const parsedLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  return {
    propertyId,
    startAfterPropertyId,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
  };
}

export async function runSharedDataBackfillHandler(req: Request, res: Response): Promise<void> {
  try {
    const summary = await sharedDataBackfillService.runBackfill({
      propertyId: typeof req.body?.propertyId === 'string' ? req.body.propertyId : undefined,
      dryRun: typeof req.body?.dryRun === 'boolean' ? req.body.dryRun : true,
      limit: Number.isFinite(Number(req.body?.limit)) ? Number(req.body.limit) : undefined,
      startAfterPropertyId:
        typeof req.body?.startAfterPropertyId === 'string' ? req.body.startAfterPropertyId : undefined,
      includePreference:
        typeof req.body?.includePreference === 'boolean' ? req.body.includePreference : undefined,
      includeAssumptions:
        typeof req.body?.includeAssumptions === 'boolean' ? req.body.includeAssumptions : undefined,
      includeSignals: typeof req.body?.includeSignals === 'boolean' ? req.body.includeSignals : undefined,
    });

    res.json({ success: true, data: summary });
  } catch (error: any) {
    logger.error('[ADMIN-SHARED-DATA] Failed to run backfill:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error?.message || 'Failed to run shared data backfill.',
      },
    });
  }
}

export async function getSharedDataReadinessHandler(req: Request, res: Response): Promise<void> {
  try {
    const report = await sharedDataBackfillService.getReadinessReport(parseScope(req));
    res.json({ success: true, data: report });
  } catch (error: any) {
    logger.error('[ADMIN-SHARED-DATA] Failed to build readiness report:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error?.message || 'Failed to build shared data readiness report.',
      },
    });
  }
}

export async function getSharedDataConsistencyHandler(req: Request, res: Response): Promise<void> {
  try {
    const report = await sharedDataBackfillService.getConsistencyReport(parseScope(req));
    res.json({ success: true, data: report });
  } catch (error: any) {
    logger.error('[ADMIN-SHARED-DATA] Failed to build consistency report:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error?.message || 'Failed to build shared data consistency report.',
      },
    });
  }
}

export async function getSharedSignalHealthHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : undefined;
    const lookbackDays = Number.isFinite(Number(req.query.lookbackDays))
      ? Number(req.query.lookbackDays)
      : undefined;

    const health = await signalService.getSignalHealthOverview({
      propertyId,
      limit,
      lookbackDays,
    });

    res.json({ success: true, data: health });
  } catch (error: any) {
    logger.error('[ADMIN-SHARED-DATA] Failed to build signal health report:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error?.message || 'Failed to build signal health report.',
      },
    });
  }
}

export async function getSharedDataDiagnosticsHandler(req: Request, res: Response): Promise<void> {
  try {
    const diagnostics = await sharedDataBackfillService.getOperationalDiagnostics(parseScope(req));
    res.json({ success: true, data: diagnostics });
  } catch (error: any) {
    logger.error('[ADMIN-SHARED-DATA] Failed to build operational diagnostics report:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error?.message || 'Failed to build operational diagnostics report.',
      },
    });
  }
}
