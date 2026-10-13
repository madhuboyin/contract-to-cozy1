// The home's open Home Operations work items (register P2 "Maintenance and Home Operations"; FRD v1.342). A read. The changes are
// HOME_WORK_ITEM_COMMAND (homeWorkItemCommands.handler.ts).
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, readableCode } from '../askFormatting';
import { listWorkItems } from '../../../modules/homeOperations/application/listWorkItems.usecase';
import {
  WORK_ITEM_ACTION_IDS, WORK_ITEM_ENTITY_TYPE, WORK_ITEM_MESSAGES, workItemBatchEligible, workItemChangeable,
} from '../support/homeWorkItemCommand';

const STATE_LABELS: Record<string, string> = {
  CANDIDATE: 'Suggested', ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', IN_GUIDANCE: 'In guidance', IN_PROJECT: 'In a project',
  BLOCKED: 'Blocked', DEFERRED: 'Deferred', REPORTED_COMPLETE: 'Reported complete', REOPENED: 'Reopened', FOLLOW_UP_DUE: 'Follow-up due',
};

export interface WorkItemView {
  id: string; title: string; state: string; obligationType: string; safetyTier: string; dueAt: Date | null; dueWindowEnd: Date | null; snoozedUntil: Date | null;
  isRoutine: boolean; supersededByWorkItemId: string | null;
}

export function homeWorkItemsFromRows(items: WorkItemView[], canChange: boolean, now: Date): AskOperationResult {
  const open = items.filter(workItemChangeable);
  if (open.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'NO_OPEN_WORK_ITEMS',
      blocks: [{ type: 'EMPTY_STATE', id: 'home-work-items-empty', title: 'No open work items', body: 'Nothing is open in your home operations list right now.', actions: [] }], suggestions: [],
    };
  }
  const sorted = [...open].sort((a, b) => {
    const left = a.dueAt?.getTime() ?? a.dueWindowEnd?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const right = b.dueAt?.getTime() ?? b.dueWindowEnd?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  }).slice(0, 40);
  const eligible = open.filter(workItemBatchEligible).length;
  const row = (item: WorkItemView) => {
    const due = item.dueAt ?? item.dueWindowEnd;
    const snoozed = item.snoozedUntil && item.snoozedUntil.getTime() > now.getTime();
    const meta = [
      due ? `Due ${humanDate(due)}` : 'No due date',
      snoozed ? `Snoozed until ${humanDate(item.snoozedUntil!)}` : null,
      item.isRoutine ? 'Routine' : null,
    ].filter((value): value is string => Boolean(value));
    return {
      id: item.id, title: item.title, description: readableCode(item.obligationType), meta, status: STATE_LABELS[item.state] ?? item.state, href: null,
      entityType: WORK_ITEM_ENTITY_TYPE,
      actions: canChange ? [
        { id: WORK_ITEM_ACTION_IDS.SNOOZE, label: 'Snooze', message: WORK_ITEM_MESSAGES.SNOOZE, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'QUIET' as const },
        { id: WORK_ITEM_ACTION_IDS.RESCHEDULE, label: 'Change due date', message: WORK_ITEM_MESSAGES.RESCHEDULE, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const },
      ] : [],
    };
  };
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'home-work-items-summary', title: `${open.length} open work item${open.length === 1 ? '' : 's'}`,
      body: `${eligible ? `${eligible} routine low-risk suggestion${eligible === 1 ? '' : 's'} can be accepted together. ` : ''}Snoozing only hides reminders; changing the due date replaces the date it is due.${open.length > sorted.length ? ` Showing the first ${sorted.length}, soonest due first.` : ''}`,
      tone: 'DEFAULT',
      actions: canChange && eligible ? [{
        id: WORK_ITEM_ACTION_IDS.ACCEPT_ROUTINE, label: `Accept ${eligible} routine suggestion${eligible === 1 ? '' : 's'}`, message: WORK_ITEM_MESSAGES.ACCEPT_ROUTINE,
        interactionType: 'START_WORKFLOW' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const,
      }] : [],
    },
    { type: 'GROUPED_LIST', filters: [], id: 'home-work-items', title: 'Work items', description: 'Soonest due first.', sections: [{ id: 'home-work-items-open', title: 'Open', count: sorted.length, items: sorted.map(row) }], actions: [] },
  ];
  return { status: 'ANSWERED', reasonCode: 'HOME_WORK_ITEMS_FOUND', blocks, suggestions: [] };
}

registerCapabilityHandler('home-work-items.list', async (envelope, deps) => {
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const items = await listWorkItems({ propertyId: envelope.propertyId! });
  return homeWorkItemsFromRows(items as unknown as WorkItemView[], access.role !== HouseholdRole.VIEWER, new Date());
});
