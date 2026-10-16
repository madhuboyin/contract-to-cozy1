// The buyer's purchase Loan Estimates (register P2 "Buyer Closing"; FRD v1.352). A read of BuyerPurchaseLoanEstimateService.list: each lender offer's
// current draft and confirmed revision with the selected offer marked. The changes are BUYER_LOAN_ESTIMATE_COMMAND (buyerLoanEstimateCommands.handler.ts).
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import { BuyerPurchaseLoanEstimateService } from '../../buyerPurchaseLoanEstimate.service';
import { LE_ACTION_IDS, LE_ENTITY_TYPE, LE_MESSAGES, REVISION_STATUS_LABELS, type LeKind } from '../support/buyerLoanEstimateCommand';
import { SETUP_ACTION_IDS, SETUP_MESSAGES } from '../support/buyerPlanSetupCommand';
import { collectionDescriptor } from '../support/collectionDescriptor';

const dollars = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const rate = (bps: number | null | undefined) => (bps == null ? null : `${(bps / 100).toFixed(2)}%`);

export interface LoanEstimateView {
  purchasePath: string;
  selection: null | { offerId: string; revisionId: string; intentToProceedAt: string | null };
  offers: Array<{
    id: string; lenderName: string;
    revisions: Array<{
      id: string; status: string; revisionNumber: number; aprBps: number | null; noteRateBps: number | null; estimatedTotalMonthlyPaymentCents: number | null;
      monthlyPrincipalAndInterestCents: number | null; cashToCloseCents: number | null; issuedDate: string | null;
    }>;
  }>;
}

export function buyerLoanEstimatesFromView(view: LoanEstimateView, canChange: boolean): AskOperationResult {
  const summaryAction = (kind: LeKind, label: string) => ({
    id: LE_ACTION_IDS[kind], label, message: LE_MESSAGES[kind], interactionType: 'START_WORKFLOW' as const, operationId: 'BUYER_LOAN_ESTIMATE_COMMAND' as const, style: 'SECONDARY' as const,
  });
  const rowAction = (kind: LeKind, label: string) => ({
    id: LE_ACTION_IDS[kind], label, message: LE_MESSAGES[kind], interactionType: 'MUTATE_RECORD' as const, operationId: 'BUYER_LOAN_ESTIMATE_COMMAND' as const, style: 'SECONDARY' as const,
  });
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'buyer-le-boundary', title: 'This records offers; it does not apply',
    body: 'ContractToCozy records the figures you enter from each Loan Estimate. It does not apply for a loan, lock a rate or contact a lender, and choosing an offer here is your own planning record.',
    severity: 'INFO', suggestions: [],
  };
  const financed = view.purchasePath === 'FINANCED';
  const pathAction = {
    id: SETUP_ACTION_IDS.PATH_SET, label: financed ? 'Change how I am paying' : 'Set how I am paying', message: SETUP_MESSAGES.PATH_SET, interactionType: 'START_WORKFLOW' as const,
    operationId: 'BUYER_PLAN_SETUP_COMMAND' as const, style: 'SECONDARY' as const,
  };
  const top = canChange ? [...(financed ? [summaryAction('OFFER_ADD', 'Add a lender offer')] : []), pathAction] : [];
  if (!view.offers.length) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: financed ? 'BUYER_LOAN_ESTIMATES_NONE' : 'BUYER_LOAN_ESTIMATES_NOT_FINANCED',
      blocks: [{
        type: 'SUMMARY', id: 'buyer-le-none', title: 'No Loan Estimate has been recorded yet',
        body: financed ? 'Add each lender offer you receive so you can compare them and choose one.' : 'Loan Estimates are recorded once your purchase is set up as financed.',
        tone: 'CAUTION', actions: top,
      }, boundary],
      suggestions: [],
    };
  }
  const confirmed = view.offers.flatMap((o) => o.revisions.filter((r) => r.status === 'CONFIRMED').map((r) => ({ offer: o, revision: r })));
  const selectedOffer = view.offers.find((o) => o.id === view.selection?.offerId) ?? null;
  const lowestApr = confirmed.filter((c) => c.revision.aprBps != null).sort((a, b) => a.revision.aprBps! - b.revision.aprBps!)[0] ?? null;
  const body = [
    selectedOffer ? `Selected: ${selectedOffer.lenderName}${view.selection?.intentToProceedAt ? `, with intent to proceed noted ${humanDate(new Date(view.selection.intentToProceedAt))}` : ', for planning only'}.` : 'No offer is selected yet.',
    `${confirmed.length} confirmed ${confirmed.length === 1 ? 'offer' : 'offers'} of ${view.offers.length}.`,
    confirmed.length >= 2 && lowestApr ? `Lowest APR among confirmed: ${lowestApr.offer.lenderName} at ${rate(lowestApr.revision.aprBps)}. A lower APR is not always the better offer; compare costs and cash to close.` : null,
  ].filter(Boolean).join(' ');
  const items = view.offers.flatMap((offer) => {
    const hasDraft = offer.revisions.some((r) => r.status === 'DRAFT');
    return offer.revisions.filter((r) => r.status !== 'SUPERSEDED').map((r) => ({
      id: r.id, title: `${offer.lenderName} — revision ${r.revisionNumber}`, description: null,
      meta: [rate(r.noteRateBps) ? `Rate ${rate(r.noteRateBps)}` : null, rate(r.aprBps) ? `APR ${rate(r.aprBps)}` : null,
        dollars(r.estimatedTotalMonthlyPaymentCents ?? r.monthlyPrincipalAndInterestCents) ? `${dollars(r.estimatedTotalMonthlyPaymentCents ?? r.monthlyPrincipalAndInterestCents)} a month` : null,
        dollars(r.cashToCloseCents) ? `${dollars(r.cashToCloseCents)} to close` : null, r.issuedDate ? `Issued ${humanDate(new Date(`${r.issuedDate}T12:00:00.000Z`))}` : null,
        view.selection?.revisionId === r.id ? 'Selected' : null].filter((v): v is string => Boolean(v)),
      status: REVISION_STATUS_LABELS[r.status] ?? r.status, href: null, entityType: LE_ENTITY_TYPE,
      actions: !canChange || !financed ? [] : r.status === 'DRAFT'
        ? [rowAction('DRAFT_EDIT', 'Edit the draft'), rowAction('CONFIRM', 'Confirm the figures')]
        : [...(view.selection?.revisionId === r.id ? [] : [rowAction('SELECT', 'Select this offer')]), ...(hasDraft ? [] : [rowAction('REVISION_START', 'Start a new revision')])],
    }));
  });
  return {
    status: 'ANSWERED',
    blocks: [{
      type: 'SUMMARY', id: 'buyer-le-summary', title: selectedOffer ? `${selectedOffer.lenderName} is your selected offer` : 'Your lender offers', body, tone: 'DEFAULT', actions: top,
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'buyer-le-offers', title: 'Offers and revisions', description: 'A draft is not part of your comparison until you confirm its figures.',
      sections: [{ id: 'offers', title: 'Loan Estimates', count: items.length, items: items.slice(0, 15) }],
      collection: collectionDescriptor({ sourceTotal: items.length, fetchedCount: items.length, sections: [{ items: items.slice(0, 15) }], nextPageAvailable: false }),
      actions: [],
    }, boundary],
    suggestions: [],
  };
}

registerCapabilityHandler('buyer.loan-estimates', async (envelope, deps) => {
  const access = await (deps?.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  const data = await BuyerPurchaseLoanEstimateService.list(envelope.userId, envelope.propertyId!);
  return buyerLoanEstimatesFromView(data as unknown as LoanEstimateView, access.role !== HouseholdRole.VIEWER);
});
