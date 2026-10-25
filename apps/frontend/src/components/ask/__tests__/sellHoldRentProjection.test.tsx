import { render, screen, within } from '@testing-library/react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

const block: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
  type: 'TABLE', id: 'sell-hold-rent-projection', title: 'How hold and rent change over time',
  description: 'Annual modeled changes.',
  columns: [{ key: 'year', label: 'Year' }, { key: 'homeValue', label: 'Home value' }, { key: 'hold', label: 'Hold change' }, { key: 'rent', label: 'Rent change' }],
  rows: [
    { id: '2027', values: { year: '2027', homeValue: '$725,000', hold: '$12,000', rent: '$18,000' } },
    { id: '2028', values: { year: '2028', homeValue: '$750,000', hold: '$16,000', rent: '$25,000' } },
    { id: '2029', values: { year: '2029', homeValue: '$776,000', hold: '$21,000', rent: '$33,000' } },
  ],
  actions: [],
};

test('renders the full annual Sell Hold Rent projection as an accessible compact chart with a data-table disclosure', () => {
  render(<AdaptiveTableBlock block={block} renderAction={() => null} />);
  expect(screen.getByRole('img', { name: /Annual modeled changes/ })).toHaveAccessibleName(/Hold moves from \$12K to \$21K; rent moves from \$18K to \$33K/);
  expect(screen.getByText('View annual values')).toBeVisible();
  expect(screen.getAllByText('2029')).toHaveLength(2);
});

test('renders the Sell Hold Rent comparison strip with path economics breakdown and leading badge', () => {
  const comparisonBlock: Extract<AskPresentationBlock, { type: 'COMPARISON' }> = {
    type: 'COMPARISON',
    id: 'sell-hold-rent-comparison',
    title: '5-year path comparison',
    description: 'Modeled side-by-side economics.',
    options: [
      {
        id: 'sell',
        label: 'Sell now',
        summary: 'Estimated net proceeds after selling costs and debt payoff.',
        attributes: [
          { label: 'Modeled outcome', value: '$420,000', tone: 'POSITIVE' },
          { label: 'Current value', value: '$700,000', tone: 'DEFAULT' },
          { label: 'Selling costs', value: '$42,000', tone: 'DEFAULT' },
          { label: 'Debt payoff', value: '$238,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
      {
        id: 'hold',
        label: 'Hold',
        summary: 'Projected net wealth impact over 5 years.',
        badges: [
          {
            policyCode: 'SELL_HOLD_RENT_MODELED_OUTCOME',
            label: 'Leads modeled outcome',
            basis: 'Leads on the canonical model outcome ($465,000 over 5 years).',
          },
        ],
        attributes: [
          { label: 'Modeled outcome', value: '$465,000', tone: 'POSITIVE', leading: true },
          { label: 'Appreciation gain', value: '$112,000', tone: 'DEFAULT' },
          { label: 'Carry costs', value: '$67,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
      {
        id: 'rent',
        label: 'Rent out',
        summary: 'Projected rental cashflow and appreciation.',
        attributes: [
          { label: 'Modeled outcome', value: '$440,000', tone: 'POSITIVE' },
          { label: 'Gross rent', value: '$180,000', tone: 'DEFAULT' },
          { label: 'Operating costs', value: '$52,000', tone: 'DEFAULT' },
        ],
        actions: [],
      },
    ],
    actions: [],
  };

  render(<ComparisonStripBlock block={comparisonBlock} renderAction={() => null} />);
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(within(items[1]).getByText('Leads modeled outcome')).toHaveAttribute('data-badge-policy', 'SELL_HOLD_RENT_MODELED_OUTCOME');
  expect(within(items[1]).getByText('$465,000')).toBeVisible();
});

test('renders Sell Hold Rent assumptions with baseline and override tiles alongside table data', () => {
  const assumptionsBlock: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
    type: 'TABLE',
    id: 'sell-hold-rent-assumptions',
    title: 'Assumptions used',
    description: 'Inputs for this scenario.',
    columns: [
      { key: 'input', label: 'Input' },
      { key: 'value', label: 'Value' },
      { key: 'source', label: 'Source' },
    ],
    rows: [
      { id: 'home-value', values: { input: 'Home value', value: '$700,000', source: 'Property profile' } },
      { id: 'monthly-rent', values: { input: 'Monthly rent', value: '$3,400', source: 'What-if override' } },
    ],
    actions: [],
  };

  const { container } = render(<AdaptiveTableBlock block={assumptionsBlock} renderAction={() => null} />);
  expect(container.querySelector('[data-sell-hold-rent-assumptions]')).toBeInTheDocument();
  expect(screen.getAllByText('$3,400').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText('Override')).toBeInTheDocument();
  expect(screen.getByText('Baseline')).toBeInTheDocument();
});
