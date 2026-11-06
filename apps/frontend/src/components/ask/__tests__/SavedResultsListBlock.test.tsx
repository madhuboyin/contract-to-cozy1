import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GroupedListBlock } from '../blocks/GroupedListBlock';
import { BoundaryBlock, SummaryBlock } from '../blocks/CoreBlocks';

type SavedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type SavedSummaryBlock = Extract<AskPresentationBlock, { type: 'SUMMARY' }>;
type SavedBoundaryBlock = Extract<AskPresentationBlock, { type: 'BOUNDARY' }>;

function savedListBlock(): SavedListBlock {
  return {
    type: 'GROUPED_LIST',
    id: 'saved-results-list',
    title: 'Saved',
    actions: [],
    filters: [
      { id: 'fresh-current', label: 'Current', message: 'Only show current saved results', active: false },
      { id: 'fresh-stale', label: 'Out of date', message: 'Only show out of date saved results', active: false },
      { id: 'fresh-expired', label: 'Expired', message: 'Only show expired saved results', active: false },
      { id: 'fresh-superseded', label: 'Replaced by a newer version', message: 'Only show replaced saved results', active: false },
      { id: 'type-seasonal_checklist', label: 'Seasonal checklists', message: 'Only show seasonal checklists', active: false },
      { id: 'type-quote_comparison', label: 'Quote comparisons', message: 'Only show quote comparisons', active: false },
      { id: 'show-archived', label: 'Archived · 2', message: 'Only show archived saved results', active: false },
      { id: 'clear-search', label: 'Clear search “roof”', message: 'Now show saved results with no search', active: true },
      { id: 'clear-all', label: 'Clear filters', message: 'Now show all saved results with no filters', active: false },
      { id: 'show-more', label: 'Show more', message: 'Now show more saved results', active: false },
    ],
    sections: [
      {
        id: 'saved',
        title: 'Saved results',
        count: 3,
        items: [
          {
            id: 'seasonal-summer-2026',
            title: 'Summer 2026 checklist',
            description: '0 of 3 tasks done',
            status: 'Out of date',
            entityType: 'SEASONAL_CHECKLIST',
            href: null,
            meta: ['Out of date', 'Summer 2026', 'Facts as of Sep 9, 2026', 'This season has ended.'],
            actions: [
              {
                id: 'saved-open',
                label: 'Open and review',
                message: 'Open Summer 2026 checklist',
                interactionType: 'CONVERSATION_CONTINUE',
                operationId: 'SEASONAL_HOME_CARE',
                style: 'PRIMARY',
              },
              {
                id: 'saved-archive',
                label: 'Archive',
                message: 'Archive Summer 2026 checklist in my saved results',
                interactionType: 'MUTATE_RECORD',
                operationId: 'SAVED_ARCHIVE_COMMAND',
                entityType: 'SAVED_ARTIFACT',
                entityId: 'seasonal:summer-2026',
                style: 'QUIET',
              },
            ],
          },
          {
            id: 'seasonal-winter-2026',
            title: 'Winter 2026 checklist',
            description: '2 of 4 tasks done',
            status: null,
            entityType: 'SEASONAL_CHECKLIST',
            href: null,
            meta: ['Current', 'Winter 2026', 'Facts as of Nov 3, 2026'],
            actions: [
              {
                id: 'saved-open',
                label: 'Open',
                message: 'Open Winter 2026 checklist',
                interactionType: 'CONVERSATION_CONTINUE',
                operationId: 'SEASONAL_HOME_CARE',
                style: 'PRIMARY',
              },
              {
                id: 'saved-archive',
                label: 'Archive',
                message: 'Archive Winter 2026 checklist in my saved results',
                interactionType: 'MUTATE_RECORD',
                operationId: 'SAVED_ARCHIVE_COMMAND',
                entityType: 'SAVED_ARTIFACT',
                entityId: 'seasonal:winter-2026',
                style: 'QUIET',
              },
            ],
          },
          {
            id: 'comparison-q1',
            title: 'Roofing quotes',
            description: 'Selected Acme',
            status: null,
            entityType: 'QUOTE_COMPARISON_WORKSPACE',
            href: null,
            meta: ['Current', 'Decided, updated 2026-10-07', 'Facts as of Oct 7, 2026', 'Sensitive'],
            actions: [
              {
                id: 'saved-open',
                label: 'Open',
                message: 'Open Roofing quotes',
                interactionType: 'CONVERSATION_CONTINUE',
                operationId: 'QUOTE_COMPARISON_REVIEW',
                style: 'PRIMARY',
              },
            ],
          },
        ],
      },
    ],
  };
}

test('renders Saved results as a dedicated conversational collection with structured filters and adjacent actions', () => {
  const onFilterClick = jest.fn();
  const onItemAction = jest.fn();

  render(
    <GroupedListBlock
      block={savedListBlock()}
      executionId="exec-1"
      propertyId="prop-1"
      itemActionsDisabled={false}
      onFilterClick={onFilterClick}
      onItemAction={onItemAction}
      onCollectionPage={jest.fn()}
      onAccessLost={jest.fn()}
    />,
  );

  expect(document.querySelector('[data-saved-results-list]')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();

  // Header status breakdown pills
  expect(screen.getByText('3 results')).toBeInTheDocument();
  expect(screen.getByText('2 current')).toBeInTheDocument();
  expect(screen.getByText('1 needs review')).toBeInTheDocument();

  // Checklist progress bar and percentage
  expect(screen.getByText('2 of 4 tasks done')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();

  // Primary and quiet secondary row actions dispatch with exact canonical arguments
  fireEvent.click(screen.getByRole('button', { name: /Open and review/i }));
  expect(onItemAction).toHaveBeenCalledWith(
    'SEASONAL_CHECKLIST',
    'seasonal-summer-2026',
    'Open Summer 2026 checklist',
    'SEASONAL_HOME_CARE',
    'CONVERSATION_CONTINUE',
  );

  fireEvent.click(screen.getAllByRole('button', { name: /^Archive$/i })[0]);
  expect(onItemAction).toHaveBeenCalledWith(
    'SAVED_ARTIFACT',
    'seasonal:summer-2026',
    'Archive Summer 2026 checklist in my saved results',
    'SAVED_ARCHIVE_COMMAND',
    'MUTATE_RECORD',
  );

  // Freshness filter, type dropdown filter, archive switch, search clear, and show more
  fireEvent.click(screen.getByRole('button', { name: 'Out of date' }));
  expect(onFilterClick).toHaveBeenCalledWith('Only show out of date saved results');

  fireEvent.click(screen.getByRole('button', { name: 'Seasonal checklists' }));
  expect(onFilterClick).toHaveBeenCalledWith('Only show seasonal checklists');

  fireEvent.click(screen.getByRole('button', { name: 'Archived · 2' }));
  expect(onFilterClick).toHaveBeenCalledWith('Only show archived saved results');

  fireEvent.click(screen.getByRole('button', { name: /Clear search “roof”/i }));
  expect(onFilterClick).toHaveBeenCalledWith('Now show saved results with no search');

  fireEvent.click(screen.getByRole('button', { name: 'Show more saved results' }));
  expect(onFilterClick).toHaveBeenCalledWith('Now show more saved results');
});

test('renders saved-results-summary and saved-results-partial as calm, truthful conversational blocks', () => {
  const summary: SavedSummaryBlock = {
    type: 'SUMMARY',
    id: 'saved-results-summary',
    title: '3 shown so far; some kinds could not be read, so this may not be everything',
    body: '3 shown so far; some kinds could not be read, so this may not be everything. Showing saved · newest first.',
    headline: '3 shown so far; some kinds could not be read, so this may not be everything.',
    supportLine: 'Showing saved · newest first.',
    tone: 'CAUTION',
    chips: [{ label: '2 archived', tone: 'DEFAULT' }],
    actions: [],
  };

  const partialBoundary: SavedBoundaryBlock = {
    type: 'BOUNDARY',
    id: 'saved-results-partial',
    title: 'Some saved results could not be shown',
    body: "Negotiation analyses: Negotiation analyses belong to a buyer case; the case's visibility rule has not been connected to Saved.; Buyer workspaces: Buyer workspaces apply only to a purchase in progress; their lifecycle gate has not been connected to Saved. Nothing here is treated as zero or complete for those.",
    severity: 'CAUTION',
    suggestions: [],
  };

  render(
    <div>
      <SummaryBlock
        block={summary}
        executionId="exec-1"
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onItemAction={jest.fn()}
        onCollectionPage={jest.fn()}
        onAccessLost={jest.fn()}
      />
      <BoundaryBlock
        block={partialBoundary}
        executionId="exec-1"
        itemActionsDisabled={false}
        onFilterClick={jest.fn()}
        onItemAction={jest.fn()}
        onCollectionPage={jest.fn()}
        onAccessLost={jest.fn()}
      />
    </div>,
  );

  expect(screen.getByText('3 saved results ready to reopen')).toBeInTheDocument();
  expect(screen.getByText('Showing saved · newest first.')).toBeInTheDocument();
  expect(screen.getByText('2 archived')).toBeInTheDocument();

  // Partial coverage boundary renders as a compact collapsible disclosure while keeping all reasons in DOM
  expect(document.querySelector('[data-partial-coverage-boundary="saved-results-partial"]')).toBeInTheDocument();
  expect(screen.getByText('Some saved results could not be shown')).toBeInTheDocument();
  expect(screen.getByText('2 areas not shown')).toBeInTheDocument();
  expect(screen.getByText('Negotiation analyses')).toBeInTheDocument();
  expect(screen.getByText('Buyer workspaces')).toBeInTheDocument();
});
