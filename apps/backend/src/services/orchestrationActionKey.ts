// apps/backend/src/services/orchestrationActionKey.ts
import { OrchestratedAction } from './orchestration.service';

export function computeActionKey(action: Pick<
  OrchestratedAction,
  | 'propertyId'
  | 'source'
  | 'serviceCategory'
  | 'systemType'
  | 'category'
  | 'checklistItemId'
  | 'orchestrationActionId'
>) {
  // Highest precision first
  const assetKey =
    action.orchestrationActionId ??
    action.checklistItemId ??
    action.serviceCategory ??
    action.systemType ??
    action.category ??
    'UNKNOWN';

  return [
    action.propertyId,
    action.source,
    String(assetKey).toUpperCase(),
  ].join(':');
}
