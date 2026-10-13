// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { ServiceCategory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getQuoteComparisonWorkspace, getWorkspaceComparability } from '../../quoteComparison.service';
import { money } from '../askFormatting';
import { askContextFingerprint, durableFreeTextClarification, QuoteWorkspaceCommandInputSchema, ensurePropertyAccess } from '../askHandlerSupport';
import { QUOTE_COMMAND_ACTION_IDS, QUOTE_COMMAND_MESSAGES, QUOTE_ENTITY_TYPE, QUOTE_WORKSPACE_ENTITY_TYPE } from '../support/quoteComparisonCommand';

export async function quoteWorkspaceContextVersion(propertyId: string): Promise<string> {
  const workspaces = await prisma.quoteComparisonWorkspace.findMany({ where: { propertyId }, select: { id: true, status: true, updatedAt: true }, orderBy: { id: 'asc' } });
  return askContextFingerprint(workspaces.map((workspace) => [workspace.id, workspace.status, workspace.updatedAt.toISOString()]));
}

function serviceCategoryFromMessage(message: string): ServiceCategory | null {
  const categories: Array<[RegExp, ServiceCategory]> = [
    [/\b(?:roof|roofing)\b/i, ServiceCategory.ROOFING], [/\bplumb/i, ServiceCategory.PLUMBING],
    [/\belectric/i, ServiceCategory.ELECTRICAL], [/\b(?:hvac|heating|cooling|furnace|air conditioner)\b/i, ServiceCategory.HVAC],
    [/\b(?:clean|cleaning)\b/i, ServiceCategory.CLEANING], [/\b(?:paint|painting)\b/i, ServiceCategory.PAINTING],
    [/\b(?:landscap|yard)\b/i, ServiceCategory.LANDSCAPING], [/\b(?:appliance)\b/i, ServiceCategory.APPLIANCE_REPAIR],
    [/\b(?:inspect|inspection)\b/i, ServiceCategory.INSPECTION], [/\b(?:warranty)\b/i, ServiceCategory.WARRANTY],
    [/\b(?:insurance|coverage)\b/i, ServiceCategory.INSURANCE],
  ];
  return categories.find(([pattern]) => pattern.test(message))?.[1] ?? null;
}

async function quoteComparisonCreateResult(propertyId: string, message: string): Promise<AskOperationResult> {
  const serviceCategory = serviceCategoryFromMessage(message);
  if (!serviceCategory) return {
    status: 'NEEDS_CLARIFICATION', reasonCode: 'QUOTE_COMPARISON_SCOPE_REQUIRED',
    ...durableFreeTextClarification('QUOTE_COMPARISON_CREATE', 'What service are the quotes for?'),
    blocks: [{ type: 'SUMMARY', id: 'quote-workspace-scope', title: 'What service are the quotes for?', body: 'Name the service—such as roofing, plumbing, HVAC, electrical, cleaning, or painting—before creating the comparison workspace.', tone: 'CAUTION', actions: [] }],
    suggestions: [],
  };
  const input = QuoteWorkspaceCommandInputSchema.parse({ serviceCategory, scopeSummary: message.slice(0, 1000) });
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = await quoteWorkspaceContextVersion(propertyId);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'QUOTE_COMPARISON_CONFIRMATION_REQUIRED', contextVersion, parameters: { quoteWorkspace: input, quoteWorkspaceContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'quote-workspace-review', title: 'Review this comparison workspace', body: 'No workspace or quote has been created yet.', tone: 'DEFAULT', actions: [] }],
    confirmation: { confirmationId: `quote-workspace-${propertyId}-1`, version: 1, title: 'Create this quote comparison?', description: 'This creates one canonical draft workspace; it does not select a provider or accept a quote.', fields: [{ label: 'Service', value: serviceCategory.toLowerCase().replace(/_/g, ' ') }, { label: 'Scope', value: input.scopeSummary }], editableFields: [], confirmLabel: 'Create workspace', consentText: 'I authorize creating this draft comparison workspace for the selected home.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

const QUOTE_STALE_AFTER_DAYS = 90;

const quoteDate = (value: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(value);

const quoteReadinessLabel = (stage: unknown) => String(stage ?? 'Needs review').toLowerCase().replace(/_/g, ' ');

export const QUOTE_LOWEST_PRICE_BADGE = {
  label: 'Lowest price',
  policyCode: 'QUOTE_LOWEST_PRICE_SCOPE_ALIGNED',
  basis: 'The lowest recorded total among the comparison-ready proposals, which cover the same confirmed scope. It is not a recommendation: check exclusions, warranty and payment terms.',
} as const;

type QuoteForReview = {
  id: string; vendorName: string; quoteAmount: unknown; currency?: string | null; decision?: string | null;
  readinessStage?: string | null; scopeSummary?: string | null; serviceLabelRaw?: string | null;
  quoteDate?: Date | null; expirationDate?: Date | null; missingFactsJson?: unknown;
  terms?: Array<{ type: string; value: string }> | null;
};

/**
 * IW-PRES-016 (FRD v1.76). The quotes still in play (every quote the homeowner has not rejected) as a comparison
 * strip, or null when there are fewer than two or more than four of them; the caller then keeps the table. The only
 * badge is "Lowest price", and only when the workspace is COMPARABLE, among its comparison-ready quotes, in one
 * currency and without a tie; its Price attribute is then the declared leading value. Freshness mirrors the
 * comparison page (expired, no quote date, or over 90 days old is a caution). Pure and exported for tests.
 */
export function quoteReviewComparison(
  quotes: QuoteForReview[],
  comparability: { status: string; eligibleQuoteIds: string[] },
  now: Date = new Date(),
): Extract<AskPresentationBlock, { type: 'COMPARISON' }> | null {
  const active = quotes.filter((quote) => quote.decision !== 'REJECTED');
  if (active.length < 2 || active.length > 4) return null;
  const rejected = quotes.length - active.length;
  const amountOf = (quote: QuoteForReview) => {
    const value = Number(quote.quoteAmount);
    return Number.isFinite(value) && value >= 0 ? { value, currency: (quote.currency ?? 'USD').toUpperCase() } : null;
  };
  let lowestId: string | null = null;
  if (comparability.status === 'COMPARABLE') {
    const eligible = new Set(comparability.eligibleQuoteIds);
    const priced = active.filter((quote) => eligible.has(quote.id)).map((quote) => ({ id: quote.id, amount: amountOf(quote) }));
    const currencies = new Set(priced.map((entry) => entry.amount?.currency));
    if (priced.length >= 2 && priced.every((entry) => entry.amount) && currencies.size === 1) {
      const min = Math.min(...priced.map((entry) => entry.amount!.value));
      const atMin = priced.filter((entry) => entry.amount!.value === min);
      if (atMin.length === 1) lowestId = atMin[0].id;
    }
  }
  const ready = new Set(comparability.eligibleQuoteIds);
  return {
    type: 'COMPARISON', id: 'quote-review-table', title: 'Recorded proposals',
    description: `Ask preserves the canonical readiness state and does not select a provider.${rejected ? ` ${rejected} rejected ${rejected === 1 ? 'quote is' : 'quotes are'} not shown here.` : ''}`,
    options: active.map((quote) => {
      const amount = amountOf(quote);
      const leading = quote.id === lowestId;
      const expired = quote.expirationDate ? quote.expirationDate.getTime() < now.getTime() : false;
      const ageDays = quote.quoteDate ? Math.floor((now.getTime() - quote.quoteDate.getTime()) / 86_400_000) : null;
      const freshness = expired
        ? { value: `Expired ${quoteDate(quote.expirationDate!)}`, tone: 'CAUTION' as const }
        : ageDays === null
          ? { value: 'Quote date not recorded', tone: 'CAUTION' as const }
          : ageDays > QUOTE_STALE_AFTER_DAYS
            ? { value: `Quoted ${quoteDate(quote.quoteDate!)}, over ${QUOTE_STALE_AFTER_DAYS} days ago`, tone: 'CAUTION' as const }
            : { value: `Quoted ${quoteDate(quote.quoteDate!)}`, tone: 'DEFAULT' as const };
      const scope = quote.scopeSummary ?? quote.serviceLabelRaw ?? null;
      const warranty = (quote.terms ?? []).find((term) => term.type === 'WARRANTY')?.value ?? null;
      const missing = Array.isArray(quote.missingFactsJson)
        ? (quote.missingFactsJson as Array<{ label?: unknown }>).map((fact) => (typeof fact?.label === 'string' ? fact.label : null)).filter((label): label is string => Boolean(label))
        : [];
      return {
        id: quote.id, label: quote.vendorName, summary: null,
        ...(leading ? { badges: [{ ...QUOTE_LOWEST_PRICE_BADGE }] } : {}),
        amount,
        attributes: [
          { label: 'Price', value: amount ? `${amount.currency} ${amount.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'Price not recorded', tone: amount ? 'DEFAULT' as const : 'CAUTION' as const, ...(leading ? { leading: true } : {}) },
          ready.has(quote.id)
            ? { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' as const }
            : { label: 'Readiness', value: quoteReadinessLabel(quote.readinessStage), tone: 'CAUTION' as const },
          { label: 'Scope', value: scope ?? 'Scope not confirmed', tone: scope ? 'DEFAULT' as const : 'CAUTION' as const },
          { label: 'Warranty', value: warranty ?? 'Not recorded', tone: 'DEFAULT' as const },
          { label: 'Freshness', ...freshness },
          missing.length
            ? { label: 'Missing facts', value: missing.slice(0, 3).join(', ') + (missing.length > 3 ? ` and ${missing.length - 3} more` : ''), tone: 'CAUTION' as const }
            : { label: 'Missing facts', value: 'None', tone: 'DEFAULT' as const },
        ],
        actions: [],
      };
    }),
    actions: [],
  };
}

async function quoteComparisonReviewResult(propertyId: string, canChange = false): Promise<AskOperationResult> {
  const latest = await prisma.quoteComparisonWorkspace.findFirst({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, select: { id: true, outcome: true, journeyStage: true } });
  if (!latest) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'QUOTE_COMPARISON_NOT_STARTED',
    blocks: [{ type: 'SUMMARY', id: 'quote-review-empty', title: 'No quote comparison is recorded yet', body: 'Create a workspace, then record at least two proposals. Ask will not compare unrecorded prices or infer missing scope and terms.', tone: 'CAUTION', actions: [{ id: 'create-comparison', label: 'Create comparison workspace', interactionType: 'START_WORKFLOW', message: 'Start a quote comparison workspace', operationId: 'QUOTE_COMPARISON_CREATE', style: 'PRIMARY' }] }],
    suggestions: [],
  };
  const [workspace, comparability] = await Promise.all([
    getQuoteComparisonWorkspace(propertyId, latest.id), getWorkspaceComparability(propertyId, latest.id),
  ]);
  if (!workspace) throw new Error('Quote comparison workspace is unavailable.');
  const quotes = (workspace.quotes ?? []) as Array<any>;
  const comparisonReady = new Set(comparability.eligibleQuoteIds);
  const amounts = quotes.map((quote) => Number(quote.quoteAmount)).filter(Number.isFinite);
  const lowest = amounts.length ? Math.min(...amounts) : null;
  const highest = amounts.length ? Math.max(...amounts) : null;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'quote-review-summary', title: quotes.length < 2 ? 'Add another proposal before comparing' : comparability.status === 'COMPARABLE' ? `${quotes.length} proposals are ready for a scope-aligned review` : 'The recorded proposals are not safely comparable yet',
    body: `${comparability.reasons.join(' ')}${lowest != null && highest != null ? ` Recorded prices range from ${money(lowest)} to ${money(highest)}.` : ''} A lower total is not automatically a better fit; scope, exclusions, warranty, licensing, insurance, payment terms, and homeowner-confirmed facts remain material.`,
    tone: comparability.status === 'COMPARABLE' ? 'DEFAULT' : 'CAUTION',
    // A contributor or owner can record another proposal while the decision is open; a viewer is offered nothing it would refuse.
    actions: canChange && latest.outcome === 'OPEN' ? [{
      id: QUOTE_COMMAND_ACTION_IDS.ADD, label: 'Add a proposal', interactionType: 'START_WORKFLOW' as const, message: QUOTE_COMMAND_MESSAGES.ADD,
      operationId: 'QUOTE_COMPARISON_COMMAND' as const, entityType: QUOTE_WORKSPACE_ENTITY_TYPE, entityId: latest.id, style: 'PRIMARY' as const,
    }, {
      id: QUOTE_COMMAND_ACTION_IDS.CLOSE, label: 'Close this decision', interactionType: 'START_WORKFLOW' as const, message: QUOTE_COMMAND_MESSAGES.CLOSE,
      operationId: 'QUOTE_COMPARISON_COMMAND' as const, entityType: QUOTE_WORKSPACE_ENTITY_TYPE, entityId: latest.id, style: 'QUIET' as const,
    }] : [],
  }];
  // IW-PRES-016 (FRD v1.76): two to four quotes still in play render as a comparison strip; one quote, or five and
  // more, keep the table below with every quote.
  const strip = quoteReviewComparison(quotes, comparability);
  if (strip) blocks.push(strip);
  else if (quotes.length) blocks.push({
    type: 'TABLE', id: 'quote-review-table', title: 'Recorded proposals', description: 'Ask preserves the canonical readiness state and does not select a provider.',
    columns: [{ key: 'vendor', label: 'Provider' }, { key: 'amount', label: 'Price' }, { key: 'readiness', label: 'Readiness' }, { key: 'scope', label: 'Scope' }],
    rows: quotes.map((quote) => ({ id: quote.id, values: { vendor: quote.vendorName, amount: `${quote.currency ?? 'USD'} ${Number(quote.quoteAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, readiness: comparisonReady.has(quote.id) ? 'Comparison ready' : String(quote.readinessStage ?? 'Needs review').toLowerCase().replace(/_/g, ' '), scope: quote.scopeSummary ?? quote.serviceLabelRaw ?? 'Scope not confirmed' } })), actions: [],
  });
  const locked = latest.outcome !== 'OPEN' || ['FINALIZATION', 'BOOKING', 'SCHEDULED', 'COMPLETED', 'CLOSED'].includes(String(latest.journeyStage));
  if (canChange && !locked && quotes.length) {
    const item = (quote: any) => {
      const rejected = quote.decision === 'REJECTED';
      const ready = comparisonReady.has(quote.id);
      const open = ((quote.clarifications ?? []) as Array<{ status: string }>).filter((entry) => entry.status === 'OPEN').length;
      const act = (id: string, label: string, message: string, style: 'PRIMARY' | 'SECONDARY' | 'QUIET' = 'SECONDARY') =>
        ({ id, label, message, operationId: 'QUOTE_COMPARISON_COMMAND', interactionType: 'MUTATE_RECORD' as const, style });
      return {
        id: quote.id, title: quote.vendorName, description: null,
        meta: [
          `${quote.currency ?? 'USD'} ${Number(quote.quoteAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
          rejected ? 'Rejected' : quote.isSelected ? 'Selected' : ready ? 'Comparison ready' : quote.homeownerConfirmedAt ? 'Facts confirmed, not yet comparable' : 'Facts not confirmed',
          ...(open ? [`${open} open question${open === 1 ? '' : 's'}`] : []),
        ],
        status: null, href: null, entityType: QUOTE_ENTITY_TYPE,
        actions: [
          ...(ready && !rejected && !quote.isSelected ? [act(QUOTE_COMMAND_ACTION_IDS.SELECT, 'Select', QUOTE_COMMAND_MESSAGES.SELECT, 'PRIMARY')] : []),
          ...(!quote.homeownerConfirmedAt && !rejected ? [act(QUOTE_COMMAND_ACTION_IDS.CONFIRM, 'Confirm the facts', QUOTE_COMMAND_MESSAGES.CONFIRM, ready ? 'SECONDARY' : 'PRIMARY')] : []),
          act(QUOTE_COMMAND_ACTION_IDS.EDIT, 'Change details', QUOTE_COMMAND_MESSAGES.EDIT),
          act(QUOTE_COMMAND_ACTION_IDS.CLARIFY, 'Ask a question', QUOTE_COMMAND_MESSAGES.CLARIFY),
          ...(open ? [act(QUOTE_COMMAND_ACTION_IDS.RESOLVE, 'Record the answer', QUOTE_COMMAND_MESSAGES.RESOLVE)] : []),
          rejected ? act(QUOTE_COMMAND_ACTION_IDS.RESTORE, 'Return to consideration', QUOTE_COMMAND_MESSAGES.RESTORE) : act(QUOTE_COMMAND_ACTION_IDS.REJECT, 'Reject', QUOTE_COMMAND_MESSAGES.REJECT),
          act(QUOTE_COMMAND_ACTION_IDS.REMOVE, 'Remove', QUOTE_COMMAND_MESSAGES.REMOVE, 'QUIET'),
        ],
      };
    };
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'quote-review-manage', title: 'Manage proposals',
      description: 'Confirm a proposal\u2019s facts, change them, record a question or the provider\u2019s answer, select the one you prefer, reject one you have ruled out, or remove one. Each change is reviewed before it is saved, and nothing is accepted or sent to a provider.',
      sections: [{ id: 'quote-review-manage-all', title: 'Proposals', count: quotes.length, items: quotes.slice(0, 25).map(item) }], actions: [],
    });
  }
  blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'quote-review-gaps', title: 'Comparison controls', description: 'These are the scope or fact gaps the recorded proposals still have. Use Confirm the facts, or Change details, on the proposal.', sections: [{ id: 'controls', title: comparability.status === 'COMPARABLE' ? 'Aligned comparison' : 'What still needs attention', count: Math.max(1, comparability.reasons.length), items: comparability.reasons.map((reason, index) => ({ id: `quote-reason-${index}`, title: reason, description: null, meta: [], status: comparability.status, href: null })) }], actions: [] });
  blocks.push({ type: 'EVIDENCE', id: 'quote-review-evidence', title: 'Proposal freshness', items: quotes.slice(0, 20).map((quote) => ({ label: quote.vendorName, source: quote.sourceType ? `Quote · ${String(quote.sourceType).toLowerCase()}` : 'Recorded quote', observedAt: quote.updatedAt?.toISOString?.() ?? quote.createdAt?.toISOString?.() ?? null })) });
  blocks.push({ type: 'BOUNDARY', id: 'quote-review-boundary', title: 'Comparison support—not provider endorsement', body: 'Verify scope, credentials, insurance, references, permits, warranties, payment milestones, and final terms. Ask does not accept a quote, rank provider trust, or guarantee workmanship.', severity: 'INFO', suggestions: [] });
  return { status: comparability.status === 'COMPARABLE' ? 'ANSWERED' : 'READY_WITH_LIMITATIONS', reasonCode: comparability.status === 'COMPARABLE' ? undefined : `QUOTE_${comparability.status}`, contextVersion: workspace.updatedAt?.toISOString?.() ?? null, blocks, suggestions: [] };
}

registerCapabilityHandler('quote-comparison.create', async (envelope) => quoteComparisonCreateResult(envelope.propertyId!, envelope.message));

registerCapabilityHandler('quote-comparison.review', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return quoteComparisonReviewResult(envelope.propertyId!, access.role !== 'VIEWER');
});
