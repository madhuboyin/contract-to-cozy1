// Completion reports for guidance journeys, shared by every surface that performs the same domain write.
// (Ask guided-journey continuation FRD, Phase 0)
//
// The traditional controllers report a finished recall step to the guidance engine after the write. An Ask
// confirmation that performs the same write must report it the same way, or a journey stays stuck at that step when
// the homeowner finishes in Ask. Both surfaces call the functions here so the payload cannot drift.
//
// Reporting is best-effort (a failure is logged, never thrown: the domain write already happened) and idempotent: the
// evidence row carries a dedupeKey, so replaying the same confirmation (or confirming in Ask something already done
// in the Desktop UI) does not add a second evidence row.

import { logger } from '../../lib/logger';
import { guidanceJourneyService } from './guidanceJourney.service';

export type RecallMatchReportAction = 'CONFIRM' | 'DISMISS' | 'RESOLVE';

export type RecallMatchReportRow = {
  id: string;
  propertyId?: string;
  inventoryItemId?: string | null;
  recallId?: string | null;
  status?: string | null;
  confidencePct?: number | null;
  method?: string | null;
  resolutionType?: string | null;
  resolutionNotes?: string | null;
  resolvedAt?: Date | string | null;
};

export function buildRecallMatchCompletion(
  propertyId: string,
  action: RecallMatchReportAction,
  row: RecallMatchReportRow,
) {
  const base = {
    propertyId,
    signalIntentFamily: 'recall_detected',
    issueDomain: 'SAFETY' as const,
    inventoryItemId: row.inventoryItemId ?? null,
    sourceToolKey: 'recalls',
    sourceEntityType: 'RECALL_MATCH',
    sourceEntityId: row.id,
  };
  if (action === 'CONFIRM') {
    return {
      ...base,
      stepKey: 'safety_alert',
      status: 'COMPLETED' as const,
      dedupeKey: `recalls:${propertyId}:${row.id}:confirm`,
      producedData: {
        proofType: 'recall_confirmation',
        proofId: row.id,
        status: row.status ?? null,
        confidencePct: row.confidencePct ?? null,
        method: row.method ?? null,
        recallId: row.recallId ?? null,
      },
    };
  }
  if (action === 'DISMISS') {
    return {
      ...base,
      stepKey: 'recall_resolution',
      status: 'SKIPPED' as const,
      dedupeKey: `recalls:${propertyId}:${row.id}:dismiss`,
      reasonCode: 'USER_DISMISSED',
      reasonMessage: 'User dismissed recall match.',
      producedData: {
        proofType: 'recall_dismissal',
        proofId: row.id,
        status: row.status ?? null,
        recallId: row.recallId ?? null,
      },
    };
  }
  const resolvedAt = row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null;
  return {
    ...base,
    stepKey: 'recall_resolution',
    status: 'COMPLETED' as const,
    dedupeKey: `recalls:${propertyId}:${row.id}:resolve`,
    producedData: {
      proofType: 'recall_resolution',
      proofId: row.id,
      status: row.status ?? null,
      resolutionType: row.resolutionType ?? null,
      resolutionNotes: row.resolutionNotes ?? null,
      resolvedAt,
      recallId: row.recallId ?? null,
    },
  };
}

/** Reports a recall match write to the guidance engine. Never throws. */
export async function reportRecallMatchStep(
  propertyId: string,
  action: RecallMatchReportAction,
  row: RecallMatchReportRow,
  actorUserId?: string | null,
): Promise<void> {
  try {
    await guidanceJourneyService.recordToolCompletion({
      ...buildRecallMatchCompletion(propertyId, action, row),
      ...(actorUserId ? { actorUserId } : {}),
    });
  } catch (guidanceError) {
    logger.warn({ guidanceError, action, matchId: row.id }, '[GUIDANCE] recall match completion report failed');
  }
}

// ── Do-Nothing Simulator ────────────────────────────────────────────────────────────────────────────────────────

export type DoNothingRunReportRow = {
  id: string;
  horizonMonths?: number | null;
  confidence?: string | null;
  riskScoreDelta?: number | null;
  incidentLikelihood?: string | null;
  expectedCostDeltaCentsMin?: number | null;
  expectedCostDeltaCentsMax?: number | null;
  summary?: unknown;
};

/**
 * The completion a finished simulation run reports. Desktop passes the journey id and step key the page sent; Ask passes the
 * journey step it was launched from. Both are the same domain write, so the payload (and the idempotency key) is built here.
 */
export function buildDoNothingRunCompletion(
  propertyId: string,
  run: DoNothingRunReportRow,
  target: { journeyId?: string | null; stepKey?: string | null; signalIntentFamily?: string | null },
) {
  return {
    propertyId,
    journeyId: target.journeyId ?? null,
    signalIntentFamily: target.signalIntentFamily?.trim().toLowerCase() || 'cost_of_inaction_risk',
    issueDomain: 'FINANCIAL' as const,
    sourceToolKey: 'do-nothing-simulator',
    sourceEntityType: 'DO_NOTHING_SIMULATION_RUN',
    sourceEntityId: run.id,
    stepKey: target.stepKey ?? 'compare_action_options',
    status: 'COMPLETED' as const,
    dedupeKey: `do-nothing-simulator:${propertyId}:${run.id}:${target.stepKey ?? 'compare_action_options'}`,
    producedData: {
      proofType: 'simulation_run',
      proofId: run.id,
      runId: run.id,
      horizonMonths: run.horizonMonths ?? null,
      confidence: run.confidence ?? null,
      riskScoreDelta: run.riskScoreDelta ?? null,
      incidentLikelihood: run.incidentLikelihood ?? null,
      expectedCostDeltaCentsMin: run.expectedCostDeltaCentsMin ?? null,
      expectedCostDeltaCentsMax: run.expectedCostDeltaCentsMax ?? null,
      summary: run.summary ?? null,
    },
  };
}

/** Reports a simulation run to the guidance engine. Never throws; returns whether the report was recorded. */
export async function reportDoNothingRun(
  propertyId: string,
  run: DoNothingRunReportRow,
  target: { journeyId?: string | null; stepKey?: string | null; signalIntentFamily?: string | null },
  actorUserId?: string | null,
): Promise<boolean> {
  try {
    await guidanceJourneyService.recordToolCompletion({
      ...buildDoNothingRunCompletion(propertyId, run, target),
      ...(actorUserId ? { actorUserId } : {}),
    });
    return true;
  } catch (guidanceError) {
    logger.warn({ guidanceError, runId: run.id }, '[GUIDANCE] do-nothing run completion report failed');
    return false;
  }
}
