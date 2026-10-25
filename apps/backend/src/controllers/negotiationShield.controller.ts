import { reportToExactStep } from '../services/guidanceEngine/exactStepReporting';
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { NEGOTIATION_SHIELD_DEFAULT_STEP_KEY, recordNegotiationShieldAnalysisCompletion } from '../services/negotiationShieldJourneyCompletion';
import {
  AttachNegotiationShieldDocumentPayload,
  CreateNegotiationShieldCaseInput,
  NegotiationShieldEventInput,
  RecordBuyerNegotiationOutcomeInput,
  SaveNegotiationShieldInputPayload,
  StartBuyerNegotiationInput,
} from '../services/negotiationShield.types';
import { NegotiationShieldService } from '../services/negotiationShield.service';
import {
  assertProjectComplianceApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';

const service = new NegotiationShieldService();

export async function startBuyerNegotiation(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = requireUser(req);
    const detail = await service.startBuyerNegotiation(
      req.params.propertyId,
      userId,
      req.body as StartBuyerNegotiationInput,
    );
    res.status(201).json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

export async function recordBuyerNegotiationOutcome(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const { userId } = requireUser(req);
    const detail = await service.recordBuyerNegotiationOutcome(
      req.params.propertyId,
      req.params.caseId,
      userId,
      req.body as RecordBuyerNegotiationOutcomeInput,
      req.householdRole!,
    );
    res.json({ success: true, data: detail });
  } catch (error) {
    next(error);
  }
}

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
    const { userId } = requireUser(req);
    const [cases, propertyContext] = await Promise.all([
      service.listCasesForProperty(req.params.propertyId),
      getProjectComplianceEnvelope(req.params.propertyId, userId, 'NEGOTIATION_SHIELD'),
    ]);
    res.json({ success: true, data: { cases, propertyContext } });
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
    await assertProjectComplianceApplicable(
      req.params.propertyId,
      userId,
      'NEGOTIATION_SHIELD',
      {},
      'negotiationShield',
    );
    const detail = await service.createCase(req.params.propertyId, userId, payload);
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'NEGOTIATION_SHIELD');
    res.status(201).json({ success: true, data: { ...detail, propertyContext } });
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
    const { userId } = requireUser(req);
    const detail = await service.getCaseDetail(req.params.propertyId, req.params.caseId);
    const pricingAssessment = detail.latestAnalysis?.pricingAssessment;
    const generatedContextVersion = pricingAssessment && typeof pricingAssessment === 'object'
      ? String((pricingAssessment as Record<string, unknown>)._propertyContextVersion ?? '') || null
      : null;
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'NEGOTIATION_SHIELD',
      {},
      generatedContextVersion,
    );
    res.json({ success: true, data: { ...detail, propertyContext } });
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
      role: req.householdRole!,
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
    const currentContext = await assertProjectComplianceApplicable(
      req.params.propertyId,
      userId,
      'NEGOTIATION_SHIELD',
      {},
      'negotiationShield',
    );
    const detail = await service.analyzeCase(
      req.params.propertyId,
      req.params.caseId,
      currentContext.contextVersion,
    );

    // The journey completion is shared with Ask (negotiationShieldJourneyCompletion.ts) so both surfaces keep identical side effects.
    const guidanceStepId = readQueryString(req.query.guidanceStepId);
    if (guidanceStepId) {
      // Launched from a journey step: that exact, revalidated step only; never the signal family.
      await reportToExactStep(req.params.propertyId, guidanceStepId, { toolKey: 'negotiation-shield', stepKeys: [NEGOTIATION_SHIELD_DEFAULT_STEP_KEY] },
        (binding) => recordNegotiationShieldAnalysisCompletion({ propertyId: req.params.propertyId, actorUserId: userId, detail, journeyId: binding.journeyId, stepKey: binding.stepKey, signalIntentFamily: binding.signalIntentFamily }));
    } else {
      await recordNegotiationShieldAnalysisCompletion({
        propertyId: req.params.propertyId,
        actorUserId: userId,
        detail,
        signalIntentFamily: readQueryString(req.query.guidanceSignalIntentFamily)?.toLowerCase() ?? null,
      });
    }

    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'NEGOTIATION_SHIELD',
      {},
      currentContext.contextVersion,
    );
    res.status(201).json({ success: true, data: { ...detail, propertyContext } });
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
