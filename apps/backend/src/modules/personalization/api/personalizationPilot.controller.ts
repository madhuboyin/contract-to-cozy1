import { Response } from 'express';
import { CustomRequest } from '../../../types';
import { isToolEnabled } from '../../../config/featureFlags';
import {
  getPilotPersonalization,
  optInToPilotPersonalization,
  resetPilotPersonalization,
} from '../application/getPilotPersonalization.usecase';
import { recordRecommendationFeedback } from '../application/recordRecommendationFeedback.usecase';
import { recommendationBelongsToProperty } from '../infrastructure/pilotRepository';
import { findPilotHousehold } from '../infrastructure/pilotRepository';
import { recordProfileAnswer } from '../application/recordProfileAnswer.usecase';

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
  const data = await getPilotPersonalization(context.propertyId, context.userId);
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
  const household = await findPilotHousehold(context.propertyId, context.userId);
  if (!household || !(await recommendationBelongsToProperty(recommendationId, context.propertyId, household.id))) {
    return res.status(404).json({ success: false, error: { code: 'RECOMMENDATION_NOT_FOUND', message: 'Recommendation not found.' } });
  }
  const result = await recordRecommendationFeedback({ recommendationId, ...req.body });
  return res.status(result.status === 'RECORDED' ? 201 : 200).json({ success: true, data: result });
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
