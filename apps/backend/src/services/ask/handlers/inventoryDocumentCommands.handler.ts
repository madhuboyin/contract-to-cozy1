// Link or unlink a document on an inventory item (FRD v1.470). The form lists the item's linked documents (to unlink) and the home's other documents
// (to link) as one choice; the write is InventoryService.linkDocument / unlinkDocument, the call the Inventory page makes, after a confirmation.
import { prisma } from '../../../lib/prisma';
import type { AskCaptureRequest, CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import type { ConfirmCapabilityContext, ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { InventoryService } from '../../inventory.service';
import { inventoryItemContextVersion } from '../suggestedActions/domainVersions';
import { ITEM_DOCUMENTS_MESSAGE, ITEM_DOCUMENT_CAPTURE_KEY, parseDocumentChoice } from '../support/roomDetailCommand';

const inventoryService = new InventoryService();
type Launch = CreateAskExecutionRequest['launchContext'];
const LIMIT = 25;

export const isItemDocumentsMessage = (message: string) => message.trim() === ITEM_DOCUMENTS_MESSAGE;
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'item-documents-unavailable', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});

export async function itemDocumentsResult(userId: string, propertyId: string, launch: Launch, stored?: { itemId: string; sourceExecutionId?: string | null }, answer?: Record<string, unknown>): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const itemId = stored?.itemId ?? launch?.entityId ?? '';
  const item = itemId ? await prisma.inventoryItem.findFirst({ where: { id: itemId, propertyId }, select: { id: true, name: true, updatedAt: true } }) : null;
  if (!item) return unavailable('ITEM_DOCUMENTS_ITEM_MISSING', 'That item is no longer available', 'Nothing changed.');
  const source = stored?.sourceExecutionId ?? launch?.sourceExecutionId ?? null;
  const version = inventoryItemContextVersion(item);
  const [linked, others]: [Array<{ id: string; name: string }>, Array<{ id: string; name: string }>] = await Promise.all([
    (prisma as any).document.findMany({ where: { inventoryItemId: item.id, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: LIMIT, select: { id: true, name: true } }),
    (prisma as any).document.findMany({ where: { propertyId, deletedAt: null, OR: [{ inventoryItemId: null }, { inventoryItemId: { not: item.id } }] }, orderBy: { createdAt: 'desc' }, take: LIMIT, select: { id: true, name: true } }),
  ]);
  const choice = parseDocumentChoice(answer?.document);
  if (!choice) {
    if (!linked.length && !others.length) return unavailable('ITEM_DOCUMENTS_NONE', 'No documents to link yet', 'This home has no documents in Home Records yet. Add one first. Nothing changed.');
    const options = [...linked.map((doc) => ({ label: `Unlink: ${doc.name}`, value: `unlink:${doc.id}` })), ...others.map((doc) => ({ label: `Link: ${doc.name}`, value: `link:${doc.id}` }))];
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'ITEM_DOCUMENTS_CHOICE_REQUIRED', contextVersion: version, parameters: { itemDocumentLaunch: { itemId: item.id, sourceExecutionId: source } },
      blocks: [{ type: 'SUMMARY', id: 'item-documents-choice', title: `Documents for ${item.name}`, body: `${linked.length} linked. Choose a document to link or unlink; nothing changes until you confirm.`, tone: 'DEFAULT', actions: [] }],
      captureRequests: [{
        requirementId: 'item-document-inputs', captureKey: ITEM_DOCUMENT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: `Documents for ${item.name}`, question: 'Which document?', helpText: null,
        inputSchema: { type: 'GROUP', fields: [{ key: 'document', label: 'Document', required: true, inputSchema: { type: 'SINGLE_SELECT', options } }] } as unknown as AskCaptureRequest['inputSchema'],
        allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: version,
      } as AskCaptureRequest], suggestions: [],
    };
  }
  const doc = [...linked, ...others].find((candidate) => candidate.id === choice.documentId);
  if (!doc) return unavailable('ITEM_DOCUMENTS_DOCUMENT_MISSING', 'That document is not available', 'It may have been removed or moved. Nothing changed.');
  const link = choice.kind === 'LINK';
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: link ? 'ITEM_DOCUMENT_LINK_CONFIRMATION_REQUIRED' : 'ITEM_DOCUMENT_UNLINK_CONFIRMATION_REQUIRED', contextVersion: version,
    parameters: { itemDocument: { kind: choice.kind, itemId: item.id, documentId: doc.id }, itemDocumentContextVersion: version, sourceExecutionId: source, confirmationVersion: 1, confirmationExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'item-document-review', title: `Review: ${link ? 'link' : 'unlink'} ${doc.name}`, body: 'No shared-home record has changed yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `item-document-${choice.kind.toLowerCase()}-${item.id}-${doc.id}`, version: 1, title: `${link ? 'Link' : 'Unlink'} “${doc.name}” ${link ? 'to' : 'from'} ${item.name}?`,
      description: link ? 'The document stays in Home Records and is shown as evidence for this item. A document is linked to one item at a time, so linking moves it from any other item.' : 'The document stays in Home Records; it is just no longer shown as evidence for this item.',
      fields: [{ label: 'Item', value: item.name }, { label: 'Document', value: doc.name }], editableFields: [], confirmLabel: link ? 'Link document' : 'Unlink document',
      consentText: 'I authorize this change to the shared home record.', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
    suggestions: [],
  };
}

export async function confirmItemDocument(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult | null> {
  const { execution, userId, parameters } = ctx;
  const stored = parameters.itemDocument as { kind?: string; itemId?: string; documentId?: string } | undefined;
  if (!stored?.kind || !stored.itemId || !stored.documentId) return null;
  const propertyId = execution.propertyId!;
  const item = await prisma.inventoryItem.findFirst({ where: { id: stored.itemId, propertyId }, select: { id: true, name: true, updatedAt: true } });
  if (!item) throw Object.assign(new Error('This inventory item is no longer available. It may have been deleted.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const doc = await (prisma as any).document.findFirst({ where: { id: stored.documentId, deletedAt: null }, select: { id: true, name: true, inventoryItemId: true } });
  const link = stored.kind === 'LINK';
  if (!doc) throw Object.assign(new Error('This document is no longer available.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // A link or unlink that already happened (a recovery retry) is a no-op, not a conflict.
  const alreadyDone = link ? doc.inventoryItemId === item.id : doc.inventoryItemId !== item.id;
  if (!alreadyDone) {
    if (parameters.itemDocumentContextVersion !== inventoryItemContextVersion(item)) throw Object.assign(new Error('This inventory item changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
    try {
      if (link) await inventoryService.linkDocument(propertyId, item.id, doc.id); else await inventoryService.unlinkDocument(propertyId, item.id, doc.id);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'DOC_PROPERTY_MISMATCH' || code === 'DOC_NOT_LINKED' || code === 'DOCUMENT_NOT_FOUND') throw Object.assign(new Error('This document can no longer be changed. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
      throw error;
    }
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: link ? 'ITEM_DOCUMENT_LINKED' : 'ITEM_DOCUMENT_UNLINKED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `item-document-${stored.kind.toLowerCase()}-${item.id}`, title: link ? 'Document linked' : 'Document unlinked', status: 'COMPLETED', description: link ? 'The document is now evidence for this item.' : 'The document stays in Home Records and is no longer linked to this item.', details: [{ label: 'Item', value: item.name }, { label: 'Document', value: doc.name }], actions: [] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'INVENTORY_ITEM', artifactId: item.id, refreshedExecutions: refresh.refreshedExecutions };
}
