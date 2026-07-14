import { Response } from 'express';
import { CustomRequest } from '../../../types';
import { isToolEnabled } from '../../../config/featureFlags';
import {
  getPilotPersonalization,
  optInToPilotPersonalization,
  resetPilotPersonalization,
  refreshPilotPersonalization,
} from '../application/getPilotPersonalization.usecase';
import { recordRecommendationFeedback } from '../application/recordRecommendationFeedback.usecase';
import { recommendationBelongsToProperty } from '../infrastructure/pilotRepository';
import { findPilotHousehold, findPilotHouseholdForProperty } from '../infrastructure/pilotRepository';
import { recordProfileAnswer } from '../application/recordProfileAnswer.usecase';
import { getPersonalizationCapabilities } from '../domain/capabilityPolicy';
import { getModuleRecommendations } from '../application/getModuleRecommendations.usecase';
import { convertRecommendationToMaintenanceTask } from '../application/convertRecommendationToMaintenanceTask.usecase';
import type { PersonalizationModule } from '../catalog/pilotDefinitions';
import { ModuleRecommendationQuerySchema } from './personalizationPilot.validators';
import { getHouseholdContextMap } from '../application/getHouseholdContextMap.usecase';

function pilotContext(req: CustomRequest, res: Response): { propertyId: string; userId: string } | null {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;
  if (!propertyId || !userId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CONTEXT', message: 'Property and user are required.' } });
    return null;
  }
  if (!isToolEnabled('PERSONALIZATION_PILOT', userId)) {
    res.status(404).json({ success: false, error: { code: 'PILOT_DISABLED', message: 'Personalization pilot is not enabled.' } });
    return null;
  }
  return { propertyId, userId };
}

export async function getPilot(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const capabilities = getPersonalizationCapabilities(req.householdRole!);
  const data = await getPilotPersonalization(context.propertyId, capabilities);
  return res.json({ success: true, data });
}

export async function getPilotContextMap(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const data = await getHouseholdContextMap(context.propertyId);
  return res.json({ success: true, data });
}

export async function optInPilot(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const data = await optInToPilotPersonalization(context.propertyId, context.userId);
  return res.status(201).json({ success: true, data });
}

export async function submitPilotFeedback(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const recommendationId = req.params.recommendationId;
  const household = await findPilotHouseholdForProperty(context.propertyId);
  if (!household || !(await recommendationBelongsToProperty(recommendationId, context.propertyId, household.id))) {
    return res.status(404).json({ success: false, error: { code: 'RECOMMENDATION_NOT_FOUND', message: 'Recommendation not found.' } });
  }
  const result = await recordRecommendationFeedback({ recommendationId, ...req.body });
  return res.status(result.status === 'RECORDED' ? 201 : 200).json({ success: true, data: result });
}

export async function refreshPilot(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const data = await refreshPilotPersonalization(context.propertyId);
  return res.json({ success: true, data });
}

export async function submitPilotProfileAnswer(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const household = await findPilotHousehold(context.propertyId, context.userId);
  if (!household?.consentVersion) {
    return res.status(409).json({ success: false, error: { code: 'CONSENT_REQUIRED', message: 'Join the pilot before answering profile questions.' } });
  }

  const result = await recordProfileAnswer({
    householdId: household.id,
    questionId: req.params.questionId,
    placement: 'PILOT',
    ...req.body,
  });
  const unavailable = result.status === 'QUESTION_NOT_FOUND' || result.status === 'QUESTION_NOT_ACTIVE';
  const statusCode = result.status === 'INVALID_ANSWER' ? 400 : unavailable ? 404 : result.status === 'DUPLICATE' ? 200 : 201;
  return res.status(statusCode).json({ success: result.status !== 'INVALID_ANSWER' && !unavailable, data: result });
}

export async function resetPilot(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const data = await resetPilotPersonalization(context.propertyId, context.userId);
  return res.json({ success: true, data });
}

export async function getPilotModuleRecommendations(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
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

export async function convertPilotRecommendationToTask(req: CustomRequest, res: Response) {
  const context = pilotContext(req, res);
  if (!context) return;
  const household = await findPilotHouseholdForProperty(context.propertyId);
  if (!household?.consentVersion) {
    return res.status(409).json({ success: false, error: { code: 'CONSENT_REQUIRED', message: 'Personalization is not configured for this property.' } });
  }

  const result = await convertRecommendationToMaintenanceTask({
    recommendationId: req.params.recommendationId,
    propertyId: context.propertyId,
    householdId: household.id,
    userId: context.userId,
    idempotencyKey: req.body.idempotencyKey,
  });
  if (result.status === 'RECOMMENDATION_NOT_FOUND') {
    return res.status(404).json({ success: false, error: { code: result.status, message: 'Recommendation not found.' } });
  }
  if (result.status === 'ACTION_NOT_SUPPORTED') {
    return res.status(409).json({ success: false, error: { code: result.status, message: 'This recommendation cannot become a maintenance task.' } });
  }
  return res.status(result.status === 'CREATED' ? 201 : 200).json({ success: true, data: result });
}
