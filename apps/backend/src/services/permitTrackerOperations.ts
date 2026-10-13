// The effects of adding, changing and removing a permit record, in one place (the Negotiation Shield D6 pattern).
//
// The desktop routes and Ask both call these, so the property-context feature gate, the project-compliance applicability check, the analytics events and
// the tool-lifecycle completion are identical whichever surface made the change. permitTracker.service.ts holds the persistence; this holds what the
// controller used to do around it.
import { APIError } from '../middleware/error.middleware';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from './analytics';
import { permitRecordCompletionEvent } from './analytics/permitHoaLifecycle';
import { recordToolLifecycleEvents } from './analytics/toolLifecycle';
import { assertProjectComplianceApplicable } from './projectCompliance/context';
import { permitTrackerService } from './permitTracker.service';

export async function createManualPermitWithEffects(propertyId: string, userId: string, body: Record<string, any>) {
  const operationInput = { workTypes: body.workTypes ?? [] };
  const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: 'PERMITS', operationKey: 'CREATE_MANUAL_PERMIT', operationInput });
  if (!evaluation.canExecute) {
    throw new APIError('Complete the required property responsibility before adding this permit.', 409, 'PROPERTY_CONTEXT_INCOMPLETE', { evaluation });
  }
  await assertProjectComplianceApplicable(propertyId, userId, 'PERMIT_TRACKER', { permitWorkTypes: operationInput.workTypes }, 'permitTracking');
  const permit = await permitTrackerService.createManualPermit(propertyId, userId, body);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PERMIT_TRACKER,
    metadataJson: { actionType: 'create_manual_permit', permitId: (permit as any)?.id },
  });
  void recordToolLifecycleEvents({
    userId, propertyId,
    events: [permitRecordCompletionEvent({
      recordId: (permit as any).id, sourceActionId: body.sourceActionId, sourceEntityType: body.sourceEntityType,
      sourceEntityId: body.sourceEntityId, sourceJourneyId: body.sourceJourneyId,
    })],
  });
  return permit;
}

export async function updatePermitWithEffects(propertyId: string, userId: string, permitId: string, patch: Record<string, any>) {
  const permit = await permitTrackerService.updatePermit(permitId, propertyId, userId, patch);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PERMIT_TRACKER,
    metadataJson: { actionType: 'update_permit', permitId },
  });
  return permit;
}

export async function deletePermitWithEffects(propertyId: string, userId: string, permitId: string) {
  await permitTrackerService.softDeletePermit(permitId, propertyId);
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PERMIT_TRACKER,
    metadataJson: { actionType: 'delete_permit', permitId },
  });
}
