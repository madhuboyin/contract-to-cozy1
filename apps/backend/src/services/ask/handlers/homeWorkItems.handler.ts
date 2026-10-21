// The home's open Home Operations work items (register P2 "Maintenance and Home Operations"; FRD v1.342). A read. The changes are
// HOME_WORK_ITEM_COMMAND (homeWorkItemCommands.handler.ts).
import { HouseholdRole, type OperationalWorkItemState, type RecommendationSafetyTier } from '@prisma/client';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, readableCode } from '../askFormatting';
import { listWorkItems } from '../../../modules/homeOperations/application/listWorkItems.usecase';
import { legalUserWorkItemTransitions } from '../../../modules/homeOperations/domain/userGovernance';
import {
  WORK_ITEM_ACTION_IDS, WORK_ITEM_ENTITY_TYPE, WORK_ITEM_MESSAGES, workItemBatchEligible, workItemChangeable,
} from '../support/homeWorkItemCommand';

const STATE_LABELS: Record<string, string> = {
  CANDIDATE: 'Not added', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', IN_GUIDANCE: 'In guidance', IN_PROJECT: 'In a project',
  BLOCKED: 'Blocked', DEFERRED: 'Paused', REPORTED_COMPLETE: 'Waiting for verification', REOPENED: 'Needs follow-up', FOLLOW_UP_DUE: 'Follow-up due',
};

export interface WorkItemView {
  id: string; title: string; state: OperationalWorkItemState; obligationType: string; safetyTier: RecommendationSafetyTier; dueAt: Date | null; dueWindowEnd: Date | null; snoozedUntil: Date | null;
  isRoutine: boolean; supersededByWorkItemId: string | null; subjectType?: string; homeownerReason?: string | null;
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
  const titleCounts = open.reduce((counts, item) => {
    const key = item.title.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const row = (item: WorkItemView) => {
    const due = item.dueAt ?? item.dueWindowEnd;
    const snoozed = item.snoozedUntil && item.snoozedUntil.getTime() > now.getTime();
    const overdue = Boolean(
      due
      && due.getTime() < now.getTime()
      && item.state !== 'CANDIDATE'
      && item.state !== 'REPORTED_COMPLETE'
      && !snoozed,
    );
    const meta = [
      overdue ? `Overdue since ${humanDate(due!)}` : due ? `Due ${humanDate(due)}` : 'No due date',
      snoozed ? `Snoozed until ${humanDate(item.snoozedUntil!)}` : null,
      item.state === 'REPORTED_COMPLETE' ? 'You marked this complete; it stays here until the outcome is verified' : null,
      item.state === 'CANDIDATE' ? 'Not yet added to your work' : null,
      item.isRoutine ? 'Routine' : null,
    ].filter((value): value is string => Boolean(value));
    const repeatedTitle = (titleCounts.get(item.title.trim().toLocaleLowerCase()) ?? 0) > 1;
    const recordContext = repeatedTitle
      ? item.homeownerReason?.trim() || (item.subjectType ? `${readableCode(item.subjectType)} · ${readableCode(item.obligationType)}` : readableCode(item.obligationType))
      : readableCode(item.obligationType);
    const context = item.state === 'CANDIDATE' ? `Recommendation · ${recordContext}` : recordContext;
    const legalStatusChanges = legalUserWorkItemTransitions({ state: item.state, safetyTier: item.safetyTier });
    const updateStatus = legalStatusChanges.length > 0
      ? [{ id: WORK_ITEM_ACTION_IDS.UPDATE_STATUS, label: 'Update status', message: WORK_ITEM_MESSAGES.UPDATE_STATUS, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'PRIMARY' as const }]
      : [];
    const actions = !canChange ? [] : item.state === 'REPORTED_COMPLETE'
      ? [
        { id: WORK_ITEM_ACTION_IDS.ATTACH_EVIDENCE, label: 'Add evidence', message: WORK_ITEM_MESSAGES.ATTACH_EXISTING, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const },
        ...updateStatus,
      ]
      : item.state === 'CANDIDATE'
        ? updateStatus
        : [
          ...updateStatus,
          { id: WORK_ITEM_ACTION_IDS.SNOOZE, label: 'Snooze', message: WORK_ITEM_MESSAGES.SNOOZE, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'QUIET' as const },
          { id: WORK_ITEM_ACTION_IDS.RESCHEDULE, label: 'Change due date', message: WORK_ITEM_MESSAGES.RESCHEDULE, interactionType: 'MUTATE_RECORD' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const },
        ];
    return {
      id: item.id, title: item.title, description: context, meta, status: STATE_LABELS[item.state] ?? null, href: null,
      tone: overdue ? 'CRITICAL' as const : 'DEFAULT' as const,
      entityType: WORK_ITEM_ENTITY_TYPE,
      actions,
    };
  };
  const rows = sorted.map((item) => ({ item, row: row(item) }));
  const sectionInputs = [
    { id: 'home-work-items-action', title: 'Needs action', items: rows.filter(({ item }) => item.state !== 'CANDIDATE' && item.state !== 'REPORTED_COMPLETE').map(({ row: listRow }) => listRow) },
    { id: 'home-work-items-verification', title: 'Waiting for verification', items: rows.filter(({ item }) => item.state === 'REPORTED_COMPLETE').map(({ row: listRow }) => listRow) },
    { id: 'home-work-items-recommendations', title: 'Recommendations', items: rows.filter(({ item }) => item.state === 'CANDIDATE').map(({ row: listRow }) => listRow) },
  ].filter((section) => section.items.length > 0);
  let previewBudget = 12;
  const sections = sectionInputs.map((section, index) => {
    const laterSections = sectionInputs.length - index - 1;
    const initialVisibleCount = Math.min(section.items.length, Math.max(1, previewBudget - laterSections));
    previewBudget = Math.max(0, previewBudget - initialVisibleCount);
    return { ...section, count: section.items.length, initialVisibleCount };
  });
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'home-work-items-summary', title: `${open.length} open work item${open.length === 1 ? '' : 's'}`,
      body: `${eligible ? `${eligible} routine suggestion${eligible === 1 ? '' : 's'} can be accepted together. ` : ''}${open.length > sorted.length ? `Showing ${sorted.length} soonest.` : 'Soonest due first.'}`,
      tone: 'DEFAULT',
      actions: canChange && eligible ? [{
        id: WORK_ITEM_ACTION_IDS.ACCEPT_ROUTINE, label: `Accept ${eligible} routine suggestion${eligible === 1 ? '' : 's'}`, message: WORK_ITEM_MESSAGES.ACCEPT_ROUTINE,
        interactionType: 'START_WORKFLOW' as const, operationId: 'HOME_WORK_ITEM_COMMAND' as const, style: 'SECONDARY' as const,
      }] : [],
    },
    { type: 'GROUPED_LIST', filters: [], id: 'home-work-items', title: 'Work items', description: null, listDensity: 'DENSE', sections, actions: [] },
  ];
  return { status: 'ANSWERED', reasonCode: 'HOME_WORK_ITEMS_FOUND', blocks, suggestions: [] };
}

registerCapabilityHandler('home-work-items.list', async (envelope, deps) => {
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const items = await listWorkItems({ propertyId: envelope.propertyId! });
  return homeWorkItemsFromRows(items as unknown as WorkItemView[], access.role !== HouseholdRole.VIEWER, new Date());
});
