// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { humanDate, readableCode } from '../askFormatting';
import { ServicePriceRadarService } from '../../servicePriceRadar.service';
import { SERVICE_PRICE_CHECK_ACTION_ID, SERVICE_PRICE_CHECK_MESSAGE } from '../support/homeToolRunConstants';
import { collectionDescriptor } from '../support/collectionDescriptor';

// Service Price Radar capability-card slice (FRD v1.60): the twelfth new operation for a capability with none. Reads
// ServicePriceRadarService.listChecks with the page's own limit (12), the call GET
// /properties/:id/service-price-radar/checks makes for the page's recent quote checks (the route also returns a
// compliance envelope the page ignores and emits TOOL_USED analytics; Ask does neither). listChecks only admits the
// property's primary homeowner profile, although the route lets any household member in, so a household member it
// refuses gets that said plainly rather than an error. Read-only: running a new quote check stays on the page.
export const SERVICE_PRICE_RADAR_ASK_LIMIT = 12;
type ServicePriceCheckView = Awaited<ReturnType<ServicePriceRadarService['listChecks']>>['items'][number];
// The page's own labels (ServicePriceRadarClient verdictMeta, servicePriceRadarApi category options).
const SERVICE_PRICE_VERDICT_LABELS: Record<string, string> = { FAIR: 'Fair', HIGH: 'Above range', VERY_HIGH: 'Well above range', UNDERPRICED: 'Below range' };
const SERVICE_PRICE_CATEGORY_LABELS: Record<string, string> = { HVAC: 'HVAC', WINDOWS_DOORS: 'Windows & Doors', LANDSCAPING_DRAINAGE: 'Landscaping & Drainage', SECURITY_SAFETY: 'Security & Safety' };
const servicePriceCategoryLabel = (value: string) => SERVICE_PRICE_CATEGORY_LABELS[value] ?? readableCode(value).replace(/\b\w/g, (c) => c.toUpperCase());
const servicePriceMoney = (value: number | null | undefined) => (value == null ? null : `$${Math.round(value).toLocaleString('en-US')}`);

export function servicePriceChecksFromView(checks: readonly ServicePriceCheckView[] | 'PRIMARY_OWNER_ONLY', propertyId: string, sourceTotal?: number): AskOperationResult {
  // The answer reaches only the home's primary account holder, who can check a quote from it, inside Ask.
  const checkAction = (label: string) => ({ id: SERVICE_PRICE_CHECK_ACTION_ID, label, interactionType: 'START_WORKFLOW' as const, message: SERVICE_PRICE_CHECK_MESSAGE, operationId: 'SERVICE_PRICE_CHECK_RUN', style: 'PRIMARY' as const });
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'service-price-radar-boundary', title: 'A price check, not a quote review',
    body: 'Expected ranges come from typical local prices for the service, not an inspection of the job. Scope, materials and access can move a fair price, so ask the contractor about a quote that falls outside the range before deciding.',
    severity: 'INFO', suggestions: [],
  };
  if (checks === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'SERVICE_PRICE_RADAR_PRIMARY_OWNER_ONLY',
      blocks: [{
        type: 'SUMMARY', id: 'service-price-radar-summary', title: 'Only the home\'s primary owner can see quote checks',
        body: 'Service Price Radar quote checks are kept for the home\'s primary account holder, so they can\'t be shown here.',
        tone: 'CAUTION', actions: [],
      }],
      suggestions: [],
    };
  }
  if (!checks.length) {
    return {
      status: 'ANSWERED', reasonCode: 'SERVICE_PRICE_RADAR_NO_CHECKS',
      blocks: [{
        type: 'SUMMARY', id: 'service-price-radar-summary', title: 'No quote checks yet',
        body: 'Service Price Radar compares a contractor quote with typical local prices for the service. None has been checked for this home yet. Check one below; nothing is checked until you confirm.',
        tone: 'DEFAULT', actions: [checkAction('Check a quote')],
      }, boundary],
      suggestions: [],
    };
  }
  const above = checks.filter((check) => check.verdict === 'HIGH' || check.verdict === 'VERY_HIGH').length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'service-price-radar-summary',
    title: `${checks.length} recent quote check${checks.length === 1 ? '' : 's'}`,
    body: [
      above ? `${above} ${above === 1 ? 'quote looks' : 'quotes look'} above the expected range.` : 'None of them look above the expected range.',
      `Latest checked ${humanDate(new Date(checks[0].createdAt))}.`,
    ].join(' '),
    tone: above ? 'CAUTION' : 'DEFAULT',
    actions: [checkAction('Check another quote')],
  }];
  if (sourceTotal == null ? checks.length >= SERVICE_PRICE_RADAR_ASK_LIMIT : sourceTotal > checks.length) {
    blocks.push({
      type: 'LIMITATION', id: 'service-price-radar-limit', title: `Showing the ${SERVICE_PRICE_RADAR_ASK_LIMIT} most recent checks`,
      body: 'Older quote checks are not listed here.', severity: 'INFO',
    });
  }
  const sections = [{
    id: 'service-price-radar-recent', title: 'Recent checks', count: checks.length,
    items: checks.map((check) => {
      const low = servicePriceMoney(check.expectedLow);
      const high = servicePriceMoney(check.expectedHigh);
      return {
        id: check.id,
        title: `${servicePriceCategoryLabel(check.serviceCategory)}${check.serviceSubcategory ? ` · ${servicePriceCategoryLabel(check.serviceSubcategory)}` : ''}`,
        description: check.explanationShort,
        meta: [`Quote ${servicePriceMoney(check.quoteAmount)}`, low && high ? `Expected ${low} to ${high}` : 'Broad range only', ...(check.quoteVendorName ? [check.quoteVendorName] : []), `Checked ${humanDate(new Date(check.createdAt))}`],
        status: check.verdict ? SERVICE_PRICE_VERDICT_LABELS[check.verdict] ?? 'Need more context' : 'Need more context', href: null,
      };
    }),
  }];
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'service-price-radar-checks', title: 'Recent quote checks', description: 'Newest first.',
    sections,
    collection: collectionDescriptor({ sourceTotal: sourceTotal ?? checks.length, fetchedCount: checks.length, sections, nextPageAvailable: false }),
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'SERVICE_PRICE_RADAR_CHECKS_READY', blocks, suggestions: [] };
}

async function servicePriceChecksResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    const result = await new ServicePriceRadarService().listChecks(propertyId, userId, { limit: SERVICE_PRICE_RADAR_ASK_LIMIT });
    return servicePriceChecksFromView(result.items, propertyId, result.totalCount ?? result.items.length);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_ACCESS_DENIED') return servicePriceChecksFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('service-price-radar.checks', async (envelope) => servicePriceChecksResult(envelope.propertyId!, envelope.userId));
