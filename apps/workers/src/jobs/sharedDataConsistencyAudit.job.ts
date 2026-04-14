import { sharedDataBackfillService } from '../../../backend/src/services/sharedDataBackfill.service';
import { logger } from '../lib/logger';

type SharedDataConsistencyAuditResult = {
  propertiesEvaluated: number;
  issueCount: number;
  readyProperties: number;
  partialProperties: number;
  legacyHeavyProperties: number;
};

export async function runSharedDataConsistencyAuditJob(): Promise<SharedDataConsistencyAuditResult> {
  const limitEnv = Number(process.env.SHARED_DATA_AUDIT_LIMIT ?? '0');
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? Math.floor(limitEnv) : undefined;

  const [consistency, readiness] = await Promise.all([
    sharedDataBackfillService.getConsistencyReport({ limit }),
    sharedDataBackfillService.getReadinessReport({ limit }),
  ]);

  logger.info(
    `[shared-data-consistency-audit] properties=${consistency.propertiesEvaluated} issues=${consistency.issueCount} ` +
      `ready=${readiness.summary.ready} partial=${readiness.summary.partial} legacyHeavy=${readiness.summary.legacyHeavy}`,
  );

  return {
    propertiesEvaluated: consistency.propertiesEvaluated,
    issueCount: consistency.issueCount,
    readyProperties: readiness.summary.ready,
    partialProperties: readiness.summary.partial,
    legacyHeavyProperties: readiness.summary.legacyHeavy,
  };
}
