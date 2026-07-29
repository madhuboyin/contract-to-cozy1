import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import * as svc from '../services/projectTracker.service';
import {
  getProjectExecutionAlignment as getExecutionAlignment,
  markProjectExecutionReconciliationError,
  reconcileProjectExecution,
} from '../services/renovationExecution.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import {
  assertProjectComplianceApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { APIError } from '../middleware/error.middleware';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';
import {
  hasTrackableProjectMilestone,
  projectMilestonePlanCompletionEvent,
  projectProgressCompletionEvent,
} from '../services/analytics/projectTrackerLifecycle';

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const [data, propertyContext] = await Promise.all([
      svc.listProjects(req.params.propertyId),
      getProjectComplianceEnvelope(req.params.propertyId, req.user!.userId, 'PROJECT_TRACKER'),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { count: Array.isArray(data) ? data.length : undefined },
    });

    res.json({ success: true, data, propertyContext });
  } catch (err) { next(err); }
}

export async function getProviderExecutionReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const serviceCategory = String(req.query.serviceCategory ?? '').trim();
    if (!serviceCategory) throw new APIError('serviceCategory is required.', 400, 'SERVICE_CATEGORY_REQUIRED');
    const data = await svc.getProviderExecutionReadiness(
      req.params.propertyId,
      req.params.providerId,
      serviceCategory,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const work = {
      projectType: req.body.projectType,
      serviceCategory: req.body.serviceCategory,
      homeSystemsAffected: req.body.homeSystemsAffected ?? [],
    };
    const evaluation = await evaluateFeatureContext(req.params.propertyId, req.user!.userId, {
      featureKey: 'PROJECTS',
      operationKey: 'CREATE_PROJECT',
      operationInput: work,
    });
    if (!evaluation.canExecute) {
      throw new APIError(
        'Complete the required property responsibility before creating this project.',
        409,
        'PROPERTY_CONTEXT_INCOMPLETE',
        { evaluation },
      );
    }
    await assertProjectComplianceApplicable(
      req.params.propertyId,
      req.user!.userId,
      'PROJECT_TRACKER',
      work,
      'ownerProjectExecution',
    );
    const data = await svc.createProject(req.params.propertyId, req.body);
    if (req.body.guidanceJourneyId) {
      try {
        await guidanceJourneyService.recordToolCompletion({
          propertyId: req.params.propertyId,
          actorUserId: req.user!.userId,
          journeyId: req.body.guidanceJourneyId,
          inventoryItemId: req.body.inventoryItemId ?? null,
          sourceToolKey: 'project-tracker',
          sourceEntityType: 'PROJECT',
          sourceEntityId: (data as any).id,
          stepKey: 'confirm_scope_and_provider',
          status: 'COMPLETED',
          producedData: {
            proofType: 'project_scope_confirmation',
            proofId: (data as any).id,
            projectId: (data as any).id,
            executionPath: req.body.executionPath ?? null,
            fulfillmentMode: req.body.fulfillmentMode ?? 'PROVIDER',
            fundingMode: req.body.fundingMode ?? 'SELF_PAID',
            complexity: req.body.complexity ?? 'MAJOR',
          },
        });
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[PHASE3] project handoff guidance hook failed');
      }
    }
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      req.user!.userId,
      'PROJECT_TRACKER',
      work,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { actionType: 'create_project', projectId: (data as any)?.id },
    });
    const firstMilestone = (data as any).milestones?.[0];
    if (hasTrackableProjectMilestone(firstMilestone)) {
      void recordToolLifecycleEvents({
        userId: req.user!.userId,
        propertyId: req.params.propertyId,
        events: [projectMilestonePlanCompletionEvent({
          projectId: (data as any).id,
          milestoneId: firstMilestone.id,
          operation: 'project_created_with_milestone',
          sourceActionId: req.body.sourceActionId,
          sourceEntityType: req.body.sourceEntityType,
          sourceEntityId: req.body.sourceEntityId,
          sourceJourneyId:
            req.body.sourceJourneyId ?? req.body.guidanceJourneyId,
        })],
      });
    }

    res.status(201).json({ success: true, data, propertyContext });
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getProjectDetail(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getReconciliationLedger(req: Request, res: Response, next: NextFunction) {
  try {
    const writeBacks = await svc.listProjectWriteBacks(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data: { writeBacks } });
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateProject(req.params.projectId, req.params.propertyId, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function cancelProject(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.cancelProject(req.params.projectId, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getMilestoneTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const projectType = req.query.projectType as string;
    if (!projectType) {
      return res.status(400).json({ success: false, error: { message: 'projectType query param is required', code: 'VALIDATION_ERROR' } });
    }
    const templates = svc.getMilestoneTemplate(projectType);
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
}

// ── Milestones ────────────────────────────────────────────────────────────────

export async function listMilestones(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listMilestones(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createMilestone(req.params.projectId, req.params.propertyId, req.body);
    const project = await svc.getProjectDetail(
      req.params.projectId,
      req.params.propertyId,
    );
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId: req.params.propertyId,
      events: [projectMilestonePlanCompletionEvent({
        projectId: req.params.projectId,
        milestoneId: (data as any).id,
        operation: 'milestone_added',
        sourceActionId: (project as any).sourceActionId,
        sourceEntityType: (project as any).sourceEntityType,
        sourceEntityId: (project as any).sourceEntityId,
        sourceJourneyId:
          (project as any).sourceJourneyId
          ?? (project as any).guidanceJourneyId,
      })],
    });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateMilestone(
      req.params.milestoneId, req.params.projectId, req.params.propertyId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function completeMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.completeMilestone(
      req.params.milestoneId, req.params.projectId, req.params.propertyId,
      req.user!.userId, req.body,
    );
    const project = await svc.getProjectDetail(
      req.params.projectId,
      req.params.propertyId,
    );
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId: req.params.propertyId,
      events: [projectProgressCompletionEvent({
        projectId: req.params.projectId,
        milestoneId: req.params.milestoneId,
        requiresPhotoEvidence: (data as any).requiresPhotoEvidence,
        sourceActionId: (project as any).sourceActionId,
        sourceEntityType: (project as any).sourceEntityType,
        sourceEntityId: (project as any).sourceEntityId,
        sourceJourneyId:
          (project as any).sourceJourneyId
          ?? (project as any).guidanceJourneyId,
      })],
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteMilestone(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteMilestone(req.params.milestoneId, req.params.projectId, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function listPayments(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listPayments(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createPayment(req.params.projectId, req.params.propertyId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updatePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updatePayment(
      req.params.paymentId, req.params.projectId, req.params.propertyId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function markPaymentPaid(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.markPaymentPaid(
      req.params.paymentId, req.params.projectId, req.params.propertyId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deletePayment(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deletePayment(req.params.paymentId, req.params.projectId, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Change Orders ─────────────────────────────────────────────────────────────

export async function listChangeOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listChangeOrders(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createChangeOrder(req.params.projectId, req.params.propertyId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateChangeOrder(
      req.params.changeOrderId, req.params.projectId, req.params.propertyId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function reviewChangeOrderCompliance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.reviewChangeOrderCompliance(
      req.params.changeOrderId,
      req.params.projectId,
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function approveChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.approveChangeOrder(
      req.params.changeOrderId, req.params.projectId, req.params.propertyId, req.user!.userId,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function rejectChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.rejectChangeOrder(
      req.params.changeOrderId, req.params.projectId, req.params.propertyId,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function voidChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.voidChangeOrder(
      req.params.changeOrderId, req.params.projectId, req.params.propertyId,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProjectExecutionAlignment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getExecutionAlignment(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function retryProjectExecutionReconciliation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await reconcileProjectExecution(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) {
    await markProjectExecutionReconciliationError(
      req.params.projectId,
      req.params.propertyId,
      err,
    ).catch(() => {});
    next(err);
  }
}

// ── Progress Log ──────────────────────────────────────────────────────────────

export async function listLogEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listLogEntries(req.params.projectId, req.params.propertyId, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createLogEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createLogEntry(
      req.params.projectId, req.params.propertyId, req.user!.userId, req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteLogEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteLogEntry(req.params.logId, req.params.projectId, req.params.propertyId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Issues ────────────────────────────────────────────────────────────────────

export async function listIssues(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listIssues(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createIssue(req.params.projectId, req.params.propertyId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateIssue(
      req.params.issueId, req.params.projectId, req.params.propertyId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function resolveIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.resolveIssue(
      req.params.issueId, req.params.projectId, req.params.propertyId, req.user!.userId, req.body,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Completion ────────────────────────────────────────────────────────────────

export async function getCompletionChecklist(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getCompletionChecklist(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getCloseoutPackage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getCloseoutPackage(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createCloseoutShareLink(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createCloseoutShareLink(
      req.params.projectId,
      req.params.propertyId,
      req.body.expiresInDays,
    );
    res.status(201).json({
      success: true,
      data: {
        shareUrl: `/renovation-closeout/share/${data.token}`,
        expiresAt: data.shareLink.expiresAt,
      },
    });
  } catch (err) { next(err); }
}

export async function getPublicCloseoutPackage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getPublicCloseoutPackage(req.params.token);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function completeMinorWork(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.completeMinorWork(req.params.propertyId, req.user!.userId, req.body);
    const closureSteps = [
      'confirm_scope_and_provider', 'track_work', 'verify_outcome', 'capture_proof', 'update_home_record', 'set_future_care',
    ] as const;
    for (const stepKey of closureSteps) {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: req.params.propertyId,
        actorUserId: req.user!.userId,
        journeyId: data.guidanceJourneyId,
        inventoryItemId: data.inventoryItemId,
        sourceToolKey: 'project-completion',
        sourceEntityType: 'HOME_EVENT',
        sourceEntityId: data.homeEventId,
        stepKey,
        status: 'COMPLETED',
        producedData: { proofType: `minor_work_${stepKey}`, proofId: data.homeEventId, minorWork: true },
      });
    }
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { actionType: 'complete_minor_work', journeyId: data.guidanceJourneyId, actualCostCents: req.body.actualCostCents },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function confirmCompletion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.confirmCompletion(
      req.params.projectId, req.params.propertyId, req.user!.userId, req.body,
    );

    const completedProject = (data as any).project;
    if (completedProject?.guidanceJourneyId && req.body.outcomeStatus === 'VERIFIED_SUCCESS') {
      const closureSteps = [
        ['track_work', 'project_execution_record', req.params.projectId],
        ['verify_outcome', 'project_verified_outcome', (data as any).homeEventId],
        ['capture_proof', 'project_completion_proof', (data as any).documentIds?.[0] ?? (data as any).homeEventId],
        ['update_home_record', 'living_home_record_writeback', (data as any).homeEventId],
        ['set_future_care', 'future_care_plan', (data as any).futureCareTaskIds?.[0] ?? (data as any).homeEventId],
      ] as const;
      try {
        for (const [stepKey, proofType, proofId] of closureSteps) {
          await guidanceJourneyService.recordToolCompletion({
            propertyId: req.params.propertyId,
            actorUserId: req.user!.userId,
            journeyId: completedProject.guidanceJourneyId,
            inventoryItemId: completedProject.inventoryItemId ?? null,
            sourceToolKey: 'project-completion',
            sourceEntityType: 'PROJECT',
            sourceEntityId: req.params.projectId,
            stepKey,
            status: 'COMPLETED',
            producedData: {
              proofType,
              proofId,
              projectId: req.params.projectId,
              outcomeStatus: req.body.outcomeStatus,
              writeBackAppliedAt: completedProject.writeBackAppliedAt,
            },
          });
        }
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[PHASE3] verified closure guidance hook failed');
      }
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: {
        actionType: 'confirm_completion',
        projectId: req.params.projectId,
        journeyId: completedProject?.guidanceJourneyId ?? null,
        outcomeStatus: req.body.outcomeStatus,
        providerOutcome: req.body.providerOutcome,
        priceVarianceCents: req.body.actualCostCents === undefined
          ? null
          : req.body.actualCostCents - (completedProject?.currentContractAmountCents ?? 0),
        recommendationOverridden: req.body.recommendationOverridden,
        blockedDays: completedProject?.createdAt && completedProject?.verifiedAt
          ? Math.max(0, Math.round((new Date(completedProject.verifiedAt).getTime() - new Date(completedProject.createdAt).getTime()) / 86_400_000))
          : null,
        writeBackCount: (data as any).writeBacks?.length ?? 0,
        followUpTaskCount: (data as any).futureCareTaskIds?.length ?? 0,
        idempotentReplay: (data as any).idempotentReplay ?? false,
      },
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
}
