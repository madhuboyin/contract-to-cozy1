import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import * as svc from '../services/projectTracker.service';
import {
  getProjectExecutionAlignment as getExecutionAlignment,
  markProjectExecutionReconciliationError,
  reconcileProjectExecution,
} from '../services/renovationExecution.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProjectComplianceEnvelope } from '../services/projectCompliance/context';
import { APIError } from '../middleware/error.middleware';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import { reportProjectClosure } from '../services/guidanceEngine/projectJourneyReporting';
import { createProjectWithEffects } from '../services/projectTrackerOperations';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';
import {
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
    // The gates, the guidance report, the analytics and the first-milestone lifecycle event live in the shared service, so Ask creates a project exactly the same way.
    const { project: data, work } = await createProjectWithEffects(req.params.propertyId, req.user!.userId, req.body);
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      req.user!.userId,
      'PROJECT_TRACKER',
      work as never,
    );
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
    const data = await svc.updateProject(req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId });
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
      req.params.paymentId, req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId },
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
    const data = await svc.createChangeOrder(req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateChangeOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateChangeOrder(
      req.params.changeOrderId, req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId },
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
    const data = await svc.createIssue(req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.updateIssue(
      req.params.issueId, req.params.projectId, req.params.propertyId, { ...req.body, actingUserId: req.user!.userId },
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

export async function escalateIssue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.escalateIssue(req.params.issueId, req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function addIssueNote(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.addIssueNote(req.params.issueId, req.params.projectId, req.params.propertyId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function generateDisputePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.generateDisputePackage(req.params.issueId, req.params.projectId, req.params.propertyId, req.user!.userId, req.body.evidenceDocumentIds);
    res.status(201).json({ success: true, data });
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

export async function listCloseoutShareLinks(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await svc.listCloseoutShareLinks(req.params.projectId, req.params.propertyId) }); }
  catch (err) { next(err); }
}

export async function revokeCloseoutShareLink(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await svc.revokeCloseoutShareLink(req.params.shareLinkId, req.params.projectId, req.params.propertyId) }); }
  catch (err) { next(err); }
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
    await reportProjectClosure(req.params.propertyId, req.user!.userId, {
      projectId: req.params.projectId, journeyId: completedProject?.guidanceJourneyId, inventoryItemId: completedProject?.inventoryItemId ?? null,
      outcomeStatus: req.body.outcomeStatus, writeBackAppliedAt: completedProject?.writeBackAppliedAt,
      homeEventId: (data as any).homeEventId, documentIds: (data as any).documentIds, futureCareTaskIds: (data as any).futureCareTaskIds,
    });

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
          : completedProject?.currentContractAmountCents == null
            ? null // an unknown contract amount has no variance (owner ruling D-H5)
            : req.body.actualCostCents - completedProject.currentContractAmountCents,
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
