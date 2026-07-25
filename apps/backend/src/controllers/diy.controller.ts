// apps/backend/src/controllers/diy.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest as Request } from '../types';
import { diyService } from '../services/diy.service';
import { diyDecisionService } from '../services/diyDecision.service';
import { diyAiGuideService } from '../services/diyAiGuide.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluateDiyApplicability } from '../services/diy/applicabilityPolicy';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';
import {
  diyDecisionCompletionEvent,
  diyProjectCompletionEvent,
} from '../services/analytics/diyLifecycle';

// ── Skill Profile ─────────────────────────────────────────────────────────────

export async function getSkillProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await diyService.getSkillProfile(req.user!.userId);
    res.json({ success: true, data: { profile } });
  } catch (err) { next(err); }
}

export async function upsertSkillProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await diyService.upsertSkillProfile(req.user!.userId, req.body);
    res.json({ success: true, data: { profile } });
  } catch (err) { next(err); }
}

// ── Template Library ──────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await diyService.listTemplates(req.query as any);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getFeaturedTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const templates = await diyService.getFeaturedTemplates();
    res.json({ success: true, data: { templates } });
  } catch (err) { next(err); }
}

export async function getTemplateDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await diyService.getTemplateDetail(req.params.templateId);
    res.json({ success: true, data: { template } });
  } catch (err) { next(err); }
}

// ── Decision Engine ────────────────────────────────────────────────────────────

export async function getDiyDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const context = await getPropertyContext(
      req.params.propertyId,
      { userId: req.user!.userId },
      { scopes: ['EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'INVENTORY'] },
    );
    const applicability = evaluateDiyApplicability(context, req.body.projectCategory);
    if (applicability.status !== 'APPLICABLE') {
      res.status(409).json({
        success: false,
        error: 'This project does not apply to the selected property, or required property facts are missing.',
        data: { applicability },
      });
      return;
    }
    const result = await diyDecisionService.score({ ...req.body, userId: req.user!.userId });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.DIY_DECISION,
      metadataJson: { verdict: (result as any)?.verdict, score: (result as any)?.score },
    });
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId: req.params.propertyId,
      events: [diyDecisionCompletionEvent({
        propertyId: req.params.propertyId,
        verdict: result.verdict,
        score: result.score,
        category: req.body.projectCategory,
      })],
    });

    res.json({ success: true, data: { ...result, applicability } });
  } catch (err) { next(err); }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await diyService.createProject(req.params.propertyId, req.user!.userId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.DIY_DECISION,
      metadataJson: { actionType: 'create_project', category: (project as any)?.category },
    });
    void recordToolLifecycleEvents({
      userId: req.user!.userId,
      propertyId: req.params.propertyId,
      events: [diyProjectCompletionEvent({
        projectId: project.id,
        category: project.category,
        decisionVerdict: project.decisionVerdict,
      })],
    });

    res.status(201).json({ success: true, data: { project } });
  } catch (err) { next(err); }
}

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await diyService.listProjects(req.params.propertyId, req.query as any);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await diyService.getProjectDetail(req.params.projectId, req.params.propertyId);
    res.json({ success: true, data: { project } });
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await diyService.updateProject(req.params.projectId, req.params.propertyId, req.body);
    res.json({ success: true, data: { project } });
  } catch (err) { next(err); }
}

export async function updateStep(req: Request, res: Response, next: NextFunction) {
  try {
    const step = await diyService.updateStep(
      req.params.projectId, req.params.propertyId, req.params.stepId, req.body,
    );
    res.json({ success: true, data: { step } });
  } catch (err) { next(err); }
}

export async function completeProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await diyService.completeProject(req.params.projectId, req.params.propertyId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.DIY_DECISION,
      metadataJson: { actionType: 'complete_project' },
    });

    res.json({ success: true, data: { homeEventId: project.homeEventId } });
  } catch (err) { next(err); }
}

export async function abandonProject(req: Request, res: Response, next: NextFunction) {
  try {
    const hireOut = req.body.hireOut ?? false;
    await diyService.abandonProject(req.params.projectId, req.params.propertyId, hireOut);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.DIY_DECISION,
      metadataJson: { actionType: 'abandon_project', hireOut },
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// ── AI Guide ──────────────────────────────────────────────────────────────────

export async function generateAiGuide(req: Request, res: Response, next: NextFunction) {
  try {
    const guideId = await diyAiGuideService.initiateGeneration(
      req.user!.userId, req.params.propertyId, req.body.userPrompt,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.DIY_DECISION,
      metadataJson: { actionType: 'generate_ai_guide', guideId },
    });

    res.status(201).json({ success: true, data: { guideId } });
  } catch (err) { next(err); }
}

export async function getAiGuide(req: Request, res: Response, next: NextFunction) {
  try {
    const guide = await diyAiGuideService.getGuide(req.params.guideId, req.params.propertyId);
    if (!guide) { res.status(404).json({ success: false, error: 'Guide not found' }); return; }
    res.json({ success: true, data: { guide } });
  } catch (err) { next(err); }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminListTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await diyService.adminListTemplates(req.query as any);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function adminGetTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await diyService.adminGetTemplate(req.params.templateId);
    res.json({ success: true, data: { template } });
  } catch (err) { next(err); }
}

export async function adminCreateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await diyService.adminCreateTemplate(req.body);
    res.status(201).json({ success: true, data: { template } });
  } catch (err) { next(err); }
}

export async function adminUpdateTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const template = await diyService.adminUpdateTemplate(req.params.templateId, req.body);
    res.json({ success: true, data: { template } });
  } catch (err) { next(err); }
}
