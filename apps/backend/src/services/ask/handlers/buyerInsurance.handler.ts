// The buyer's closing insurance (register P2 "Buyer Closing"; FRD v1.348). A read of BuyerInsuranceService.get: requirements, quotes, the chosen quote,
// the bound policy and the proof status. The changes are BUYER_INSURANCE_COMMAND (buyerInsuranceCommands.handler.ts).
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerInsuranceService } from '../../buyerInsurance.service';
import {
  INSURANCE_ACTION_IDS, INSURANCE_ENTITY_TYPES, INSURANCE_MESSAGES, PROOF_LABELS, QUOTE_STATUS_LABELS, REQUIREMENT_STATUS_LABELS, bindBlocker, quoteSelectable, requirementUpdatable,
  type InsuranceKind,
} from '../support/buyerInsuranceCommand';

const dollars = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);

export interface InsuranceView {
  workspace: null | {
    selectedQuoteId: string | null; boundPolicyId: string | null; lenderProofStatus: string; closingProofStatus: string; requiredEffectiveAt: string | null;
    quotes: Array<{ id: string; carrierName: string; status: string; annualPremiumCents: number | null; deductibleCents: number | null; validUntil: string | null }>;
    requirements: Array<{ id: string; title: string; status: string; blocking: boolean; dueAt: string | null }>;
  };
  policy: null | { carrierName: string; policyNumber: string; startDate: string | null; expiryDate: string | null };
}

export function buyerInsuranceFromView(view: InsuranceView, canChange: boolean, now: Date): AskOperationResult {
  const summaryAction = (kind: InsuranceKind, label: string) => ({
    id: INSURANCE_ACTION_IDS[kind], label, message: INSURANCE_MESSAGES[kind], interactionType: 'START_WORKFLOW' as const, operationId: 'BUYER_INSURANCE_COMMAND' as const, style: 'SECONDARY' as const,
  });
  const rowAction = (kind: InsuranceKind, label: string) => ({
    id: INSURANCE_ACTION_IDS[kind], label, message: INSURANCE_MESSAGES[kind], interactionType: 'MUTATE_RECORD' as const, operationId: 'BUYER_INSURANCE_COMMAND' as const, style: 'SECONDARY' as const,
  });
  const w = view.workspace;
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'buyer-insurance-boundary', title: 'Coverage is bought from your insurer',
    body: 'ContractToCozy records what you did with your insurer. It does not buy, bind or cancel coverage, and your lender and agent decide whether the proof is enough.', severity: 'INFO', suggestions: [],
  };
  const top = canChange ? [summaryAction('REQUIREMENT_ADD', 'Add a requirement'), summaryAction('QUOTE_ADD', 'Record a quote'), summaryAction('PROOF', 'Update proof')] : [];
  if (!w) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'BUYER_INSURANCE_NOT_RECORDED',
      blocks: [{ type: 'SUMMARY', id: 'buyer-insurance-unrecorded', title: 'No closing insurance has been recorded yet', body: 'Record a quote you received or a requirement your lender gave you to start tracking it.', tone: 'CAUTION', actions: top }, boundary],
      suggestions: [],
    };
  }
  const chosen = w.quotes.find((q) => q.id === w.selectedQuoteId && q.status === 'SELECTED') ?? null;
  const openBlocking = w.requirements.filter((r) => r.blocking && requirementUpdatable(r.status));
  const blockedBind = bindBlocker({ selectedQuoteId: w.selectedQuoteId, boundPolicyId: w.boundPolicyId }, chosen, now);
  const bindOffered = canChange && !w.boundPolicyId && chosen !== null && blockedBind === null;
  const body = [
    view.policy ? `Bound: ${view.policy.carrierName}, policy ${view.policy.policyNumber}${view.policy.startDate ? `, from ${humanDate(new Date(view.policy.startDate))}` : ''}.`
      : chosen ? `Chosen quote: ${chosen.carrierName}${dollars(chosen.annualPremiumCents) ? `, ${dollars(chosen.annualPremiumCents)} a year` : ''}. Not recorded as bound yet.` : 'No quote has been chosen yet.',
    `Proof for your lender: ${PROOF_LABELS[w.lenderProofStatus] ?? w.lenderProofStatus}. For closing: ${PROOF_LABELS[w.closingProofStatus] ?? w.closingProofStatus}.`,
    w.requiredEffectiveAt ? `Needed in effect by ${humanDate(new Date(w.requiredEffectiveAt))}.` : null,
  ].filter(Boolean).join(' ');
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'buyer-insurance-summary',
    title: openBlocking.length ? `${openBlocking.length} insurance requirement${openBlocking.length === 1 ? '' : 's'} still hold up closing` : view.policy ? 'Your insurance is recorded as bound' : 'Closing insurance in progress',
    body, tone: openBlocking.length ? 'CAUTION' : 'DEFAULT',
    actions: [...top, ...(bindOffered ? [summaryAction('BIND', 'Record that it was bound')] : [])],
  }];
  if (w.quotes.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-insurance-quotes', title: 'Quotes you recorded', description: null,
      sections: [{ id: 'quotes', title: 'Quotes', count: w.quotes.length, items: w.quotes.slice(0, 10).map((q) => ({
        id: q.id, title: q.carrierName, description: null,
        meta: [dollars(q.annualPremiumCents) ? `${dollars(q.annualPremiumCents)} a year` : null, dollars(q.deductibleCents) ? `${dollars(q.deductibleCents)} deductible` : null, q.validUntil ? `Valid until ${humanDate(new Date(q.validUntil))}` : null].filter((v): v is string => Boolean(v)),
        status: QUOTE_STATUS_LABELS[q.status] ?? q.status, href: null, entityType: INSURANCE_ENTITY_TYPES.QUOTE,
        actions: canChange && quoteSelectable(q.status) && !w.boundPolicyId ? [rowAction('QUOTE_SELECT', 'Choose this quote')] : [],
      })) }], actions: [],
    });
  }
  if (w.requirements.length) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'buyer-insurance-requirements', title: 'Requirements', description: null,
      sections: [{ id: 'requirements', title: 'Requirements', count: w.requirements.length, items: w.requirements.slice(0, 10).map((r) => ({
        id: r.id, title: r.title, description: null, meta: [r.blocking ? 'Holds up closing' : null, r.dueAt ? `Due ${humanDate(new Date(r.dueAt))}` : null].filter((v): v is string => Boolean(v)),
        status: REQUIREMENT_STATUS_LABELS[r.status] ?? r.status, href: null, entityType: INSURANCE_ENTITY_TYPES.REQUIREMENT,
        actions: canChange && requirementUpdatable(r.status) ? [rowAction('REQUIREMENT_UPDATE', 'Update where it stands')] : [],
      })) }], actions: [],
    });
  }
  blocks.push(boundary);
  return { status: openBlocking.length ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: openBlocking.length ? 'BUYER_INSURANCE_HAS_BLOCKERS' : undefined, blocks, suggestions: [] };
}

registerCapabilityHandler('buyer.insurance-readiness', async (envelope, deps) => {
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const data = await BuyerInsuranceService.get(envelope.userId, envelope.propertyId!);
  return buyerInsuranceFromView({ workspace: data.workspace as never, policy: data.policy as never }, access.role !== HouseholdRole.VIEWER, new Date());
});
