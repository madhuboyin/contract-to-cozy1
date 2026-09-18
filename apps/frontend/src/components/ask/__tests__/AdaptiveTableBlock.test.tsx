import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { AdaptiveTableBlock } from '../AdaptiveTableBlock';
import { resolveAdaptiveTablePresentation } from '@/features/ask/adaptivePresentation';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type TableBlock = Extract<AskPresentationBlock, { type: 'TABLE' }>;
const block: TableBlock = {
  type: 'TABLE', id: 'cost-table', title: 'Ownership costs', description: 'Recorded annual costs.',
  columns: [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Annual amount' }, { key: 'source', label: 'Source' }],
  rows: [
    { id: 'tax', values: { category: 'Property tax', amount: '$6,200', source: 'Tax record' } },
    { id: 'insurance', values: { category: 'Insurance', amount: '$1,900', source: 'Policy' } },
  ],
  totalCount: 4,
  actions: [{ id: 'open-costs', label: 'Open ownership costs', href: '/dashboard/ownership-costs', style: 'SECONDARY' }],
};

function execution(table: TableBlock = block): AskExecutionResponse {
  return {
    sessionId: 'adaptive-session', executionId: 'adaptive-execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'adaptive-result', revision: 1, domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
    blocks: [table], updatedAt: '2026-09-17T12:00:00.000Z',
  } as AskExecutionResponse;
}

function Harness({ table = block }: { table?: TableBlock }) {
  const response = useMemo(() => execution(table), [table]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <AdaptiveTableBlock block={table} renderAction={(action) => action.href ? <a href={action.href}>{action.label}</a> : null} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('resolver uses a responsive default and avoids a comparison table for one record', () => {
  expect(resolveAdaptiveTablePresentation(block, 'AUTO')).toEqual({ mode: 'RESPONSIVE', offersChoice: true, reason: 'RESPONSIVE_DEFAULT' });
  expect(resolveAdaptiveTablePresentation({ ...block, rows: block.rows.slice(0, 1) }, 'TABLE')).toEqual({ mode: 'CARDS', offersChoice: false, reason: 'SINGLE_RECORD' });
});

test('view choice changes locally, preserves semantics and persists for the result', async () => {
  const firstRender = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.getByRole('table', { name: 'Ownership costs' })).toBeInTheDocument();
  expect(firstRender.container.querySelector('[data-table-presentation="cards"]')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getAllByText('Annual amount').length).toBe(2);
  expect(screen.getByText('Showing 2 of 4 records. View: cards.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open ownership costs' })).toHaveAttribute('href', '/dashboard/ownership-costs');
  expect(readResultView(window.sessionStorage, resultViewKey('adaptive-session', 'home', 'adaptive-result')).presentationModes['cost-table']).toBe('CARDS');

  firstRender.unmount();
  const restoredRender = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.queryByRole('table')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Table' }));
  expect(screen.getByRole('table', { name: 'Ownership costs' })).toBeInTheDocument();
  expect(restoredRender.container.querySelector('[data-table-presentation="cards"]')).not.toBeInTheDocument();
});

test('a single record uses labeled cards without presenting a meaningless view switch', () => {
  const single = { ...block, id: 'single-record', rows: block.rows.slice(0, 1), totalCount: 1 };
  const { container } = render(<Harness table={single} />);
  expect(screen.queryByRole('group', { name: 'View Ownership costs' })).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(container.querySelector('[data-table-presentation="cards"]')).toBeInTheDocument();
  expect(screen.getByText('1 record. View: cards.')).toBeInTheDocument();
});
