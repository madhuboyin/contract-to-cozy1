import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import { resolveAdaptiveComparisonPresentation } from '@/features/ask/adaptivePresentation';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type ComparisonBlock = Extract<AskPresentationBlock, { type: 'COMPARISON' }>;

const block: ComparisonBlock = {
  type: 'COMPARISON', id: 'repair-options', title: 'Compare your options', description: 'Modeled from the recorded appliance details.',
  options: [
    {
      id: 'repair', label: 'Repair', summary: 'Address the current failure.',
      badge: { label: 'Lowest upfront cost', basis: 'The recorded repair estimate is lower than the replacement estimate.', policyCode: 'LOWEST_RECORDED_UPFRONT_COST' },
      attributes: [{ label: 'Estimated cost', value: '$650', tone: 'POSITIVE' }],
      actions: [{ id: 'review-repair', label: 'Review repair', message: 'Review the repair option', operationId: 'REPLACEMENT_GUIDANCE', interactionType: 'START_WORKFLOW', style: 'PRIMARY' }],
    },
    { id: 'replace', label: 'Replace', summary: 'Install a comparable new unit.', attributes: [{ label: 'Estimated cost', value: '$2,400', tone: 'CAUTION' }], actions: [] },
    { id: 'monitor', label: 'Monitor', summary: 'Defer work and watch condition.', attributes: [{ label: 'Estimated cost', value: '$0 now', tone: 'DEFAULT' }], actions: [] },
  ],
  actions: [],
};

function execution(): AskExecutionResponse {
  return {
    sessionId: 'comparison-session', executionId: 'comparison-execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'comparison-result', revision: 1, domainScopePhrase: null, dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
    blocks: [block], updatedAt: '2026-09-18T12:00:00.000Z',
  } as AskExecutionResponse;
}

function Harness() {
  const response = useMemo(() => execution(), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <ComparisonStripBlock block={block} renderAction={(action) => <button type="button">{action.label}</button>} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('renders bounded options, declared badge provenance and option-scoped actions', async () => {
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.getByRole('list', { name: 'Compare your options options' })).toHaveAttribute('data-comparison-presentation', 'strip');
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Lowest upfront cost')).toHaveAttribute('data-badge-policy', 'LOWEST_RECORDED_UPFRONT_COST');
  fireEvent.click(screen.getByText('Why this label'));
  expect(screen.getByText('The recorded repair estimate is lower than the replacement estimate.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review repair' })).toBeVisible();
  expect(screen.getByText('positive')).toBeVisible();
});

test('two options use a non-carousel grid while an explicit choice controls larger sets', () => {
  const pair = { ...block, options: block.options.slice(0, 2) };
  expect(resolveAdaptiveComparisonPresentation(pair, 'AUTO')).toEqual({ layout: 'GRID', choices: ['GRID', 'TABLE'], reason: 'SMALL_SET' });
  // A strip choice saved on a larger result never turns a pair into a carousel; the table is still offered.
  expect(resolveAdaptiveComparisonPresentation(pair, 'STRIP')).toEqual({ layout: 'GRID', choices: ['GRID', 'TABLE'], reason: 'SMALL_SET' });
  expect(resolveAdaptiveComparisonPresentation(pair, 'TABLE')).toEqual({ layout: 'TABLE', choices: ['GRID', 'TABLE'], reason: 'USER_CHOICE' });
  expect(resolveAdaptiveComparisonPresentation(block, 'AUTO')).toEqual({ layout: 'STRIP', choices: ['AUTO', 'STRIP', 'GRID', 'TABLE'], reason: 'BOUNDED_ALTERNATIVES' });
  expect(resolveAdaptiveComparisonPresentation(block, 'GRID')).toEqual({ layout: 'GRID', choices: ['AUTO', 'STRIP', 'GRID', 'TABLE'], reason: 'USER_CHOICE' });
});

test('offers a persisted non-carousel path without issuing another response', async () => {
  const firstRender = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show all' })).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(screen.getByRole('button', { name: 'Show all' })).toHaveAttribute('aria-pressed', 'true');
  expect(firstRender.container.querySelector('[data-comparison-presentation="grid"]')).toBeInTheDocument();
  expect(readResultView(window.sessionStorage, resultViewKey('comparison-session', 'home', 'comparison-result')).comparisonLayouts['repair-options']).toBe('GRID');

  firstRender.unmount();
  render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show all' })).toHaveAttribute('aria-pressed', 'true'));
});

test('exposes visible keyboard-operable strip controls and position context', async () => {
  render(<Harness />);
  await waitFor(() => expect(screen.getByText(/Option 1 of 3/)).toBeVisible());
  const next = screen.getByRole('button', { name: 'Next option in Compare your options' });
  fireEvent.click(next);
  expect(screen.getByText(/Option 2 of 3/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous option in Compare your options' })).not.toBeDisabled();
});
