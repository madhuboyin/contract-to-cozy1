/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskWorkDestination } from '../workspace/AskWorkDestination';
import { workResumeHref } from '../work/workPresentation';
import { api } from '@/lib/api/client';
import type { AskWorkPage, AskWorkResolution, AskWorkRow } from '@/features/ask/types';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('propertyId=home-1'),
}));
jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }),
}));
jest.mock('@/lib/api/client', () => ({ api: {
  getAskWorkPage: jest.fn(),
  resolveAskWork: jest.fn(),
  continueAskExecution: jest.fn(),
  retryAskExecution: jest.fn(),
  cancelAskExecution: jest.fn(),
} }));

const getWork = api.getAskWorkPage as jest.Mock;
const resolveWork = api.resolveAskWork as jest.Mock;
const continueExecution = api.continueAskExecution as jest.Mock;
const retryExecution = api.retryAskExecution as jest.Mock;
const cancelExecution = api.cancelAskExecution as jest.Mock;

const launch = { operationId: null, entityType: null, entityId: null, actionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: null };
const row = (overrides: Partial<AskWorkRow> = {}): AskWorkRow => ({
  workKey: 'project:pr1', sourceAliases: [], providerId: 'PROJECTS', workType: 'PROJECT', propertyId: 'home-1', entity: { type: 'PROJECT_RECORD', id: 'pr1' }, title: 'New roof', summary: 'Roof Replacement · Acme',
  status: { canonical: 'IN_PROGRESS', label: 'In Progress' }, lifecycleView: 'NEEDS_YOU', nextAction: { label: 'Check on progress', operationId: 'PROJECT_TRACKER_COMMAND', allowed: true }, sortAt: '2026-10-18T12:00:00.000Z',
  freshness: { version: 'v1', asOf: '2026-10-18T12:00:00.000Z' }, sourceOwner: 'projects',
  resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: { ...launch, operationId: 'PROJECT_TRACKER_PROJECTS', entityType: 'PROJECT_RECORD', entityId: 'pr1' } }, ...overrides,
});
const pendingRow = (): AskWorkRow => row({
  workKey: 'execution:e1', providerId: 'PENDING_EXECUTIONS', workType: 'PENDING_EXECUTION', title: 'Approve the maintenance plan', summary: null,
  status: { canonical: 'NEEDS_CONFIRMATION', label: 'Waiting for your confirmation' }, nextAction: { label: 'Review and confirm', operationId: null, allowed: true },
  resume: { kind: 'CONFIRMATION', executionId: 'e1', sessionId: 's1', launch: { ...launch, entityType: 'AskExecution', entityId: 'e1' } },
});
const page = (rows: AskWorkRow[], overrides: Partial<AskWorkPage> = {}): AskWorkPage => ({
  contractVersion: 'ask-work-v1', propertyId: 'home-1', generatedAt: '2026-10-19T12:00:00.000Z', view: 'NEEDS_YOU', total: rows.length, totalScope: 'COMPLETE', partial: false, delivered: rows.length,
  nextCursor: null, truncated: false, viewCounts: { NEEDS_YOU: rows.length, ACTIVE: 2, WAITING: 0, SCHEDULED: null, COMPLETED: 5, ARCHIVED: 1 }, sort: { key: 'sortAt', label: 'Most recently updated first' },
  query: { workType: null, status: null },
  providers: [{ providerId: 'PROJECTS', label: 'Projects', workType: 'PROJECT', state: 'AVAILABLE', reason: null, total: rows.length, delivered: rows.length, required: true }],
  filterOptions: { workTypes: [{ value: 'PROJECT', label: 'Projects' }], statusesByWorkType: { PROJECT: [{ value: 'IN_PROGRESS', label: 'In progress' }, { value: 'DISPUTED', label: 'Disputed' }] } },
  unscopedPending: [], rows, ...overrides,
});
const resolution = (overrides: Partial<AskWorkResolution> = {}): AskWorkResolution => ({
  contractVersion: 'ask-work-v1', propertyId: 'home-1', workKey: 'project:pr1', outcome: 'AVAILABLE', row: row(), currentVersion: 'v1', supersededBy: null, message: 'Ready to open.', ...overrides,
});

describe('AskWorkDestination', () => {
  beforeEach(() => {
    for (const mock of [push, getWork, resolveWork, continueExecution, retryExecution, cancelExecution]) mock.mockReset();
  });

  it('lists the Needs you view with counts on every view, a "—" where a count is unknown, and a stated total', async () => {
    getWork.mockResolvedValue({ success: true, data: page([row()]) });
    render(<AskWorkDestination />);
    expect(await screen.findByText('New roof')).toBeInTheDocument();
    expect(getWork).toHaveBeenCalledWith('home-1', expect.objectContaining({ view: 'NEEDS_YOU' }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Needs you1', 'Active2', 'Waiting0', 'Scheduled—', 'Completed5', 'Archived1']);
    expect(screen.getByRole('tab', { name: /Scheduled/ })).toHaveTextContent('—');
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it('names every kind of work that could not be read and never calls a partial list complete or empty', async () => {
    getWork.mockResolvedValue({ success: true, data: page([], {
      partial: true, total: null, totalScope: 'PARTIAL',
      providers: [
        { providerId: 'PROJECTS', label: 'Projects', workType: 'PROJECT', state: 'AVAILABLE', reason: null, total: 0, delivered: 0, required: true },
        { providerId: 'REPAIRS', label: 'Repairs', workType: 'REPAIR', state: 'UNAVAILABLE', reason: 'Repairs have no canonical homeowner reader.', total: null, delivered: 0, required: true },
      ],
    }) });
    render(<AskWorkDestination />);
    expect(await screen.findByText(/not a confirmed empty list/)).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
    const partial = document.querySelector('[data-work-partial]') as HTMLElement;
    expect(within(partial).getByText(/may be incomplete/)).toBeInTheDocument();
    expect(within(partial).getByText('Repairs have no canonical homeowner reader.', { exact: false })).toBeInTheDocument();
  });

  it('states a real empty view only when every provider answered', async () => {
    getWork.mockResolvedValue({ success: true, data: page([]) });
    render(<AskWorkDestination />);
    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
  });

  it('switches views and filters by kind of work, restarting from the first page', async () => {
    getWork.mockResolvedValue({ success: true, data: page([row()]) });
    render(<AskWorkDestination />);
    await screen.findByText('New roof');
    fireEvent.click(screen.getByRole('tab', { name: /Active/ }));
    await waitFor(() => expect(getWork).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ view: 'ACTIVE' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Kind of work'), { target: { value: 'PROJECT' } });
    await waitFor(() => expect(getWork).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ view: 'ACTIVE', workType: 'PROJECT' }), expect.anything()));
    const statusSelect = screen.getByLabelText('Status');
    // The server's complete list, including a status no loaded row has yet.
    expect(within(statusSelect).getByRole('option', { name: 'Disputed' })).toBeInTheDocument();
  });

  it('shows pending requests that have no home in their own section, never inside a home\'s list', async () => {
    const homeless = { ...pendingRow(), workKey: 'execution:e7', propertyId: null, title: 'Add my new water heater', resume: { kind: 'CONVERSATION' as const, executionId: 'e7', sessionId: 's7', launch: { ...launch, entityType: 'AskExecution', entityId: 'e7' } } };
    getWork.mockResolvedValue({ success: true, data: page([row()], { unscopedPending: [homeless] }) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ workKey: 'execution:e7', row: homeless }) });
    continueExecution.mockResolvedValue({ success: true, data: { executionId: 'e7', sessionId: 's7', property: null } });
    render(<AskWorkDestination />);
    const section = await screen.findByLabelText('Requests with no home yet');
    expect(within(section).getByText('Add my new water heater')).toBeInTheDocument();
    expect(screen.getByText('No home selected yet')).toBeInTheDocument();
    fireEvent.click(within(section).getByRole('button', { name: 'Review and confirm' }));
    await waitFor(() => expect(continueExecution).toHaveBeenCalledWith('e7', 'ASK_PAGE'));
    expect(push).toHaveBeenCalled();
  });

  it('opens a request whose result was not confirmed through the canonical continuation, with no dismiss', async () => {
    const unknown = row({ workKey: 'execution:e5', providerId: 'UNKNOWN_OUTCOME_EXECUTIONS', workType: 'UNKNOWN_OUTCOME_EXECUTION', title: 'Replace the filter', summary: 'We could not confirm whether this finished.', status: { canonical: 'OUTCOME_UNKNOWN', label: 'Result not confirmed' }, nextAction: { label: 'Check what happened', operationId: null, allowed: true }, resume: { kind: 'CONFIRMATION', executionId: 'e5', sessionId: 's5', launch } });
    getWork.mockResolvedValue({ success: true, data: page([unknown]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ workKey: 'execution:e5', row: unknown }) });
    continueExecution.mockResolvedValue({ success: true, data: { executionId: 'e5', sessionId: 's5', property: { id: 'home-1', label: 'Home' } } });
    render(<AskWorkDestination />);
    expect(await screen.findByText('We could not confirm whether this finished.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check what happened' }));
    await waitFor(() => expect(continueExecution).toHaveBeenCalledWith('e5', 'ASK_PAGE'));
    expect(push).toHaveBeenCalledWith('/dashboard/ask?propertyId=home-1&sessionId=s5&executionId=e5');
  });

  it('explains why work Ask cannot continue is shown without an action', async () => {
    const repair = row({ workKey: 'repair:b1', providerId: 'REPAIRS', workType: 'REPAIR', title: 'Plumbing repair', nextAction: null, resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch, unavailableReason: 'Ask cannot manage service bookings yet. Its current state is shown here.' } });
    getWork.mockResolvedValue({ success: true, data: page([repair]) });
    render(<AskWorkDestination />);
    await screen.findByText('Plumbing repair');
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.querySelector('[data-work-detail]')).toHaveTextContent('Ask cannot manage service bookings yet');
  });

  it('pages every row: Show more continues from the cursor and never repeats a row', async () => {
    getWork.mockResolvedValueOnce({ success: true, data: page([row()], { nextCursor: 'c1', truncated: true, total: 2 }) });
    getWork.mockResolvedValueOnce({ success: true, data: page([row(), row({ workKey: 'claim:c1', workType: 'CLAIM', title: 'Water claim' })], { total: 2 }) });
    render(<AskWorkDestination />);
    await screen.findByText('New roof');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Water claim')).toBeInTheDocument();
    expect(getWork).toHaveBeenLastCalledWith('home-1', expect.objectContaining({ cursor: 'c1' }), expect.anything());
    expect(screen.getAllByText('New roof')).toHaveLength(1);
  });

  it('opens a pending request through a fresh resolve and the canonical Ask continuation', async () => {
    getWork.mockResolvedValue({ success: true, data: page([pendingRow()]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ workKey: 'execution:e1', row: pendingRow() }) });
    continueExecution.mockResolvedValue({ success: true, data: { executionId: 'e1', sessionId: 's1', property: { id: 'home-1', label: 'Home' } } });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Review and confirm' }));
    await waitFor(() => expect(continueExecution).toHaveBeenCalledWith('e1', 'ASK_PAGE'));
    expect(resolveWork).toHaveBeenCalledWith('home-1', 'execution:e1', 'v1');
    expect(push).toHaveBeenCalledWith('/dashboard/ask?propertyId=home-1&sessionId=s1&executionId=e1');
  });

  it('opens domain work in Ask with its exact identity, operation and version', async () => {
    const decision = row({ workKey: 'decisionThread:t1', workType: 'DECISION_THREAD', providerId: 'DECISION_THREADS', title: 'Replace the furnace?', resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch: { ...launch, operationId: 'HVAC_DECISION_CONTINUE', entityType: 'InventoryItem', entityId: 'inv1', decisionThreadId: 't1', contextVersion: '3' } } });
    getWork.mockResolvedValue({ success: true, data: page([decision]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ workKey: 'decisionThread:t1', row: decision }) });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check on progress' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(push.mock.calls[0][0], 'https://x.test');
    expect(url.pathname).toBe('/dashboard/ask');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ propertyId: 'home-1', launchOperationId: 'HVAC_DECISION_CONTINUE', launchEntityType: 'InventoryItem', launchEntityId: 'inv1', launchDecisionThreadId: 't1', launchContextVersion: '3', from: 'work' });
  });

  it('does not navigate when the work changed: it shows the latest and says so', async () => {
    getWork.mockResolvedValue({ success: true, data: page([row()]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ outcome: 'STALE', row: row({ title: 'New roof (updated)', freshness: { version: 'v2', asOf: '2026-10-19T00:00:00.000Z' } }), currentVersion: 'v2', message: 'This changed since you last looked. Review the latest before acting.' }) });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check on progress' }));
    expect(await screen.findByText('New roof (updated)')).toBeInTheDocument();
    expect(document.querySelector('[data-work-notice]')).toHaveTextContent('changed since you last looked');
    expect(push).not.toHaveBeenCalled();
  });

  it('reports superseded work and opens its replacement on request', async () => {
    getWork.mockResolvedValue({ success: true, data: page([row({ workKey: 'journey:j1', workType: 'GUIDANCE_JOURNEY', title: 'Roof plan' })]) });
    resolveWork.mockResolvedValueOnce({ success: true, data: resolution({ workKey: 'journey:j1', outcome: 'SUPERSEDED', row: null, supersededBy: 'project:pr1', message: 'This plan became a project.' }) });
    resolveWork.mockResolvedValueOnce({ success: true, data: resolution({ workKey: 'project:pr1', row: row() }) });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check on progress' }));
    expect(await screen.findByText('This plan became a project.', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the replacement' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(resolveWork).toHaveBeenLastCalledWith('home-1', 'project:pr1');
    expect(push.mock.calls[0][0]).toContain('launchEntityId=pr1');
  });

  it.each([['DELETED', 'This was removed'], ['ACCESS_LOST', 'You no longer have access to this.'], ['COMPLETED', 'This is finished.']] as const)('shows a distinct message for %s and does not navigate', async (outcome, message) => {
    getWork.mockResolvedValue({ success: true, data: page([row()]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ outcome, row: null, message }) });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check on progress' }));
    expect(await screen.findByText(message, { exact: false })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('retries a failed request through the idempotent retry route, not a new conversation', async () => {
    const failed = row({ workKey: 'execution:e9', providerId: 'RETRYABLE_EXECUTIONS', workType: 'RETRYABLE_EXECUTION', title: 'Add a water heater', nextAction: { label: 'Try this again', operationId: null, allowed: true, retryExecutionId: 'e9' }, resume: { kind: 'CONVERSATION', executionId: 'e9', sessionId: 's9', launch } });
    getWork.mockResolvedValue({ success: true, data: page([failed]) });
    resolveWork.mockResolvedValue({ success: true, data: resolution({ workKey: 'execution:e9', row: failed }) });
    retryExecution.mockResolvedValue({ success: true, data: { executionId: 'e10', sessionId: 's9', property: { id: 'home-1', label: 'Home' } } });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try this again' }));
    await waitFor(() => expect(retryExecution).toHaveBeenCalledWith('e9', expect.any(String)));
    expect(push).toHaveBeenCalledWith('/dashboard/ask?propertyId=home-1&sessionId=s9&executionId=e10');
  });

  it('dismisses a pending request and removes it', async () => {
    getWork.mockResolvedValue({ success: true, data: page([pendingRow()]) });
    cancelExecution.mockResolvedValue({ success: true, data: { status: 'CANCELLED' } });
    render(<AskWorkDestination />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(cancelExecution).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(screen.queryByText('Approve the maintenance plan')).not.toBeInTheDocument());
  });

  it('shows work with no Ask operation (a report job) with its detail and no dead action', async () => {
    const job = row({ workKey: 'job:reportExport:r1', providerId: 'QUEUED_JOBS', workType: 'QUEUED_JOB', title: 'Home report pack report', nextAction: null, resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch } });
    getWork.mockResolvedValue({ success: true, data: page([job]) });
    render(<AskWorkDestination />);
    await screen.findByText('Home report pack report');
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.querySelector('[data-work-detail]')).toHaveTextContent('nothing to continue in Ask');
  });

  it('says the service is paused rather than empty', async () => {
    getWork.mockRejectedValue(Object.assign(new Error('paused'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    render(<AskWorkDestination />);
    await waitFor(() => expect(document.querySelector('[data-ask-collection-state]')).not.toBeNull());
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  });
});

describe('workResumeHref', () => {
  it('resumes an execution by its session and execution, and a domain row by its launch', () => {
    expect(workResumeHref(pendingRow(), 'home-1')).toBe('/dashboard/ask?propertyId=home-1&sessionId=s1&executionId=e1');
    expect(workResumeHref(row(), 'home-1')).toContain('launchOperationId=PROJECT_TRACKER_PROJECTS');
    expect(workResumeHref(row({ resume: { kind: 'WORKSPACE', executionId: null, sessionId: null, launch } }), 'home-1')).toBeNull();
  });
});
