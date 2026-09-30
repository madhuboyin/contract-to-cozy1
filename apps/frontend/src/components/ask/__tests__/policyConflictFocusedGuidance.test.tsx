import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useMemo } from 'react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// FRD v1.171: a policy-fact conflict is resolved inside the focused Home Action answer. This renderer keys on fixed
// section ids, so a section it does not know is silently dropped (the same guard the checklist test provides).

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const action = (id: string, label: string, message: string, style: 'PRIMARY' | 'SECONDARY') =>
  ({ id, label, message, style, interactionType: 'MUTATE_RECORD' as const, operationId: 'DOCUMENT_PROMOTION_CONFIRM' });

function block(withActions: boolean): GroupedList {
  return {
    type: 'GROUPED_LIST',
    id: 'focused-home-action-guidance',
    title: 'What to do next',
    description: 'Guidance for the Home Action you selected.',
    filters: [],
    sections: [
      { id: 'next-step', title: 'Recommended next step', count: 1, items: [{ id: 'primary', title: 'Review the newly extracted details', description: 'Confirm which value is correct.', meta: [] }] },
      { id: 'policy-conflicts', title: 'Conflicting policy details', count: 2, items: [
        {
          id: 'fact-p1', title: 'Annual premium', description: 'Newly extracted: $2,100. Currently confirmed: $1,800.', meta: ['Acme Insurance'], entityType: 'INSURANCE_POLICY_FACT',
          ...(withActions ? { actions: [action('keep-p1', 'Keep existing', 'Reject this extracted policy value.', 'SECONDARY'), action('use-p1', 'Use extracted value', 'Confirm this extracted policy value.', 'PRIMARY')] } : {}),
        },
        {
          id: 'fact-p2', title: 'Dwelling coverage limit', description: 'Newly extracted: $450,000. Currently confirmed: $400,000.', meta: ['Acme Insurance'], entityType: 'INSURANCE_POLICY_FACT',
          ...(withActions ? { actions: [action('keep-p2', 'Keep existing', 'Reject this extracted policy value.', 'SECONDARY'), action('use-p2', 'Use extracted value', 'Confirm this extracted policy value.', 'PRIMARY')] } : {}),
        },
      ] },
    ],
    actions: withActions ? [] : [{ id: 'home-action-primary-1', label: 'Review conflicting policy details', href: '/dashboard/properties/p1/tools/coverage-intelligence?policyId=policy-1', style: 'PRIMARY' }],
  } as GroupedList;
}

function Harness({ withActions, onItemAction }: { withActions: boolean; onItemAction: (...args: unknown[]) => void }) {
  // Memoized: a new block object per render would hand useResultView a new response each time and loop forever.
  const focused = useMemo(() => block(withActions), [withActions]);
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [focused],
  } as AskExecutionResponse), [focused]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <GenericGroupedListBlock block={focused} executionId="execution" propertyId="home" onItemAction={onItemAction as never} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

test('every conflicting fact renders with both values, never dropped by the fixed-id renderer', () => {
  render(<Harness withActions onItemAction={() => undefined} />);
  expect(screen.getByText('Conflicting policy details')).toBeInTheDocument();
  expect(screen.getByText('Annual premium')).toBeInTheDocument();
  expect(screen.getByText('Dwelling coverage limit')).toBeInTheDocument();
  expect(screen.getByText(/Newly extracted: \$2,100\. Currently confirmed: \$1,800\./)).toBeInTheDocument();
  expect(screen.getAllByText('Acme Insurance')).toHaveLength(2);
  // No redundant round trip to the tool when it is resolved here.
  expect(screen.queryByRole('link', { name: /Review conflicting policy details/ })).not.toBeInTheDocument();
});

test('Keep existing and Use extracted value dispatch the exact fact, message and confirmation-gated operation', () => {
  const onItemAction = jest.fn();
  render(<Harness withActions onItemAction={onItemAction} />);
  const useButtons = screen.getAllByRole('button', { name: 'Use extracted value' });
  const keepButtons = screen.getAllByRole('button', { name: 'Keep existing' });
  expect(useButtons).toHaveLength(2);
  expect(keepButtons).toHaveLength(2);

  fireEvent.click(useButtons[1]);
  expect(onItemAction).toHaveBeenLastCalledWith('INSURANCE_POLICY_FACT', 'fact-p2', 'Confirm this extracted policy value.', 'DOCUMENT_PROMOTION_CONFIRM', 'MUTATE_RECORD');
  fireEvent.click(keepButtons[0]);
  expect(onItemAction).toHaveBeenLastCalledWith('INSURANCE_POLICY_FACT', 'fact-p1', 'Reject this extracted policy value.', 'DOCUMENT_PROMOTION_CONFIRM', 'MUTATE_RECORD');
});

test('a viewer sees the conflict read-only and keeps the exactly-targeted link', () => {
  render(<Harness withActions={false} onItemAction={() => undefined} />);
  expect(screen.getByText('Annual premium')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use extracted value' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Keep existing' })).not.toBeInTheDocument();
  const link = screen.getByRole('link', { name: /Review conflicting policy details/ });
  expect(link.getAttribute('href')).toContain('policyId=policy-1');
});

test('the coverage tool reads policyId from the URL and hands it to the panel that resolves the conflict', () => {
  const source = readFileSync(join(__dirname, '../../../app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/CoverageIntelligenceToolClient.tsx'), 'utf8');
  expect(source).toContain("const requestedPolicyId = searchParams.get('policyId');");
  expect(source).toContain('<PolicyRecordReadinessPanel propertyId={propertyId} policyId={requestedPolicyId} />');
});
