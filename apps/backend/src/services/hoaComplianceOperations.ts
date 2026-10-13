// The side effects of the HOA Compliance writes (FRD v1.328), shared by the routes' controller and by Ask so that the property-context gate, the
// project-compliance applicability check, analytics and the tool-lifecycle completion are not copied: a second caller gets exactly what the route does.
import type { HouseholdRole } from '@prisma/client';
import { hoaComplianceService } from './hoaCompliance.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { assertProjectComplianceDecisionsApplicable, getProjectComplianceEnvelope } from './projectCompliance/context';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { APIError } from '../middleware/error.middleware';
import { recordToolLifecycleEvents } from './analytics/toolLifecycle';
import { hoaApprovalRecordCompletionEvent } from './analytics/permitHoaLifecycle';

const track = (userId: string | undefined, propertyId: string, actionType: string, extra: Record<string, unknown> = {}) => analyticsEmitter.track({
  eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.COMMUNITY, featureKey: AnalyticsFeature.HOA_COMPLIANCE,
  metadataJson: { actionType, ...extra },
});

export async function upsertHoaAssociationWithEffects(input: { propertyId: string; userId: string; body: any }) {
  const association = await hoaComplianceService.upsertAssociation(input.propertyId, input.body);
  const propertyContext = await getProjectComplianceEnvelope(input.propertyId, input.userId, 'HOA_COMPLIANCE');
  track(input.userId, input.propertyId, 'upsert_association');
  return { association, propertyContext };
}

export async function createHoaApprovalRecordWithEffects(input: { propertyId: string; userId: string; role: HouseholdRole; body: any }) {
  const { propertyId, userId, role, body } = input;
  const work = { hoaWorkTypes: [body.workType] };
  await assertProjectComplianceDecisionsApplicable(propertyId, userId, 'HOA_COMPLIANCE', work, ['hoaCompliance']);
  const evaluation = await evaluateFeatureContext(propertyId, userId, {
    featureKey: 'HOA_COMPLIANCE', operationKey: 'CREATE_APPROVAL_RECORD', operationInput: { workType: body.workType },
  });
  if (!evaluation.canExecute) {
    throw new APIError('Complete the required property responsibility before tracking this HOA approval.', 409, 'PROPERTY_CONTEXT_INCOMPLETE', { evaluation });
  }
  await assertProjectComplianceDecisionsApplicable(propertyId, userId, 'HOA_COMPLIANCE', work, ['ownerProjectExecution']);
  const record = await hoaComplianceService.createApprovalRecord(propertyId, userId, body, role);
  const propertyContext = await getProjectComplianceEnvelope(propertyId, userId, 'HOA_COMPLIANCE', work);
  track(userId, propertyId, 'create_approval_record', { recordId: (record as any)?.id });
  void recordToolLifecycleEvents({
    userId, propertyId,
    events: [hoaApprovalRecordCompletionEvent({
      recordId: (record as any).id, sourceActionId: body.sourceActionId, sourceEntityType: body.sourceEntityType,
      sourceEntityId: body.sourceEntityId, sourceJourneyId: body.sourceJourneyId,
    })],
  });
  return { record, propertyContext };
}

export async function reportHoaViolationWithEffects(input: { propertyId: string; userId: string; body: any }) {
  const incident = await hoaComplianceService.reportViolation(input.propertyId, input.userId, input.body);
  track(input.userId, input.propertyId, 'report_violation', { incidentId: (incident as any)?.id });
  return incident;
}
