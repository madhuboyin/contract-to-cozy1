// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { listNegotiationShieldCasesForProperty } from '../../negotiationShieldCaseList';
import type { NegotiationShieldCaseSummaryDTO } from '../../negotiationShield.types';

// Negotiation Shield capability-card slice (FRD v1.56): the eighth new operation for a capability with none. Reads
// listNegotiationShieldCasesForProperty, which NegotiationShieldService.listCasesForProperty (GET
// /properties/:id/negotiation-shield/cases, the page's case list) delegates to, newest first. The list lives in its own
// module so Ask does not load the service's document parsing and OCR dependencies. It shows what that list shows (title, scenario, status, last update) plus buyer mode
// and the last analysis date; case descriptions, inputs, analyses and drafts stay on the case. Read-only: creating,
// analyzing and drafting are the page's own writes, and nothing is sent to the other party from Ask.
export const NEGOTIATION_SHIELD_ASK_LIMIT = 50;
type NegotiationShieldCaseView = NegotiationShieldCaseSummaryDTO;
// The page's own labels (NegotiationShieldToolClient SCENARIO_OPTIONS and formatStatusLabel).
const NEGOTIATION_SCENARIO_LABELS: Record<string, string> = {
  CONTRACTOR_QUOTE_REVIEW: 'Contractor quote review',
  INSURANCE_PREMIUM_INCREASE: 'Insurance premium increase',
  INSURANCE_CLAIM_SETTLEMENT: 'Insurance claim settlement',
  BUYER_INSPECTION_NEGOTIATION: 'Buyer inspection negotiation',
  CONTRACTOR_URGENCY_PRESSURE: 'Contractor urgency pressure',
};
const NEGOTIATION_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', READY_FOR_REVIEW: 'Ready for review', ANALYZED: 'Analyzed', ARCHIVED: 'Archived' };

export function negotiationShieldCasesFromView(cases: readonly NegotiationShieldCaseView[], propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/negotiation-shield`;
  const openAction = { id: 'open-negotiation-shield', label: 'Open Negotiation Shield', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'negotiation-shield-boundary', title: 'Preparation help, not legal or insurance advice',
    body: 'Negotiation Shield helps you prepare for a quote, premium, claim or inspection conversation. It is not legal, insurance or pricing advice, and nothing is sent to the other party from here. Case details, analyses and drafts are on each case.',
    severity: 'INFO', suggestions: [],
  };
  if (!cases.length) {
    return {
      status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_NO_CASES',
      blocks: [{
        type: 'SUMMARY', id: 'negotiation-shield-summary', title: 'No Negotiation Shield reviews yet',
        body: 'Negotiation Shield reviews a contractor quote, a premium increase, a claim settlement, contractor urgency pressure or a buyer inspection request before you respond. Open it to start one.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['Compare my service quotes'],
    };
  }
  const shown = cases.slice(0, NEGOTIATION_SHIELD_ASK_LIMIT);
  const count = (status: string) => cases.filter((item) => item.status === status).length;
  const open = cases.length - count('ARCHIVED');
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'negotiation-shield-summary',
    title: `${open} open negotiation review${open === 1 ? '' : 's'}`,
    body: [
      [['READY_FOR_REVIEW', 'ready for review'], ['ANALYZED', 'analyzed'], ['DRAFT', 'in draft'], ['ARCHIVED', 'archived']]
        .filter(([status]) => count(status)).map(([status, label]) => `${count(status)} ${label}`).join(', ').replace(/^./, (c) => c.toUpperCase()) + '.',
      `Last updated ${humanDate(new Date(cases[0].updatedAt))}.`,
    ].join(' '),
    tone: 'DEFAULT',
    actions: [openAction],
  }];
  if (cases.length > shown.length) {
    blocks.push({
      type: 'LIMITATION', id: 'negotiation-shield-limit', title: `Showing the ${shown.length} most recently updated reviews`,
      body: `There are ${cases.length} reviews in all. The rest are on the Negotiation Shield page.`, severity: 'INFO',
    });
  }
  const row = (item: NegotiationShieldCaseView) => ({
    id: item.id,
    title: item.title,
    description: null,
    meta: [
      NEGOTIATION_SCENARIO_LABELS[item.scenarioType] ?? readableCode(item.scenarioType),
      ...(item.perspective === 'BUYER' ? ['Buyer mode'] : []),
      ...(item.latestAnalysisAt ? [`Analyzed ${humanDate(new Date(item.latestAnalysisAt))}`] : []),
      `Updated ${humanDate(new Date(item.updatedAt))}`,
    ],
    status: NEGOTIATION_STATUS_LABELS[item.status] ?? readableCode(item.status),
    href: `${pageHref}?caseId=${encodeURIComponent(item.id)}`,
  });
  const active = shown.filter((item) => item.status !== 'ARCHIVED');
  const archived = shown.filter((item) => item.status === 'ARCHIVED');
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'negotiation-shield-cases', title: 'Negotiation reviews', description: 'Newest first, as on the page. Open a review for its analysis and draft.',
    sections: [
      ...(active.length ? [{ id: 'negotiation-shield-open', title: 'Open', count: active.length, items: active.map(row) }] : []),
      ...(archived.length ? [{ id: 'negotiation-shield-archived', title: 'Archived', count: archived.length, items: archived.map(row) }] : []),
    ],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_CASES_READY', blocks, suggestions: ['Compare my service quotes'] };
}

async function negotiationShieldCasesResult(propertyId: string): Promise<AskOperationResult> {
  return negotiationShieldCasesFromView(await listNegotiationShieldCasesForProperty(propertyId), propertyId);
}

registerCapabilityHandler('negotiation-shield.cases', async (envelope) => negotiationShieldCasesResult(envelope.propertyId!));
