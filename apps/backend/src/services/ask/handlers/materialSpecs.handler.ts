// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { MaterialSpecService } from '../../materialSpec.service';
import { HouseholdRole } from '@prisma/client';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { MATERIAL_SPEC_ADD_ACTION_ID, MATERIAL_SPEC_ADD_MESSAGE } from '../support/homeRecordAddConstants';
import { MATERIAL_CATEGORY_LABELS } from '../support/materialSpecEditor';
import { MATERIAL_SPEC_STATE_ACTION_IDS, MATERIAL_SPEC_STATE_MESSAGES, materialSpecDeletable } from '../support/materialSpecStateCommand';
import { humanDate } from '../askFormatting';
import { MATERIAL_SPECS_SHOW_ALL_ACTION_ID, MATERIAL_SPECS_SHOW_ALL_MESSAGE, materialSearchTerm } from '../support/materialSpecSearch';

const materialSpecService = new MaterialSpecService();

// Material Specs capability-card slice (FRD v1.62): the fourteenth new operation for a capability with none. Reads
// MaterialSpecService.listSpecs with no filter -- the call GET /properties/:id/materials makes for the Material Specs
// page (the service's default page of 50, ordered by category then label; the route also returns a compliance envelope
// the page ignores and emits TOOL_USED analytics, which Ask does not). The page shows only that first page and drops
// hasMore; Ask says when there are more. Each spec keeps what the page card shows plus the colour code, finish,
// supplier and a discontinued flag, which are the facts people ask a materials record for. Notes, lot numbers,
// quantities and compliance checks stay on the spec page. Read-only.
type MaterialSpecListView = Awaited<ReturnType<MaterialSpecService['listSpecs']>>;
export { MATERIAL_CATEGORY_LABELS };

export const MATERIAL_SPEC_EDIT_MESSAGE = 'Edit this material.';

/** A recent materials export as the list shows it (FRD v1.465). Status is the service's own; a completed file past its keep-until date reads as expired. */
export interface MaterialExportRow { id: string; status: string; title: string; totalSpecs: number | null; expiresAt: Date | null; createdAt: Date }
const EXPORT_STATUS_LABELS: Record<string, string> = { PENDING: 'Preparing', GENERATING: 'Preparing', COMPLETED: 'Ready', FAILED: 'Failed', EXPIRED: 'Expired' };
export const MATERIAL_SPEC_EXPORT_ENTITY_TYPE = 'MATERIAL_SPEC_EXPORT';

/** The recent materials exports, newest first: still preparing, ready to download, or failed in the last 7 days. Expired files are left out. */
function exportsBlock(exportRows: readonly MaterialExportRow[], now: Date): AskPresentationBlock[] {
  const recent = exportRows
    .map((row) => ({ ...row, status: row.status === 'COMPLETED' && row.expiresAt && row.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : row.status }))
    .filter((row) => row.status !== 'EXPIRED' && now.getTime() - row.createdAt.getTime() <= 7 * 24 * 60 * 60 * 1000)
    .slice(0, 3);
  if (!recent.length) return [];
  const items = recent.map((row) => ({
    id: row.id, title: row.title, description: row.status === 'FAILED' ? 'The export could not be prepared. Ask to export again to try once more.' : null,
    meta: [row.totalSpecs != null ? `${row.totalSpecs} ${row.totalSpecs === 1 ? 'material' : 'materials'}` : null, row.status === 'COMPLETED' && row.expiresAt ? `Download until ${humanDate(row.expiresAt)}` : null].filter((value): value is string => Boolean(value)),
    status: EXPORT_STATUS_LABELS[row.status] ?? row.status.toLowerCase(), entityType: MATERIAL_SPEC_EXPORT_ENTITY_TYPE, href: null,
  }));
  return [{
    type: 'GROUPED_LIST', filters: [], id: 'material-specs-exports', title: 'Your materials exports', description: 'A PDF of the recorded materials. A ready export can be downloaded below the answer, by anyone with access to this home.',
    sections: [{ id: 'material-exports', title: 'Recent exports', count: items.length, items }], actions: [],
  }];
}

export function materialSpecsFromView(view: MaterialSpecListView, propertyId: string, canAdd = false, exportRows: readonly MaterialExportRow[] = [], now: Date = new Date(), search: { term: string } | null = null): AskOperationResult {
  // A contributor or owner can record a material from here, inside Ask; a viewer reads the list only.
  // Edit is declared per row for contributors and owners only (FRD v1.390); a viewer reads the list and the canonical detail.
  const editAction = { id: 'edit-material', label: 'Edit material', message: MATERIAL_SPEC_EDIT_MESSAGE, interactionType: 'MUTATE_RECORD' as const, operationId: 'MATERIAL_SPEC_UPDATE', style: 'SECONDARY' as const };
  // Stop using or use again, and delete (a proposed material only: the service keeps the history of the rest), are declared per row for contributors and owners (FRD v1.465).
  const stateAction = (id: keyof typeof MATERIAL_SPEC_STATE_ACTION_IDS, label: string) => ({
    id: MATERIAL_SPEC_STATE_ACTION_IDS[id], label, message: MATERIAL_SPEC_STATE_MESSAGES[id], interactionType: 'MUTATE_RECORD' as const, operationId: 'MATERIAL_SPEC_UPDATE' as const, style: 'QUIET' as const,
  });
  const rowActions = (spec: { isActive: boolean; lifecycleStatus: string; photos?: readonly unknown[] }) => canAdd ? [
    editAction,
    spec.isActive ? stateAction('ARCHIVE', 'Stop using') : stateAction('RESTORE', 'Use again'),
    ...(materialSpecDeletable(spec.lifecycleStatus) ? [stateAction('DELETE', 'Delete')] : []),
    // Only a material with a photo offers Remove a photo; the list reads the first photo, which is enough to know there is one.
    ...(spec.photos?.length ? [stateAction('PHOTO_DELETE', 'Remove a photo')] : []),
  ] : undefined;
  const exportAction = canAdd ? [{ id: MATERIAL_SPEC_STATE_ACTION_IDS.EXPORT, label: 'Export my materials', interactionType: 'START_WORKFLOW' as const, message: MATERIAL_SPEC_STATE_MESSAGES.EXPORT, operationId: 'MATERIAL_SPEC_UPDATE' as const, style: 'SECONDARY' as const }] : [];
  const addActions = canAdd ? [{ id: MATERIAL_SPEC_ADD_ACTION_ID, label: 'Add a material', interactionType: 'START_WORKFLOW' as const, message: MATERIAL_SPEC_ADD_MESSAGE, operationId: 'MATERIAL_SPEC_ADD', style: 'PRIMARY' as const }] : [];
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'material-specs-boundary', title: 'As recorded, not checked against the product',
    body: 'Products, colours and suppliers are what was recorded for this home. Confirm a colour or product with the supplier before buying a match, since formulas and product lines change.',
    severity: 'INFO', suggestions: [],
  };
  const specs = view.specs;
  // A search that finds nothing says so and offers the whole list; it never claims the home has no materials.
  const showAll = { id: MATERIAL_SPECS_SHOW_ALL_ACTION_ID, label: 'Show all my materials', interactionType: 'START_WORKFLOW' as const, message: MATERIAL_SPECS_SHOW_ALL_MESSAGE, operationId: 'MATERIAL_SPECS_LIST' as const, style: 'SECONDARY' as const };
  if (search && !specs.length) {
    return {
      status: 'ANSWERED', reasonCode: 'MATERIAL_SPECS_SEARCH_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'material-specs-summary', title: `No recorded material matches “${search.term}”`,
        body: 'The search looks at each material\'s name, supplier, product, colour code, SKU and notes, among the materials still in use. Try another word, or show the whole list.',
        tone: 'DEFAULT', actions: [showAll, ...addActions].slice(0, 3),
      }, boundary],
      suggestions: [],
    };
  }
  if (!specs.length) {
    return {
      status: 'ANSWERED', reasonCode: 'MATERIAL_SPECS_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'material-specs-summary', title: 'No materials recorded yet',
        body: 'Material Specs keeps the paint colours, tile, flooring, fixtures and suppliers used in this home so you can match them later. None have been recorded for this home yet.',
        tone: 'DEFAULT', actions: addActions,
      }, boundary],
      suggestions: [],
    };
  }
  const discontinued = specs.filter((spec) => spec.supplierDiscontinued).length;
  const categories = new Map<string, typeof specs>();
  for (const spec of specs) categories.set(spec.category, [...(categories.get(spec.category) ?? []), spec]);
  const categoryNames = [...categories.keys()].map((category) => MATERIAL_CATEGORY_LABELS[category] ?? readableCode(category));
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'material-specs-summary',
    title: search ? `${specs.length}${view.hasMore ? '+' : ''} material${specs.length === 1 && !view.hasMore ? '' : 's'} match${specs.length === 1 && !view.hasMore ? 'es' : ''} “${search.term}”` : `${specs.length}${view.hasMore ? '+' : ''} saved material${specs.length === 1 && !view.hasMore ? '' : 's'}`,
    body: [
      categories.size === 1 ? `${categoryNames[0]} used in this home.` : `${categories.size} types used in this home: ${categoryNames.join(', ')}.`,
      discontinued ? `${discontinued} ${discontinued === 1 ? 'is' : 'are'} marked discontinued by the supplier.` : null,
    ].filter(Boolean).join(' '),
    tone: discontinued ? 'CAUTION' : 'DEFAULT',
    actions: search ? [showAll] : [],
  }];
  if (view.hasMore) {
    blocks.push({
      type: 'LIMITATION', id: 'material-specs-limit', title: `Showing the first ${specs.length} materials`,
      body: search ? 'More materials match than this. Add another word, such as a room or a colour code, to narrow it.' : 'This home has more recorded materials than this. Search by a product, supplier or colour code, such as “find paint SW 7008”, to narrow it.', severity: 'INFO',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'material-specs-items', title: 'Saved materials', description: 'By type. Select View details to see everything recorded.',
    sections: [...categories.entries()].map(([category, rows]) => ({
      id: `material-specs-${category.toLowerCase()}`, title: MATERIAL_CATEGORY_LABELS[category] ?? readableCode(category), count: rows.length,
      items: rows.map((spec) => ({
        id: spec.id,
        title: spec.label,
        entityType: 'MATERIAL_SPEC',
        description: [spec.manufacturer, spec.productName].filter(Boolean).join(' · ') || null,
        meta: [
          spec.room?.name ?? (spec.scopeLevel === 'PROPERTY' ? 'Whole home' : null),
          spec.colorCode ? `Colour ${spec.colorCode}` : null,
          spec.finish ? `Finish ${spec.finish}` : null,
          spec.supplier ? `Supplier ${spec.supplier}` : null,
          spec.supplierDiscontinued ? 'Discontinued' : null,
          spec.isActive ? null : 'No longer in use',
        ].filter((value): value is string => Boolean(value)),
        // The canonical lifecycle key; the client shows the friendly label (Planned, Installed ...) and explains it in the detail.
        status: spec.lifecycleStatus,
        actions: rowActions(spec),
      })),
    })),
    // The collection's one primary step sits in its header, beside the summary, instead of on a row of its own.
    actions: [...addActions, ...exportAction],
  });
  blocks.push(...exportsBlock(exportRows, now), boundary);
  return { status: 'ANSWERED', reasonCode: 'MATERIAL_SPECS_READY', blocks, suggestions: [] };
}

async function materialSpecsResult(propertyId: string, canAdd: boolean, message = ''): Promise<AskOperationResult> {
  const term = materialSearchTerm(message);
  const [view, exportRows] = await Promise.all([
    // The call Desktop's search box makes (active materials, the first 20), or the page's own list when no word was asked for.
    term ? materialSpecService.searchSpecs(propertyId, term).then((specs) => ({ specs, hasMore: specs.length >= 20 }) as unknown as MaterialSpecListView) : materialSpecService.listSpecs(propertyId, {}),
    materialSpecService.listExports(propertyId),
  ]);
  return materialSpecsFromView(view, propertyId, canAdd, exportRows as unknown as MaterialExportRow[], new Date(), term ? { term } : null);
}

registerCapabilityHandler('material-specs.list', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return materialSpecsResult(envelope.propertyId!, access.role !== HouseholdRole.VIEWER, envelope.message);
});
