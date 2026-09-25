// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { humanDate, readableCode } from '../askFormatting';
import { ServicePriceRadarService } from '../../servicePriceRadar.service';

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

export function servicePriceChecksFromView(checks: readonly ServicePriceCheckView[] | 'PRIMARY_OWNER_ONLY', propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/service-price-radar`;
  const openAction = { id: 'open-service-price-radar', label: 'Open Service Price Radar', href: pageHref, style: 'PRIMARY' as const };
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
        body: 'Service Price Radar compares a contractor quote with typical local prices for the service. Open it to check a quote.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Compare my service quotes'],
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
    actions: [openAction],
  }];
  if (checks.length >= SERVICE_PRICE_RADAR_ASK_LIMIT) {
    blocks.push({
      type: 'LIMITATION', id: 'service-price-radar-limit', title: `Showing the ${SERVICE_PRICE_RADAR_ASK_LIMIT} most recent checks`,
      body: 'Older quote checks are not listed here, as on the page.', severity: 'INFO',
    });
  }
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'service-price-radar-checks', title: 'Recent quote checks', description: 'Newest first, as on the page. Open Service Price Radar for the full breakdown.',
    sections: [{
      id: 'service-price-radar-recent', title: 'Recent checks', count: checks.length,
      items: checks.map((check) => {
        const low = servicePriceMoney(check.expectedLow);
        const high = servicePriceMoney(check.expectedHigh);
        return {
          id: check.id,
          title: `${servicePriceCategoryLabel(check.serviceCategory)}${check.serviceSubcategory ? ` · ${servicePriceCategoryLabel(check.serviceSubcategory)}` : ''}`,
          description: check.explanationShort,
          meta: [
            `Quote ${servicePriceMoney(check.quoteAmount)}`,
            low && high ? `Expected ${low} to ${high}` : 'Broad range only',
            ...(check.quoteVendorName ? [check.quoteVendorName] : []),
            `Checked ${humanDate(new Date(check.createdAt))}`,
          ],
          status: check.verdict ? SERVICE_PRICE_VERDICT_LABELS[check.verdict] ?? 'Need more context' : 'Need more context',
          href: pageHref,
        };
      }),
    }],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'SERVICE_PRICE_RADAR_CHECKS_READY', blocks, suggestions: ['Compare my service quotes'] };
}

async function servicePriceChecksResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  try {
    const { items } = await new ServicePriceRadarService().listChecks(propertyId, userId, { limit: SERVICE_PRICE_RADAR_ASK_LIMIT });
    return servicePriceChecksFromView(items, propertyId);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_ACCESS_DENIED') return servicePriceChecksFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('service-price-radar.checks', async (envelope) => servicePriceChecksResult(envelope.propertyId!, envelope.userId));
