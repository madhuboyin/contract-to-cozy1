import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import {
  NewHomeLifecycleInputSchema,
  NewHomePilotAssessmentInputSchema,
  NewHomeTaskUpdateSchema,
} from '../productFramework/newHomeSetup.contract';
import { NewHomeSetupService } from '../services/newHomeSetup.service';

function userId(req: AuthRequest): string {
  if (!req.user) throw new Error('Authentication required.');
  return req.user.userId;
}

const getOverview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await NewHomeSetupService.getOverview(userId(req), req.params.propertyId);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const getAssessment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await NewHomeSetupService.getAssessment(userId(req), req.params.propertyId);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const assessPilot = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const input = NewHomePilotAssessmentInputSchema.parse(req.body);
    const data = await NewHomeSetupService.assessPilot(userId(req), req.params.propertyId, input);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const getPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await NewHomeSetupService.getOrCreatePlan(userId(req), req.params.propertyId);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const updateLifecycle = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const input = NewHomeLifecycleInputSchema.parse(req.body);
    const data = await NewHomeSetupService.updateLifecycle(userId(req), req.params.propertyId, input);
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

const updateTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const input = NewHomeTaskUpdateSchema.parse(req.body);
    const data = await NewHomeSetupService.updateTask(
      userId(req), req.params.propertyId, req.params.taskId, input,
    );
    return res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const newHomeSetupController = {
  getOverview,
  getAssessment,
  assessPilot,
  getPlan,
  updateLifecycle,
  updateTask,
};
