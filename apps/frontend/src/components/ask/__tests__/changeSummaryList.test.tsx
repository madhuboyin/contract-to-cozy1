import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChangeSummaryList } from '../blocks/DecisionBlocks';
import { BlockSequence } from '../blocks/registry';
import type { AskPresentationBlock } from '@/features/ask/types';

type ChangeSummary = Extract<AskPresentationBlock, { type: 'CHANGE_SUMMARY' }>;

function change(id: string, title: string, detectedAt: string, overrides: Partial<ChangeSummary> = {}): ChangeSummary {
  return {
    type: 'CHANGE_SUMMARY', id, title, source: 'Home action',
    changeType: 'ACTION_STATE_CHANGED', summary: 'Home action updated.',
    effectiveAt: detectedAt, detectedAt, materiality: 'IMPORTANT',
    materialityReasonCodes: ['ACTION_PRIORITY'], confidence: 1,
    linkedAction: {
      label: 'Open in Home Operations',
      href: `/dashboard/properties/property-1/home-operations?focusWorkItemId=${id}&openManage=1`,
    },
    ...overrides,
  };
}

test('renders canonical titles as compact expandable activity rows with exact work-item links', () => {
  render(<ChangeSummaryList blocks={[
    change('work-1', 'Chimney cleaning and inspection', '2026-09-25T12:00:00.000Z'),
    change('work-2', 'Replace the aging water heater', '2026-09-25T10:00:00.000Z', { materiality: 'URGENT' }),
  ]} />);

  const list = screen.getByTestId('change-summary-list');
  expect(within(list).getAllByText('Home action updated.')).toHaveLength(2);
  expect(within(list).getByText('Chimney cleaning and inspection')).toBeInTheDocument();
  expect(within(list).getByText('Replace the aging water heater')).toBeInTheDocument();
  expect(within(list).getAllByRole('heading', { level: 3 })).toHaveLength(1);

  const firstRow = within(list).getByText('Chimney cleaning and inspection').closest('details');
  expect(firstRow).not.toBeNull();
  fireEvent.click(within(firstRow as HTMLElement).getByText('Chimney cleaning and inspection'));
  expect(within(firstRow as HTMLElement).getByRole('link', { name: /Open in Home Operations/ })).toHaveAttribute(
    'href',
    '/dashboard/properties/property-1/home-operations?focusWorkItemId=work-1&openManage=1',
  );
});

test('the response sequence groups adjacent change blocks into one list', () => {
  const blocks: AskPresentationBlock[] = [
    change('work-1', 'Chimney cleaning and inspection', '2026-09-25T12:00:00.000Z'),
    change('work-2', 'Replace the aging water heater', '2026-09-24T10:00:00.000Z'),
  ];
  render(<BlockSequence blocks={blocks} renderBlock={(block) => <div key={block.id}>{block.id}</div>} />);
  expect(screen.getAllByTestId('change-summary-list')).toHaveLength(1);
  expect(screen.getByText('Chimney cleaning and inspection')).toBeInTheDocument();
  expect(screen.getByText('Replace the aging water heater')).toBeInTheDocument();
});
