import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Minimal UI stubs ─────────────────────────────────────────────────────────
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, ...rest }: any) => (
    <input value={value} onChange={onChange} {...rest} />
  ),
}));
jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, ...rest }: any) => (
    <textarea value={value} onChange={onChange} {...rest} />
  ),
}));
jest.mock('lucide-react', () => ({
  Plus: () => <span>Plus</span>,
  Trash2: () => <span>Trash2</span>,
  Users: () => <span>Users</span>,
  RotateCcw: () => <span>RotateCcw</span>,
}));
jest.mock('@/components/seller-prep/LeadCaptureModal', () => ({ LeadCaptureModal: () => null }));
jest.mock('@/lib/api/client', () => ({ api: { deleteAgentInterview: jest.fn() } }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

import { AgentInterviewGuide } from '../AgentInterviewGuide';

const DEFAULT_QUESTIONS = [
  { id: 'exp', label: 'Experience', question: 'Neighborhood sales last year', default: '5-10 sales (Local average)' },
  { id: 'dom', label: 'Speed', question: 'Avg. days on market', default: '30 days (Market average)' },
  { id: 'list', label: 'Pricing', question: 'List-to-sale price ratio', default: '98% (Standard performance)' },
  { id: 'comm', label: 'Cost', question: 'Commission structure', default: '5-6% (Industry standard)' },
  { id: 'mark', label: 'Marketing', question: 'Photography & Staging', default: 'Professional photos included' },
];

function makeAgent(overrides = {}) {
  return {
    id: 'agent-1',
    agentName: 'Agent 1',
    notes: DEFAULT_QUESTIONS.reduce((acc: any, q) => ({ ...acc, [q.id]: q.default }), {}),
    isDefault: DEFAULT_QUESTIONS.reduce((acc: any, q) => ({ ...acc, [q.id]: true }), {}),
    ...overrides,
  };
}

// ── Bug 1: Agent name editing ─────────────────────────────────────────────────
describe('AgentInterviewGuide — agent name editing (Bug 1)', () => {
  it('updates agentName in state (not notes) when the name input changes', () => {
    const agent = makeAgent();
    const onInterviewsChange = jest.fn();

    render(
      <AgentInterviewGuide
        propertyId="prop-1"
        interviews={[agent]}
        onInterviewsChange={onInterviewsChange}
      />
    );

    // The name input is the one whose value equals agent.agentName
    const nameInput = screen.getByDisplayValue('Agent 1');
    fireEvent.change(nameInput, { target: { value: 'Jane Smith' } });

    expect(onInterviewsChange).toHaveBeenCalledTimes(1);
    const [updatedInterviews] = onInterviewsChange.mock.calls[0];

    // agentName must be updated
    expect(updatedInterviews[0].agentName).toBe('Jane Smith');
    // notes must NOT have been touched
    expect(updatedInterviews[0].notes).toEqual(agent.notes);
  });
});

// ── Bug 2: resetToDefault single dispatch ────────────────────────────────────
describe('AgentInterviewGuide — resetToDefault (Bug 2)', () => {
  it('calls onInterviewsChange exactly once and sets both note value and isDefault flag', () => {
    // Start with a customised value so the Reset button is visible
    const agent = makeAgent({
      notes: { ...DEFAULT_QUESTIONS.reduce((acc: any, q) => ({ ...acc, [q.id]: q.default }), {}), exp: 'Custom value' },
      isDefault: { ...DEFAULT_QUESTIONS.reduce((acc: any, q) => ({ ...acc, [q.id]: true }), {}), exp: false },
    });
    const onInterviewsChange = jest.fn();

    render(
      <AgentInterviewGuide
        propertyId="prop-1"
        interviews={[agent]}
        onInterviewsChange={onInterviewsChange}
      />
    );

    const resetBtn = screen.getByText('Reset');
    fireEvent.click(resetBtn);

    // Must be called exactly once — double-dispatch was the bug
    expect(onInterviewsChange).toHaveBeenCalledTimes(1);

    const [updatedInterviews] = onInterviewsChange.mock.calls[0];
    const updated = updatedInterviews[0];

    // note value restored to default
    expect(updated.notes.exp).toBe('5-10 sales (Local average)');
    // isDefault flag set back to true
    expect(updated.isDefault.exp).toBe(true);
  });
});
