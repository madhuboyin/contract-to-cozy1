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
import type { FeedbackSurface, FeedbackTargetType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { recordTypedFeedback } from '../../../services/feedback/typedFeedback.service';
import type { FeedbackReasonCode } from '../../../productFramework/feedback.contract';

export type RecordFeedbackStatus = 'RECORDED' | 'DUPLICATE' | 'RECOMMENDATION_NOT_FOUND';

export interface RecordRecommendationFeedbackParams {
  recommendationId: string;
  eventId: string;
  type: string;
  explicit: boolean;
  reasonCode?: string | null;
  comment?: string | null;
  reportedByUserId?: string | null;
  surface?: FeedbackSurface;
  targetType?: FeedbackTargetType;
  targetId?: string;
  contextVersion?: string | null;
  capabilityId?: string | null;
  capabilityVersion?: string | null;
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

function canonicalReasonCodes(type: string, reasonCode?: string | null): FeedbackReasonCode[] {
  const reasons: FeedbackReasonCode[] = [];
  if (['ACCEPTED', 'COMPLETED', 'SAVED', 'EXPANDED', 'VENDOR_CLICKED'].includes(type)) reasons.push('USEFUL');
  if (['DISMISSED', 'NOT_RELEVANT', 'SNOOZED', 'COMPLAINT', 'RECOMMENDATION_OVERRIDDEN', 'RECOMMENDATION_REVERSED'].includes(type)) reasons.push('NOT_USEFUL');
  const mapped: Partial<Record<string, FeedbackReasonCode>> = {
    ALREADY_DONE: 'ALREADY_HANDLED',
    NOT_APPLICABLE: 'NOT_APPLICABLE',
    BAD_TIMING: 'WRONG_TIMING',
    WRONG_PROFILE: 'WRONG_FACT',
  };
  const detail = reasonCode ? mapped[reasonCode] : undefined;
  if (detail && !reasons.includes(detail)) reasons.push(detail);
  return reasons;
}

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

  const feedback = await prisma.$transaction(async (tx) => {
    const saved = await createFeedback({
      recommendationId: params.recommendationId,
      eventId: params.eventId,
      type: params.type,
      explicit: params.explicit,
      reasonCode: params.reasonCode,
      comment: params.comment,
    }, tx);
    // RecommendationFeedback remains the append-only lifecycle/suppression
    // ledger. Explicit homeowner interpretation is also written to the one
    // typed Feedback contract in the same transaction, so quality and
    // personalization can no longer disagree about whether it happened.
    if (params.explicit && params.reportedByUserId) {
      await recordTypedFeedback({
        userId: params.reportedByUserId,
        propertyId: context.propertyId,
        page: 'personalization',
        rating: canonicalReasonCodes(params.type, params.reasonCode).includes('USEFUL') ? 'up' : 'down',
        comment: params.comment ?? null,
        targetType: params.targetType ?? 'OTHER',
        targetId: params.targetId ?? params.recommendationId,
        surface: params.surface ?? 'HOME',
        reasonCodes: canonicalReasonCodes(params.type, params.reasonCode),
        contextVersion: params.contextVersion ?? null,
        capabilityId: params.capabilityId ?? null,
        capabilityVersion: params.capabilityVersion ?? null,
      }, tx);
    }
    return saved;
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
