// Seasonal checklist item controls inside Ask (register P2 "Seasonal Home Care"; FRD v1.343). Pure: declared messages, action ids, the snooze form and
// the state rules, mirroring seasonalChecklist.service and seasonalChecklistIntegration.service so only what they would accept is offered.
//
// Completing a seasonal task is completing its linked maintenance task (the seasonal item follows it), which Ask already does from the maintenance
// list; it is not repeated here.
import { z } from 'zod';

export const SEASONAL_ITEM_ENTITY_TYPE = 'SEASONAL_ITEM';
export const SEASONAL_ITEM_MESSAGES = {
  ADD: 'Add this seasonal task to my maintenance.',
  SNOOZE: 'Snooze this seasonal task.',
  DISMISS: 'Set this seasonal task aside.',
  RESTORE: 'Bring back this seasonal task.',
} as const;
export type SeasonalItemKind = keyof typeof SEASONAL_ITEM_MESSAGES;
export const SEASONAL_ITEM_ACTION_IDS = { ADD: 'seasonal-item-add', SNOOZE: 'seasonal-item-snooze', DISMISS: 'seasonal-item-dismiss', RESTORE: 'seasonal-item-restore' } as const;
export const seasonalItemKindFromMessage = (message: string): SeasonalItemKind | null =>
  ((Object.entries(SEASONAL_ITEM_MESSAGES) as Array<[SeasonalItemKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const SEASONAL_SNOOZE_CAPTURE_KEY = 'SEASONAL_ITEM_SNOOZE';
export const SEASONAL_SNOOZE_CHOICES = [{ value: '7', label: 'One week', days: 7 }, { value: '14', label: 'Two weeks', days: 14 }, { value: '30', label: 'One month', days: 30 }] as const;
export const SeasonalSnoozeSchema = z.object({ days: z.enum(['7', '14', '30']) }).strict();
export const parseSeasonalSnoozeAnswer = (answer: unknown) => SeasonalSnoozeSchema.safeParse(answer);

interface ItemState { status: string; priority: string; maintenanceTaskId: string | null; completed: boolean }
/**
 * The controls an item allows now. Add: a pending or snoozed item not yet in maintenance (contributor; the service also needs an existing-home setup).
 * Snooze and set aside: pending or snoozed; critical tasks cannot be set aside. Bring back: a dismissed item. Snooze, set aside and bring back are the
 * home's primary account holder only, because the service filters on it.
 */
export function seasonalItemKinds(item: ItemState, who: { canManage: boolean; isPrimaryHolder: boolean }): SeasonalItemKind[] {
  if (!who.canManage || item.completed) return [];
  const kinds: SeasonalItemKind[] = [];
  const open = item.status === 'RECOMMENDED' || item.status === 'ADDED' || item.status === 'SNOOZED' || item.status === 'PENDING';
  if (item.status === 'DISMISSED') {
    if (who.isPrimaryHolder) kinds.push('RESTORE');
    return kinds;
  }
  if (!open) return kinds;
  if (!item.maintenanceTaskId) kinds.push('ADD');
  if (who.isPrimaryHolder) {
    kinds.push('SNOOZE');
    if (item.priority !== 'CRITICAL') kinds.push('DISMISS');
  }
  return kinds;
}
