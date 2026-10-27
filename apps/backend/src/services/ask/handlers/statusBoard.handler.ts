import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { prisma } from '../../../lib/prisma';
import { listBoard } from '../../homeStatusBoard.service';
import { listBoardQuerySchema } from '../../../validators/homeStatusBoard.validators';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { collectionDescriptor } from '../support/collectionDescriptor';
import {
  STATUS_BOARD_COMMAND_ACTION_IDS, STATUS_BOARD_COMMAND_MESSAGES, STATUS_BOARD_HIDDEN_ACTION_ID, STATUS_BOARD_HIDDEN_MESSAGE, STATUS_BOARD_ITEM_ENTITY_TYPE, STATUS_BOARD_PROPERTY_ENTITY_TYPE,
} from '../support/statusBoardCommand';

// Status Board handler (HOME_STATUS_BOARD, adapter `status-board.read`). Moved out of askOrchestrator.service.ts as the
// pilot of its decomposition (FRD v1.97, docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md): the body is
// unchanged, the handler registers itself, and the orchestrator re-exports its names so existing imports keep working.

// Status Board capability-card slice (FRD v1.51): the fourth new operation for a capability with none. Reads listBoard,
// the same call the page's route makes, for the first 100 visible items (the route's maximum page). Like the route,
// listBoard first creates missing board rows and recomputes stale derived statuses. Read-only.
// FRD v1.319: the Ask read no longer creates rows or recomputes (listBoard readOnly): refreshing is the explicit "Refresh the board" action, which a
// contributor or owner confirms. Correcting an item (condition, recommendation, dates, note, pin, hide) is a row action, behind the same floor.
type StatusBoardView = Awaited<ReturnType<typeof listBoard>>;
const STATUS_BOARD_CONDITIONS = [
  { key: 'ACTION_NEEDED', title: 'Needs action' },
  { key: 'MONITOR', title: 'Monitor' },
  { key: 'GOOD', title: 'In good shape' },
] as const;
// FRD Presentation Quality 1A: an item whose condition cannot be predicted (no install date) is UNKNOWN, never "in good
// shape". The board service only flags it while its stored condition is GOOD, so it is classified once here, server-side:
// an actionable or monitored item that also lacks a date stays in its (more urgent) condition section.
export const STATUS_BOARD_MISSING_INFO_SECTION_ID = 'status-board-needs-info';
export const statusBoardIsUnknown = (item: { condition?: unknown; needsInstallDateForPrediction?: boolean | null }): boolean =>
  Boolean(item.needsInstallDateForPrediction) && item.condition === 'GOOD';
export const STATUS_BOARD_ASK_LIMIT = 100;
const STATUS_BOARD_INITIAL_VISIBLE = 6;

// IW-PRES-014 (FRD v1.84): the shelf-card facts for one Status Board item. Only "Needs action" is a caution; the
// timing line is the recorded age, or says the install date is missing. No cost is recorded here.
export function statusBoardShelfFacts(item: { condition?: unknown; ageYears?: number | null; needsInstallDateForPrediction?: boolean | null }): { tone: 'DEFAULT' | 'CAUTION'; timingLabel: string | null } {
  return {
    tone: item.condition === 'ACTION_NEEDED' ? 'CAUTION' : 'DEFAULT',
    timingLabel: item.ageYears != null ? `${item.ageYears} yr old` : item.needsInstallDateForPrediction ? 'Install date needed' : null,
  };
}

// P1 inline capture (FRD v1.100): an item whose install date is missing gets an "Add install date" capture, the same
// INVENTORY_ITEM_CORRECT flow the Appliance Oracle uses for a missing purchase date. The action dispatches with the
// card's id, so such a card carries the inventory item's id (not the board row's) and the INVENTORY_ITEM entity type.
export function statusBoardCaptureFields(item: { id: string; inventoryItemId?: string | null; needsInstallDateForPrediction?: boolean | null }): { id: string; entityType?: string; actions?: Array<{ id: string; label: string; message: string; style: 'PRIMARY'; interactionType: 'MUTATE_RECORD'; operationId: string }> } {
  if (!item.needsInstallDateForPrediction || !item.inventoryItemId) return { id: item.id };
  return {
    id: item.inventoryItemId, entityType: 'INVENTORY_ITEM',
    actions: [{ id: 'correct-installedOn', label: 'Add install date', message: 'Correct the install date of this inventory item.', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'INVENTORY_ITEM_CORRECT' }],
  };
}

export function statusBoardMeta(item: any): string[] {
  const entries = [
    readableCode(item.recommendation),
    readableCode(item.category),
    ...(item.ageYears != null ? [`${item.ageYears} yr old`] : []),
    ...(item.warrantyStatus ? [`Warranty: ${readableCode(item.warrantyStatus)}`] : []),
    ...(item.pendingMaintenance ? [`${item.pendingMaintenance} open maintenance task${item.pendingMaintenance === 1 ? '' : 's'}`] : []),
    ...(item.room?.name ? [item.room.name] : []),
    ...(item.isPinned ? ['Pinned'] : []),
  ];
  return entries.length > 6 ? entries.filter((_, index) => index !== 1) : entries;
}

// Presentation Quality 3B: the summary body leads with what matters (the most urgent item, named with its recorded reason), says
// plainly when nothing could be rated, and keeps the estimation basis beside the claim instead of only in the closing boundary.
// A title that reads like an internal key is record data, not language, so it is never quoted (the answer checker rejects it).
const INTERNAL_KEY_LIKE = /\b[A-Z]{3,}_[A-Z0-9_]{2,}\b/;
export function statusBoardLead(input: { items: any[]; actionNeeded: number; monitor: number; good: number; unknown: number; total: number; truncated: boolean }): string {
  const { items, actionNeeded, monitor, good, unknown, total, truncated } = input;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  let lead: string;
  if (actionNeeded > 0) {
    const top = items.find((item) => item.condition === 'ACTION_NEEDED' && !statusBoardIsUnknown(item));
    const name = top ? String(top.displayName || readableCode(top.category)) : '';
    const reason = top ? (top.computedReasons ?? []).find((entry: any) => entry?.code !== 'ALL_CLEAR' && entry?.detail)?.detail : null;
    lead = name && !INTERNAL_KEY_LIKE.test(name)
      ? `Start with ${name}${reason && !INTERNAL_KEY_LIKE.test(String(reason)) ? `: ${String(reason).replace(/[.]+$/, '')}` : ''}.`
      : `${actionNeeded} ${plural(actionNeeded, 'item needs', 'items need')} action first.`;
  } else if (monitor > 0) {
    lead = `Nothing needs action right now; ${monitor} ${plural(monitor, 'item is', 'items are')} worth keeping an eye on.`;
  } else if (good > 0) {
    lead = unknown > 0
      ? `Nothing needs action among the ${good} ${plural(good, 'item', 'items')} with a recorded age.`
      : 'Nothing needs action or monitoring right now.';
  } else {
    lead = 'None of these items has enough recorded dates to be rated yet.';
  }
  const unrated = unknown > 0 && good + monitor + actionNeeded > 0 ? ` ${unknown} ${plural(unknown, 'is', 'are')} not rated yet because ${plural(unknown, 'its', 'their')} install or purchase date is missing.` : '';
  return `${lead}${unrated} Condition is estimated from recorded age, expected life, warranty and maintenance, across ${total} recorded ${plural(total, 'item', 'items')}${truncated ? ` (counts cover the ${items.length} shown)` : ''}.`;
}

export function statusBoardFromView(view: StatusBoardView, propertyId: string, canChange = false, hidden: { count?: number; only?: boolean } = {}): AskOperationResult {
  const items: any[] = (view.items ?? []).filter((item: any) => !hidden.only || item.isHidden);
  const total: number = hidden.only ? items.length : view.pagination?.total ?? items.length;
  const unknownCount = items.filter(statusBoardIsUnknown).length;
  const count = (condition: string) => items.filter((item) => item.condition === condition && !statusBoardIsUnknown(item)).length;
  const needsDate = items.filter((item) => item.needsInstallDateForPrediction).length;
  const truncated = total > items.length;
  const limitations = [
    ...(hidden.only && (view.pagination?.total ?? 0) > (view.items ?? []).length ? [`Only the first ${(view.items ?? []).length} of ${view.pagination?.total} items were searched for hidden ones.`] : []),
    ...(truncated ? [`Showing the first ${items.length} of ${total} items, pinned and most urgent first; the rest are on the Status Board.`] : []),
    ...(needsDate ? [`${needsDate} item${needsDate === 1 ? ' needs' : 's need'} an install or purchase date before ${needsDate === 1 ? 'its' : 'their'} condition can be predicted.`] : []),
  ];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'status-board-summary',
    title: hidden.only
      ? (total ? `${total} hidden ${total === 1 ? 'item' : 'items'}` : 'No items are hidden')
      : total
      ? `${count('ACTION_NEEDED')} need action, ${count('MONITOR')} to monitor, ${count('GOOD')} in good shape`
      : 'Nothing is on the Status Board yet',
    body: hidden.only
      ? (total ? 'These items are kept off the board and out of its counts. Open one to show it again.' : 'Every item is on the board.')
      : total
      ? statusBoardLead({ items, actionNeeded: count('ACTION_NEEDED'), monitor: count('MONITOR'), good: count('GOOD'), unknown: unknownCount, total, truncated })
      : canChange
        ? 'The Status Board tracks appliances and systems recorded in Inventory. If you have recorded some, refresh the board to bring them in; otherwise add them there to see their condition here.'
        : 'The Status Board tracks appliances and systems recorded in Inventory. Add them there to see their condition here.',
    tone: !hidden.only && count('ACTION_NEEDED') ? 'CAUTION' : 'DEFAULT',
    actions: hidden.only ? [{ id: 'status-board-back-to-board', label: 'Back to the status board', interactionType: 'START_WORKFLOW' as const, message: 'Show my status board', operationId: 'HOME_STATUS_BOARD' as const, style: 'PRIMARY' as const }] : [
      ...(hidden.count ? [{ id: STATUS_BOARD_HIDDEN_ACTION_ID, label: `Show hidden items (${hidden.count})`, interactionType: 'START_WORKFLOW' as const, message: STATUS_BOARD_HIDDEN_MESSAGE, operationId: 'HOME_STATUS_BOARD' as const, style: 'SECONDARY' as const }] : []),
      ...(canChange ? [{
      id: STATUS_BOARD_COMMAND_ACTION_IDS.REFRESH, label: 'Refresh the board', interactionType: 'START_WORKFLOW' as const, message: STATUS_BOARD_COMMAND_MESSAGES.REFRESH,
      operationId: 'STATUS_BOARD_COMMAND' as const, entityType: STATUS_BOARD_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
    }] : []),
    ],
  }];
  if (limitations.length) blocks.push({ type: 'LIMITATION', id: 'status-board-limits', title: 'What this does not cover', body: limitations.join(' '), severity: 'INFO' });
  const sectionDefs = [
    ...STATUS_BOARD_CONDITIONS.map(({ key, title }) => ({
      id: `status-board-${key.toLowerCase().replace(/_/g, '-')}`, title,
      rows: items.filter((item) => item.condition === key && !statusBoardIsUnknown(item)),
    })),
    ...(unknownCount ? [{ id: STATUS_BOARD_MISSING_INFO_SECTION_ID, title: 'Missing information', rows: items.filter(statusBoardIsUnknown) }] : []),
  ];
  const sections = sectionDefs.map(({ id, title, rows }) => {
    return {
      id, title, count: rows.length,
      // Every fetched row is delivered (the board read is at most 100, the block's per-section limit); the shelf stays compact
      // through `initialVisibleCount` and a local "Show more", so a section's count is never larger than what it carries.
      initialVisibleCount: STATUS_BOARD_INITIAL_VISIBLE,
      items: rows.map((item) => ({
        title: item.displayName || readableCode(item.category),
        description: (item.computedReasons ?? []).filter((reason: any) => reason?.code !== 'ALL_CLEAR' && reason?.detail).map((reason: any) => reason.detail).join('; ') || null,
        // A card's meta holds at most six entries (the contract's limit). A fully recorded item has seven, and the
        // category is the one a card can do without (FRD v1.84: before, such an item failed the contract).
        meta: statusBoardMeta(item),
        status: String(item.condition),
        needsInfo: Boolean(item.needsInstallDateForPrediction),
        href: null,
        ...statusBoardShelfFacts(item),
        // The install-date capture writes the inventory item, which a viewer cannot do: offer it only to someone who can, so a
        // viewer is not shown an action the server would refuse.
        ...(canChange ? statusBoardCaptureFields(item) : { id: item.id }),
        // An item that needs its install date keeps that capture (it dispatches with the inventory id); every other item can be corrected.
        ...(canChange && !item.needsInstallDateForPrediction ? {
          entityType: STATUS_BOARD_ITEM_ENTITY_TYPE,
          actions: [{
            id: STATUS_BOARD_COMMAND_ACTION_IDS.CORRECT, label: 'Correct this item', message: STATUS_BOARD_COMMAND_MESSAGES.CORRECT,
            operationId: 'STATUS_BOARD_COMMAND' as const, interactionType: 'MUTATE_RECORD' as const, style: 'SECONDARY' as const,
          }],
        } : {}),
      })),
    };
  });
  if (items.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'status-board-items', title: 'Explore your home status',
      presentation: { pattern: 'STATUS_ACCORDION' }, description: 'Each with why, from age, warranty and maintenance records.', sections,
      // The Ask read is the board's first page only and has no inline continuation, so a board larger than that says so here.
      collection: collectionDescriptor({ sourceTotal: total, fetchedCount: items.length, sections, nextPageAvailable: false }),
      actions: [] });
  }
  blocks.push({
    type: 'BOUNDARY', id: 'status-board-boundary', title: 'Estimated condition, not an inspection',
    body: 'Condition is estimated from recorded age, expected life, warranty and maintenance. It cannot see wear, leaks or damage; a professional inspection can.',
    severity: 'INFO', suggestions: [],
  });
  return {
    status: limitations.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: total ? (count('ACTION_NEEDED') ? 'STATUS_BOARD_ACTION_NEEDED' : 'STATUS_BOARD_REVIEWED') : 'STATUS_BOARD_EMPTY',
    blocks,
    suggestions: [],
  };
}

async function homeStatusBoardResult(userId: string, propertyId: string, canChange: boolean, hiddenOnly = false): Promise<AskOperationResult> {
  const view = await listBoard(propertyId, listBoardQuerySchema.parse({ limit: String(STATUS_BOARD_ASK_LIMIT), ...(hiddenOnly ? { includeHidden: 'true' } : {}) }), userId, { readOnly: true });
  if (hiddenOnly) return statusBoardFromView(view, propertyId, canChange, { only: true });
  // The board leaves hidden items out, so the way back to them is offered only when there are some.
  const count = await prisma.homeItem.count({ where: { propertyId, status: { is: { isHidden: true } } } });
  return statusBoardFromView(view, propertyId, canChange, { count });
}

registerCapabilityHandler('status-board.read', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  const hiddenOnly = envelope.launchContext?.operationId === 'HOME_STATUS_BOARD' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === STATUS_BOARD_HIDDEN_MESSAGE;
  return homeStatusBoardResult(envelope.userId, envelope.propertyId!, access.role !== 'VIEWER', hiddenOnly);
});
