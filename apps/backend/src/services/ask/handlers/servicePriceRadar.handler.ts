// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { APIError } from '../../../middleware/error.middleware';
import { humanDate, readableCode } from '../askFormatting';
import { ServicePriceRadarService } from '../../servicePriceRadar.service';
import { SERVICE_PRICE_CHECK_ACTION_ID, SERVICE_PRICE_CHECK_DETAIL_ACTION_ID, SERVICE_PRICE_CHECK_DETAIL_MESSAGE, SERVICE_PRICE_CHECK_ENTITY_TYPE, SERVICE_PRICE_CHECK_MESSAGE, SERVICE_PRICE_CHECKS_FOR_RECORD_ACTION_ID, SERVICE_PRICE_CHECKS_FOR_RECORD_MESSAGE, SERVICE_PRICE_NEGOTIATE_ACTION_ID, SERVICE_PRICE_NEGOTIATE_LABEL, SERVICE_PRICE_NEGOTIATE_MESSAGE } from '../support/homeToolRunConstants';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { SERVICE_PRICE_STORED_LINK_TYPES, parseServicePriceLink } from '../support/servicePriceLinkOptions';

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
export const servicePriceCategoryLabel = (value: string) => SERVICE_PRICE_CATEGORY_LABELS[value] ?? readableCode(value).replace(/\b\w/g, (c) => c.toUpperCase());
const servicePriceMoney = (value: number | null | undefined) => (value == null ? null : `$${Math.round(value).toLocaleString('en-US')}`);

export function servicePriceChecksFromView(checks: readonly ServicePriceCheckView[] | 'PRIMARY_OWNER_ONLY', propertyId: string, sourceTotal?: number, forRecord = false): AskOperationResult {
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
  if (!checks.length && forRecord) {
    return {
      status: 'ANSWERED', reasonCode: 'SERVICE_PRICE_RADAR_NO_CHECKS_FOR_RECORD',
      blocks: [{ type: 'SUMMARY', id: 'service-price-radar-summary', title: 'No quote checks for this record', body: 'No quote check has been tied to this record. A check can be tied to a record when it is made. Nothing has changed.', tone: 'DEFAULT', actions: [checkAction('Check a quote')] }, boundary],
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
    title: forRecord ? `${checks.length} quote check${checks.length === 1 ? '' : 's'} for this record` : `${checks.length} recent quote check${checks.length === 1 ? '' : 's'}`,
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
    id: 'service-price-radar-recent', title: forRecord ? 'Checks for this record' : 'Recent checks', count: checks.length,
    items: checks.map((check) => {
      const low = servicePriceMoney(check.expectedLow);
      const high = servicePriceMoney(check.expectedHigh);
      return {
        id: check.id,
        title: `${servicePriceCategoryLabel(check.serviceCategory)}${check.serviceSubcategory ? ` · ${servicePriceCategoryLabel(check.serviceSubcategory)}` : ''}`,
        description: check.explanationShort,
        meta: [`Quote ${servicePriceMoney(check.quoteAmount)}`, low && high ? `Expected ${low} to ${high}` : 'Broad range only', ...(check.quoteVendorName ? [check.quoteVendorName] : []), `Checked ${humanDate(new Date(check.createdAt))}`],
        status: check.verdict ? SERVICE_PRICE_VERDICT_LABELS[check.verdict] ?? 'Need more context' : 'Need more context', href: null,
        entityType: SERVICE_PRICE_CHECK_ENTITY_TYPE,
        actions: [{ id: SERVICE_PRICE_CHECK_DETAIL_ACTION_ID, label: 'See how it was checked', message: SERVICE_PRICE_CHECK_DETAIL_MESSAGE, style: 'SECONDARY' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'SERVICE_PRICE_CHECKS' as const }],
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

type ServicePriceCheckDetailView = Awaited<ReturnType<ServicePriceRadarService['getCheckDetail']>>['check'];
const asRecord = (value: unknown): Record<string, any> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {});
const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []);
const detailDate = (value: unknown) => (typeof value === 'string' && value ? humanDate(new Date(value)) : null);
const LINKED_TYPE_LABELS: Record<string, string> = { SYSTEM: 'System', APPLIANCE: 'Appliance', DOCUMENT: 'Document', INCIDENT: 'Incident', ROOM: 'Room' };

// The saved check as the page's detail shows it: what was compared, the benchmark behind the range and its provenance, the confidence, the
// pricing factors and adjustments, and the home records the check used. Read-only; a check is immutable.
/** Desktop's "Need help responding?": hand-off from a check whose price is not simply fair. Opens the contractor-quote review form with the check's vendor, amount and service. */
export const servicePriceNegotiateAction = (checkId: string) => ({
  id: SERVICE_PRICE_NEGOTIATE_ACTION_ID, label: SERVICE_PRICE_NEGOTIATE_LABEL, interactionType: 'START_WORKFLOW' as const, message: SERVICE_PRICE_NEGOTIATE_MESSAGE,
  operationId: 'NEGOTIATION_SHIELD_CASE_START' as const, entityType: SERVICE_PRICE_CHECK_ENTITY_TYPE, entityId: checkId, style: 'SECONDARY' as const,
});

export function servicePriceCheckDetailFromView(check: ServicePriceCheckDetailView | null): AskOperationResult {
  const backAction = { id: SERVICE_PRICE_CHECK_ACTION_ID, label: 'Check a quote', interactionType: 'START_WORKFLOW' as const, message: SERVICE_PRICE_CHECK_MESSAGE, operationId: 'SERVICE_PRICE_CHECK_RUN', style: 'PRIMARY' as const };
  if (!check) {
    return { status: 'NOT_APPLICABLE', reasonCode: 'SERVICE_PRICE_CHECK_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'service-price-radar-detail-missing', title: 'That quote check is no longer available', body: 'Ask could not find that check. Nothing has changed.', tone: 'DEFAULT', actions: [] }], suggestions: [] };
  }
  const factors = asRecord(check.pricingFactorsJson);
  const explanation = asRecord(check.explanationJson);
  const benchmark = asRecord(factors.benchmark);
  const confidence = asRecord(factors.confidence);
  const matched = benchmark.matched === true;
  const low = servicePriceMoney(check.expectedLow);
  const high = servicePriceMoney(check.expectedHigh);
  const verdict = check.verdict ? SERVICE_PRICE_VERDICT_LABELS[check.verdict] ?? 'Need more context' : 'Need more context';
  const title = `${servicePriceCategoryLabel(check.serviceCategory)}${check.serviceSubcategory ? ` · ${servicePriceCategoryLabel(check.serviceSubcategory)}` : ''}`;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'service-price-radar-detail', title,
    body: [
      `Quote ${servicePriceMoney(check.quoteAmount)}${check.quoteVendorName ? ` from ${check.quoteVendorName}` : ''}${low && high ? `; expected ${low} to ${high}` : '; no qualified range'}.`,
      check.explanationShort ?? '',
      `Checked ${humanDate(new Date(check.createdAt))}.`,
    ].filter(Boolean).join(' '),
    tone: check.verdict === 'HIGH' || check.verdict === 'VERY_HIGH' ? 'CAUTION' : 'DEFAULT', actions: [...(check.verdict === 'FAIR' ? [] : [servicePriceNegotiateAction(check.id)]), backAction],
  }];

  const attr = (label: string, value: string | number | null | undefined) => (value == null || value === '' ? null : { label, value: String(value).slice(0, 160) });
  type DetailRow = { id: string; title: string; description: string | null; meta: string[]; status: string | null; href: null; attributes?: Array<{ label: string; value: string }>; actions?: Array<{ id: string; entityType: string; entityId: string; label: string; message: string; style: 'QUIET'; interactionType: 'CONVERSATION_CONTINUE'; operationId: 'SERVICE_PRICE_CHECKS' }> };
  const rows: DetailRow[] = [];
  rows.push({
    id: 'result', title: 'Result', description: null, meta: [], status: verdict, href: null,
    attributes: [
      attr('Quote', servicePriceMoney(check.quoteAmount)), attr('Expected range', low && high ? `${low} to ${high}` : 'Broad range only'), attr('Typical (median)', servicePriceMoney(check.expectedMedian)),
      attr('Confidence', check.confidenceScore == null ? null : `${Math.round(check.confidenceScore * 100)}%${confidence.band ? ` (${readableCode(String(confidence.band))})` : ''}`),
      attr('Evidence', matched ? 'Reviewed local benchmark' : 'Rough planning range only'),
    ].filter((entry): entry is { label: string; value: string } => entry !== null),
  });
  if (matched) {
    const observed = [detailDate(benchmark.observationStart), detailDate(benchmark.observationEnd)].filter(Boolean).join(' to ');
    rows.push({
      id: 'benchmark', title: 'Benchmark behind the range', description: typeof benchmark.methodologySummary === 'string' ? benchmark.methodologySummary : null, meta: [], status: null, href: null,
      attributes: [
        attr('Source', benchmark.sourceName), attr('Source link', typeof benchmark.sourceUrl === 'string' ? benchmark.sourceUrl : null), attr('Release', benchmark.releaseVersion),
        attr('Area', benchmark.regionKey ? `${readableCode(String(benchmark.regionType ?? ''))} ${benchmark.regionKey}`.trim() : null),
        attr('Observed', observed || null), attr('Retrieved', detailDate(benchmark.retrievedAt)), attr('Effective', detailDate(benchmark.effectiveAt)), attr('Expires', detailDate(benchmark.expiresAt)),
        attr('Sample size', benchmark.sampleSize), attr('Priced per', benchmark.unit ? readableCode(String(benchmark.unit)) : null),
        attr('Percentile range', benchmark.percentileLow != null && benchmark.percentileHigh != null ? `${servicePriceMoney(Number(benchmark.percentileLow))} to ${servicePriceMoney(Number(benchmark.percentileHigh))}` : null),
        attr('Scope', benchmark.normalizedScopeKey ? readableCode(String(benchmark.normalizedScopeKey)) : null), attr('Benchmark ID', benchmark.benchmarkId), attr('Release ID', benchmark.releaseId),
      ].filter((entry): entry is { label: string; value: string } => entry !== null),
    });
  }
  const adjustments = Array.isArray(factors.adjustments) ? factors.adjustments.map(asRecord).filter((entry) => typeof entry.note === 'string') : [];
  if (adjustments.length) {
    rows.push({
      id: 'adjustments', title: 'What moved the range', description: null, meta: [], status: null, href: null,
      attributes: adjustments.slice(0, 8).map((entry) => ({ label: readableCode(String(entry.code ?? 'adjustment')).replace(/^\w/, (c) => c.toUpperCase()), value: `${entry.effect === 'up' ? 'Raised' : entry.effect === 'down' ? 'Lowered' : 'No change'}: ${String(entry.note).slice(0, 120)}` })),
    });
  }
  const property = asRecord(factors.property);
  const region = asRecord(factors.region);
  const systems = asRecord(asRecord(check.propertySnapshotJson).systems);
  const usedFactors = [
    attr('Home size', property.propertySize ? `${Number(property.propertySize).toLocaleString('en-US')} sq ft` : null), attr('Year built', property.yearBuilt),
    attr('Home type', property.dwellingType ? readableCode(String(property.dwellingType)) : null), attr('Location', [region.city, region.state].filter(Boolean).join(', ') || null),
    ...Object.entries({ roofType: 'Roof', heatingType: 'Heating', coolingType: 'Cooling', waterHeaterType: 'Water heater', foundationType: 'Foundation', sidingType: 'Siding' }).map(([key, label]) => (typeof systems[key] === 'string' && systems[key] ? attr(label, readableCode(systems[key])) : null)),
    attr('Drainage issues', systems.hasDrainageIssues === true ? 'Yes' : systems.hasDrainageIssues === false ? 'No' : null),
  ].filter((entry): entry is { label: string; value: string } => entry !== null);
  if (usedFactors.length) rows.push({ id: 'home-facts', title: 'Home facts used', description: null, meta: [], status: null, href: null, attributes: usedFactors });
  for (const entity of check.linkedEntities.slice(0, 8)) {
    rows.push({
      id: `linked-${entity.linkedEntityType}-${entity.linkedEntityId}`, title: `${LINKED_TYPE_LABELS[entity.linkedEntityType] ?? readableCode(entity.linkedEntityType)} used: ${entity.label}`.slice(0, 160),
      description: entity.summary, meta: [], status: null, href: null,
      actions: [{ id: SERVICE_PRICE_CHECKS_FOR_RECORD_ACTION_ID, entityType: entity.linkedEntityType, entityId: entity.linkedEntityId, label: 'Other checks for this', message: SERVICE_PRICE_CHECKS_FOR_RECORD_MESSAGE, style: 'QUIET' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'SERVICE_PRICE_CHECKS' as const }],
    });
  }
  // A row shows at most eight facts; a longer set continues in a second row of the same title.
  for (let i = rows.length - 1; i >= 0; i--) {
    const attributes = rows[i].attributes ?? [];
    if (attributes.length <= 8) continue;
    const chunks = Array.from({ length: Math.ceil(attributes.length / 8) }, (_, n) => attributes.slice(n * 8, n * 8 + 8));
    rows.splice(i, 1, ...chunks.map((chunk, n) => ({ ...rows[i], id: n ? `${rows[i].id}-${n + 1}` : rows[i].id, title: n ? `${rows[i].title} (continued)` : rows[i].title, description: n ? null : rows[i].description, attributes: chunk })));
  }
  const sections = [{ id: 'service-price-radar-detail-sections', title: 'How it was checked', count: rows.length, items: rows }];
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'service-price-radar-detail-list', title: 'How this check was made', description: null, sections,
    collection: collectionDescriptor({ sourceTotal: rows.length, fetchedCount: rows.length, sections, nextPageAvailable: false }), actions: [],
  });
  const limitations = asStrings(explanation.limitations);
  if (limitations.length) blocks.push({ type: 'LIMITATION', id: 'service-price-radar-detail-limits', title: 'What this check cannot tell you', body: limitations.join(' '), severity: 'INFO' });
  blocks.push({
    type: 'BOUNDARY', id: 'service-price-radar-boundary', title: 'A price check, not a quote review',
    body: 'Expected ranges come from typical local prices for the service, not an inspection of the job. Scope, materials and access can move a fair price, so ask the contractor about a quote that falls outside the range before deciding.',
    severity: 'INFO', suggestions: [],
  });
  return { status: 'ANSWERED', reasonCode: 'SERVICE_PRICE_CHECK_DETAIL_READY', blocks, suggestions: [] };
}

async function servicePriceCheckDetailResult(propertyId: string, userId: string, checkId: string): Promise<AskOperationResult> {
  try {
    const { check } = await new ServicePriceRadarService().getCheckDetail(propertyId, checkId, userId);
    return servicePriceCheckDetailFromView(check);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_ACCESS_DENIED') return servicePriceChecksFromView('PRIMARY_OWNER_ONLY', propertyId);
    if (error instanceof APIError && error.code === 'SERVICE_RADAR_CHECK_NOT_FOUND') return servicePriceCheckDetailFromView(null);
    throw error;
  }
}

async function servicePriceChecksForRecordResult(propertyId: string, userId: string, linkedEntityType: string, linkedEntityId: string): Promise<AskOperationResult> {
  const link = parseServicePriceLink(`${linkedEntityType}:${linkedEntityId}`, SERVICE_PRICE_STORED_LINK_TYPES);
  if (!link) return servicePriceChecksFromView([], propertyId, 0, true);
  try {
    const result = await new ServicePriceRadarService().listChecks(propertyId, userId, { limit: SERVICE_PRICE_RADAR_ASK_LIMIT, ...link });
    return servicePriceChecksFromView(result.items, propertyId, result.totalCount ?? result.items.length, true);
  } catch (error) {
    if (error instanceof APIError && error.code === 'PROPERTY_ACCESS_DENIED') return servicePriceChecksFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('service-price-radar.checks', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message === SERVICE_PRICE_CHECKS_FOR_RECORD_MESSAGE && launch?.entityType && launch.entityId) {
    return servicePriceChecksForRecordResult(envelope.propertyId!, envelope.userId, launch.entityType, launch.entityId);
  }
  if (envelope.message === SERVICE_PRICE_CHECK_DETAIL_MESSAGE && launch?.entityType === SERVICE_PRICE_CHECK_ENTITY_TYPE && launch.entityId) {
    return servicePriceCheckDetailResult(envelope.propertyId!, envelope.userId, launch.entityId);
  }
  return servicePriceChecksResult(envelope.propertyId!, envelope.userId);
});
