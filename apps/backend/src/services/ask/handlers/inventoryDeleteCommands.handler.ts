import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import type { CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import type { ConfirmCapabilityContext, ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { inventoryItemContextVersion, roomContextVersion } from '../suggestedActions/domainVersions';
import { INVENTORY_DELETE_MESSAGE, ROOM_DELETE_MESSAGE } from '../support/inventoryDeleteCommand';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import { InventoryService } from '../../inventory.service';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from '../../coverageAnalysis.service';
import { markReplaceRepairStale } from '../../replaceRepairAnalysis.service';
import { markRiskPremiumOptimizerStale } from '../../riskPremiumOptimizer.service';
import { markDoNothingRunsStale } from '../../doNothingSimulator.service';

const inventoryService = new InventoryService();

type Launch = CreateAskExecutionRequest['launchContext'];

const DeleteInputSchema = z.object({ kind: z.enum(['ITEM', 'ROOM']), id: z.string().min(1) });

const gone = (kind: 'item' | 'room'): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: kind === 'item' ? 'INVENTORY_DELETE_TARGET_MISSING' : 'ROOM_DELETE_TARGET_MISSING',
  blocks: [{ type: 'SUMMARY', id: `${kind}-delete-missing`, title: `That ${kind} is no longer available`, body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [],
});

const confirmationFor = (kind: 'item' | 'room', id: string, name: string, description: string, fields: Array<{ label: string; value: string }>, expiresAt: Date) => ({
  confirmationId: `${kind}-delete-${id}-1`, version: 1, title: `Delete ${kind} "${name}"?`, description, fields, editableFields: [],
  confirmLabel: `Delete ${kind}`, consentText: `I authorize deleting this ${kind} from the shared home record.`, expiresAt: expiresAt.toISOString(),
});

export const isInventoryDeleteMessage = (message: string) => message.trim() === INVENTORY_DELETE_MESSAGE;
export const isRoomDeleteMessage = (message: string) => message.trim() === ROOM_DELETE_MESSAGE;

export async function inventoryDeleteResult(userId: string, propertyId: string, launch: Launch): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const item = launch?.entityId ? await prisma.inventoryItem.findFirst({
    where: { id: launch.entityId, propertyId }, select: { id: true, name: true, category: true, updatedAt: true, room: { select: { name: true } }, _count: { select: { documents: true } } },
  }) : null;
  if (!item) return gone('item');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = inventoryItemContextVersion(item as never);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INVENTORY_DELETE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { inventoryDelete: { kind: 'ITEM', id: item.id }, inventoryDeleteContextVersion: contextVersion, sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'inventory-delete-review', title: `Review deleting ${item.name}`, body: 'No shared-home record has changed yet. Deleting cannot be undone.', tone: 'CAUTION', actions: [] }],
    confirmation: confirmationFor('item', item.id, item.name, 'This removes the item from the shared home inventory. Documents linked to it stay in Home Records but are unlinked. Dependent coverage and replace-or-repair analyses are marked for refresh.',
      [{ label: 'Item', value: item.name }, ...(item.room?.name ? [{ label: 'Room', value: item.room.name }] : []), { label: 'Linked documents', value: String(item._count.documents) }], expiresAt),
    suggestions: [],
  };
}

export async function roomDeleteResult(userId: string, propertyId: string, launch: Launch): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const room = launch?.entityId ? await prisma.inventoryRoom.findFirst({
    where: { id: launch.entityId, propertyId }, select: { id: true, name: true, type: true, floorLevel: true, updatedAt: true, _count: { select: { items: true } } },
  }) : null;
  if (!room) return gone('room');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const contextVersion = roomContextVersion(room as never);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_DELETE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { inventoryDelete: { kind: 'ROOM', id: room.id }, inventoryDeleteContextVersion: contextVersion, sourceExecutionId: launch?.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'room-delete-review', title: `Review deleting ${room.name}`, body: 'No shared-home record has changed yet. Deleting cannot be undone.', tone: 'CAUTION', actions: [] }],
    confirmation: confirmationFor('room', room.id, room.name, 'The items in this room are kept and become unassigned. Dependent coverage analysis is marked for refresh.',
      [{ label: 'Room', value: room.name }, { label: 'Items that become unassigned', value: String(room._count.items) }], expiresAt),
    suggestions: [],
  };
}

export async function confirmInventoryDelete(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult | null> {
  const { execution, userId, parameters } = ctx;
  const parsed = DeleteInputSchema.safeParse(parameters.inventoryDelete);
  if (!parsed.success) return null;
  const propertyId = execution.propertyId!;
  const { kind, id } = parsed.data;
  const item = kind === 'ITEM' ? await prisma.inventoryItem.findFirst({ where: { id, propertyId }, select: { id: true, name: true, category: true, updatedAt: true } }) : null;
  const room = kind === 'ROOM' ? await prisma.inventoryRoom.findFirst({ where: { id, propertyId }, select: { id: true, name: true, type: true, floorLevel: true, updatedAt: true } }) : null;
  const target = item ?? room;
  if (!target) throw Object.assign(new Error(`This ${kind === 'ITEM' ? 'item' : 'room'} is no longer available. It may have been deleted.`), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  {
    const version = item ? inventoryItemContextVersion(item as never) : roomContextVersion(room as never);
    if (parameters.inventoryDeleteContextVersion !== version) throw Object.assign(new Error(`This ${kind === 'ITEM' ? 'item' : 'room'} changed while confirmation was open. Review it and try again.`), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    if (item) {
      await inventoryService.deleteItem(propertyId, item.id);
      await markCoverageAnalysisStale(propertyId);
      await markItemCoverageAnalysesStale(propertyId, item.id);
      await markReplaceRepairStale(propertyId, item.id);
    } else {
      await inventoryService.deleteRoom(propertyId, id);
    }
    // The traditional DELETE controllers (not the services) mark these stale; repeat them for the same downstream effect.
    if (!item) await markCoverageAnalysisStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  const name = target.name;
  const label = kind === 'ITEM' ? 'Item' : 'Room';
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: kind === 'ITEM' ? 'INVENTORY_ITEM_DELETED' : 'ROOM_DELETED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `${kind.toLowerCase()}-deleted-${id}`, title: `${label} deleted`, status: 'COMPLETED',
      description: kind === 'ITEM' ? 'The item was removed from the home inventory and dependent analyses were marked for refresh.' : 'The room was removed. Its items are kept and are now unassigned.',
      details: [{ label, value: name }], actions: [receiptFollowUpAction(kind === 'ITEM' ? 'INVENTORY' : 'ROOMS')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `${kind.toLowerCase()}-delete-refresh-failed-${id}`, severity: 'CAUTION', title: 'Deleted; view could not refresh', body: `The ${label.toLowerCase()} was deleted. The result you were viewing could not refresh automatically -- ask "${kind === 'ITEM' ? 'Show my home inventory' : 'Show my rooms'}" to see the current state.` });
  }
  return { result, artifactType: kind === 'ITEM' ? 'INVENTORY_ITEM' : 'INVENTORY_ROOM', artifactId: id, refreshedExecutions: refresh.refreshedExecutions };
}
