import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import { comparisonPriceShares } from '@/features/ask/adaptivePresentation';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-016 (FRD v1.76): the quote review as a comparison strip, with price
// bars from declared amounts, the server's "Lowest price" badge, and a Table view marking only declared leading values.

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;
const LOWEST = { label: 'Lowest price', policyCode: 'QUOTE_LOWEST_PRICE_SCOPE_ALIGNED', basis: 'The lowest recorded total among the comparison-ready proposals, which cover the same confirmed scope.' };
const option = (id: string, label: string, value: number, extra: Partial<ComparisonBlock['options'][number]> = {}): ComparisonBlock['options'][number] => ({
  id, label, summary: null, amount: { value, currency: 'USD' },
  attributes: [
    { label: 'Price', value: `USD ${value.toLocaleString('en-US')}`, tone: 'DEFAULT' },
    { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' },
    { label: 'Freshness', value: 'Quoted Sep 14, 2026', tone: 'DEFAULT' },
  ],
  actions: [], ...extra,
});
const quoteBlock: ComparisonBlock = {
  type: 'COMPARISON', id: 'quote-review-table', title: 'Recorded proposals', description: 'Ask preserves the canonical readiness state and does not select a provider.',
  options: [
    option('a', 'Acme Roofing', 12400),
    option('b', 'Summit Roofing', 9800, { badges: [LOWEST], attributes: [{ label: 'Price', value: 'USD 9,800', tone: 'DEFAULT', leading: true }, { label: 'Readiness', value: 'Comparison ready', tone: 'POSITIVE' }, { label: 'Freshness', value: 'Expired Sep 23, 2026', tone: 'CAUTION' }] }),
    option('c', 'Budget Roofs', 6200),
  ],
  actions: [],
};

function Harness({ block = quoteBlock }: { block?: ComparisonBlock }) {
  const response = useMemo(() => ({
    sessionId: 'quote-session', executionId: 'quote-execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'quote-result', revision: 1, domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
    blocks: [block], updatedAt: '2026-09-24T12:00:00.000Z',
  } as AskExecutionResponse), [block]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <ComparisonStripBlock block={block} renderAction={(action) => <button type="button">{action.label}</button>} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('price bars are each option\'s share of the highest declared amount, and are left out when an amount or currency differs', () => {
  expect(comparisonPriceShares(quoteBlock)?.map((share) => Number(share.toFixed(3)))).toEqual([1, 0.79, 0.5]);
  expect(comparisonPriceShares({ ...quoteBlock, options: [quoteBlock.options[0], { ...quoteBlock.options[1], amount: null }] })).toBeNull();
  expect(comparisonPriceShares({ ...quoteBlock, options: [quoteBlock.options[0], { ...quoteBlock.options[1], amount: { value: 9800, currency: 'CAD' } }] })).toBeNull();
  expect(comparisonPriceShares({ ...quoteBlock, options: [option('x', 'X', 0), option('y', 'Y', 0)] })).toBeNull();
});

test('cards show a price bar, the declared badge and a Leads marker only on the declared leading value', async () => {
  render(<Harness />);
  const cards = await screen.findAllByRole('listitem');
  expect(cards).toHaveLength(3);
  expect(within(cards[0]).getByRole('img', { name: 'Highest price of these options' })).toBeInTheDocument();
  expect(within(cards[1]).getByRole('img', { name: '79% of the highest price of these options' })).toBeInTheDocument();
  expect(within(cards[1]).getByText('Lowest price')).toHaveAttribute('data-badge-policy', 'QUOTE_LOWEST_PRICE_SCOPE_ALIGNED');
  expect(within(cards[1]).getByText('Leads')).toBeInTheDocument();
  // Budget Roofs is cheapest on paper but carries no declared badge or lead, so none is shown.
  expect(within(cards[2]).queryByText('Lowest price')).toBeNull();
  expect(within(cards[2]).queryByText('Leads')).toBeNull();
  expect(within(cards[0]).queryByText('Leads')).toBeNull();
});

test('the Table view shows the same options as rows, marks only declared leading cells, and the choice is kept', async () => {
  const first = render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: 'Table' }));
  expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true');
  const table = screen.getByRole('table', { name: 'Recorded proposals' });
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Acme Roofing', 'Summit Roofing', 'Budget Roofs']);
  expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Labels', 'Price', 'Readiness', 'Freshness']);
  const leading = first.container.querySelectorAll('[data-leading="true"]');
  expect(leading).toHaveLength(1);
  expect(leading[0].textContent).toBe('USD 9,800Leads');
  expect(within(table).getByText('Expired Sep 23, 2026')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Recorded proposals options' })).toBeNull();
  expect(readResultView(window.sessionStorage, resultViewKey('quote-session', 'home', 'quote-result')).comparisonLayouts['quote-review-table']).toBe('TABLE');
  first.unmount();
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('table', { name: 'Recorded proposals' })).toBeInTheDocument());
});

test('two quotes offer Cards and Table only; an attribute one option lacks reads "Not listed" in the table', async () => {
  const pair: ComparisonBlock = { ...quoteBlock, options: [quoteBlock.options[0], { ...quoteBlock.options[2], attributes: quoteBlock.options[2].attributes.slice(0, 2) }] };
  render(<Harness block={pair} />);
  const group = await screen.findByRole('group', { name: 'View Recorded proposals' });
  expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Cards', 'Table']);
  expect(within(group).getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(within(group).getByRole('button', { name: 'Table' }));
  const freshness = screen.getByRole('rowheader', { name: 'Freshness' }).closest('tr')!;
  expect(within(freshness).getByText('Not listed')).toBeInTheDocument();
  expect(screen.queryByRole('rowheader', { name: 'Labels' })).toBeNull();
});
