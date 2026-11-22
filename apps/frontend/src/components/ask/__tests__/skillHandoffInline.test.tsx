import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse } from '@/features/ask/types';

// Owner review 2026-11-21: one next step is an inline action ("Next: Review coverage gaps →"), not a large tinted panel with a heading, a button and an implementation explanation.
const execution = () => ({
  sessionId: 'session', executionId: 'execution', question: 'Which claims are open?', status: 'ANSWERED', property: { id: 'home', label: 'Main' }, presentationFamily: null,
  createdAt: '2026-11-21T10:00:00.000Z', updatedAt: '2026-11-21T10:00:00.000Z', viewState: null, captureRequests: [], confirmation: null, clarification: null,
  blocks: [{ type: 'SUMMARY', id: 'a', title: '2 open claims.', body: 'x', tone: 'DEFAULT', actions: [] }],
  skillHandoff: {
    suggestedNextSkillId: 'coverage', suggestedGoal: 'Review coverage gaps', suggestedLabel: 'Review coverage gaps', reasonCodes: ['CLAIMS_OPEN'], contextReferenceIds: [],
    continuity: { propertyId: 'home', sourceEntityType: null, sourceEntityId: null, sourceHomeActionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null, returnDestination: null },
  },
  correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

it('shows the suggested next step as one inline action with no panel, heading or visible explanation', async () => {
  const ask = jest.fn();
  const { container } = render(
    <ExecutionCard execution={execution()} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={ask} selectedPropertyId="home"
      setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
      contextOpen={false} onOpenContext={jest.fn()} />,
  );
  const next = await screen.findByRole('button', { name: /Review coverage gaps/ });
  expect(next).toHaveTextContent('Review coverage gaps →');
  expect(container.querySelector('[data-skill-handoff]')).toHaveTextContent(/^Next:/);
  expect(screen.queryByText('Suggested next step')).toBeNull();
  expect(container.querySelector('[data-skill-handoff]')?.className).not.toMatch(/bg-teal-50|border-teal-200|rounded-2xl/);
  // The access-and-context note is kept for assistive technology, not drawn.
  expect(screen.getByText(/check access, availability, and current home context/).className).toContain('sr-only');
  next.click();
  expect(ask).toHaveBeenCalledTimes(1);
});
