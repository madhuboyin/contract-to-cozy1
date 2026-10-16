import type { AskOperationId } from '../askOperationRegistry';

export interface OperationSpecificContinuationRecipe {
  label: string;
  message: string;
  operationId: AskOperationId;
  outcomeKey: string;
  reasonCode: string;
}
const recipe = (
  label: string,
  message: string,
  operationId: AskOperationId,
  outcomeKey: string,
  reasonCode: string,
): OperationSpecificContinuationRecipe => ({ label, message, operationId, outcomeKey, reasonCode });

/**
 * Phase 17 operation-specific continuation recipes. The key is the operation that produced the current result; every destination is
 * an existing typed Ask operation. These are domain continuations, not generic discovery starters, and are still rechecked by the
 * shared availability, authorization, lifecycle, deduplication and exact-four policy.
 */
export const OPERATION_SPECIFIC_CONTINUATION_RECIPES: Readonly<Partial<Record<AskOperationId, readonly OperationSpecificContinuationRecipe[]>>> = Object.freeze({
  MAINTENANCE_STATUS: [
    recipe('See what may be coming up', 'What maintenance might be coming up?', 'MAINTENANCE_FORECAST', 'REVIEW_MAINTENANCE_FORECAST', 'MAINTENANCE_RELATED_FORECAST'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'MAINTENANCE_RELATED_HOME_ACTIONS'),
  ],
  MAINTENANCE_FORECAST: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'FORECAST_RELATED_MAINTENANCE'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'FORECAST_RELATED_HOME_ACTIONS'),
  ],
  HOME_ACTIONS: [
    recipe('Review pending maintenance', 'What maintenance is pending?', 'MAINTENANCE_STATUS', 'REVIEW_MAINTENANCE_STATUS', 'HOME_ACTIONS_RELATED_MAINTENANCE'),
    recipe('Review open inspection findings', 'Show my open inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'HOME_ACTIONS_RELATED_INSPECTIONS'),
    recipe('Check recorded recalls', 'Show recalls that may affect my home', 'RECALL_REVIEW', 'REVIEW_RECALLS', 'HOME_ACTIONS_RELATED_RECALLS'),
  ],
  INVENTORY_LOOKUP: [
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'INVENTORY_RELATED_WARRANTIES'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'INVENTORY_RELATED_DOCUMENTS'),
    recipe('Check recorded recalls', 'Show recalls that may affect my home', 'RECALL_REVIEW', 'REVIEW_RECALLS', 'INVENTORY_RELATED_RECALLS'),
  ],
  WARRANTY_LOOKUP: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'WARRANTY_RELATED_INVENTORY'),
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'WARRANTY_RELATED_DOCUMENTS'),
    recipe('Review coverage gaps', 'Show coverage gaps for my recorded items', 'COVERAGE_GAPS', 'REVIEW_COVERAGE_GAPS', 'WARRANTY_RELATED_COVERAGE'),
  ],
  DOCUMENT_LOOKUP: [
    recipe('Review extracted records', 'Show document-derived records awaiting review', 'DOCUMENT_PROMOTION_REVIEW', 'REVIEW_DOCUMENT_PROMOTIONS', 'DOCUMENTS_RELATED_PROMOTIONS'),
    recipe('Review recorded warranties', 'Show my recorded warranties', 'WARRANTY_LOOKUP', 'REVIEW_WARRANTIES', 'DOCUMENTS_RELATED_WARRANTIES'),
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'DOCUMENTS_RELATED_INVENTORY'),
  ],
  DOCUMENT_PROMOTION_REVIEW: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'PROMOTIONS_RELATED_DOCUMENTS'),
    recipe('Review inspection findings', 'Show my inspection findings', 'INSPECTION_FINDINGS', 'REVIEW_INSPECTION_FINDINGS', 'PROMOTIONS_RELATED_INSPECTIONS'),
  ],
  RECALL_REVIEW: [
    recipe('Review home inventory', 'Show my home inventory', 'INVENTORY_LOOKUP', 'REVIEW_HOME_INVENTORY', 'RECALLS_RELATED_INVENTORY'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'RECALLS_RELATED_HOME_ACTIONS'),
  ],
  INSPECTION_FINDINGS: [
    recipe('Review home documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'INSPECTIONS_RELATED_DOCUMENTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'INSPECTIONS_RELATED_HOME_ACTIONS'),
  ],
  INCIDENT_CLAIM_STATUS: [
    recipe('Continue claim preparation', 'What should I do next for my active claim?', 'INCIDENT_CONTINUATION', 'CONTINUE_INCIDENT_WORK', 'CLAIMS_RELATED_CONTINUATION'),
    recipe('Review supporting documents', 'Show my home documents', 'DOCUMENT_LOOKUP', 'REVIEW_DOCUMENTS', 'CLAIMS_RELATED_DOCUMENTS'),
    recipe('Review all home priorities', 'What needs my attention around the home?', 'HOME_ACTIONS', 'REVIEW_HOME_ACTIONS', 'CLAIMS_RELATED_HOME_ACTIONS'),
  ],
});

export function operationSpecificContinuationOutcomeKeys(sourceOperationId: string): readonly string[] {
  return (OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId as AskOperationId] ?? [])
    .map((entry) => `${entry.operationId}:${entry.outcomeKey}`);
}
