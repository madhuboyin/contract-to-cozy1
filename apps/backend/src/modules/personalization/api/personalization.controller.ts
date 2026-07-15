import { Response } from 'express';
import { CustomRequest } from '../../../types';
import {
  getPersonalization as loadPersonalization,
  enableOptionalProfile as enableOptionalProfileForProperty,
  resetOptionalProfile as resetOptionalProfileForProperty,
  refreshPersonalization as refreshPersonalizationForProperty,
} from '../application/getPersonalization.usecase';
import { recordRecommendationFeedback } from '../application/recordRecommendationFeedback.usecase';
import { recommendationBelongsToProperty } from '../infrastructure/personalizationRepository';
import { findHouseholdForPropertyOwner } from '../infrastructure/personalizationRepository';
import { recordProfileAnswer } from '../application/recordProfileAnswer.usecase';
import { getPersonalizationCapabilities } from '../domain/capabilityPolicy';
import { getModuleRecommendations } from '../application/getModuleRecommendations.usecase';
import { convertRecommendationToMaintenanceTask } from '../application/convertRecommendationToMaintenanceTask.usecase';
import type { PersonalizationModule } from '../catalog/personalizationDefinitions';
import { ModuleRecommendationQuerySchema } from './personalization.validators';
import { getHouseholdContextMap } from '../application/getHouseholdContextMap.usecase';
import { isPersonalizationPaused } from '../../../services/personalizationKillSwitch.service';

function personalizationContext(req: CustomRequest, res: Response): { propertyId: string; userId: string } | null {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;
  if (!propertyId || !userId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CONTEXT', message: 'Property and user are required.' } });
    return null;
  }
  return { propertyId, userId };
}

async function rejectPausedWrite(res: Response): Promise<boolean> {
  if (!(await isPersonalizationPaused())) return false;
  res.status(503).json({
    success: false,
    error: { code: 'PERSONALIZATION_PAUSED', message: 'Personalization is temporarily paused.' },
  });
  return true;
}

export async function getPersonalization(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const capabilities = getPersonalizationCapabilities(req.householdRole!);
  const data = await loadPersonalization(context.propertyId, context.userId, capabilities);
  return res.json({ success: true, data });
}

export async function getPersonalizationContextMap(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const data = await getHouseholdContextMap(context.propertyId, context.userId);
  return res.json({ success: true, data });
}

export async function enableOptionalHouseholdProfile(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  if (await rejectPausedWrite(res)) return;
  const data = await enableOptionalProfileForProperty(context.propertyId, context.userId);
  return res.status(201).json({ success: true, data });
}

export async function submitRecommendationFeedback(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  if (await rejectPausedWrite(res)) return;
  const recommendationId = req.params.recommendationId;
  if (!(await recommendationBelongsToProperty(recommendationId, context.propertyId))) {
    return res.status(404).json({ success: false, error: { code: 'RECOMMENDATION_NOT_FOUND', message: 'Recommendation not found.' } });
  }
  const result = await recordRecommendationFeedback({ recommendationId, ...req.body });
  return res.status(result.status === 'RECORDED' ? 201 : 200).json({ success: true, data: result });
}

export async function refreshPersonalization(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const data = await refreshPersonalizationForProperty(context.propertyId);
  return res.json({ success: true, data });
}

export async function submitProfileAnswer(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  if (await rejectPausedWrite(res)) return;
  const household = await findHouseholdForPropertyOwner(context.propertyId, context.userId);
  if (!household?.consentVersion) {
    return res.status(409).json({ success: false, error: { code: 'CONSENT_REQUIRED', message: 'Enable the optional household profile before answering questions.' } });
  }

  const result = await recordProfileAnswer({
    householdId: household.id,
    propertyId: context.propertyId,
    ownerUserId: context.userId,
    questionId: req.params.questionId,
    ...req.body,
  });
  const unavailable = result.status === 'QUESTION_NOT_FOUND' || result.status === 'QUESTION_NOT_ACTIVE';
  const rejected = result.status === 'INVALID_ANSWER' || result.status === 'CONSENT_REQUIRED';
  const statusCode = result.status === 'INVALID_ANSWER'
    ? 400
    : result.status === 'CONSENT_REQUIRED'
      ? 409
      : unavailable
        ? 404
        : result.status === 'DUPLICATE'
          ? 200
          : 201;
  return res.status(statusCode).json({ success: !rejected && !unavailable, data: result });
}

export async function resetOptionalHouseholdProfile(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const data = await resetOptionalProfileForProperty(context.propertyId, context.userId);
  return res.json({ success: true, data });
}

export async function getPersonalizationModuleRecommendations(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const module = req.params.module?.toUpperCase();
  if (module !== 'DASHBOARD' && module !== 'MAINTENANCE' && module !== 'HEALTH') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_MODULE', message: 'Unsupported personalization module.' } });
  }
  const query = ModuleRecommendationQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'Limit must be between 1 and 25.' } });
  }
  const capabilities = getPersonalizationCapabilities(req.householdRole!);
  const data = await getModuleRecommendations(
    context.propertyId,
    module as PersonalizationModule,
    capabilities,
    query.data.limit,
  );
  return res.json({ success: true, data });
}

export async function convertPersonalizationRecommendationToTask(req: CustomRequest, res: Response) {
  const context = personalizationContext(req, res);
  if (!context) return;
  const result = await convertRecommendationToMaintenanceTask({
    recommendationId: req.params.recommendationId,
    propertyId: context.propertyId,
    userId: context.userId,
    idempotencyKey: req.body.idempotencyKey,
  });
  if (result.status === 'RECOMMENDATION_NOT_FOUND') {
    return res.status(404).json({ success: false, error: { code: result.status, message: 'Recommendation not found.' } });
  }
  if (result.status === 'ACTION_NOT_SUPPORTED') {
    return res.status(409).json({ success: false, error: { code: result.status, message: 'This recommendation cannot become a maintenance task.' } });
  }
  if (result.status === 'PERSONALIZATION_PAUSED') {
    return res.status(503).json({ success: false, error: { code: result.status, message: 'Personalization is temporarily paused.' } });
  }
  return res.status(result.status === 'CREATED' ? 201 : 200).json({ success: true, data: result });
}
