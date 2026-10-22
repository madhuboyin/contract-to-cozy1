import { render, screen } from '@testing-library/react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
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
