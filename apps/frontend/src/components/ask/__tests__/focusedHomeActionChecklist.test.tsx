import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Home Action focused-guidance CTA fix, Group B health-factor checklist slice (gap audit §17;
// FRD v1.157+). askFocusedGuidance.ts now adds a `checklist` section to the
// `focused-home-action-guidance` block for health-insight actions like the reported
// "See age-related checklist" case. This block has its own special-cased renderer
// (GroupedListBlock.tsx) that only looks up sections by a fixed set of ids -- guards against
// that renderer silently dropping the new section the way it would any id it doesn't know.

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const block: GroupedList = {
  type: 'GROUPED_LIST',
  id: 'focused-home-action-guidance',
  title: 'What to do next',
  description: 'Guidance for the Home Action you selected.',
  filters: [],
  sections: [
    { id: 'next-step', title: 'Recommended next step', count: 1, items: [{ id: 'primary', title: 'Book a general home inspection', description: 'Age-related wear is worth a look.', meta: ['medium confidence'] }] },
    { id: 'why-it-matters', title: 'Why this matters', count: 1, items: [{ id: 'why', title: 'Age Factor', description: 'Older homes accumulate small deferred-maintenance items.', meta: [] }] },
    { id: 'checklist', title: 'Age-related checklist', count: 2, items: [
      { id: 'item-1', title: 'HVAC', description: 'Get a service inspection.', condition: 'Your HVAC is 12 years old. Typical lifespan is 15–20 years.', meta: ['Review soon'] },
      { id: 'item-2', title: 'Plumbing', description: 'Have a plumber identify your pipe material.', condition: 'Homes built 1978–1995 may have polybutylene pipes.', meta: ['Act now'] },
    ] },
  ],
  actions: [],
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

test('the checklist section renders inline alongside the existing next-step and why-it-matters content', () => {
  render(<Harness />);
  expect(screen.getByText('Age-related checklist')).toBeInTheDocument();
  expect(screen.getByText('HVAC')).toBeInTheDocument();
  expect(screen.getByText('Plumbing')).toBeInTheDocument();
  expect(screen.getByText('Review soon')).toBeInTheDocument();
  expect(screen.getByText('Act now')).toBeInTheDocument();
  expect(screen.getByText(/Your HVAC is 12 years old/)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Age-related checklist' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Current condition' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Recommended action' })).toBeInTheDocument();
  // Existing sections are unaffected by the addition.
  expect(screen.getByText('Book a general home inspection')).toBeInTheDocument();
  expect(screen.queryByText(/Older homes accumulate/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View details' }));
  expect(screen.getByText(/Older homes accumulate/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('button', { name: /Close details/ })).not.toBeInTheDocument();
  // No redundant CTA back to the page whose content is already inline.
  expect(screen.queryByRole('link', { name: /See age-related checklist/ })).not.toBeInTheDocument();
});
