import { fireEvent, render, screen } from '@testing-library/react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import { SummaryBlock } from '../blocks/CoreBlocks';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { AskBlockActionContext } from '../blocks/context';
import type { AskPresentationBlock } from '@/features/ask/types';

function renderGroupedList(
  block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>,
  onItemAction = jest.fn(),
  invoke = jest.fn(),
) {
  return render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke }}>
      <GenericGroupedListBlock
        block={block}
        executionId="exec-ownership-1"
        propertyId="prop-1"
        onAccessLost={jest.fn()}
        onItemAction={onItemAction}
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onCollectionPage={jest.fn()}
      />
    </AskBlockActionContext.Provider>,
  );
}

describe('Ownership Cost conversational UI panels', () => {
  it('renders an honest coverage bar instead of a $0/yr | $0 | $0 breakdown when all categories are missing', () => {
    const zeroSummary: Extract<AskPresentationBlock, { type: 'SUMMARY' }> = {
      type: 'SUMMARY',
      id: 'ownership-costs-summary',
      title: "This home's recorded operating expense is about $0 per month",
      body: 'For an established home, this guidance emphasizes current condition, upcoming work, and sustainable long-term costs. $0 per year is included in the operating expense lens. $0 is supported by confirmed or observed records and $0 is estimated. 6 included categories are still missing and not counted as zero.',
      tone: 'CAUTION',
      actions: [],
    };

    const { container } = render(
      <AskBlockActionContext.Provider value={{ disabled: false, invoke: jest.fn() }}>
        <SummaryBlock block={zeroSummary} executionId="exec-1" onAccessLost={jest.fn()} onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} />
      </AskBlockActionContext.Provider>,
    );

    expect(container.querySelector('[data-ownership-costs-summary="ownership-costs-summary"]')).toBeInTheDocument();
    expect(container.querySelector('[data-ownership-costs-coverage-bar]')).toBeInTheDocument();
    expect(screen.getByText('0 of 6 included categories recorded yet')).toBeVisible();
    expect(screen.queryByText('$0/yr')).not.toBeInTheDocument();
  });

  it('renders the 3-column Annual Total / Confirmed / Estimated breakdown when costs are recorded', () => {
    const populatedSummary: Extract<AskPresentationBlock, { type: 'SUMMARY' }> = {
      type: 'SUMMARY',
      id: 'ownership-costs-summary',
      title: "This home's recorded operating expense is about $1,420 per month",
      body: '$17,040 per year is included in the operating expense lens. $14,160 is supported by confirmed or observed records and $2,880 is estimated. 1 included category is still missing and not counted as zero.',
      tone: 'CAUTION',
      actions: [],
    };

    render(
      <AskBlockActionContext.Provider value={{ disabled: false, invoke: jest.fn() }}>
        <SummaryBlock block={populatedSummary} executionId="exec-1" onAccessLost={jest.fn()} onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} />
      </AskBlockActionContext.Provider>,
    );

    expect(screen.getByText('$17,040/yr')).toBeVisible();
    expect(screen.getByText('$14,160')).toBeVisible();
    expect(screen.getByText('$2,880')).toBeVisible();
  });

  it('renders a compact single-line banner when Cost by category has 0 recorded rows', () => {
    const emptyCategories: Extract<AskPresentationBlock, { type: 'TABLE' }> = {
      type: 'TABLE',
      id: 'ownership-cost-categories',
      title: 'Cost by category',
      description: 'Categories included in the operating expense lens, ordered by annual amount.',
      preferredPresentation: 'TABLE',
      columns: [
        { key: 'category', label: 'Category' },
        { key: 'monthly', label: 'Monthly' },
        { key: 'annual', label: 'Annual' },
        { key: 'evidence', label: 'Evidence' },
      ],
      rows: [],
      actions: [],
    };

    const { container } = render(<AdaptiveTableBlock block={emptyCategories} renderAction={() => null} />);
    expect(container.querySelector('[data-ownership-cost-categories-empty]')).toBeInTheDocument();
    expect(screen.getByText('Cost by category')).toBeVisible();
    expect(
      screen.getByText(/No recorded amounts in this lens yet — review the missing categories below/),
    ).toBeVisible();
    expect(screen.queryByText('No records are available for this result.')).not.toBeInTheDocument();
  });

  it('renders ownership-cost-missing as a 2-column divided grid with category-specific guidance and actions', () => {
    const onItemAction = jest.fn();
    const missingBlock: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
      type: 'GROUPED_LIST',
      id: 'ownership-cost-missing',
      title: 'Information that could improve this total',
      description: 'These categories are applicable or unresolved, but no amount is currently included.',
      sections: [
        {
          id: 'missing',
          title: 'Missing or stale categories',
          count: 2,
          items: [
            {
              id: 'PROPERTY_TAX',
              title: 'Property tax',
              description: 'No usable current amount is recorded.',
              status: 'MISSING',
              tone: 'CAUTION',
              meta: [],
              actions: [
                {
                  id: 'fix-PROPERTY_TAX',
                  label: 'Review property tax',
                  message: 'What can I deduct or review for property taxes?',
                  operationId: 'TAX_DEDUCTION_IDENTIFY',
                  interactionType: 'NAVIGATE',
                  style: 'PRIMARY',
                },
                {
                  id: 'add-expense-PROPERTY_TAX',
                  label: 'Add a property tax payment',
                  message: 'Add a property tax expense for this home.',
                  operationId: 'OWNERSHIP_COST_COMMAND',
                  interactionType: 'MUTATE_RECORD',
                  style: 'SECONDARY',
                },
              ],
            },
            {
              id: 'INSURANCE',
              title: 'Home insurance',
              description: 'No usable current amount is recorded.',
              status: 'MISSING',
              tone: 'CAUTION',
              meta: [],
              actions: [
                {
                  id: 'fix-INSURANCE',
                  label: 'Review insurance',
                  message: 'Show my coverage gaps.',
                  operationId: 'COVERAGE_GAPS',
                  interactionType: 'NAVIGATE',
                  style: 'PRIMARY',
                },
              ],
            },
          ],
        },
      ],
      filters: [],
      actions: [],
    };

    const { container } = renderGroupedList(missingBlock, onItemAction);

    expect(container.querySelector('[data-ownership-cost-missing]')).toBeInTheDocument();
    expect(screen.getByText('2 categories missing')).toBeVisible();
    expect(
      screen.getByText('Add your latest property tax bill or assessment to include annual taxes.'),
    ).toBeVisible();
    expect(
      screen.getByText('Link your homeowners policy or annual premium to include coverage costs.'),
    ).toBeVisible();
    expect(screen.queryByText('No usable current amount is recorded.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add a property tax payment' }));
    expect(onItemAction).toHaveBeenCalledWith(
      undefined,
      'PROPERTY_TAX',
      'Add a property tax expense for this home.',
      'OWNERSHIP_COST_COMMAND',
      'MUTATE_RECORD',
    );
  });

  it('renders a single Add an expense CTA when ownership-cost-expenses is empty (no duplicate button)', () => {
    const invoke = jest.fn();
    const emptyExpenses: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
      type: 'GROUPED_LIST',
      id: 'ownership-cost-expenses',
      title: 'Expenses you recorded',
      description: 'You have not recorded an expense for this home. Utility, HOA, property-tax, repair and project expenses feed the totals above.',
      sections: [
        {
          id: 'recorded-expenses',
          title: 'Expenses',
          count: 0,
          items: [],
        },
      ],
      filters: [],
      actions: [
        {
          id: 'add-home-expense',
          label: 'Add an expense',
          message: 'Add an expense for this home.',
          operationId: 'HOME_EXPENSE_MUTATE',
          interactionType: 'START_WORKFLOW',
          style: 'PRIMARY',
        },
      ],
    };

    const { container } = renderGroupedList(emptyExpenses, jest.fn(), invoke);

    expect(container.querySelector('[data-ownership-cost-expenses]')).toBeInTheDocument();
    const addButtons = screen.getAllByRole('button', { name: 'Add an expense' });
    expect(addButtons).toHaveLength(1);
    expect(screen.queryByText('Nothing is recorded here yet.')).not.toBeInTheDocument();

    fireEvent.click(addButtons[0]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('renders recorded expenses with extracted dollar amounts and inline Change/Delete buttons', () => {
    const onItemAction = jest.fn();
    const populatedExpenses: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
      type: 'GROUPED_LIST',
      id: 'ownership-cost-expenses',
      title: 'Expenses you recorded',
      description: 'Expenses recorded directly in your home record.',
      sections: [
        {
          id: 'recorded-expenses',
          title: 'Expenses',
          count: 1,
          items: [
            {
              id: 'exp-1',
              title: 'October electric bill',
              description: null,
              entityType: 'EXPENSE',
              meta: ['Utility', '$185.00', '2026-10-15'],
              actions: [
                {
                  id: 'edit-expense-exp-1',
                  label: 'Change',
                  message: 'Update the expense "October electric bill" (id exp-1).',
                  operationId: 'OWNERSHIP_COST_COMMAND',
                  interactionType: 'MUTATE_RECORD',
                  entityType: 'EXPENSE',
                  entityId: 'exp-1',
                  style: 'QUIET',
                },
                {
                  id: 'delete-expense-exp-1',
                  label: 'Delete',
                  message: 'Delete the expense "October electric bill" (id exp-1).',
                  operationId: 'OWNERSHIP_COST_COMMAND',
                  interactionType: 'MUTATE_RECORD',
                  entityType: 'EXPENSE',
                  entityId: 'exp-1',
                  style: 'QUIET',
                },
              ],
            },
          ],
        },
      ],
      filters: [],
      actions: [
        {
          id: 'add-home-expense',
          label: 'Add an expense',
          message: 'Add an expense for this home.',
          operationId: 'OWNERSHIP_COST_COMMAND',
          interactionType: 'START_WORKFLOW',
          style: 'PRIMARY',
        },
      ],
    };

    renderGroupedList(populatedExpenses, onItemAction);

    expect(screen.getByText('October electric bill')).toBeVisible();
    expect(screen.getByText('$185.00')).toBeVisible();
    expect(screen.getByText('2026-10-15')).toBeVisible();
    expect(screen.getByText('Utility')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Add an expense' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onItemAction).toHaveBeenCalledWith(
      'EXPENSE',
      'exp-1',
      'Update the expense "October electric bill" (id exp-1).',
      'OWNERSHIP_COST_COMMAND',
      'MUTATE_RECORD',
    );
  });
});
