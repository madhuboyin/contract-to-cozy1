import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Slice 4b of docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md: the page tells the person what happened (or could not happen) because the linked
// maintenance task was completed elsewhere: updating, needs review (asking them to review and confirm), needs attention with "Finish updating", and closed
// by the task. It never promises a time, polls a bounded number of times while updating, and leaves the project's own controls in place.
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj-1' }),
  useSearchParams: () => new URLSearchParams('propertyId=prop-1'),
  useRouter: () => ({ push: jest.fn() }),
}));
const mockAccess = { canWrite: true, isViewer: false, isLoading: false };
jest.mock('@/lib/property/usePropertyWriteAccess', () => ({ usePropertyWriteAccess: () => mockAccess }));
const api = { getDiyProject: jest.fn(), retryDiyTaskReconciliation: jest.fn(), retryDiyCompletionEffects: jest.fn(), updateDiyProjectStep: jest.fn(), abandonDiyProject: jest.fn(), completeDiyProject: jest.fn() };
jest.mock('@/lib/api/client', () => ({ api }));

import ProjectTrackerPage from '../projects/[id]/page';

const REVIEW = "Your linked task was marked complete, but not from this project, and we can't tell whether you did the work or hired someone, so this project is still open. Review the project and confirm whether you completed the work or hired a professional.";
const link = (state: string, summary: string, canRecover = false) => ({ state, summary, canRecover });
const step = { id: 's1', stepNumber: 1, title: 'Task 1', description: 'x', status: 'PENDING', isOptional: false, updatedAt: '2026-10-06T12:00:00.001Z' };
const project = (taskLink: any, extra: Record<string, unknown> = {}) => ({
  id: 'proj-1', title: 'Replace faucet', category: 'PLUMBING', status: 'IN_PROGRESS', aiGuideId: null, homeEventId: null, updatedAt: '2026-10-06T12:00:00.100Z',
  steps: [step], materials: [], tools: [], completionEffects: null, taskLink, ...extra,
});
const open = async (value: any) => { api.getDiyProject.mockResolvedValue(value); render(<ProjectTrackerPage />); await screen.findByText('Replace faucet'); };

beforeEach(() => { jest.clearAllMocks(); mockAccess.canWrite = true; mockAccess.isViewer = false; api.retryDiyTaskReconciliation.mockResolvedValue({ reset: true, taskLink: link('UPDATING', 'Your linked task was completed. Updating this project.') }); });

describe('the linked task disclosure', () => {
  it('updating: says so, offers no action, promises no time', async () => {
    await open(project(link('UPDATING', 'Your linked task was completed. Updating this project.')));
    expect(document.querySelector('[data-task-link="UPDATING"]')).toHaveTextContent('Your linked task was completed. Updating this project.');
    expect(screen.queryByRole('button', { name: 'Finish updating' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b\d+\s*(seconds?|minutes?)\b/i);
  });

  it('needs review: asks the person to review and confirm (never to "finish it" or "stop it"), and the project\'s own controls stay', async () => {
    await open(project(link('NEEDS_REVIEW', REVIEW)));
    const panel = document.querySelector('[data-task-link="NEEDS_REVIEW"]')!;
    expect(panel).toHaveTextContent('Review the project and confirm whether you completed the work or hired a professional.');
    expect(panel.textContent).not.toMatch(/finish it|stop it/i);
    expect(screen.queryByRole('button', { name: 'Finish updating' })).toBeNull();
    expect(screen.getByText(/hire a pro instead/i)).toBeInTheDocument();
  });

  it('needs attention: shows the message and a "Finish updating" action that re-queues and reloads', async () => {
    await open(project(link('NEEDS_ATTENTION', 'Some updates from your linked task could not be applied.', true)));
    fireEvent.click(screen.getByRole('button', { name: 'Finish updating' }));
    await waitFor(() => expect(api.retryDiyTaskReconciliation).toHaveBeenCalledWith('prop-1', 'proj-1'));
    await waitFor(() => expect(api.getDiyProject).toHaveBeenCalledTimes(2));
  });

  it('a viewer sees the message but not the action; a failed recovery shows its error', async () => {
    mockAccess.canWrite = false; mockAccess.isViewer = true;
    await open(project(link('NEEDS_ATTENTION', 'Some updates from your linked task could not be applied.', true)));
    expect(screen.getByText('Some updates from your linked task could not be applied.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish updating' })).toBeNull();
  });

  it('a failed recovery shows the error and stays on the page', async () => {
    api.retryDiyTaskReconciliation.mockRejectedValue(new Error('You do not have access to change this project.'));
    await open(project(link('NEEDS_ATTENTION', 'Some updates from your linked task could not be applied.', true)));
    fireEvent.click(screen.getByRole('button', { name: 'Finish updating' }));
    expect(await screen.findByText('You do not have access to change this project.')).toBeInTheDocument();
  });

  it('closed by the task: says so; a project closed this way shows no "recording" panel and no incident-style legacy copy', async () => {
    await open(project(link('CLOSED_BY_TASK', 'Closed because your linked task was completed.'), { status: 'COMPLETED', completionEffects: null }));
    expect(document.querySelector('[data-task-link="CLOSED_BY_TASK"]')).toHaveTextContent('Closed because your linked task was completed.');
    expect(document.querySelector('[data-completion-effects]')).toBeNull();
    await act(async () => { await Promise.resolve(); });
  });

  it('nothing to say: no panel', async () => {
    await open(project(null));
    expect(document.querySelector('[data-task-link]')).toBeNull();
  });
});

describe('polling while updating', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const tick = async (ms = 10_000) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };

  it('looks again while updating, stops once the state changes, and is bounded', async () => {
    api.getDiyProject.mockResolvedValue(project(link('UPDATING', 'Your linked task was completed. Updating this project.')));
    render(<ProjectTrackerPage />);
    await act(async () => { await Promise.resolve(); });
    for (let i = 0; i < 3; i += 1) await tick();
    expect(api.getDiyProject.mock.calls.length).toBe(4);
    api.getDiyProject.mockResolvedValue(project(link('CLOSED_BY_TASK', 'Closed because a pro completed your linked task.'), { status: 'HIRED_OUT' }));
    await tick();
    const settled = api.getDiyProject.mock.calls.length;
    await tick(60_000);
    expect(api.getDiyProject.mock.calls.length).toBe(settled);
  });

  it('gives up after a bounded number of looks', async () => {
    api.getDiyProject.mockResolvedValue(project(link('UPDATING', 'Your linked task was completed. Updating this project.')));
    render(<ProjectTrackerPage />);
    await act(async () => { await Promise.resolve(); });
    for (let i = 0; i < 40; i += 1) await tick();
    expect(api.getDiyProject.mock.calls.length).toBe(13);
  });
});
