import { PropertyMaintenanceTaskService } from '../../../services/PropertyMaintenanceTask.service';
import { buildMaintenanceTaskFromRecommendation } from '../adapters/recommendationPlacement.adapter';
import { loadActiveRecommendationForAction } from '../infrastructure/pilotRepository';
import { recordRecommendationFeedback } from './recordRecommendationFeedback.usecase';

export type ConvertRecommendationStatus = 'CREATED' | 'EXISTING' | 'RECOMMENDATION_NOT_FOUND' | 'ACTION_NOT_SUPPORTED';

export async function convertRecommendationToMaintenanceTask(params: {
  recommendationId: string;
  propertyId: string;
  householdId?: string | null;
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
    // Acceptance is a recommendation outcome, not an HTTP-attempt outcome.
    // A stable event ID prevents retries with a fresh request key from
    // inflating Phase 3 quality metrics after task-action deduplication.
    eventId: `personalization-task-accepted:${params.recommendationId}`,
    type: 'ACCEPTED',
    explicit: true,
  });

  return {
    status: result.deduped ? 'EXISTING' as const : 'CREATED' as const,
    task: result.task,
    deduped: result.deduped,
  };
}
