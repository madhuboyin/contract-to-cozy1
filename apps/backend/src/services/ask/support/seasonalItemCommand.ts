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
  REMOVE: 'Remove this seasonal task from my maintenance.',
} as const;
export type SeasonalItemKind = keyof typeof SEASONAL_ITEM_MESSAGES;
export const SEASONAL_ITEM_ACTION_IDS = { ADD: 'seasonal-item-add', SNOOZE: 'seasonal-item-snooze', DISMISS: 'seasonal-item-dismiss', RESTORE: 'seasonal-item-restore', REMOVE: 'seasonal-item-remove' } as const;
export const seasonalItemKindFromMessage = (message: string): SeasonalItemKind | null =>
  ((Object.entries(SEASONAL_ITEM_MESSAGES) as Array<[SeasonalItemKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

// Whole-checklist controls (Desktop's "Add all critical tasks" and "Dismiss this season"). The entity is the checklist, not a task.
export const SEASONAL_CHECKLIST_ENTITY_TYPE = 'SEASONAL_CHECKLIST';
export const SEASONAL_CHECKLIST_MESSAGES = {
  ADD_ALL_CRITICAL: 'Add all critical tasks on this seasonal checklist to my maintenance.',
  DISMISS_CHECKLIST: 'Dismiss this seasonal checklist.',
} as const;
export type SeasonalChecklistKind = keyof typeof SEASONAL_CHECKLIST_MESSAGES;
export const SEASONAL_CHECKLIST_ACTION_IDS = { ADD_ALL_CRITICAL: 'seasonal-checklist-add-critical', DISMISS_CHECKLIST: 'seasonal-checklist-dismiss' } as const;
export const seasonalChecklistKindFromMessage = (message: string): SeasonalChecklistKind | null =>
  ((Object.entries(SEASONAL_CHECKLIST_MESSAGES) as Array<[SeasonalChecklistKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;

interface ChecklistState { status: string; items: Array<{ status: string; priority: string }> }
/**
 * The whole-checklist controls the checklist allows now. Both are the home's primary account holder only, because the service filters on it. Add all
 * critical needs a high-priority task still waiting (RECOMMENDED, the service's own selection); dismiss needs a checklist not already dismissed.
 */
export function seasonalChecklistKinds(checklist: ChecklistState, who: { canManage: boolean; isPrimaryHolder: boolean }): SeasonalChecklistKind[] {
  if (!who.canManage || !who.isPrimaryHolder || checklist.status === 'DISMISSED') return [];
  const kinds: SeasonalChecklistKind[] = [];
  if (checklist.items.some((item) => item.priority === 'CRITICAL' && item.status === 'RECOMMENDED')) kinds.push('ADD_ALL_CRITICAL');
  kinds.push('DISMISS_CHECKLIST');
  return kinds;
}

export const SEASONAL_SNOOZE_CAPTURE_KEY = 'SEASONAL_ITEM_SNOOZE';
export const SEASONAL_SNOOZE_CHOICES = [{ value: '7', label: 'One week', days: 7 }, { value: '14', label: 'Two weeks', days: 14 }, { value: '30', label: 'One month', days: 30 }] as const;
export const SeasonalSnoozeSchema = z.object({ days: z.enum(['7', '14', '30']) }).strict();
export const parseSeasonalSnoozeAnswer = (answer: unknown) => SeasonalSnoozeSchema.safeParse(answer);

interface ItemState { status: string; priority: string; maintenanceTaskId: string | null; completed: boolean }
/**
 * The controls an item allows now. Add: a pending or snoozed item not yet in maintenance (contributor; the service also needs an existing-home setup). Remove: an open item that is in maintenance (contributor); it unlinks the maintenance task, which is kept.
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
  else kinds.push('REMOVE');
  if (who.isPrimaryHolder) {
    kinds.push('SNOOZE');
    if (item.priority !== 'CRITICAL') kinds.push('DISMISS');
  }
  return kinds;
}
