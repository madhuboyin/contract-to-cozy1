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

// ---- Step 7A: the previous-step view, "Review last step" and Reopen ---------------------------------------------------------------------------------------
const wf = (id: string, label: string, message: string, operationId: string, entityType: string, entityId: string, actionId?: string, style = 'SECONDARY') => ({
  id, label, interactionType: 'START_WORKFLOW', message, operationId, entityType, entityId, ...(actionId ? { actionId } : {}), style,
});
const previousView = (overrides: Record<string, unknown> = {}) => ({
  type: 'TASK_GUIDE', id: 'diy-project-guide', title: 'Repaint the hallway', summary: 'Looking back at step 1 of 4, done. You are on step 3.',
  eyebrow: ['Painting', 'Reviewed guide', 'Earlier step'], icon: 'TASK', chips: [{ label: 'Done', kind: 'STATUS' }], tip: null,
  main: { title: 'Tape the trim', body: 'Apply painter tape.', facts: [{ label: 'This step', value: 'Required' }] }, history: [], notes: [],
  actions: [
    wf('diy-step-reopen', 'Reopen this step', 'Reopen this step.', 'DIY_STEP_UPDATE', 'DIY_STEP', 's1', 'REOPEN'),
    wf('diy-step-previous', 'Previous step', 'Show the previous step.', 'DIY_PROJECT_GUIDE', 'DIY_STEP', 's0', 'VIEW'),
    wf('diy-step-back', 'Back to step 3', 'Back to the guide.', 'DIY_PROJECT_GUIDE', 'DIY_PROJECT', 'p1'),
    open,
  ],
  progress: { current: 1, total: 4, completed: 2, skipped: 0, label: 'Looking back at step 1 of 4, done. You are on step 3.', asOf: AS_OF },
  outline: outlineAt(3), ...overrides,
} as unknown as AskPresentationBlock);

describe('the previous-step view and Reopen', () => {
  it('renders the looked-back-at step with its state and the producer\'s label, and keeps marking the REAL current step', () => {
    const view = card(execution([previousView()]));
    expect(article(view)).toHaveTextContent('Looking back at step 1 of 4, done. You are on step 3.');
    expect(article(view)).toHaveTextContent('Earlier step');
    expect(article(view)).toHaveTextContent('Tape the trim');
    expect(article(view).querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(article(view).querySelector('[aria-current="step"]')).toHaveTextContent('Step title 3');
  });

  it('Reopen, Previous step and Back each launch exactly the declared command', () => {
    const view = card(execution([previousView()]));
    fireEvent.click(screen.getByRole('button', { name: /Reopen this step/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Reopen this step.', undefined, expect.objectContaining({ sourceExecutionId: 'exec-guide', operationId: 'DIY_STEP_UPDATE', entityType: 'DIY_STEP', entityId: 's1', actionId: 'REOPEN' }));
    fireEvent.click(screen.getByRole('button', { name: /Previous step/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Show the previous step.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_STEP', entityId: 's0', actionId: 'VIEW' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to step 3/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Back to the guide.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: 'p1' }));
    expect(view.ask).toHaveBeenCalledTimes(3);
  });

  it('a view without Reopen (a viewer, a withdrawn guide) shows only the read actions and the page link', () => {
    card(execution([previousView({ actions: [wf('diy-step-back', 'Back to step 3', 'Back to the guide.', 'DIY_PROJECT_GUIDE', 'DIY_PROJECT', 'p1'), open] })]));
    expect(screen.queryByRole('button', { name: /Reopen this step/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Back to step 3/ })).toBeInTheDocument();
  });

  it('focus lands on the guide heading when the view replaces the live guide in place, and the status announces the new label', () => {
    const view = card(execution([guide(3)]), jest.fn(), 'exec-guide');
    expect(article(view).querySelector('[data-task-guide-progress]')).toHaveTextContent('Step 3 of 4, 2 done');
    (document.activeElement as HTMLElement).blur();
    rerenderCard(view, execution([previousView()], '2026-10-06T12:05:00.000Z'), 'exec-guide');
    expect(article(view).querySelector('[data-task-guide-progress]')).toHaveTextContent('Looking back at step 1 of 4, done.');
    expect(document.activeElement).toBe(heading(view));
  });
});

// ---- Step 7B: Finish, and the stop-or-hand-off options -------------------------------------------------------------------------------------------------------
describe('finish, stop and hand off', () => {
  // The all-resolved state and the options are TASK_GUIDE cards (every action renders). A SUMMARY would show only its FIRST action in the calm shell (IW-CONV-002), which would
  // hide Review last step, Hand off and Back: a regression test below pins that, so these surfaces are never moved back to a SUMMARY.
  const resolvedCard = (actions: unknown[]) => guide(4, {
    summary: 'All 4 steps resolved, 3 done, 1 skipped', progress: { current: 4, total: 4, completed: 3, skipped: 1, label: 'All 4 steps resolved, 3 done, 1 skipped', asOf: AS_OF },
    main: { title: 'Every step is resolved', body: 'You can finish the project here, or on the project page.', facts: [] }, tip: null,
    outline: [1, 2, 3, 4].map((n) => ({ stepId: `s${n}`, title: `Step title ${n}`, state: n === 3 ? 'SKIPPED' : 'DONE', optional: false })), actions,
  });
  const allResolvedActions = [
    wf('diy-project-finish', 'Finish this project', 'Finish this project.', 'DIY_PROJECT_COMPLETE', 'DIY_PROJECT', 'p1', 'COMPLETE', 'PRIMARY'),
    wf('diy-review-last-step', 'Review last step', 'Review the last step.', 'DIY_PROJECT_GUIDE', 'DIY_STEP', 's4', 'VIEW'), open,
  ];
  const optionsCard = (actions: unknown[]) => guide(2, {
    summary: 'Stop or hand off this project', eyebrow: ['Painting', 'Reviewed guide', 'Stop or hand off'], tip: null,
    main: { title: 'What each choice does', body: 'Stopping marks the project as stopped. Handing off marks it as handed to a professional; it does not book or contact anyone. Neither can be undone in Cozy.', facts: [] }, actions,
  });
  const optionActions = [
    wf('diy-project-stop', 'Stop this project', 'Stop this project.', 'DIY_PROJECT_ABANDON', 'DIY_PROJECT', 'p1', 'STOP'),
    wf('diy-project-handoff', 'Hand this off to a pro', 'Hand this off to a pro.', 'DIY_PROJECT_ABANDON', 'DIY_PROJECT', 'p1', 'HAND_OFF'),
    wf('diy-step-back', 'Back to the guide', 'Back to the guide.', 'DIY_PROJECT_GUIDE', 'DIY_PROJECT', 'p1'),
  ];

  it('Finish is the filled button on the all-resolved card, every action renders, and Finish launches exactly the declared command', () => {
    const view = card(execution([resolvedCard(allResolvedActions)]));
    const finish = screen.getByRole('button', { name: /Finish this project/ });
    expect(finish.className).toMatch(/bg-teal-700/);
    expect(screen.getByRole('button', { name: /Review last step/ })).toBeInTheDocument();
    expect(within(article(view)).getByRole('link', { name: /Open this project/ })).toBeInTheDocument();
    fireEvent.click(finish);
    expect(view.ask).toHaveBeenLastCalledWith('Finish this project.', undefined, expect.objectContaining({ sourceExecutionId: 'exec-guide', operationId: 'DIY_PROJECT_COMPLETE', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'COMPLETE' }));
    expect(view.ask).toHaveBeenCalledTimes(1);
  });

  it('a card without Finish (a viewer, a withdrawn guide) shows only the read action and the page link', () => {
    card(execution([resolvedCard(allResolvedActions.slice(1))]));
    expect(screen.queryByRole('button', { name: /Finish this project/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Review last step/ })).toBeInTheDocument();
  });

  it('the options card states that neither can be undone, none of the buttons is filled, ALL THREE render, and each launches exactly its declared command', () => {
    const view = card(execution([optionsCard(optionActions)]));
    expect(screen.getByText(/Neither can be undone in Cozy/)).toBeInTheDocument();
    for (const name of [/Stop this project/, /Hand this off to a pro/, /Back to the guide/]) expect(screen.getByRole('button', { name }).className).not.toMatch(/bg-teal-700/);
    fireEvent.click(screen.getByRole('button', { name: /Stop this project/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Stop this project.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_ABANDON', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'STOP' }));
    fireEvent.click(screen.getByRole('button', { name: /Hand this off to a pro/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Hand this off to a pro.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_ABANDON', actionId: 'HAND_OFF' }));
    fireEvent.click(screen.getByRole('button', { name: /Back to the guide/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Back to the guide.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: 'p1' }));
    expect(view.ask).toHaveBeenCalledTimes(3);
  });

  it('REGRESSION PIN: the calm shell shows only the FIRST action of a SUMMARY, so these surfaces must stay TASK_GUIDE cards', () => {
    const summary = { type: 'SUMMARY', id: 'x-summary', title: 'Options', body: 'Body', tone: 'CAUTION', actions: optionActions } as unknown as AskPresentationBlock;
    card(execution([summary]));
    expect(screen.queryByRole('button', { name: /Hand this off to a pro/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Back to the guide/ })).toBeNull();
  });

  it('the current-step card carries "Stop or hand off" as a quiet button, never Stop or Hand off themselves', () => {
    const more = wf('diy-project-more', 'Stop or hand off', 'Show the options to stop or hand off this project.', 'DIY_PROJECT_GUIDE', 'DIY_PROJECT', 'p1', 'MORE', 'QUIET');
    const view = card(execution([guide(2, { actions: [stepAction('COMPLETE', 's2'), more, open] })]));
    const button = screen.getByRole('button', { name: /Stop or hand off/ });
    expect(button.className).not.toMatch(/bg-teal-700/);
    expect(screen.queryByRole('button', { name: /^Stop this project/ })).toBeNull();
    fireEvent.click(button);
    expect(view.ask).toHaveBeenLastCalledWith('Show the options to stop or hand off this project.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', actionId: 'MORE' }));
  });
});

// ---- Step 7C: the finished-project view and recovery --------------------------------------------------------------------------------------------------------
describe('finished project and recovery', () => {
  const finished = (actions: unknown[], body = 'Some records could not be updated. You can still add time, cost and notes on the project page.') => guide(4, {
    summary: 'Finished, 3 of 4 steps done, 1 skipped', eyebrow: ['Painting', 'Finished'], tip: null,
    main: { title: 'This project is finished', body, facts: [] },
    progress: { current: 4, total: 4, completed: 3, skipped: 1, label: 'Finished, 3 of 4 steps done, 1 skipped', asOf: AS_OF },
    outline: [1, 2, 3, 4].map((n) => ({ stepId: `s${n}`, title: `Step title ${n}`, state: n === 3 ? 'SKIPPED' : 'DONE', optional: false })), actions,
  });
  const recover = wf('diy-record-again', 'Record my completion again', 'Record my completion again.', 'DIY_COMPLETION_RECOVER', 'DIY_PROJECT', 'p1', 'COMPLETION_EFFECTS');

  it('shows the status in words with the recovery action and the page link, and launches exactly the declared command', () => {
    const view = card(execution([finished([recover, open])]));
    expect(article(view)).toHaveTextContent('Some records could not be updated.');
    expect(article(view).querySelectorAll('[aria-current="step"]')).toHaveLength(0);
    expect(within(article(view)).getByRole('link', { name: /Open this project/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Record my completion again/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Record my completion again.', undefined, expect.objectContaining({ sourceExecutionId: 'exec-guide', operationId: 'DIY_COMPLETION_RECOVER', entityType: 'DIY_PROJECT', entityId: 'p1', actionId: 'COMPLETION_EFFECTS' }));
    expect(view.ask).toHaveBeenCalledTimes(1);
  });

  it('a finished card without the action (recorded, still recording, a viewer) offers only the page link', () => {
    card(execution([finished([open], 'Completion recorded. You can still add time, cost and notes on the project page.')]));
    expect(screen.queryByRole('button', { name: /Record my completion again/ })).toBeNull();
  });

  it('the task-link failure is a caution block with its own action above the guide, and launches the task recovery', () => {
    const block = { type: 'BOUNDARY', id: 'diy-task-link', title: 'Your linked task did not update', body: 'The linked maintenance task was completed, but this project was not updated.', severity: 'CAUTION', suggestions: [],
      actions: [wf('diy-task-record-again', 'Update my linked task again', 'Update my linked task again.', 'DIY_COMPLETION_RECOVER', 'DIY_PROJECT', 'p1', 'TASK_LINK')] } as unknown as AskPresentationBlock;
    const view = card(execution([block, guide(2)]));
    fireEvent.click(screen.getByRole('button', { name: /Update my linked task again/ }));
    expect(view.ask).toHaveBeenLastCalledWith('Update my linked task again.', undefined, expect.objectContaining({ operationId: 'DIY_COMPLETION_RECOVER', entityType: 'DIY_PROJECT', actionId: 'TASK_LINK' }));
  });
});
