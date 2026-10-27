import { fireEvent, render, screen } from '@testing-library/react';
import { TableBlock } from '../blocks/TableBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

const block: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
  type: 'TABLE', id: 'refinance-rate-history', title: '31 weeks of governed mortgage-rate history',
  columns: [{ key: 'date', label: 'Date' }, { key: 'thirty', label: '30-year fixed' }],
  rows: [{ id: 'one', values: { date: '2026-10-22', thirty: '7.320%' } }], actions: [],
};

test('keeps exact weekly refinance rates available without letting the table dominate the answer', () => {
  const { container } = render(<TableBlock block={block} executionId="execution" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);
  const details = container.querySelector('details');
  expect(details).not.toHaveAttribute('open');
  expect(screen.getByText(/View exact weekly rate data/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/View exact weekly rate data/));
  expect(details).toHaveAttribute('open');
  expect(screen.getByText('7.320%')).toBeInTheDocument();
});
