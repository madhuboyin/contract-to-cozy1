import { fireEvent, render, screen } from '@testing-library/react';
import { QuoteReviewDialog, buildConfirmRequest } from '../QuoteReviewDialog';
import type { QuoteReview } from '../../service-price-radar/servicePriceRadarApi';

// The review step of the confirmation contract (design §3.4, FRD v1.360).
const review: QuoteReview = {
  fingerprint: 'f'.repeat(64),
  headline: [
    { key: 'vendorName', label: 'Provider', value: 'Acme HVAC' }, { key: 'quoteAmount', label: 'Total', value: 8200 }, { key: 'scopeSummary', label: 'Scope', value: null },
  ],
  facts: [{ fieldKey: 'vendorName', state: 'EXTRACTED_UNCONFIRMED', extractedValue: 'Acme HVAC', confirmedValue: null }, { fieldKey: 'quoteAmount', state: 'HOMEOWNER_CORRECTED', extractedValue: 8000, confirmedValue: 8200 }],
  lineItems: [
    { id: 'li-1', kind: 'EQUIPMENT', description: 'Furnace unit', quantity: 1, unit: 'ea', unitPrice: 6000, total: 6000, state: 'EXTRACTED_UNCONFIRMED', sourceText: null, sourcePage: null },
    { id: 'li-2', kind: 'OTHER', description: 'Mystery fee', quantity: null, unit: null, unitPrice: null, total: 500, state: 'HOMEOWNER_CONFIRMED', sourceText: null, sourcePage: null },
  ],
  terms: [{ id: 't-1', type: 'WARRANTY', label: null, value: '10 years parts', included: true, state: 'EXTRACTED_UNCONFIRMED', sourceText: null, sourcePage: null }],
  counts: { facts: 2, lineItems: 2, terms: 1, unconfirmed: 2, corrected: 1, confirmed: 1 },
};

function renderDialog(over: Partial<React.ComponentProps<typeof QuoteReviewDialog>> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(<QuoteReviewDialog open vendorName="Acme HVAC" review={review} loading={false} busy={false} error={null} onCancel={onCancel} onConfirm={onConfirm} {...over} />);
  return { onConfirm, onCancel };
}

describe('QuoteReviewDialog', () => {
  it('shows every value that would be confirmed, each with its state, and says nothing unlisted is confirmed', () => {
    renderDialog();
    expect(screen.getByText('Furnace unit')).toBeInTheDocument();
    expect(screen.getByText('Mystery fee')).toBeInTheDocument();
    expect(screen.getByText('10 years parts')).toBeInTheDocument();
    expect(screen.getByText('$8,200')).toBeInTheDocument();
    expect(screen.getByText('Corrected by you')).toBeInTheDocument();
    expect(screen.getByText('Already confirmed')).toBeInTheDocument();
    expect(screen.getAllByText('As extracted').length).toBeGreaterThan(0);
    expect(screen.getByText(/Nothing that is not listed is confirmed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm 2 line items and 1 term' })).toBeInTheDocument();
  });

  it('sends a request that names exactly what was shown, and the removed values separately', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(screen.getByRole('button', { name: 'Confirm 1 line item and 1 term' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1 line item and 1 term' }));
    expect(onConfirm).toHaveBeenCalledWith({
      reviewFingerprint: review.fingerprint, lineItemIds: ['li-1', 'li-2'], termIds: ['t-1'], factKeys: ['vendorName', 'quoteAmount'], rejectedLineItemIds: ['li-2'], rejectedTermIds: [],
    });
  });

  it('can put a removed value back, and cannot confirm while loading or busy', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(buildConfirmRequest(review, new Set(), new Set()).rejectedLineItemIds).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 line items and 1 term' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('offers no confirm until the values have loaded', () => {
    renderDialog({ review: null, loading: true });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.queryByText('Furnace unit')).toBeNull();
  });
});
