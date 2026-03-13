import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import {
  AttachNegotiationShieldDocumentPayload,
  CreateNegotiationShieldCaseInput,
  NegotiationShieldEventInput,
  SaveNegotiationShieldInputPayload,
} from '../services/negotiationShield.types';
import { NegotiationShieldService } from '../services/negotiationShield.service';

const service = new NegotiationShieldService();

function requireUser(req: CustomRequest) {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  return {
    userId,
    homeownerProfileId: req.user?.homeownerProfile?.id ?? null,
  };
}

export async function listNegotiationShieldCases(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const cases = await service.listCasesForProperty(req.params.propertyId);
    res.json({ success: true, data: { cases } });
  } catch (error) {
    next(error);
  }
}

export async function createNegotiationShieldCase(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const payload = req.body as CreateNegotiationShieldCaseInput;
    const detail = await service.createCase(req.params.propertyId, userId, payload);
    res.status(201).json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function getNegotiationShieldCaseDetail(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const detail = await service.getCaseDetail(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function saveNegotiationShieldManualInput(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    requireUser(req);
    const payload = req.body as SaveNegotiationShieldInputPayload;
    const detail = await service.saveManualInput(
      req.params.propertyId,
      req.params.caseId,
      payload
    );
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function attachNegotiationShieldDocumentMetadata(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId, homeownerProfileId } = requireUser(req);
    const payload = req.body as AttachNegotiationShieldDocumentPayload;
    const detail = await service.attachDocumentMetadata({
      propertyId: req.params.propertyId,
      caseId: req.params.caseId,
      userId,
      homeownerProfileId,
      payload,
    });
    res.status(201).json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function parseNegotiationShieldDocument(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    requireUser(req);
    const detail = await service.parseCaseDocument(
      req.params.propertyId,
      req.params.caseId,
      req.params.caseDocumentId
    );
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function analyzeNegotiationShieldCase(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    requireUser(req);
    const detail = await service.analyzeCase(
      req.params.propertyId,
      req.params.caseId
    );
    res.status(201).json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function trackNegotiationShieldEvent(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const payload = req.body as NegotiationShieldEventInput;
    const result = await service.trackEvent(req.params.propertyId, userId, payload);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
