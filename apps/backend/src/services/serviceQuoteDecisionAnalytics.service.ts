import { ProductAnalyticsEventType } from '@prisma/client';
import {
  analyticsEmitter,
  AnalyticsFeature,
  AnalyticsModule,
} from './analytics';

export const ServiceQuoteDecisionEvent = {
  INTAKE_RECORDED: 'service_quote_intake_recorded',
  READINESS_ASSESSED: 'service_quote_readiness_assessed',
  SCOPE_CHANGED_AFTER_WARNING: 'service_quote_scope_changed_after_warning',
  EVIDENCE_ASSESSED: 'service_quote_evidence_assessed',
  CLARIFICATION_REQUESTED: 'service_quote_clarification_requested',
  CLARIFICATION_RESOLVED: 'service_quote_clarification_resolved',
  COMPARISON_REACHED: 'service_quote_comparison_reached',
  DECISION_RECORDED: 'service_quote_decision_recorded',
  FINALIZATION_RECORDED: 'service_quote_finalization_recorded',
  BOOKING_RECORDED: 'service_quote_booking_recorded',
  WORK_COMPLETED: 'service_quote_work_completed',
  CHANGE_ORDER_APPROVED: 'service_quote_change_order_approved',
  DISPUTE_REPORTED: 'service_quote_dispute_reported',
  CONSENT_UPDATED: 'service_quote_outcome_consent_updated',
} as const;

export type ServiceQuoteDecisionEventName =
  typeof ServiceQuoteDecisionEvent[keyof typeof ServiceQuoteDecisionEvent];

type SafeMetadata = Record<string, string | number | boolean | null>;

export function emitServiceQuoteDecisionAnalytics(input: {
  eventName: ServiceQuoteDecisionEventName;
  eventType?: ProductAnalyticsEventType;
  userId?: string | null;
  propertyId: string;
  workspaceId?: string | null;
  metadata?: SafeMetadata;
  valueNumeric?: number | null;
}) {
  analyticsEmitter.track({
    eventType: input.eventType ?? ProductAnalyticsEventType.TOOL_USED,
    eventName: input.eventName,
    userId: input.userId ?? null,
    propertyId: input.propertyId,
    moduleKey: AnalyticsModule.MARKETPLACE,
    featureKey: AnalyticsFeature.SERVICE_PRICE_RADAR,
    metadataJson: {
      metricVersion: 'service-quote-decision-v1',
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.metadata ?? {}),
    },
    valueNumeric: input.valueNumeric ?? null,
  });
}

export function outcomeConsentAllows(
  workspace: {
    outcomeMeasurementConsentJson?: unknown;
    outcomeMeasurementConsentedAt?: Date | string | null;
    outcomeMeasurementConsentRevokedAt?: Date | string | null;
  } | null | undefined,
  field: 'finalPrice' | 'changeOrders',
): boolean {
  if (
    !workspace?.outcomeMeasurementConsentedAt
    || workspace.outcomeMeasurementConsentRevokedAt
    || !workspace.outcomeMeasurementConsentJson
    || typeof workspace.outcomeMeasurementConsentJson !== 'object'
    || Array.isArray(workspace.outcomeMeasurementConsentJson)
  ) {
    return false;
  }
  return (workspace.outcomeMeasurementConsentJson as Record<string, unknown>)[field] === true;
}
