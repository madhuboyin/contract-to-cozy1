import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChangeSummaryList } from '../blocks/DecisionBlocks';
import { BlockSequence } from '../blocks/registry';
import { AskBlockActionContext } from '../blocks/context';
import type { AskPresentationBlock } from '@/features/ask/types';

type ChangeSummary = Extract<AskPresentationBlock, { type: 'CHANGE_SUMMARY' }>;

function change(id: string, title: string, detectedAt: string, overrides: Partial<ChangeSummary> = {}): ChangeSummary {
  return {
    type: 'CHANGE_SUMMARY', id, title, source: 'Home action',
    changeType: 'ACTION_STATE_CHANGED', summary: 'Home action updated.',
    effectiveAt: detectedAt, detectedAt, materiality: 'IMPORTANT',
    materialityReasonCodes: ['CANONICAL_ACTION_SOON'], whyItMatters: 'This home priority should be reviewed soon.', dateLabel: 'Changed', confidence: 1,
    linkedAction: {
      label: 'Open in Home Operations',
      href: `/dashboard/properties/property-1/home-operations?focusWorkItemId=${id}&openManage=1`,
    },
    reviewAction: {
      id: `review-${id}`, label: 'Review in Ask', interactionType: 'START_WORKFLOW',
      message: `What should I do next for “${title}”?`, operationId: 'HOME_ACTIONS',
      entityType: 'HOME_ACTION', entityId: id, actionId: id, style: 'SECONDARY',
    },
    actions: [{
      id: 'home-change-older-history', label: 'View older home history', interactionType: 'START_WORKFLOW',
      message: 'Show my home timeline', operationId: 'HOME_TIMELINE_EVENTS', outcomeKey: 'REVIEW_HOME_TIMELINE', style: 'QUIET',
    }],
    ...overrides,
  };
}

test('renders canonical titles as conversational action cards with exact work-item links', () => {
  const invoke = jest.fn();
  render(<AskBlockActionContext.Provider value={{ disabled: false, invoke }}><ChangeSummaryList blocks={[
    change('work-1', 'Chimney cleaning and inspection', '2026-09-25T12:00:00.000Z'),
    change('work-2', 'Replace the aging water heater', '2026-09-25T10:00:00.000Z', { materiality: 'URGENT' }),
  ]} /></AskBlockActionContext.Provider>);

  const list = screen.getByTestId('change-summary-list');
  expect(within(list).getByRole('heading', { name: 'Important changes from the last 30 days' })).toBeInTheDocument();
  expect(within(list).getByText('2 recent updates may affect your home, priorities, or recommendations.')).toBeInTheDocument();
  expect(within(list).queryByText('Updated.')).toBeNull();
  expect(within(list).getByText('Chimney cleaning and inspection')).toBeInTheDocument();
  expect(within(list).getByText('Replace the aging water heater')).toBeInTheDocument();
  expect(within(list).getAllByRole('article')).toHaveLength(2);
  expect(list).toHaveClass('max-w-6xl');
  expect(within(list).getAllByText('Home action updated.')).toHaveLength(2);

  const firstCard = within(list).getByText('Chimney cleaning and inspection').closest('article');
  expect(firstCard).not.toBeNull();
  const disclosure = within(firstCard as HTMLElement).getByRole('button', { name: /Chimney cleaning and inspection/ });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(disclosure);
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(within(firstCard as HTMLElement).getByText('Why this matters')).toBeInTheDocument();
  expect(within(firstCard as HTMLElement).getByText('This home priority should be reviewed soon.')).toBeInTheDocument();
  expect(within(firstCard as HTMLElement).queryByText('Home action')).toBeNull();
  expect(within(firstCard as HTMLElement).queryByText(/Detected|effective|canonical action/i)).toBeNull();
  fireEvent.click(within(firstCard as HTMLElement).getByRole('button', { name: 'Review in Ask' }));
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'HOME_ACTION', entityId: 'work-1', operationId: 'HOME_ACTIONS' }));
  expect(within(firstCard as HTMLElement).getByRole('link', { name: /View full record/ })).toHaveAttribute(
    'href',
    '/dashboard/properties/property-1/home-operations?focusWorkItemId=work-1&openManage=1',
  );
  expect(within(list).getByRole('heading', { name: 'Looking for older history?' })).toBeInTheDocument();
  fireEvent.click(within(list).getByRole('button', { name: 'View older home history' }));
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'HOME_TIMELINE_EVENTS', message: 'Show my home timeline' }));
});

test('the response sequence groups adjacent change blocks into one conversational card cluster', () => {
  const blocks: AskPresentationBlock[] = [
    change('work-1', 'Chimney cleaning and inspection', '2026-09-25T12:00:00.000Z'),
    change('work-2', 'Replace the aging water heater', '2026-09-24T10:00:00.000Z'),
  ];
  render(<BlockSequence blocks={blocks} renderBlock={(block) => <div key={block.id}>{block.id}</div>} />);
  expect(screen.getAllByTestId('change-summary-list')).toHaveLength(1);
  expect(screen.getByText('Chimney cleaning and inspection')).toBeInTheDocument();
  expect(screen.getByText('Replace the aging water heater')).toBeInTheDocument();
});
