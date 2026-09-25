// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { priceFinalizationService } from '../../priceFinalization.service';
import { humanDate, titleCase } from '../askFormatting';

// Price Finalization capability-card slice (FRD v1.67): the eighteenth new operation for a capability with none (the
// v1.47 "needs a product decision" label did not hold once the page was traced). Reads
// PriceFinalizationService.listForProperty with the page's limit of 20 -- the call GET /properties/:id/price-finalizations
// makes (the route also attaches a project-compliance envelope and emits TOOL_USED analytics; Ask does neither). OWNER
// floor: the route admits any household member, but the service's ensurePropertyAccess only admits the primary homeowner
// profile, as Service Price Radar's does (v1.60); Ask says so instead of erroring. The page shows only the first 5 of
// its 20 and labels an archived record "Draft"; Ask lists all 20, keeps archived ones apart and says when there may be
// more. Notes and linked-record ids stay on the page. Read-only: saving, finalizing and booking stay on the page.
export const PRICE_FINALIZATION_ASK_LIMIT = 20;
type PriceFinalizationView = Awaited<ReturnType<typeof priceFinalizationService.listForProperty>>['items'][number];
const PRICE_FINALIZATION_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Entered by hand', NEGOTIATION_SHIELD: 'From Negotiation Shield', QUOTE_COMPARISON: 'From Quote Comparison', SERVICE_PRICE_RADAR: 'From Service Price Radar',
};
const finalizationMoney = (value: number | null | undefined) => (value == null
  ? null
  : `$${value.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`);

export function priceFinalizationsFromView(records: readonly PriceFinalizationView[] | 'PRIMARY_OWNER_ONLY', propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/price-finalization`;
  const openAction = { id: 'open-price-finalization', label: 'Open Price Finalization', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'price-finalization-boundary', title: 'As recorded, not a signed contract',
    body: 'These are the prices and terms the household recorded. The written agreement with the vendor controls, so check it before paying or booking.',
    severity: 'INFO', suggestions: [],
  };
  if (records === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'PRICE_FINALIZATION_PRIMARY_OWNER_ONLY',
      blocks: [{
        type: 'SUMMARY', id: 'price-finalization-summary', title: 'Only the home\'s primary owner can see price finalizations',
        body: 'Price Finalization records are kept for the home\'s primary account holder, so they can\'t be shown here.',
        tone: 'CAUTION', actions: [],
      }],
      suggestions: [],
    };
  }
  if (!records.length) {
    return {
      status: 'ANSWERED', reasonCode: 'PRICE_FINALIZATIONS_EMPTY',
      blocks: [{
        type: 'SUMMARY', id: 'price-finalization-summary', title: 'No price finalizations yet',
        body: 'Price Finalization records the price and terms you accept from a vendor before booking the work. Open it to save one.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Compare my service quotes'],
    };
  }
  const row = (record: PriceFinalizationView) => {
    const accepted = finalizationMoney(record.acceptedPrice);
    const quoted = finalizationMoney(record.quotePrice);
    return {
      id: record.id,
      title: record.vendorName || 'Unnamed vendor',
      description: [
        record.serviceCategory ? titleCase(record.serviceCategory) : 'Service category not set',
        accepted ? `accepted ${accepted}${quoted && record.quotePrice !== record.acceptedPrice ? ` (quoted ${quoted})` : ''}` : 'no accepted price',
      ].join(' · '),
      meta: [
        record.scopeSummary ? `Scope: ${record.scopeSummary}` : null,
        record.paymentTerms ? `Payment: ${record.paymentTerms}` : null,
        record.warrantyTerms ? `Warranty: ${record.warrantyTerms}` : null,
        record.timelineTerms ? `Timeline: ${record.timelineTerms}` : null,
        record.finalizedAt ? `Finalized ${humanDate(new Date(record.finalizedAt))}` : null,
        record.bookingId ? 'Booked' : null,
        PRICE_FINALIZATION_SOURCE_LABELS[record.sourceType] ?? null,
      ].filter((value): value is string => Boolean(value)),
      status: record.status === 'FINALIZED' ? 'Finalized' : record.status === 'ARCHIVED' ? 'Archived' : 'Draft',
    };
  };
  const groups = [
    ['FINALIZED', 'Finalized'], ['DRAFT', 'Drafts'], ['ARCHIVED', 'Archived'],
  ] as const;
  const finalized = records.filter((record) => record.status === 'FINALIZED').length;
  const drafts = records.filter((record) => record.status === 'DRAFT').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'price-finalization-summary',
    title: `${records.length} price finalization${records.length === 1 ? '' : 's'} recorded`,
    body: `${finalized} finalized and ${drafts} still ${drafts === 1 ? 'a draft' : 'drafts'}.`,
    tone: 'DEFAULT', actions: [openAction],
  }];
  if (records.length >= PRICE_FINALIZATION_ASK_LIMIT) {
    blocks.push({
      type: 'LIMITATION', id: 'price-finalization-limit', title: `Showing the ${PRICE_FINALIZATION_ASK_LIMIT} most recent`,
      body: 'Older records may exist; this is the same list the Price Finalization page loads.', severity: 'INFO',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'price-finalization-items', title: 'Recorded prices and terms',
    description: 'Newest first. Open Price Finalization to edit a draft, finalize it or continue to booking.',
    sections: groups
      .map(([status, title]) => ({ status, title, items: records.filter((record) => record.status === status).map(row) }))
      .filter((section) => section.items.length > 0)
      .map((section) => ({ id: `price-finalization-${section.status.toLowerCase()}`, title: section.title, count: section.items.length, items: section.items })),
    actions: [],
  }, boundary);
  return { status: 'ANSWERED', reasonCode: 'PRICE_FINALIZATIONS_READY', blocks, suggestions: ['Compare my service quotes'] };
}

async function priceFinalizationsResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    const { items } = await priceFinalizationService.listForProperty(propertyId, userId, PRICE_FINALIZATION_ASK_LIMIT);
    return priceFinalizationsFromView(items, propertyId);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_ACCESS_DENIED') return priceFinalizationsFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('price-finalization.records', async (envelope) => priceFinalizationsResult(envelope.propertyId!, envelope.userId));
