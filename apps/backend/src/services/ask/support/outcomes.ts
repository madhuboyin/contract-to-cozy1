// Ask handler support: outcomes. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import * as outcomeObservationService from '../../decisionPlatform/outcomeObservationService';
import { sourceTypeLabel as outcomeSourceTypeLabel } from '../../decisionPlatform/outcomeObservationService';

export function formatOutcomeCents(cents: number | null): string | null {
  return cents == null ? null : `$${(cents / 100).toFixed(2)}`;
}

// Ask Intelligence FRD §21.5, Phase 10A. `comparable` is always false and
// `predictedCostLabel` always null for this slice -- the HVAC engine does not
// yet emit a normalized predicted cost to compare against, and §21.5
// requires the block hide the delta rather than show a non-comparable one.
export function outcomeSummaryBlock(id: string, decisionThreadId: string, rows: outcomeObservationService.OutcomeSummaryAttribution[]): AskPresentationBlock {
  return {
    type: 'OUTCOME_SUMMARY', id, title: 'Outcome for this decision', decisionThreadId,
    entries: rows.map((row) => {
      const payload = row.observation.observedPayload as { costCents?: number | null; note?: string | null } | null;
      return {
        outcomeObservationId: row.observation.id,
        recommendationSnapshotId: row.attribution.recommendationSnapshotId,
        observedType: row.observation.observedType,
        occurredAt: row.observation.occurredAt.toISOString(),
        verificationStatus: row.observation.verificationStatus,
        sourceLabel: outcomeSourceTypeLabel(row.observation.sourceType),
        relationshipType: row.attribution.relationshipType,
        attributionConfidence: row.attribution.confidence,
        reviewStatus: row.attribution.reviewStatus,
        comparable: false,
        observedCostLabel: formatOutcomeCents(typeof payload?.costCents === 'number' ? payload.costCents : null),
        predictedCostLabel: null,
        note: typeof payload?.note === 'string' ? payload.note : null,
      };
    }),
    limitation: 'A different outcome or homeowner choice does not by itself prove the recommendation was incorrect.',
  };
}
