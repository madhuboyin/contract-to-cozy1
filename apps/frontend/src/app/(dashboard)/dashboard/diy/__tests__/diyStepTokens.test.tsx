import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Slice 2b of docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md: the project page sends the version each change is based on, reloads and explains
// when the server says the project changed or closed, offers "Complete Project" only when the completion rule holds, and can reopen a finished step.
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'proj-1' }),
  useSearchParams: () => new URLSearchParams('propertyId=prop-1'),
  useRouter: () => ({ push }),
}));
jest.mock('@/lib/property/usePropertyWriteAccess', () => ({ usePropertyWriteAccess: () => ({ canWrite: true, isViewer: false, isLoading: false }) }));
const api = { getDiyProject: jest.fn(), updateDiyProjectStep: jest.fn(), abandonDiyProject: jest.fn(), completeDiyProject: jest.fn() };
jest.mock('@/lib/api/client', () => ({ api }));

import ProjectTrackerPage from '../projects/[id]/page';

const STEP_TOKENS = { s1: '2026-10-06T12:00:00.001Z', s2: '2026-10-06T12:00:00.002Z', s3: '2026-10-06T12:00:00.003Z', s4: '2026-10-06T12:00:00.004Z' };
const PROJECT_TOKEN = '2026-10-06T12:00:00.100Z';
const step = (id: string, stepNumber: number, extra: Record<string, unknown> = {}) => ({
  id, stepNumber, title: `Task ${stepNumber}`, description: `Do step ${stepNumber}.`, status: 'PENDING', isOptional: false, updatedAt: (STEP_TOKENS as any)[id], ...extra,
});
const project = (steps: any[], extra: Record<string, unknown> = {}) => ({
  id: 'proj-1', title: 'Replace faucet', category: 'PLUMBING', status: 'IN_PROGRESS', aiGuideId: null, homeEventId: null, updatedAt: PROJECT_TOKEN, steps, materials: [], tools: [], ...extra,
});
const apiError = (code: string, message: string) => Object.assign(new Error(message), { payload: { error: { code, message } } });
const open = async (value: any) => {
  api.getDiyProject.mockResolvedValue(value);
  render(<ProjectTrackerPage />);
  await screen.findByText('Replace faucet');
};

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(window, 'confirm').mockReturnValue(true); api.updateDiyProjectStep.mockResolvedValue({ step: {}, alreadyApplied: false }); });

describe('step updates', () => {
  it('send the version of the step that was on screen', async () => {
    await open(project([step('s1', 1), step('s2', 2)]));
    fireEvent.click(screen.getByText('Task 2'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(api.updateDiyProjectStep).toHaveBeenCalledWith('prop-1', 'proj-1', 's2', expect.objectContaining({ status: 'COMPLETED', expectedUpdatedAt: STEP_TOKENS.s2 })));
  });

  it('reload the project and say it changed when the server reports a stale version', async () => {
    await open(project([step('s1', 1)]));
    api.updateDiyProjectStep.mockRejectedValue(apiError('DIY_STALE', 'This step changed while you were working. Reload and try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText("This project changed while you were working. We've refreshed it.")).toBeInTheDocument();
    expect(api.getDiyProject).toHaveBeenCalledTimes(2);
  });

  it('reload and explain when the project was finished meanwhile, and show the server\'s message for a refused transition', async () => {
    await open(project([step('s1', 1)]));
    api.updateDiyProjectStep.mockRejectedValueOnce(apiError('DIY_PROJECT_CLOSED', 'closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText('This project is already finished and can no longer be changed.')).toBeInTheDocument();
    api.updateDiyProjectStep.mockRejectedValueOnce(apiError('DIY_STEP_TRANSITION_NOT_ALLOWED', 'A step with a safety note cannot be skipped.'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText('A step with a safety note cannot be skipped.')).toBeInTheDocument();
  });

  it('reopen a completed step with a version, and Skip is not offered for a required step or a step with a safety note', async () => {
    await open(project([step('s1', 1, { status: 'COMPLETED' }), step('s2', 2), step('s3', 3, { isOptional: true }), step('s4', 4, { isOptional: true, safetyNote: 'Wear gloves.' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen step' }));
    await waitFor(() => expect(api.updateDiyProjectStep).toHaveBeenCalledWith('prop-1', 'proj-1', 's1', expect.objectContaining({ status: 'IN_PROGRESS', expectedUpdatedAt: STEP_TOKENS.s1 })));

    fireEvent.click(screen.getByText('Task 2'));
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.click(screen.getByText('Task 4'));
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.click(screen.getByText('Task 3'));
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
  });
});

describe('finishing the project', () => {
  it('offers Complete Project only when required steps are completed and optional steps are completed or skipped, and hints while only optional steps are left', async () => {
    await open(project([step('s1', 1, { status: 'COMPLETED' }), step('s2', 2, { isOptional: true }), step('s3', 3, { isOptional: true, status: 'IN_PROGRESS' })]));
    expect(screen.queryByText('Complete Project')).toBeNull();
    expect(document.querySelector('[data-optional-steps-left]')).toHaveTextContent('2 optional steps are left: do them or skip them to finish the project.');
  });

  it('shows no hint while a required step is open, and shows the button when everything is resolved', async () => {
    await open(project([step('s1', 1), step('s2', 2, { isOptional: true, status: 'SKIPPED' })]));
    expect(document.querySelector('[data-optional-steps-left]')).toBeNull();
    expect(screen.queryByText('Complete Project')).toBeNull();
  });

  it('completes with the project version, and a stale completion refreshes the project and says so', async () => {
    await open(project([step('s1', 1, { status: 'COMPLETED' }), step('s2', 2, { isOptional: true, status: 'SKIPPED' })]));
    fireEvent.click(screen.getByText('Complete Project'));
    api.completeDiyProject.mockRejectedValueOnce(apiError('DIY_STALE', 'This project changed while you were working. Reload it and try again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Completion' }));
    expect(await screen.findByText('This project changed while you were working. Reload it and try again.')).toBeInTheDocument();
    expect(api.completeDiyProject).toHaveBeenCalledWith('prop-1', 'proj-1', expect.objectContaining({ expectedUpdatedAt: PROJECT_TOKEN }));
    expect(api.getDiyProject).toHaveBeenCalledTimes(2);
  });

  it('abandon sends the project version, and a stale one stays on the page with the refreshed project', async () => {
    await open(project([step('s1', 1)]));
    api.abandonDiyProject.mockRejectedValue(apiError('DIY_STALE', 'stale'));
    fireEvent.click(screen.getByText(/hire a pro instead/i));
    await waitFor(() => expect(api.abandonDiyProject).toHaveBeenCalledWith('prop-1', 'proj-1', { hireOut: false, expectedUpdatedAt: PROJECT_TOKEN }));
    expect(await screen.findByText("This project changed while you were working. We've refreshed it.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
