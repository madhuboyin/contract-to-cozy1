import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { listBoard } from '../../homeStatusBoard.service';
import { listBoardQuerySchema } from '../../../validators/homeStatusBoard.validators';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';

// Status Board handler (HOME_STATUS_BOARD, adapter `status-board.read`). Moved out of askOrchestrator.service.ts as the
// pilot of its decomposition (FRD v1.97, docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md): the body is
// unchanged, the handler registers itself, and the orchestrator re-exports its names so existing imports keep working.

// Status Board capability-card slice (FRD v1.51): the fourth new operation for a capability with none. Reads listBoard,
// the same call the page's route makes, for the first 100 visible items (the route's maximum page). Like the route,
// listBoard first creates missing board rows and recomputes stale derived statuses. Read-only.
type StatusBoardView = Awaited<ReturnType<typeof listBoard>>;
const STATUS_BOARD_CONDITIONS = [
  { key: 'ACTION_NEEDED', title: 'Needs action' },
  { key: 'MONITOR', title: 'Monitor' },
  { key: 'GOOD', title: 'In good shape' },
] as const;
export const STATUS_BOARD_ASK_LIMIT = 100;

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

export function statusBoardFromView(view: StatusBoardView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/status-board`;
  const items: any[] = view.items ?? [];
  const total: number = view.pagination?.total ?? items.length;
  const count = (condition: string) => items.filter((item) => item.condition === condition).length;
  const needsDate = items.filter((item) => item.needsInstallDateForPrediction).length;
  const truncated = total > items.length;
  const limitations = [
    ...(truncated ? [`Showing the first ${items.length} of ${total} items, pinned and most urgent first; the rest are on the Status Board.`] : []),
    ...(needsDate ? [`${needsDate} item${needsDate === 1 ? ' needs' : 's need'} an install or purchase date before ${needsDate === 1 ? 'its' : 'their'} condition can be predicted.`] : []),
  ];
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'status-board-summary',
    title: total
      ? `${count('ACTION_NEEDED')} need action, ${count('MONITOR')} to monitor, ${count('GOOD')} in good shape`
      : 'Nothing is on the Status Board yet',
    body: total
      ? `Across ${total} recorded appliance${total === 1 ? '' : 's'} and system${total === 1 ? '' : 's'}${truncated ? ` (counts cover the ${items.length} shown)` : ''}.`
      : 'The Status Board tracks appliances and systems recorded in Inventory. Add them there to see their condition here.',
    tone: count('ACTION_NEEDED') ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-status-board', label: 'Open Status Board', href: pageHref, style: 'PRIMARY' }],
  }];
  if (limitations.length) blocks.push({ type: 'LIMITATION', id: 'status-board-limits', title: 'What this does not cover', body: limitations.join(' '), severity: 'INFO' });
  const sections = STATUS_BOARD_CONDITIONS.map(({ key, title }) => {
    const rows = items.filter((item) => item.condition === key);
    return {
      id: `status-board-${key.toLowerCase().replace(/_/g, '-')}`, title, count: rows.length,
      items: rows.slice(0, 25).map((item) => ({
        title: item.displayName || readableCode(item.category),
        description: (item.computedReasons ?? []).filter((reason: any) => reason?.code !== 'ALL_CLEAR' && reason?.detail).map((reason: any) => reason.detail).join('; ') || null,
        // A card's meta holds at most six entries (the contract's limit). A fully recorded item has seven, and the
        // category is the one a card can do without (FRD v1.84: before, such an item failed the contract).
        meta: statusBoardMeta(item),
        status: String(item.condition),
        href: item.deepLinks?.viewItem ?? pageHref,
        ...statusBoardShelfFacts(item),
        ...statusBoardCaptureFields(item),
      })),
    };
  }).filter((section) => section.count > 0);
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'status-board-items', title: 'Appliances and systems by condition', // IW-PRES-014 / IW-PRES-022: the Status Board renders as shelves (FRD v1.84); the cards are read-only.
      presentation: { pattern: 'SHELVES' }, description: 'Each with why, from age, warranty and maintenance records.', sections,
      actions: [{ id: 'open-status-board', label: 'Open Status Board', href: pageHref, style: 'SECONDARY' }] });
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
    suggestions: ['What maintenance is due?', 'Should I repair or replace my oldest appliance?'],
  };
}

async function homeStatusBoardResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const view = await listBoard(propertyId, listBoardQuerySchema.parse({ limit: String(STATUS_BOARD_ASK_LIMIT) }), userId);
  return statusBoardFromView(view, propertyId);
}

registerCapabilityHandler('status-board.read', async (envelope) => homeStatusBoardResult(envelope.userId, envelope.propertyId!));
