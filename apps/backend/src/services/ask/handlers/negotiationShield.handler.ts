// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { HouseholdRole } from '@prisma/client';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { NEGOTIATION_SHIELD_START_ACTION_ID, NEGOTIATION_SHIELD_START_MESSAGE } from '../support/negotiationShieldStart';
import { humanDate, money, readableCode } from '../askFormatting';
import { getNegotiationShieldCaseReviewForProperty, listNegotiationShieldCasesForProperty, type NegotiationShieldCaseReviewDTO } from '../../negotiationShieldCaseList';
import type { NegotiationShieldCaseSummaryDTO } from '../../negotiationShield.types';

// Negotiation Shield capability-card slice (FRD v1.56): the eighth new operation for a capability with none. Reads
// listNegotiationShieldCasesForProperty, which NegotiationShieldService.listCasesForProperty (GET
// /properties/:id/negotiation-shield/cases, the page's case list) delegates to, newest first. The list lives in its own
// module so Ask does not load the service's document parsing and OCR dependencies. It shows what that list shows (title, scenario, status, last update) plus buyer mode
// and the last analysis date. Read-only: creating, analyzing and drafting are the page's own writes, and nothing is sent to the
// other party from Ask.
//
// Review (all-tools register, Negotiation Shield slice 1): a row's "Review" action opens ONE case from the same operation (the
// Property Brief preview pattern: launchContext.entityType NEGOTIATION_SHIELD_CASE, entityId the case id), reading the case's stored
// analysis and latest draft through getNegotiationShieldCaseReviewForProperty. It never loads the case's raw inputs, documents,
// file URLs or storage keys, and the analysis is the stored, deterministic one: Ask neither runs nor sends anything.
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
export const NEGOTIATION_SHIELD_CASE_ENTITY = 'NEGOTIATION_SHIELD_CASE';
export const NEGOTIATION_SHIELD_REVIEW_MESSAGE = 'Review this negotiation case.';
export const NEGOTIATION_SHIELD_LIST_MESSAGE = 'Show my negotiation shield cases';
const NEGOTIATION_PRICING_LABELS: Record<string, string> = {
  INSUFFICIENT_DATA: 'Not enough information to assess the price', APPEARS_HIGH: 'The price appears high', APPEARS_REASONABLE: 'The price appears reasonable',
  NEEDS_COMPARISON: 'Needs comparison with other quotes', EXPLANATION_UNCLEAR: 'The explanation is unclear', NEEDS_REVIEW: 'Needs review',
  DOCUMENTED_INCREASE: 'The increase is documented', LEVERAGE_PRESENT: 'There is leverage to use', SETTLEMENT_GAP_PRESENT: 'There is a gap in the settlement',
  REQUEST_BROAD_OR_UNCLEAR: 'The request is broad or unclear', PARTIAL_CONCESSION_POSSIBLE: 'A partial concession may be possible', URGENCY_PRESSURE_PRESENT: 'Urgency pressure is present',
};
const NEGOTIATION_LEVEL_LABELS: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INFO: 'Info', MISSING: 'Missing', CAUTION: 'Caution', POSITIVE: 'Positive' };

// A contributor or owner can start a review from here, inside Ask (slice 2a); a viewer reads the list only.
const startReviewAction = {
  id: NEGOTIATION_SHIELD_START_ACTION_ID, label: 'Start a review', interactionType: 'START_WORKFLOW' as const,
  message: NEGOTIATION_SHIELD_START_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASE_START' as const, style: 'PRIMARY' as const,
};

export function negotiationShieldCasesFromView(cases: readonly NegotiationShieldCaseView[], propertyId: string, canStart = false): AskOperationResult {
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'negotiation-shield-boundary', title: 'Preparation help, not legal or insurance advice',
    body: 'Negotiation Shield helps you prepare for a quote, premium, claim or inspection conversation. It is not legal, insurance or pricing advice, and nothing is sent to the other party from here. Ask lists your reviews and shows each one\u2019s analysis and draft; starting a review is available to a contributor or owner; running the analysis and sending are not currently available in Ask.',
    severity: 'INFO', suggestions: [],
  };
  if (!cases.length) {
    return {
      status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_NO_CASES',
      blocks: [{
        type: 'SUMMARY', id: 'negotiation-shield-summary', title: 'No Negotiation Shield reviews yet',
        body: 'Negotiation Shield reviews a contractor quote, a premium increase, a claim settlement, contractor urgency pressure or a buyer inspection request before you respond. ' + (canStart
          ? 'None has been started for this home. Start one below; you will enter what you know and review it before it is saved.'
          : 'None has been started for this home. Ask cannot start one for a view-only member; a contributor or owner can.'),
        tone: 'DEFAULT', actions: canStart ? [startReviewAction] : [],
      }, boundary],
      suggestions: [],
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
    actions: canStart ? [startReviewAction] : [],
  }];
  if (cases.length > shown.length) {
    blocks.push({
      type: 'LIMITATION', id: 'negotiation-shield-limit', title: `Showing the ${shown.length} most recently updated reviews`,
      body: `There are ${cases.length} reviews in all. Ask lists the most recently updated; older ones are not shown.`, severity: 'INFO',
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
    href: null,
    entityType: NEGOTIATION_SHIELD_CASE_ENTITY,
    actions: [{ id: 'negotiation-shield-review', label: 'Review', message: NEGOTIATION_SHIELD_REVIEW_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES', interactionType: 'CONVERSATION_CONTINUE' as const, style: 'PRIMARY' as const }],
  });
  const active = shown.filter((item) => item.status !== 'ARCHIVED');
  const archived = shown.filter((item) => item.status === 'ARCHIVED');
  blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'negotiation-shield-cases', title: 'Negotiation reviews', description: 'Newest first. Choose Review to read a review\u2019s analysis and draft.',
    sections: [
      ...(active.length ? [{ id: 'negotiation-shield-open', title: 'Open', count: active.length, items: active.map(row) }] : []),
      ...(archived.length ? [{ id: 'negotiation-shield-archived', title: 'Archived', count: archived.length, items: archived.map(row) }] : []),
    ],
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_CASES_READY', blocks, suggestions: [] };
}

const NEGOTIATION_BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'negotiation-shield-boundary', title: 'Preparation help, not legal or insurance advice',
  body: 'Negotiation Shield helps you prepare for a quote, premium, claim or inspection conversation. It is not legal, insurance or pricing advice, and nothing is sent to the other party from here.',
  severity: 'INFO', suggestions: [],
};
const backToReviews = { id: 'negotiation-shield-back', label: 'Back to my reviews', interactionType: 'START_WORKFLOW' as const, message: NEGOTIATION_SHIELD_LIST_MESSAGE, operationId: 'NEGOTIATION_SHIELD_CASES' as const, style: 'SECONDARY' as const };

const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]).slice(0, 12) : []);
const text = (value: unknown, max = 600): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Splits a draft into pieces the grouped list's `detail` allows (1200 characters), at paragraph then sentence then word boundaries. */
export function chunkNegotiationDraft(body: string, max = 1100): string[] {
  const chunks: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  const pieces = body.replace(/\r\n/g, '\n').split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.length <= max) return [paragraph];
    const out: string[] = [];
    let rest = paragraph;
    while (rest.length > max) {
      const window = rest.slice(0, max);
      const cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('\n'), window.lastIndexOf(' '));
      const at = cut > max * 0.5 ? cut + 1 : max;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
    return out;
  });
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > max) flush();
    current = current ? `${current}\n\n${piece}` : piece;
  }
  flush();
  return chunks;
}

export function negotiationShieldReviewFromView(review: NegotiationShieldCaseReviewDTO | null): AskOperationResult {
  if (!review) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'NEGOTIATION_SHIELD_CASE_NOT_FOUND',
      blocks: [{
        type: 'SUMMARY', id: 'negotiation-shield-review-missing', title: 'That review is no longer available',
        body: 'Ask could not find that negotiation review for this home. It may have been removed. Nothing has changed.', tone: 'DEFAULT', actions: [backToReviews],
      }],
      suggestions: [],
    };
  }
  const { case: item, latestAnalysis: analysis, latestDraft: draft } = review;
  const scenario = NEGOTIATION_SCENARIO_LABELS[item.scenarioType] ?? readableCode(item.scenarioType);
  const pricing = (analysis?.pricingAssessment ?? null) as Record<string, unknown> | null;
  const confidenceLabel = pricing && typeof pricing.confidenceLabel === 'string' ? NEGOTIATION_LEVEL_LABELS[pricing.confidenceLabel] ?? null : null;
  const supportLine = [
    scenario,
    item.perspective === 'BUYER' ? 'Buyer mode' : null,
    analysis ? `Analyzed ${humanDate(new Date(analysis.generatedAt))}` : null,
    confidenceLabel ? `${confidenceLabel} confidence` : null,
  ].filter((value): value is string => Boolean(value)).join(' · ');
  const blocks: AskPresentationBlock[] = [];
  if (!analysis) {
    blocks.push({
      type: 'SUMMARY', id: 'negotiation-shield-review-summary', title: item.title,
      body: 'This review has not been analyzed yet, so there are no findings, leverage points or draft message to show. Running an analysis is not currently available in Ask.',
      tone: 'DEFAULT', supportLine: [scenario, `Updated ${humanDate(new Date(item.updatedAt))}`].join(' · '), actions: [backToReviews],
    });
    blocks.push(NEGOTIATION_BOUNDARY);
    return { status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_REVIEW_NOT_ANALYZED', blocks, suggestions: [] };
  }
  blocks.push({
    type: 'SUMMARY', id: 'negotiation-shield-review-summary', title: item.title,
    body: text(analysis.summary, 1500) || 'This review has been analyzed. The findings, leverage and recommended steps are below.',
    tone: 'DEFAULT', supportLine, actions: [backToReviews],
  });

  // The figures the assessment itself used, so the recommendation can be understood. Only normalized numbers, never the raw input text.
  const figure = (label: string, value: unknown, kind: 'money' | 'percent' = 'money') =>
    (typeof value === 'number' && Number.isFinite(value) ? [`${label} ${kind === 'percent' ? `${Math.round(value * 10) / 10}%` : money(value)}`] : []);
  const figures = [
    ...figure('Quote', pricing?.quoteAmount), ...figure('Prior premium', pricing?.priorPremium), ...figure('New premium', pricing?.newPremium),
    ...figure('Increase', pricing?.increaseAmount), ...figure('Increase', pricing?.increasePercentage, 'percent'),
    ...figure('Settlement', pricing?.settlementAmount), ...figure('Estimate', pricing?.estimateAmount),
    ...figure('Gap', pricing?.gapAmount), ...figure('Gap', pricing?.gapPercentage, 'percent'), ...figure('Requested concession', pricing?.requestedConcessionAmount),
  ].slice(0, 6);
  if (pricing && typeof pricing.status === 'string') {
    const rationale = asList<unknown>(pricing.rationale).map((entry) => text(entry, 300)).filter(Boolean);
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'negotiation-shield-pricing', title: 'Price check', description: text(pricing.summary, 400) || null,
      sections: [{
        id: 'negotiation-shield-pricing-assessment', title: 'Assessment', count: 1 + rationale.length,
        items: [
          { id: 'pricing-status', title: NEGOTIATION_PRICING_LABELS[pricing.status] ?? readableCode(pricing.status), description: null, meta: figures, status: confidenceLabel ? `${confidenceLabel} confidence` : null, href: null },
          ...rationale.slice(0, 5).map((entry, index) => ({ id: `pricing-reason-${index}`, title: entry, description: null, meta: [] as string[], status: null, href: null })),
        ],
      }],
      actions: [],
    });
  }
  const listBlock = (id: string, title: string, rawItems: Array<{ key?: unknown; title?: unknown; detail?: unknown; status?: unknown; strength?: unknown; priority?: unknown }>) => {
    const items = rawItems.filter((entry) => text(entry.title)).map((entry, index) => {
      const level = String(entry.status ?? entry.strength ?? entry.priority ?? '');
      return {
        id: `${id}-${typeof entry.key === 'string' && entry.key ? entry.key : index}`, title: text(entry.title, 200), description: text(entry.detail, 600) || null,
        meta: [] as string[], status: NEGOTIATION_LEVEL_LABELS[level] ?? null, href: null,
      };
    });
    if (!items.length) return;
    blocks.push({ type: 'GROUPED_LIST', filters: [], id, title, sections: [{ id: `${id}-items`, title, count: items.length, items }], actions: [] });
  };
  listBlock('negotiation-shield-findings', 'What the review found', asList(analysis.findings));
  listBlock('negotiation-shield-leverage', 'Where you have leverage', asList(analysis.negotiationLeverage));
  listBlock('negotiation-shield-next-steps', 'Recommended next steps', asList(analysis.recommendedActions));
  if (analysis.confidenceExplanation) {
    blocks.push({ type: 'LIMITATION', id: 'negotiation-shield-confidence', title: 'How confident this is', body: text(analysis.confidenceExplanation, 600), severity: 'INFO' });
  }
  if (draft && text(draft.body, 20000)) {
    const parts = chunkNegotiationDraft(text(draft.body, 20000));
    const kind = draft.draftType === 'EMAIL' ? 'email' : 'message';
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'negotiation-shield-draft', title: `Draft ${kind} \u2014 nothing has been sent`,
      description: 'Prepared for you to read and edit. Ask has not sent it to anyone and cannot send it.',
      sections: [{
        id: 'negotiation-shield-draft-parts', title: 'Draft', count: parts.length,
        items: parts.map((part, index) => ({
          id: `draft-${index}`, title: (draft.subject ? text(draft.subject, 160) : `Draft ${kind}`) + (parts.length > 1 ? ` (part ${index + 1} of ${parts.length})` : ''),
          description: null, meta: [draft.tone ? `Tone: ${readableCode(draft.tone)}` : null, `Prepared ${humanDate(new Date(draft.createdAt))}`].filter((value): value is string => Boolean(value)),
          status: 'Draft', href: null, detail: part,
        })),
      }],
      actions: [],
    });
  }
  blocks.push(NEGOTIATION_BOUNDARY);
  return { status: 'ANSWERED', reasonCode: 'NEGOTIATION_SHIELD_REVIEW_READY', blocks, suggestions: [] };
}

async function negotiationShieldCasesResult(propertyId: string, launch?: { entityType?: string | null; entityId?: string | null } | null, canStart = false): Promise<AskOperationResult> {
  // The operation registry enforces the viewer floor (the canonical read's own floor); the review is scoped to this property.
  if (launch?.entityType === NEGOTIATION_SHIELD_CASE_ENTITY && launch.entityId) {
    return negotiationShieldReviewFromView(await getNegotiationShieldCaseReviewForProperty(propertyId, launch.entityId));
  }
  return negotiationShieldCasesFromView(await listNegotiationShieldCasesForProperty(propertyId), propertyId, canStart);
}

registerCapabilityHandler('negotiation-shield.cases', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return negotiationShieldCasesResult(envelope.propertyId!, envelope.launchContext, access.role !== HouseholdRole.VIEWER);
});
