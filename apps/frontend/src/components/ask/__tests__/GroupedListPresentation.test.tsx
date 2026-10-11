import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const block: GroupedList = {
  type: 'GROUPED_LIST', id: 'records', title: 'Home records', filters: [], actions: [],
  sections: [{ id: 'recent', title: 'Recent', count: 5, items: Array.from({ length: 5 }, (_, index) => ({
    id: `record-${index}`, title: `Record ${index}`, meta: ['Current'],
  })) }],
};

function Harness() {
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('Cards/List choice persists without dropping item identity or status', async () => {
  const first = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true'));
  expect(first.container.querySelector('[data-grouped-list-presentation="compact_list"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  expect(first.container.querySelector('[data-grouped-list-presentation="cards"]')).toBeInTheDocument();
  expect(first.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(5);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).groupedListModes.records).toBe('CARDS');
  first.unmount();
  const restored = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true'));
  expect(restored.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(5);
});

test('each section independently honors its declared initial visible count', () => {
  const bounded: GroupedList = {
    ...block,
    sections: [
      { ...block.sections[0], initialVisibleCount: 2 },
      { id: 'older', title: 'Older', count: 4, initialVisibleCount: 1, items: Array.from({ length: 4 }, (_, index) => ({ id: `older-${index}`, title: `Older ${index}`, meta: [] })) },
    ],
  };
  const view = render(<GenericGroupedListBlock block={bounded} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(3);
  fireEvent.click(screen.getAllByRole('button', { name: 'Show 3 more' })[0]);
  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(9);
});

test('Project Tracker rows progressively disclose descriptions and secondary metadata', () => {
  const projectRecords: GroupedList = {
    ...block,
    id: 'project-detail-records',
    sections: [{ id: 'project-detail-milestones', title: 'Milestones', count: 1, items: [{
      id: 'milestone-1', title: 'Rough-in inspection', status: 'IN_PROGRESS', description: null,
      meta: ['Scheduled Oct 20, 2026'], detail: 'Inspect framing and rough-ins\nPhoto evidence required',
    }] }],
  };
  render(<GenericGroupedListBlock block={projectRecords} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(screen.queryByText('Inspect framing and rough-ins')).not.toBeInTheDocument();
  expect(screen.getByText('Scheduled Oct 20, 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View details for Rough-in inspection' }));
  expect(screen.getByText(/Inspect framing and rough-ins/)).toHaveTextContent('Photo evidence required');
  fireEvent.click(screen.getByRole('button', { name: 'Hide details for Rough-in inspection' }));
  expect(screen.queryByText(/Inspect framing and rough-ins/)).not.toBeInTheDocument();
});
