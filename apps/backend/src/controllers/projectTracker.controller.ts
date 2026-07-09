import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import * as svc from '../services/projectTracker.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

// ── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listProjects(req.params.propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { count: Array.isArray(data) ? data.length : undefined },
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.createProject(req.params.propertyId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { actionType: 'create_project', projectId: (data as any)?.id },
    });

    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getProjectDetail(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data });
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

export async function confirmCompletion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.confirmCompletion(
      req.params.projectId, req.params.propertyId, req.user!.userId, req.body,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PROJECT_TRACKER,
      metadataJson: { actionType: 'confirm_completion', projectId: req.params.projectId },
    });

    res.json({ success: true, data });
  } catch (err) { next(err); }
}
