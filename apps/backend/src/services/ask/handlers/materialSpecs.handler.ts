// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { MaterialSpecService } from '../../materialSpec.service';

const materialSpecService = new MaterialSpecService();

// Material Specs capability-card slice (FRD v1.62): the fourteenth new operation for a capability with none. Reads
// MaterialSpecService.listSpecs with no filter -- the call GET /properties/:id/materials makes for the Material Specs
// page (the service's default page of 50, ordered by category then label; the route also returns a compliance envelope
// the page ignores and emits TOOL_USED analytics, which Ask does not). The page shows only that first page and drops
// hasMore; Ask says when there are more. Each spec keeps what the page card shows plus the colour code, finish,
// supplier and a discontinued flag, which are the facts people ask a materials record for. Notes, lot numbers,
// quantities and compliance checks stay on the spec page. Read-only.
type MaterialSpecListView = Awaited<ReturnType<MaterialSpecService['listSpecs']>>;
// The page's own labels (MaterialSpecsClient CATEGORY_LABELS; lifecycle shown as its enum words).
const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  PAINT: 'Paint', TILE: 'Tile', FLOORING: 'Flooring', GROUT: 'Grout', COUNTERTOP: 'Countertop', CABINET: 'Cabinet', HARDWARE: 'Hardware',
  TRIM_MOLDING: 'Trim & Molding', WALLPAPER: 'Wallpaper', ROOFING: 'Roofing', SIDING: 'Siding', WINDOW: 'Window', DOOR: 'Door',
  INSULATION: 'Insulation', OTHER: 'Other',
};

export function materialSpecsFromView(view: MaterialSpecListView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/materials`;
  const openAction = { id: 'open-material-specs', label: 'Open Material Specs', href: pageHref, style: 'PRIMARY' as const };
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
        body: 'Material Specs keeps the paint colours, tile, flooring, fixtures and suppliers used in this home so you can match them later. Open it to add one.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Summarize my home record'],
    };
  }
  const discontinued = specs.filter((spec) => spec.supplierDiscontinued).length;
  const categories = new Map<string, typeof specs>();
  for (const spec of specs) categories.set(spec.category, [...(categories.get(spec.category) ?? []), spec]);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'material-specs-summary',
    title: `${specs.length}${view.hasMore ? '+' : ''} material${specs.length === 1 && !view.hasMore ? '' : 's'} recorded`,
    body: [
      `Across ${categories.size} categor${categories.size === 1 ? 'y' : 'ies'}: ${[...categories.keys()].map((category) => MATERIAL_CATEGORY_LABELS[category] ?? readableCode(category)).join(', ')}.`,
      discontinued ? `${discontinued} ${discontinued === 1 ? 'is' : 'are'} marked discontinued by the supplier.` : null,
    ].filter(Boolean).join(' '),
    tone: discontinued ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  if (view.hasMore) {
    blocks.push({
      type: 'LIMITATION', id: 'material-specs-limit', title: `Showing the first ${specs.length} materials`,
      body: 'This home has more recorded materials than this. The rest are in Material Specs, which can filter by category.', severity: 'INFO',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'material-specs-items', title: 'Recorded materials', description: 'By category, as on the page. Open a material for photos, purchase details and notes.',
    sections: [...categories.entries()].map(([category, rows]) => ({
      id: `material-specs-${category.toLowerCase()}`, title: MATERIAL_CATEGORY_LABELS[category] ?? readableCode(category), count: rows.length,
      items: rows.map((spec) => ({
        id: spec.id,
        title: spec.label,
        description: [spec.manufacturer, spec.productName].filter(Boolean).join(' · ') || null,
        meta: [
          spec.room?.name ?? (spec.scopeLevel === 'PROPERTY' ? 'Whole home' : null),
          spec.colorCode ? `Colour ${spec.colorCode}` : null,
          spec.finish ? `Finish ${spec.finish}` : null,
          spec.supplier ? `Supplier ${spec.supplier}` : null,
          spec.supplierDiscontinued ? 'Discontinued' : null,
          spec.isActive ? null : 'No longer in use',
        ].filter((value): value is string => Boolean(value)),
        status: spec.lifecycleStatus.replace(/_/g, ' '),
        href: `${pageHref}/${encodeURIComponent(spec.id)}`,
      })),
    })),
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'MATERIAL_SPECS_READY', blocks, suggestions: ['Summarize my home record'] };
}

async function materialSpecsResult(propertyId: string): Promise<AskOperationResult> {
  return materialSpecsFromView(await materialSpecService.listSpecs(propertyId, {}), propertyId);
}

registerCapabilityHandler('material-specs.list', async (envelope) => materialSpecsResult(envelope.propertyId!));
