// Project creation, with everything that has to happen around it, in one place (the price-finalization and coverage-decision pattern).
//
// The Desktop controller and the Ask confirmation both create projects. They used to differ: the page ran the property-responsibility gate and the compliance
// applicability check, emitted the create analytics event and the first-milestone lifecycle event, and reported the journey step; Ask ran none of them. Both now call
// this function, so the gates, the initial milestone lifecycle event, the journey linkage and proof, the analytics and the idempotency rule cannot drift again.
//
// Idempotency: the project service has no idempotency key, so a retry of the same operation is recognised by the caller's own anchor: `reuseCreatedSince` is the time the
// operation began, and a project of the same name created since then is that operation's own earlier write (a replayed confirmation). The page passes none.

import * as svc from './projectTracker.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from './analytics';
import { assertProjectComplianceApplicable } from './projectCompliance/context';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { APIError } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';
import { recordToolLifecycleEvents } from './analytics/toolLifecycle';
import { hasTrackableProjectMilestone, projectMilestonePlanCompletionEvent } from './analytics/projectTrackerLifecycle';
import { reportProjectCreated } from './guidanceEngine/projectJourneyReporting';

type CreateBody = Parameters<typeof svc.createProject>[1] & {
  serviceCategory?: string; homeSystemsAffected?: unknown[]; guidanceJourneyId?: string | null; inventoryItemId?: string | null;
  executionPath?: string | null; fundingMode?: string | null; complexity?: string | null; fulfillmentMode?: string | null;
  sourceActionId?: string; sourceEntityType?: string; sourceEntityId?: string; sourceJourneyId?: string;
};

export type CreateProjectResult = {
  project: any;
  /** True when this call found its own earlier write and did nothing again. */
  reused: boolean;
  /** Whether the journey step was updated: null when no journey was named (or the project was reused), false when the report failed. */
  guidanceReported: boolean | null;
  work: { projectType: unknown; serviceCategory: unknown; homeSystemsAffected: unknown[] };
};

export async function createProjectWithEffects(
  propertyId: string, userId: string, body: CreateBody, options: { reuseCreatedSince?: Date } = {},
): Promise<CreateProjectResult> {
  const work = { projectType: (body as any).projectType, serviceCategory: body.serviceCategory, homeSystemsAffected: body.homeSystemsAffected ?? [] };
  const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: 'PROJECTS', operationKey: 'CREATE_PROJECT', operationInput: work as never });
  if (!evaluation.canExecute) {
    throw new APIError('Complete the required property responsibility before creating this project.', 409, 'PROPERTY_CONTEXT_INCOMPLETE', { evaluation });
  }
  await assertProjectComplianceApplicable(propertyId, userId, 'PROJECT_TRACKER', work as never, 'ownerProjectExecution');

  if (options.reuseCreatedSince) {
    const earlier = await prisma.projectRecord.findFirst({
      where: { propertyId, name: (body as any).name, createdAt: { gte: options.reuseCreatedSince } }, select: { id: true },
    });
    if (earlier) return { project: earlier, reused: true, guidanceReported: null, work };
  }

  const project = await svc.createProject(propertyId, { ...body, actingUserId: userId } as never) as any;

  let guidanceReported: boolean | null = null;
  if (body.guidanceJourneyId) {
    guidanceReported = await reportProjectCreated(propertyId, userId, {
      projectId: project.id, journeyId: body.guidanceJourneyId, inventoryItemId: body.inventoryItemId ?? null,
      executionPath: body.executionPath ?? null, fulfillmentMode: body.fulfillmentMode, fundingMode: body.fundingMode, complexity: body.complexity,
    });
  }

  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.PROJECT_TRACKER,
    metadataJson: { actionType: 'create_project', projectId: project?.id },
  });
  const firstMilestone = project.milestones?.[0];
  if (hasTrackableProjectMilestone(firstMilestone)) {
    void recordToolLifecycleEvents({
      userId, propertyId,
      events: [projectMilestonePlanCompletionEvent({
        projectId: project.id, milestoneId: firstMilestone.id, operation: 'project_created_with_milestone',
        sourceActionId: body.sourceActionId, sourceEntityType: body.sourceEntityType, sourceEntityId: body.sourceEntityId,
        sourceJourneyId: body.sourceJourneyId ?? body.guidanceJourneyId ?? undefined,
      })],
    });
  }
  return { project, reused: false, guidanceReported, work };
}
