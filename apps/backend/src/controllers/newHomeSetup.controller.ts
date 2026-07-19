import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import {
  NewHomeLifecycleInputSchema,
  NewHomePilotAssessmentInputSchema,
  NewHomeTaskUpdateSchema,
  NewHomePunchListInputSchema,
  NewHomeBuilderResponseInputSchema,
  NewHomeWarrantyRightInputSchema,
  NewHomeRegistrationInputSchema,
  NewHomeEvidenceInputSchema,
  NewHomeInspectionBundleUpdateSchema,
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

const createPunchListItem = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.createPunchListItem(userId(req), req.params.propertyId, NewHomePunchListInputSchema.parse(req.body)); return res.status(201).json({ success: true, data }); } catch (error) { next(error); } };
const addBuilderResponse = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.addBuilderResponse(userId(req), req.params.propertyId, req.params.itemId, NewHomeBuilderResponseInputSchema.parse(req.body)); return res.status(201).json({ success: true, data }); } catch (error) { next(error); } };
const createWarrantyRight = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.createWarrantyRight(userId(req), req.params.propertyId, NewHomeWarrantyRightInputSchema.parse(req.body)); return res.status(201).json({ success: true, data }); } catch (error) { next(error); } };
const promoteWarrantyDocument = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.promoteWarrantyDocument(userId(req), req.params.propertyId, req.body); return res.status(201).json({ success: true, data }); } catch (error) { next(error); } };
const verifyWarrantyRight = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.verifyWarrantyRight(userId(req), req.params.propertyId, req.params.rightId); return res.json({ success: true, data }); } catch (error) { next(error); } };
const upsertRegistration = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.upsertRegistration(userId(req), req.params.propertyId, NewHomeRegistrationInputSchema.parse(req.body)); return res.json({ success: true, data }); } catch (error) { next(error); } };
const addEvidence = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.addEvidence(userId(req), req.params.propertyId, NewHomeEvidenceInputSchema.parse(req.body)); return res.status(201).json({ success: true, data }); } catch (error) { next(error); } };
const ensureInspectionBundles = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.ensureInspectionBundles(userId(req), req.params.propertyId); return res.json({ success: true, data }); } catch (error) { next(error); } };
const updateInspectionBundle = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.updateInspectionBundle(userId(req), req.params.propertyId, req.params.bundleId, NewHomeInspectionBundleUpdateSchema.parse(req.body)); return res.json({ success: true, data }); } catch (error) { next(error); } };
const handoff = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.ensureRecurringHandoff(userId(req), req.params.propertyId); return res.json({ success: true, data }); } catch (error) { next(error); } };
const getAcceptanceStatus = async (req: AuthRequest, res: Response, next: NextFunction) => { try { const data = await NewHomeSetupService.getAcceptanceStatus(userId(req), req.params.propertyId); return res.json({ success: true, data }); } catch (error) { next(error); } };

export const newHomeSetupController = {
  getOverview,
  getAssessment,
  assessPilot,
  getPlan,
  updateLifecycle,
  updateTask,
  createPunchListItem,
  addBuilderResponse,
  createWarrantyRight,
  promoteWarrantyDocument,
  verifyWarrantyRight,
  upsertRegistration,
  addEvidence,
  ensureInspectionBundles,
  updateInspectionBundle,
  handoff,
  getAcceptanceStatus,
};
