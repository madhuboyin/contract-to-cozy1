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

export function materialSpecsFromView(view: MaterialSpecListView, propertyId: string, canAdd = false): AskOperationResult {
  // A contributor or owner can record a material from here, inside Ask; a viewer reads the list only.
  // Edit is declared per row for contributors and owners only (FRD v1.390); a viewer reads the list and the canonical detail.
  const editActions = canAdd ? [{ id: 'edit-material', label: 'Edit material', message: MATERIAL_SPEC_EDIT_MESSAGE, interactionType: 'MUTATE_RECORD' as const, operationId: 'MATERIAL_SPEC_UPDATE', style: 'SECONDARY' as const }] : undefined;
  const addActions = canAdd ? [{ id: MATERIAL_SPEC_ADD_ACTION_ID, label: 'Add a material', interactionType: 'START_WORKFLOW' as const, message: MATERIAL_SPEC_ADD_MESSAGE, operationId: 'MATERIAL_SPEC_ADD', style: 'PRIMARY' as const }] : [];
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'material-specs-boundary', title: 'As recorded, not checked against the product',
    body: 'Products, colours and suppliers are what was recorded for this home. Confirm a colour or product with the supplier before buying a match, since formulas and product lines change.',
    severity: 'INFO', suggestions: [],
  };
  const specs = view.specs;
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
    title: `${specs.length}${view.hasMore ? '+' : ''} saved material${specs.length === 1 && !view.hasMore ? '' : 's'}`,
    body: [
      categories.size === 1 ? `${categoryNames[0]} used in this home.` : `${categories.size} types used in this home: ${categoryNames.join(', ')}.`,
      discontinued ? `${discontinued} ${discontinued === 1 ? 'is' : 'are'} marked discontinued by the supplier.` : null,
    ].filter(Boolean).join(' '),
    tone: discontinued ? 'CAUTION' : 'DEFAULT',
    actions: [],
  }];
  if (view.hasMore) {
    blocks.push({
      type: 'LIMITATION', id: 'material-specs-limit', title: `Showing the first ${specs.length} materials`,
      body: 'This home has more recorded materials than this. Ask about one category, such as paint or flooring, to narrow it.', severity: 'INFO',
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
        actions: editActions,
      })),
    })),
    // The collection's one primary step sits in its header, beside the summary, instead of on a row of its own.
    actions: addActions,
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'MATERIAL_SPECS_READY', blocks, suggestions: [] };
}

async function materialSpecsResult(propertyId: string, canAdd: boolean): Promise<AskOperationResult> {
  return materialSpecsFromView(await materialSpecService.listSpecs(propertyId, {}), propertyId, canAdd);
}

registerCapabilityHandler('material-specs.list', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return materialSpecsResult(envelope.propertyId!, access.role !== HouseholdRole.VIEWER);
});
