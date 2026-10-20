import { render, screen } from '@testing-library/react';
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;
const option = (id: string, label: string, leadingPrice: boolean): ComparisonBlock['options'][number] => ({
  id, label, summary: null, amount: null, actions: [],
  attributes: [{ label: 'Price', value: id === 'a' ? '$9,800' : '$12,400', tone: 'DEFAULT', leading: leadingPrice }],
});
const block = (options: ComparisonBlock['options']): ComparisonBlock => ({ type: 'COMPARISON', id: 'c', title: 'Recorded proposals', description: null, options, actions: [] });
const view = (value: ComparisonBlock) => render(<ComparisonStripBlock block={value} renderAction={(action) => <button type="button">{action.label}</button>} />);

test('a one-line verdict names only what the server declared leading', () => {
  view(block([option('a', 'Summit Roofing', true), option('b', 'Acme Roofing', false)]));
  const verdict = screen.getByRole('group', { name: 'Where each option leads' });
  expect(verdict).toHaveTextContent('Price: Summit Roofing');
  expect(verdict).not.toHaveTextContent('Acme Roofing');
});

test('no verdict is invented when nothing is declared leading', () => {
  view(block([option('a', 'Summit Roofing', false), option('b', 'Acme Roofing', false)]));
  expect(screen.queryByRole('group', { name: 'Where each option leads' })).toBeNull();
});
