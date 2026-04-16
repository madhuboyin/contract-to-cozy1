import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import {
  AttachNegotiationShieldDocumentPayload,
  CreateNegotiationShieldCaseInput,
  NegotiationShieldEventInput,
  SaveNegotiationShieldInputPayload,
} from '../services/negotiationShield.types';
import { NegotiationShieldService } from '../services/negotiationShield.service';
import { logger } from '../lib/logger';

const service = new NegotiationShieldService();

function readQueryString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const trimmed = value[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

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
    const { userId } = requireUser(req);
    const detail = await service.analyzeCase(
      req.params.propertyId,
      req.params.caseId
    );

    const guidanceJourneyId = readQueryString(req.query.guidanceJourneyId);
    const guidanceStepKey = readQueryString(req.query.guidanceStepKey);
    const querySignalFamily = readQueryString(req.query.guidanceSignalIntentFamily)?.toLowerCase() ?? null;

    const inferredFromScenario = (() => {
      if (detail.case.scenarioType === 'INSURANCE_PREMIUM_INCREASE') {
        return {
          signalIntentFamily: 'coverage_gap',
          issueDomain: 'INSURANCE' as const,
        };
      }

      if (detail.case.scenarioType === 'BUYER_INSPECTION_NEGOTIATION') {
        return {
          signalIntentFamily: 'inspection_followup_needed',
          issueDomain: 'MAINTENANCE' as const,
        };
      }

      if (detail.case.scenarioType === 'INSURANCE_CLAIM_SETTLEMENT') {
        return {
          signalIntentFamily: 'financial_exposure',
          issueDomain: 'FINANCIAL' as const,
        };
      }

      return {
        signalIntentFamily: 'lifecycle_end_or_past_life',
        issueDomain: 'ASSET_LIFECYCLE' as const,
      };
    })();

    try {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: req.params.propertyId,
        actorUserId: userId,
        journeyId: guidanceJourneyId ?? null,
        signalIntentFamily: querySignalFamily ?? inferredFromScenario.signalIntentFamily,
        issueDomain: inferredFromScenario.issueDomain,
        sourceToolKey: 'negotiation-shield',
        sourceEntityType: 'NEGOTIATION_SHIELD_CASE',
        sourceEntityId: detail.case.id,
        stepKey: guidanceStepKey ?? 'prepare_negotiation',
        status: 'COMPLETED',
        producedData: {
          proofType: 'negotiation_analysis',
          proofId: detail.case.id,
          scenarioType: detail.case.scenarioType,
          caseStatus: detail.case.status,
          summary: detail.latestAnalysis?.summary ?? null,
          confidence: detail.latestAnalysis?.confidence ?? null,
          negotiationLeverage: detail.latestAnalysis?.negotiationLeverage ?? null,
          recommendedActions: detail.latestAnalysis?.recommendedActions ?? null,
          pricingAssessment: detail.latestAnalysis?.pricingAssessment ?? null,
          draftType: detail.latestDraft?.draftType ?? null,
        },
      });
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] negotiation shield hook failed');
    }

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
