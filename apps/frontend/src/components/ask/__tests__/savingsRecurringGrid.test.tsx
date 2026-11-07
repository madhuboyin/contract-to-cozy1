import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { MetricRowBlock, SummaryBlock } from '../blocks/CoreBlocks';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Summary = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;
type MetricRow = Extract<AskPresentationBlock, { type: 'METRIC_ROW' }>;

const action = {
  id: 'set-up', label: 'Set up plan', message: 'Set up this plan', operationId: 'SAVINGS_BENEFIT_COMMAND',
  interactionType: 'MUTATE_RECORD' as const, style: 'PRIMARY' as const,
};

const block: GroupedList = {
  type: 'GROUPED_LIST', id: 'savings-recurring-setup', title: 'Your recurring costs',
  description: 'Add what you pay now and Ask compares it with benchmarks for your area. These are estimates, not quotes.',
  filters: [], actions: [],
  sections: [{ id: 'recurring-setup', title: 'Costs to compare', count: 4, items: [
    { id: 'insurance', entityType: 'HOME_SAVINGS_CATEGORY', title: 'Home insurance', description: 'Not set up yet. Add what you pay now and Ask will compare it.', meta: ['Not set up'], status: 'NOT_SET_UP', actions: [action] },
    { id: 'warranty', title: 'Home warranty', description: 'Choice Home. These details come from your warranty record, so they are read from there and cannot be changed here.', meta: ['From your warranty record', '$55 monthly'], status: 'CURRENT', actions: [] },
    { id: 'internet', title: 'Internet', description: 'Comcast · Gigabit', meta: ['Plan saved', '$89.99 monthly', 'Possible saving found'], status: 'FOUND_SAVINGS', actions: [{ ...action, label: 'Update plan' }] },
    { id: 'utilities', title: 'Electricity and gas', description: 'Not set up yet. Add what you pay now and Ask will compare it.', meta: ['Not set up'], status: 'NOT_SET_UP', actions: [action] },
  ] }],
};

test('renders recurring costs as a compact responsive grid without repeated setup state', () => {
  const onItemAction = jest.fn();
  const { container } = render(<GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);

  expect(screen.getByRole('heading', { name: 'Recurring costs to compare' })).toBeInTheDocument();
  expect(screen.getByText('4 costs')).toBeInTheDocument();
  expect(container.querySelector('[data-savings-recurring-grid] ul')).toHaveClass('md:grid-cols-2');
  expect(screen.queryByText('Costs to compare')).not.toBeInTheDocument();
  expect(screen.queryByText('Not set up yet. Add what you pay now and Ask will compare it.')).not.toBeInTheDocument();
  expect(screen.getAllByText('Not set up')).toHaveLength(2);
  expect(screen.getByText(/From your warranty record/)).toBeInTheDocument();
  expect(screen.queryAllByRole('button', { name: /plan/i })).toHaveLength(3);

  fireEvent.click(screen.getAllByRole('button', { name: 'Set up plan' })[0]);
  expect(onItemAction).toHaveBeenCalledWith('HOME_SAVINGS_CATEGORY', 'insurance', 'Set up this plan', 'SAVINGS_BENEFIT_COMMAND', 'MUTATE_RECORD');
});

test('renders savings summary, headline metrics, and opportunity groups as framed conversational panels', () => {
  const onItemAction = jest.fn();
  const summary: Summary = {
    type: 'SUMMARY',
    id: 'savings-summary',
    title: 'Here is the current savings picture for this home',
    body: 'Estimates are planning signals. Realized value counts only after a saving or benefit is recorded as received.',
    tone: 'DEFAULT',
    actions: [
      {
        id: 'scan-benefits',
        label: 'Re-scan for benefits',
        message: 'Scan this home for savings and benefits',
        operationId: 'SAVINGS_BENEFIT_COMMAND',
        interactionType: 'START_WORKFLOW',
        style: 'SECONDARY',
      },
    ],
  };

  const headline: MetricRow = {
    type: 'METRIC_ROW',
    id: 'savings-headline',
    title: 'At a glance',
    metrics: [
      { label: 'Best recurring estimate', value: '$312/year', detail: 'The highest single net estimate, not a sum', tone: 'POSITIVE' },
      { label: 'Ready to review', value: '2', detail: 'opportunities and benefits', tone: 'DEFAULT' },
    ],
  };

  const groups: GroupedList = {
    type: 'GROUPED_LIST',
    id: 'savings-opportunity-groups',
    title: 'By category',
    description: 'Nothing is recorded yet for recurring-cost opportunities, benefits and rebates, work in progress or realized savings.',
    filters: [],
    actions: [],
    sections: [
      {
        id: 'related',
        title: 'Related savings decisions',
        count: 1,
        items: [
          {
            id: 'related-COVERAGE',
            title: 'Coverage and premium review',
            description: '2 coverage gaps — largest exposure Microwave ($1,200)',
            meta: ['Review this estimate separately before deciding'],
            status: 'RELATED',
            href: null,
            actions: [
              {
                id: 'review-coverage-opportunity',
                label: 'Review coverage gaps',
                message: 'Show my current coverage gaps.',
                operationId: 'COVERAGE_GAPS',
                interactionType: 'CONVERSATION_CONTINUE',
                style: 'SECONDARY',
              },
            ],
          },
        ],
      },
    ],
  };

  const { container } = render(
    <div>
      <SummaryBlock
        block={summary}
        executionId="execution"
        propertyId="home"
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onItemAction={onItemAction}
        onCollectionPage={jest.fn()}
        onAccessLost={jest.fn()}
      />
      <MetricRowBlock
        block={headline}
        executionId="execution"
        propertyId="home"
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onItemAction={onItemAction}
        onCollectionPage={jest.fn()}
        onAccessLost={jest.fn()}
      />
      <GenericGroupedListBlock
        block={groups}
        executionId="execution"
        propertyId="home"
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onItemAction={onItemAction}
        onCollectionPage={jest.fn()}
        onAccessLost={jest.fn()}
      />
    </div>,
  );

  expect(container.querySelector('[data-savings-summary="savings-summary"]')).toBeInTheDocument();
  expect(container.querySelector('[data-savings-metrics="savings-headline"]')).toBeInTheDocument();
  expect(container.querySelector('[data-savings-opportunity-groups]')).toBeInTheDocument();
  expect(screen.getByText('Coverage and premium review')).toBeInTheDocument();
  expect(screen.getByText('Related decision')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Review coverage gaps/i }));
  expect(onItemAction).toHaveBeenCalledWith(
    undefined,
    'related-COVERAGE',
    'Show my current coverage gaps.',
    'COVERAGE_GAPS',
    'CONVERSATION_CONTINUE',
  );
});
