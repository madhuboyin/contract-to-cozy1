import { render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { BlockSequence } from '../blocks/registry';
import { ProgressBlock } from '../patterns/ProgressBlock';

const noop = () => undefined;

test('presents reserve-fund upcoming needs as a responsive card grid', () => {
  const block: Extract<AskPresentationBlock, { type: 'PROGRESS' }> = {
    type: 'PROGRESS', id: 'reserve-fund-overview', title: 'Funding progress', description: 'Moderate plan', percent: 0, basis: '$0 of $13,206 funded', actions: [],
    metrics: [{ label: 'Monthly plan', value: '$709/mo', tone: 'CAUTION' }],
    nextSteps: [{ id: 'dishwasher', title: 'Dishwasher', description: 'Oct 2026–Dec 2027', amountLabel: '$820–$1,229', meta: [], status: 'UPCOMING', actions: [] }],
  };
  const { container } = render(<ProgressBlock block={block} executionId="execution" onItemAction={noop} itemActionsDisabled={false} onFilterClick={noop} onCollectionPage={noop} onAccessLost={noop} />);
  expect(screen.getByText('Upcoming needs')).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAccessibleName('0% funded. $0 of $13,206 funded');
  expect(container.querySelector('[data-ask-progress-step="dishwasher"]')?.parentElement).toHaveClass('md:grid-cols-3');
});

test('presents reserve-fund plan actions and planning styles as compact grids', () => {
  const item = (id: string, title: string, status: string, description: string) => ({ id, title, status, description, meta: [], entityType: 'RESERVE_FUND', actions: [] });
  const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
    type: 'GROUPED_LIST', id: 'reserve-planning-controls', title: 'Adjust the plan', description: 'Choose how cautious the plan should be.', filters: [], actions: [],
    sections: [
      { id: 'fund-actions', title: 'Balance and calculation', count: 2, items: [item('balance', 'Log a balance change', 'AVAILABLE', 'Record a change.'), item('calculate', 'Recalculate', 'AVAILABLE', 'Refresh the plan.')] },
      { id: 'postures', title: 'Choose a planning style', count: 3, items: [item('CONSERVATIVE', 'Conservative', 'AVAILABLE', 'High estimate.'), item('MODERATE', 'Moderate', 'CURRENT', 'Midpoint.'), item('AGGRESSIVE', 'Aggressive', 'AVAILABLE', 'Low estimate.')] },
    ],
  };
  const { container } = render(<GenericGroupedListBlock block={block} executionId="execution" onItemAction={noop} itemActionsDisabled={false} onFilterClick={noop} onCollectionPage={noop} onAccessLost={noop} />);
  expect(container.querySelector('[data-reserve-planning-controls]')).toBeInTheDocument();
  expect(screen.getByText('Current')).toBeInTheDocument();
  expect(screen.queryByText('AVAILABLE')).not.toBeInTheDocument();
});

test('collapses reserve-fund secondary material into Plan details', () => {
  const blocks = [
    { type: 'PROGRESS', id: 'reserve-fund-overview' },
    { type: 'GROUPED_LIST', id: 'reserve-allocations' },
    { type: 'EVIDENCE', id: 'capital-plan-evidence' },
  ] as AskPresentationBlock[];
  const { container } = render(<BlockSequence blocks={blocks} renderBlock={(block) => <div key={block.id}>{block.id}</div>} />);
  const disclosure = container.querySelector('details[data-reserve-plan-details]');
  expect(disclosure).not.toHaveAttribute('open');
  expect(screen.getByText('Plan details')).toBeInTheDocument();
  expect(disclosure).toHaveTextContent('reserve-allocations');
  expect(disclosure).toHaveTextContent('capital-plan-evidence');
});

test('does not repeat the semantic inventory narrative above its detailed inventory list', () => {
  const blocks = [
    { type: 'SUMMARY', id: 'phase2a-inventory-summary' },
    { type: 'GROUPED_LIST', id: 'inventory-results' },
    { type: 'EVIDENCE', id: 'phase2a-inventory-summary-evidence' },
  ] as AskPresentationBlock[];
  render(<BlockSequence blocks={blocks} renderBlock={(block) => <div key={block.id}>{block.id}</div>} />);
  expect(screen.queryByText('phase2a-inventory-summary')).not.toBeInTheDocument();
  expect(screen.getByText('inventory-results')).toBeInTheDocument();
  expect(screen.getByText('phase2a-inventory-summary-evidence')).toBeInTheDocument();
});

test('keeps a compact semantic limitation but omits the duplicate maintenance summary', () => {
  const blocks = [
    { type: 'SUMMARY', id: 'phase2a-maintenance-summary' },
    { type: 'LIMITATION', id: 'semantic-amount-filter-not-applied' },
    { type: 'GROUPED_LIST', id: 'maintenance-groups' },
  ] as AskPresentationBlock[];
  render(<BlockSequence blocks={blocks} renderBlock={(block) => <div key={block.id}>{block.id}</div>} />);
  expect(screen.queryByText('phase2a-maintenance-summary')).not.toBeInTheDocument();
  expect(screen.getByText('semantic-amount-filter-not-applied')).toBeInTheDocument();
  expect(screen.getByText('maintenance-groups')).toBeInTheDocument();
});
