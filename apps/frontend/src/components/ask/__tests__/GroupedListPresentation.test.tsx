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
