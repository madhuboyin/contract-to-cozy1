import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { CustomRequest } from '../types';
import {
  ASK_INTAKE_ACCEPTED_TYPES, ASK_INTAKE_CONTRACT_VERSION, ASK_INTAKE_DISCLOSURES, ASK_INTAKE_INSPECTION_REPORT_TYPES, ASK_INTAKE_KIND_OPTIONS, ASK_INTAKE_MAX_BYTES, ASK_INTAKE_SENSITIVITIES,
} from '../services/ask/askIntake.contract';
import {
  analyzeAskIntake, confirmAskIntakeLabel, discardAskIntake, dismissAskIntakeLabel, getAskIntake, promoteAskIntake, reviewAskIntakeCandidate, stageAskIntakeFile, updateAskIntakeLabel,
  type AskIntakeContext,
} from '../services/ask/askIntake.service';

// Sole Homeowner Interface Phase 7. Routes are property-scoped and gated to CONTRIBUTOR in ask.routes.ts (propertyAuthMiddleware sets the household role).
const kindSchema = z.enum(['WARRANTY', 'RECEIPT', 'INSURANCE_POLICY', 'APPLIANCE_LABEL', 'INSPECTION_REPORT']);
const analyzeSchema = z.object({
  kind: z.union([kindSchema, z.literal('AUTO')]).optional(),
  acknowledgedProcessing: z.boolean().optional(),
  inspection: z.object({ reportType: z.enum(ASK_INTAKE_INSPECTION_REPORT_TYPES), inspectionDate: z.string().trim().min(8).max(40) }).optional(),
});
const reviewSchema = z.object({ action: z.enum(['CONFIRM', 'CORRECT', 'REJECT']), value: z.string().trim().min(1).max(2000).optional() }).refine((v) => v.action !== 'CORRECT' || Boolean(v.value), 'A corrected value is required.');
const labelPatchSchema = z.object({
  name: z.string().max(160).nullable().optional(), manufacturer: z.string().max(160).nullable().optional(), modelNumber: z.string().max(160).nullable().optional(),
  serialNumber: z.string().max(160).nullable().optional(), upc: z.string().max(160).nullable().optional(), sku: z.string().max(160).nullable().optional(),
});

function context(req: CustomRequest): AskIntakeContext {
  return { propertyId: req.params.propertyId, userId: req.user!.userId, role: req.householdRole! };
}

function badRequest(res: Response, message: string) {
  return res.status(400).json({ success: false, error: { code: 'ASK_INVALID_REQUEST', message } });
}

export function getAskIntakeConfigHandler(_req: CustomRequest, res: Response) {
  return res.status(200).json({
    success: true,
    data: {
      contractVersion: ASK_INTAKE_CONTRACT_VERSION, acceptedTypes: ASK_INTAKE_ACCEPTED_TYPES, maxBytes: ASK_INTAKE_MAX_BYTES, sensitivities: ASK_INTAKE_SENSITIVITIES,
      kinds: ASK_INTAKE_KIND_OPTIONS.map(({ kind, label, description, acceptsImages, readsWith }) => ({ kind, label, description, acceptsImages, readsWith })),
      reportTypes: ASK_INTAKE_INSPECTION_REPORT_TYPES, disclosures: ASK_INTAKE_DISCLOSURES,
    },
  });
}

export async function postAskIntakeFile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) return badRequest(res, 'Choose a file to add.');
    return res.status(201).json({ success: true, data: await stageAskIntakeFile(context(req), req.file, { sensitivity: typeof req.body?.sensitivity === 'string' ? req.body.sensitivity : undefined }) });
  } catch (error) { return next(error); }
}

export async function getAskIntakeHandler(req: CustomRequest, res: Response, next: NextFunction) {
  try { return res.status(200).json({ success: true, data: await getAskIntake(context(req), req.params.recordId) }); } catch (error) { return next(error); }
}

export async function postAskIntakeAnalyze(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const input = analyzeSchema.safeParse(req.body ?? {});
    if (!input.success) return badRequest(res, 'Choose what kind of file this is, and for an inspection its type and date.');
    return res.status(200).json({ success: true, data: await analyzeAskIntake(context(req), req.params.recordId, input.data) });
  } catch (error) { return next(error); }
}

export async function postAskIntakeCandidateReview(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const input = reviewSchema.safeParse(req.body ?? {});
    if (!input.success) return badRequest(res, input.error.issues[0]?.message ?? 'Choose confirm, correct or reject.');
    return res.status(200).json({ success: true, data: await reviewAskIntakeCandidate(context(req), req.params.recordId, req.params.candidateId, input.data) });
  } catch (error) { return next(error); }
}

export async function postAskIntakePromote(req: CustomRequest, res: Response, next: NextFunction) {
  try { return res.status(201).json({ success: true, data: await promoteAskIntake(context(req), req.params.recordId) }); } catch (error) { return next(error); }
}

export async function patchAskIntakeLabel(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const input = labelPatchSchema.safeParse(req.body ?? {});
    if (!input.success) return badRequest(res, 'Those label details are not valid.');
    return res.status(200).json({ success: true, data: await updateAskIntakeLabel(context(req), req.params.recordId, input.data) });
  } catch (error) { return next(error); }
}

export async function postAskIntakeLabelConfirm(req: CustomRequest, res: Response, next: NextFunction) {
  try { return res.status(201).json({ success: true, data: await confirmAskIntakeLabel(context(req), req.params.recordId) }); } catch (error) { return next(error); }
}

export async function postAskIntakeLabelDismiss(req: CustomRequest, res: Response, next: NextFunction) {
  try { return res.status(200).json({ success: true, data: await dismissAskIntakeLabel(context(req), req.params.recordId) }); } catch (error) { return next(error); }
}

export async function postAskIntakeDiscard(req: CustomRequest, res: Response, next: NextFunction) {
  try { return res.status(200).json({ success: true, data: await discardAskIntake(context(req), req.params.recordId) }); } catch (error) { return next(error); }
}
