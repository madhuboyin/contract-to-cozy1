// The effects of creating, editing and finalizing a Price Finalization, in one place (the Negotiation Shield D6 pattern).
//
// The desktop routes and Ask both call these, so the project-compliance applicability gate, the property-context version stamped into the record's
// metadata, the analytics event and, on finalize, the guided-journey completion are identical whichever surface made the change. The service
// (priceFinalization.service.ts) holds the persistence; this holds what the controller used to do around it.
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { assertProjectComplianceDecisionsApplicable } from './projectCompliance/context';
import { priceFinalizationService } from './priceFinalization.service';
import { resolveGuidanceStepBindingByKey } from './guidanceEngine/guidanceStepBinding';
import type {
  PriceFinalizationCreateInput, PriceFinalizationDetailDTO, PriceFinalizationFinalizeInput, PriceFinalizationUpdateInput,
} from './priceFinalization.types';

const GATE_DECISIONS = ['priceFinalization', 'providerBooking'] as const;

export function inferIssueDomainFromSignalFamily(signalIntentFamily?: string | null) {
  const family = String(signalIntentFamily ?? '').trim().toLowerCase();
  if (family === 'inspection_followup_needed') return 'MAINTENANCE' as const;
  if (family === 'financial_exposure' || family === 'cost_of_inaction_risk') return 'FINANCIAL' as const;
  if (family === 'coverage_gap' || family === 'coverage_lapse_detected') return 'INSURANCE' as const;
  return 'ASSET_LIFECYCLE' as const;
}

export async function createPriceFinalizationDraftWithEffects(
  propertyId: string, userId: string, payload: PriceFinalizationCreateInput,
): Promise<{ detail: PriceFinalizationDetailDTO; contextVersion: string }> {
  const serviceCategory = await priceFinalizationService.resolveServiceCategory(propertyId, userId, payload as never);
  const currentContext = await assertProjectComplianceDecisionsApplicable(
    propertyId, userId, 'PRICE_FINALIZATION', { serviceCategory: (serviceCategory ?? 'UNSPECIFIED') as never }, [...GATE_DECISIONS],
  );
  const detail = await priceFinalizationService.createDraft(propertyId, userId, {
    ...payload,
    serviceCategory: payload.serviceCategory ?? serviceCategory,
    metadataJson: { ...(payload.metadataJson ?? {}), _propertyContextVersion: currentContext.contextVersion },
  });
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PRICE_FINALIZATION,
    metadataJson: { actionType: 'create_draft', finalizationId: detail.id, serviceCategory: detail.serviceCategory },
  });
  return { detail, contextVersion: currentContext.contextVersion };
}

export async function updatePriceFinalizationDraftWithEffects(
  propertyId: string, userId: string, finalizationId: string, payload: PriceFinalizationUpdateInput,
): Promise<{ detail: PriceFinalizationDetailDTO; contextVersion: string }> {
  const existing = await priceFinalizationService.getDetail(propertyId, userId, finalizationId);
  const currentContext = await assertProjectComplianceDecisionsApplicable(
    propertyId, userId, 'PRICE_FINALIZATION', { serviceCategory: (payload.serviceCategory ?? existing.serviceCategory ?? 'UNSPECIFIED') as never }, [...GATE_DECISIONS],
  );
  const detail = await priceFinalizationService.updateDraft(propertyId, userId, finalizationId, {
    ...payload,
    metadataJson: { ...(existing.metadataJson ?? {}), ...(payload.metadataJson ?? {}), _propertyContextVersion: currentContext.contextVersion },
  });
  return { detail, contextVersion: currentContext.contextVersion };
}

export async function finalizePriceFinalizationWithEffects(
  propertyId: string, userId: string, finalizationId: string,
  payload: PriceFinalizationFinalizeInput & { guidanceStepKey?: string | null; guidanceSignalIntentFamily?: string | null },
): Promise<{ detail: PriceFinalizationDetailDTO; contextVersion: string; guidanceReported: boolean | null }> {
  const existing = await priceFinalizationService.getDetail(propertyId, userId, finalizationId);
  const currentContext = await assertProjectComplianceDecisionsApplicable(
    propertyId, userId, 'PRICE_FINALIZATION', { serviceCategory: (payload.serviceCategory ?? existing.serviceCategory ?? 'UNSPECIFIED') as never }, [...GATE_DECISIONS],
  );
  const detail = await priceFinalizationService.finalize(propertyId, userId, finalizationId, {
    ...payload,
    metadataJson: { ...(existing.metadataJson ?? {}), ...(payload.metadataJson ?? {}), _propertyContextVersion: currentContext.contextVersion },
  });

  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PRICE_FINALIZATION,
    metadataJson: { actionType: 'finalize', finalizationId: detail.id, acceptedPrice: detail.acceptedPrice, serviceCategory: detail.serviceCategory },
  });

  // A record that stored its journey and step is bound to exactly that step: if it is no longer this tool's open step nothing is reported, and the signal family
  // is never used instead. A record with no stored journey keeps the older behaviour (the caller's step key, else the family) as a compatibility path.
  let guidanceReported: boolean | null = null;
  if (detail.guidanceJourneyId) {
    const bound = await resolveGuidanceStepBindingByKey(propertyId, detail.guidanceJourneyId, detail.guidanceStepKey || 'finalize_price', { toolKey: 'price-finalization' });
    if (!bound.ok) return { detail, contextVersion: currentContext.contextVersion, guidanceReported: bound.reason === 'STEP_DONE' ? null : false };
  }
  const resolvedStepKey = detail.guidanceStepKey || (typeof payload.guidanceStepKey === 'string' ? payload.guidanceStepKey : null) || 'finalize_price';
  const resolvedSignalFamily = detail.guidanceSignalIntentFamily
    || (typeof payload.guidanceSignalIntentFamily === 'string' ? payload.guidanceSignalIntentFamily : null) || 'lifecycle_end_or_past_life';
  try {
    await guidanceJourneyService.recordToolCompletion({
      propertyId, actorUserId: userId, journeyId: detail.guidanceJourneyId, signalIntentFamily: resolvedSignalFamily,
      issueDomain: inferIssueDomainFromSignalFamily(resolvedSignalFamily), sourceToolKey: 'price-finalization', sourceEntityType: 'PRICE_FINALIZATION',
      sourceEntityId: detail.id, stepKey: resolvedStepKey, status: 'COMPLETED', inventoryItemId: detail.inventoryItemId,
      producedData: {
        proofType: 'price_finalization', proofId: detail.id, finalizationId: detail.id, acceptedPrice: detail.acceptedPrice, currency: detail.currency,
        vendorName: detail.vendorName, serviceCategory: detail.serviceCategory, termsAcceptedCount: detail.terms.filter((term) => term.isAccepted).length,
      },
    });
    guidanceReported = detail.guidanceJourneyId ? true : null;
  } catch (guidanceError) {
    if (detail.guidanceJourneyId) guidanceReported = false;
    logger.warn({ guidanceError }, '[GUIDANCE] price finalization hook failed');
  }
  return { detail, contextVersion: currentContext.contextVersion, guidanceReported };
}
