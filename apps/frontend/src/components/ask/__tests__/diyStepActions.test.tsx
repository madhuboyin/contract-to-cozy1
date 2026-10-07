import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Step 6, slice 6b of docs/architecture/ASK_COZY_DIY_STEP_COMMANDS_PLAN.md: the step actions on the guide card launch the declared command with exactly the producer's
// fields; the guide heading is where focus lands when the card refreshes in place; the progress sentence is a polite status. Jest component tests only: no browser ran
// here, so real-browser focus and screen-reader behavior are unverified.
const AS_OF = '2026-10-06T12:00:00.000Z';
const stepAction = (key: 'COMPLETE' | 'SKIP', stepId: string) => ({
  id: key === 'COMPLETE' ? 'diy-step-complete' : 'diy-step-skip', label: key === 'COMPLETE' ? 'Mark this step done' : 'Skip this step', interactionType: 'START_WORKFLOW',
  message: key === 'COMPLETE' ? 'Mark this step done.' : 'Skip this step.', operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: stepId, actionId: key,
  style: key === 'COMPLETE' ? 'PRIMARY' : 'QUIET',
});
const open = { id: 'open-diy-project', label: 'Open this project', href: '/dashboard/diy/projects/p1?propertyId=home', style: 'SECONDARY' };
const outlineAt = (current: number) => [1, 2, 3, 4].map((n) => ({ stepId: `s${n}`, title: `Step title ${n}`, state: n < current ? 'DONE' : n === current ? 'CURRENT' : 'UPCOMING', optional: n >= 3 }));
const guide = (current: number, overrides: Record<string, unknown> = {}) => ({
  type: 'TASK_GUIDE', id: 'diy-project-guide', title: 'Repaint the hallway', summary: `Step ${current} of 4`,
  eyebrow: ['Painting', 'Reviewed guide'], icon: 'TASK', chips: [], tip: { title: 'Tip', body: 'Press the tape edge down firmly.' },
  main: { title: `Step title ${current}`, body: 'Do the thing.', facts: [] }, history: [], notes: [],
  actions: [stepAction('COMPLETE', `s${current}`), ...(current === 3 ? [stepAction('SKIP', 's3')] : []), open],
  progress: { current, total: 4, completed: current - 1, skipped: 0, label: `Step ${current} of 4, ${current - 1} done`, asOf: AS_OF },
  outline: outlineAt(current), ...overrides,
} as unknown as AskPresentationBlock);

const execution = (blocks: AskPresentationBlock[], updatedAt = '2026-10-06T12:00:00.000Z'): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-guide', question: 'Guide me through this project.', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-06T12:00:00.000Z', updatedAt, viewState: null, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entityType: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

const props = (ask: jest.Mock, justUpdated: string | null) => ({
  isSuperseded: false, justUpdatedExecutionId: justUpdated, updateExecution: jest.fn(), loading: false, ask, selectedPropertyId: 'home', setInput: jest.fn(), visibleSuggestions: [],
  activeSessionRef: { current: 'session' }, refreshResult: jest.fn(), refreshPending: false, onAccessLost: jest.fn(), contextOpen: false, onOpenContext: jest.fn(),
});
const card = (exec: AskExecutionResponse, ask = jest.fn(), justUpdated: string | null = null) => ({ ask, ...render(<ExecutionCard execution={exec} {...props(ask, justUpdated)} />) });
const rerenderCard = (view: ReturnType<typeof card>, exec: AskExecutionResponse, justUpdated: string | null) => view.rerender(<ExecutionCard execution={exec} {...props(view.ask, justUpdated)} />);
const article = (view: { container: HTMLElement }) => view.container.querySelector('[data-task-guide]') as HTMLElement;
const heading = (view: { container: HTMLElement }) => view.container.querySelector('[data-task-guide-heading]') as HTMLElement;

describe('the step actions on the guide card', () => {
  it('render as buttons in the declared styles beside the page link, and each launches exactly the declared command', () => {
    const view = card(execution([guide(3)]));
    const done = screen.getByRole('button', { name: /Mark this step done/ });
    const skip = screen.getByRole('button', { name: /Skip this step/ });
    expect(done.className).toMatch(/bg-teal-700/);          // PRIMARY
    expect(skip.className).not.toMatch(/bg-teal-700/);      // QUIET is not a filled button
    expect(within(article(view)).getByRole('link', { name: /Open this project/ })).toHaveAttribute('href', '/dashboard/diy/projects/p1?propertyId=home');
    fireEvent.click(done);
    expect(view.ask).toHaveBeenLastCalledWith('Mark this step done.', undefined, expect.objectContaining({
      sourceExecutionId: 'exec-guide', operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: 's3', actionId: 'COMPLETE',
    }));
    fireEvent.click(skip);
    expect(view.ask).toHaveBeenLastCalledWith('Skip this step.', undefined, expect.objectContaining({ operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: 's3', actionId: 'SKIP' }));
    expect(view.ask).toHaveBeenCalledTimes(2);
  });

  it('a card without the actions (a viewer, a withdrawn guide) shows only the page link, and no control that changes the project', () => {
    const view = card(execution([guide(2, { actions: [open] })]));
    expect(screen.queryByRole('button', { name: /Mark this step done|Skip this step/ })).toBeNull();
    expect(within(article(view)).getByRole('link', { name: /Open this project/ })).toBeInTheDocument();
  });

  it('are disabled, not hidden, while another request is loading', () => {
    const exec = execution([guide(1)]);
    const ask = jest.fn();
    render(<ExecutionCard execution={exec} {...props(ask, null)} loading />);
    expect(screen.getByRole('button', { name: /Mark this step done/ })).toBeDisabled();
  });
});

describe('the guide heading and the progress status', () => {
  it('in a stepped guide the heading is programmatically focusable (not a tab stop) and the progress is a polite status', () => {
    const view = card(execution([guide(2)]));
    expect(heading(view)).toHaveTextContent('Repaint the hallway');
    expect(heading(view)).toHaveAttribute('tabindex', '-1');
    const status = article(view).querySelector('[data-task-guide-progress]') as HTMLElement;
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveTextContent('Step 2 of 4, 1 done');
  });

  it('a task guide without an outline (the seasonal guide) is unchanged: no focus marker, no status role', () => {
    const view = card(execution([guide(2, { outline: undefined, progress: undefined })]));
    expect(heading(view)).toBeNull();
    expect(article(view).querySelector('h3')).not.toHaveAttribute('tabindex');
    expect(article(view).querySelector('[role="status"]')).toBeNull();
  });

  it('a refresh that moves the position changes what the status says (the new position is announced)', () => {
    const view = card(execution([guide(2)]), jest.fn(), 'exec-guide');
    expect(article(view).querySelector('[data-task-guide-progress]')).toHaveTextContent('Step 2 of 4, 1 done');
    rerenderCard(view, execution([guide(3)], '2026-10-06T12:05:00.000Z'), 'exec-guide');
    expect(article(view).querySelector('[data-task-guide-progress]')).toHaveTextContent('Step 3 of 4, 2 done');
    expect(article(view).querySelector('[aria-current="step"]')).toHaveTextContent('Step title 3');
  });
});

describe('focus when the guide updates in place', () => {
  it('moves to the guide heading when a just-updated guide settles, and again when a refresh moves the position', () => {
    const view = card(execution([guide(2)]), jest.fn(), 'exec-guide');
    expect(document.activeElement).toBe(heading(view));
    (document.activeElement as HTMLElement).blur();
    rerenderCard(view, execution([guide(3)], '2026-10-06T12:05:00.000Z'), 'exec-guide');
    expect(document.activeElement).toBe(heading(view));
    expect(document.activeElement).toHaveTextContent('Repaint the hallway');
  });

  it('does not move when the guide is not the just-updated execution, or when nothing about the execution changed (opening the tip)', () => {
    const quiet = card(execution([guide(2)]), jest.fn(), null);
    expect(document.activeElement).not.toBe(heading(quiet));
    quiet.unmount();
    const view = card(execution([guide(2)]), jest.fn(), 'exec-guide');
    const tip = screen.getByRole('button', { name: /Show tip/ });
    tip.focus();
    fireEvent.click(tip);
    expect(screen.getByRole('button', { name: /Hide tip/ })).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(tip);
    expect(document.activeElement).not.toBe(heading(view));
  });

  it('does not move again when the parent re-renders with the same execution (an unchanged refresh)', () => {
    const exec = execution([guide(2)]);
    const view = card(exec, jest.fn(), 'exec-guide');
    expect(document.activeElement).toBe(heading(view));
    const done = screen.getByRole('button', { name: /Mark this step done/ });
    done.focus();
    rerenderCard(view, execution([guide(2)]), 'exec-guide'); // same status, same updatedAt
    expect(document.activeElement).toBe(done);
  });

  it('does not take focus for an execution that is not a stepped guide', () => {
    const view = card(execution([guide(2, { outline: undefined, progress: undefined })]), jest.fn(), 'exec-guide');
    expect(heading(view)).toBeNull();
    expect(document.activeElement?.tagName).not.toBe('H3');
  });
});
