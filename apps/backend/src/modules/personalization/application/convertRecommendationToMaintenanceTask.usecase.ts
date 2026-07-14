import { PropertyMaintenanceTaskService } from '../../../services/PropertyMaintenanceTask.service';
import { buildMaintenanceTaskFromRecommendation } from '../adapters/recommendationPlacement.adapter';
import { loadActiveRecommendationForAction } from '../infrastructure/pilotRepository';
import { recordRecommendationFeedback } from './recordRecommendationFeedback.usecase';

export type ConvertRecommendationStatus = 'CREATED' | 'EXISTING' | 'RECOMMENDATION_NOT_FOUND' | 'ACTION_NOT_SUPPORTED';

export async function convertRecommendationToMaintenanceTask(params: {
  recommendationId: string;
  propertyId: string;
  householdId: string;
  userId: string;
  idempotencyKey: string;
}) {
  const recommendation = await loadActiveRecommendationForAction(
    params.recommendationId,
    params.propertyId,
    params.householdId,
  );
  if (!recommendation) return { status: 'RECOMMENDATION_NOT_FOUND' as const };

  const taskInput = buildMaintenanceTaskFromRecommendation(recommendation);
  if (!taskInput) return { status: 'ACTION_NOT_SUPPORTED' as const };

  const result = await PropertyMaintenanceTaskService.createFromActionCenter(
    params.userId,
    params.propertyId,
    taskInput,
  );
  await recordRecommendationFeedback({
    recommendationId: params.recommendationId,
    eventId: params.idempotencyKey,
    type: 'ACCEPTED',
    explicit: true,
  });

  return {
    status: result.deduped ? 'EXISTING' as const : 'CREATED' as const,
    task: result.task,
    deduped: result.deduped,
  };
}
