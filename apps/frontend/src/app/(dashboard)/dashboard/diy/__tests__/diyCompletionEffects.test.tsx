import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

// Slice 3b of docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md: the page tells the person what is happening to the records that follow a completion
// (recording, recorded, needs attention with a "Finish recording" action, legacy unknown), never promises a time, polls a bounded number of times while
// recording, and says an incident-linked completion did not change the incident.
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj-1' }),
  useSearchParams: () => new URLSearchParams('propertyId=prop-1'),
  useRouter: () => ({ push: jest.fn() }),
}));
const mockAccess = { canWrite: true, isViewer: false, isLoading: false };
jest.mock('@/lib/property/usePropertyWriteAccess', () => ({ usePropertyWriteAccess: () => mockAccess }));
const api = { getDiyProject: jest.fn(), retryDiyCompletionEffects: jest.fn(), updateDiyProjectStep: jest.fn(), abandonDiyProject: jest.fn(), completeDiyProject: jest.fn() };
jest.mock('@/lib/api/client', () => ({ api }));

import ProjectTrackerPage from '../projects/[id]/page';

const effects = (state: string, canRecover = false) => ({
  state, canRecover,
  summary: ({
    RECORDING: 'Recording your completion.', RECORDED: 'Completion recorded.', NEEDS_ATTENTION: 'Some records could not be updated.',
    LEGACY_UNKNOWN: 'Completion was recorded before effect tracking was added. Related record updates are not verified here.',
  } as Record<string, string>)[state],
});
const completed = (state: string | null, extra: Record<string, unknown> = {}) => ({
  id: 'proj-1', title: 'Replace faucet', category: 'PLUMBING', status: 'COMPLETED', aiGuideId: null, homeEventId: null, updatedAt: '2026-10-06T12:00:00.100Z', steps: [], materials: [], tools: [],
  completionEffects: state ? effects(state, state === 'NEEDS_ATTENTION') : null, ...extra,
});
const open = async (value: any) => { api.getDiyProject.mockResolvedValue(value); render(<ProjectTrackerPage />); await screen.findByText('Replace faucet'); };

beforeEach(() => { jest.clearAllMocks(); mockAccess.canWrite = true; mockAccess.isViewer = false; api.retryDiyCompletionEffects.mockResolvedValue({ reset: true, completionEffects: effects('RECORDING') }); });

describe('completion effects disclosure', () => {
  it('while recording: says so, offers no action, and promises no time', async () => {
    await open(completed('RECORDING'));
    const panel = document.querySelector('[data-completion-effects="RECORDING"]')!;
    expect(panel).toHaveTextContent('Recording your completion.');
    expect(screen.queryByRole('button', { name: 'Finish recording' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b\d+\s*(seconds?|minutes?)\b/i);
  });

  it('needs attention: shows the message and a "Finish recording" action that re-queues and reloads', async () => {
    await open(completed('NEEDS_ATTENTION'));
    expect(screen.getByText('Some records could not be updated.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));
    await waitFor(() => expect(api.retryDiyCompletionEffects).toHaveBeenCalledWith('prop-1', 'proj-1'));
    await waitFor(() => expect(api.getDiyProject).toHaveBeenCalledTimes(2));
  });

  it('a viewer sees the message but not the recovery action', async () => {
    mockAccess.canWrite = false; mockAccess.isViewer = true;
    await open(completed('NEEDS_ATTENTION'));
    expect(screen.getByText('Some records could not be updated.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish recording' })).toBeNull();
  });

  it('a failed recovery shows the error and stays on the page', async () => {
    api.retryDiyCompletionEffects.mockRejectedValue(new Error('You do not have access to change this project.'));
    await open(completed('NEEDS_ATTENTION'));
    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));
    expect(await screen.findByText('You do not have access to change this project.')).toBeInTheDocument();
  });

  it('recorded with a home event: the timeline link, and no separate effects panel', async () => {
    await open(completed('RECORDED', { homeEventId: 'he-1' }));
    expect(screen.getByText('Project logged to your home timeline!')).toBeInTheDocument();
    expect(document.querySelector('[data-completion-effects]')).toBeNull();
  });

  it('a project completed before effect tracking existed shows the honest legacy copy and no action', async () => {
    await open(completed('LEGACY_UNKNOWN'));
    expect(screen.getByText('Completion was recorded before effect tracking was added. Related record updates are not verified here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish recording' })).toBeNull();
  });

  it('an open project shows no effects panel at all', async () => {
    await open({ ...completed(null), status: 'IN_PROGRESS' });
    expect(document.querySelector('[data-completion-effects]')).toBeNull();
  });

  it('an incident-linked completion says the incident was not changed; others do not say it', async () => {
    await open(completed('RECORDED', { incidentId: 'inc-1', homeEventId: 'he-1' }));
    expect(document.querySelector('[data-incident-note]')).toHaveTextContent('did not change the linked incident');
  });

  it('no incident note without a linked incident', async () => {
    await open(completed('RECORDED', { homeEventId: 'he-1' }));
    expect(document.querySelector('[data-incident-note]')).toBeNull();
  });
});

describe('completing from the sheet', () => {
  it('saves, reloads, and shows "Recording your completion." (there is no home event id yet), with the project version sent', async () => {
    const step = { id: 's1', stepNumber: 1, title: 'Task 1', description: 'x', status: 'COMPLETED', isOptional: false, updatedAt: '2026-10-06T12:00:00.001Z' };
    await open({ ...completed(null), status: 'IN_PROGRESS', steps: [step] });
    api.completeDiyProject.mockResolvedValue({ homeEventId: null, effects: 'RECORDING' });
    api.getDiyProject.mockResolvedValue(completed('RECORDING', { steps: [step] }));
    fireEvent.click(screen.getByText('Complete Project'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Completion' }));
    await waitFor(() => expect(api.completeDiyProject).toHaveBeenCalledWith('prop-1', 'proj-1', expect.objectContaining({ expectedUpdatedAt: '2026-10-06T12:00:00.100Z' })));
    expect(await screen.findByText('Recording your completion.')).toBeInTheDocument();
    expect(screen.queryByText('Project logged to your home timeline!')).toBeNull();
  });
});

describe('polling while recording', () => {
  // One poll interval, then enough microtask turns for the reload and the state update that re-arms the next timer.
  const tick = async (ms = 10_000) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('looks again on an interval while recording, stops once recorded, and is bounded', async () => {
    api.getDiyProject.mockResolvedValue(completed('RECORDING'));
    render(<ProjectTrackerPage />);
    await act(async () => { await Promise.resolve(); });
    expect(api.getDiyProject).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 3; i += 1) await tick();
    expect(api.getDiyProject.mock.calls.length).toBe(4);

    api.getDiyProject.mockResolvedValue(completed('RECORDED', { homeEventId: 'he-1' }));
    await tick();
    const settled = api.getDiyProject.mock.calls.length;
    await tick(60_000);
    expect(api.getDiyProject.mock.calls.length).toBe(settled);
  });

  it('gives up after a bounded number of looks', async () => {
    api.getDiyProject.mockResolvedValue(completed('RECORDING'));
    render(<ProjectTrackerPage />);
    await act(async () => { await Promise.resolve(); });
    for (let i = 0; i < 40; i += 1) await tick();
    expect(api.getDiyProject.mock.calls.length).toBe(13); // the first load plus 12 looks, then it stops
  });
});
