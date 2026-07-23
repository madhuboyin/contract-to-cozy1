import { signalService } from '@worker-shared/services/signal.service';
import { logger, AppLogger } from '../lib/logger';

export type SharedSignalHealthAuditSummary = {
  propertiesEvaluated: number;
  totalSignals: number;
  staleSignals: number;
  lowConfidenceSignals: number;
  interactionSignals: number;
};

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface SharedSignalHealthAuditDeps {
  signalService: Pick<typeof signalService, 'getSignalHealthOverview'>;
  logger: AppLogger;
}

const defaultDeps: SharedSignalHealthAuditDeps = { signalService, logger };

export async function runSharedSignalHealthAuditJob(
  deps: SharedSignalHealthAuditDeps = defaultDeps,
): Promise<SharedSignalHealthAuditSummary> {
  const { signalService, logger } = deps;
  const limitEnv = Number(process.env.SHARED_SIGNAL_AUDIT_LIMIT ?? '0');
  const lookbackEnv = Number(process.env.SHARED_SIGNAL_AUDIT_LOOKBACK_DAYS ?? '120');

  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? Math.floor(limitEnv) : 120;
  const lookbackDays = Number.isFinite(lookbackEnv) && lookbackEnv > 0 ? Math.floor(lookbackEnv) : 120;

  const overview = await signalService.getSignalHealthOverview({
    limit,
    lookbackDays,
  });

  logger.info(
    `[shared-signal-health-audit] properties=${overview.propertiesEvaluated} totalSignals=${overview.totals.totalSignals} ` +
      `stale=${overview.totals.staleSignals} lowConfidence=${overview.totals.lowConfidenceSignals} interactions=${overview.totals.interactionSignals}`,
  );

  return {
    propertiesEvaluated: overview.propertiesEvaluated,
    totalSignals: overview.totals.totalSignals,
    staleSignals: overview.totals.staleSignals,
    lowConfidenceSignals: overview.totals.lowConfidenceSignals,
    interactionSignals: overview.totals.interactionSignals,
  };
}
