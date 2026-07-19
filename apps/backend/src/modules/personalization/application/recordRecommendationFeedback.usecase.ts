// apps/backend/src/modules/personalization/application/recordRecommendationFeedback.usecase.ts
//
// PER-FR-011 ("capture explicit and implicit feedback separately, duplicate
// eventId ignored") + PER-FDBK-001 ("explicit negative feedback shall affect
// suppression more than implicit non-engagement"). The personalization API exposes this
// use case after property and household authorization.
import {
  findFeedbackByEventId,
  createFeedback,
  loadRecommendationSuppressionContext,
} from '../infrastructure/feedbackRepository';
import { createOrExtendSuppression } from '../infrastructure/suppressionRepository';
import { markRecommendationDismissed } from '../infrastructure/recommendationRepository';
import { decideSuppressionForFeedback } from '../domain/feedbackPolicy';
import { intakeRecommendationIncident } from '../../../services/recommendationIncident.service';
import type { RecommendationIncidentType } from '../../../productFramework/recommendationIncident.contract';

export type RecordFeedbackStatus = 'RECORDED' | 'DUPLICATE' | 'RECOMMENDATION_NOT_FOUND';

export interface RecordRecommendationFeedbackParams {
  recommendationId: string;
  eventId: string;
  type: string;
  explicit: boolean;
  reasonCode?: string | null;
  comment?: string | null;
  reportedByUserId?: string | null;
}

export interface RecordRecommendationFeedbackResult {
  status: RecordFeedbackStatus;
  suppressed: boolean;
  incidentOpened?: boolean;
}

const INCIDENT_TYPE_BY_FEEDBACK: Partial<Record<string, RecommendationIncidentType>> = {
  COMPLAINT: 'COMPLAINT',
  RECOMMENDATION_OVERRIDDEN: 'OVERRIDE',
  RECOMMENDATION_REVERSED: 'REVERSAL',
  PROFILE_CORRECTED: 'CALIBRATION',
};

export async function recordRecommendationFeedback(
  params: RecordRecommendationFeedbackParams,
): Promise<RecordRecommendationFeedbackResult> {
  const existing = await findFeedbackByEventId(params.eventId);
  if (existing) {
    // True no-op — never re-runs the suppression policy for a duplicate,
    // which is itself what keeps the suppression side effect idempotent.
    return { status: 'DUPLICATE', suppressed: false };
  }

  const context = await loadRecommendationSuppressionContext(params.recommendationId);
  if (!context) {
    return { status: 'RECOMMENDATION_NOT_FOUND', suppressed: false };
  }

  const feedback = await createFeedback({
    recommendationId: params.recommendationId,
    eventId: params.eventId,
    type: params.type,
    explicit: params.explicit,
    reasonCode: params.reasonCode,
    comment: params.comment,
  });

  const incidentType = INCIDENT_TYPE_BY_FEEDBACK[params.type];
  let incidentOpened = false;
  if (incidentType) {
    const intake = await intakeRecommendationIncident({
      definitionId: context.definitionId,
      recommendationId: params.recommendationId,
      sourceFeedbackId: feedback.id,
      type: incidentType,
      summary: `${params.type.split('_').join(' ')} reported for ${context.definitionCode}`,
      details: params.comment ?? params.reasonCode ?? null,
      reportedByUserId: params.reportedByUserId ?? null,
    });
    incidentOpened = intake.created;
  }

  const directive = decideSuppressionForFeedback(params.type, params.explicit);
  if (!directive) {
    return { status: 'RECORDED', suppressed: false, ...(incidentOpened ? { incidentOpened: true } : {}) };
  }

  await createOrExtendSuppression({
    propertyId: context.propertyId,
    definitionId: context.definitionId,
    reason: directive.reason,
    until: directive.until,
  });
  await markRecommendationDismissed(params.recommendationId);

  return { status: 'RECORDED', suppressed: true, ...(incidentOpened ? { incidentOpened: true } : {}) };
}
