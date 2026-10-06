import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// DIY pages for a household viewer (follow-up to the server's CONTRIBUTOR role floor on DIY writes): write controls are not offered, a notice says
// why, and a contributor keeps everything. Also pins the two error-handling fixes on the project page.
const push = jest.fn();
let search = 'propertyId=prop-1';
let params: Record<string, string> = { id: 'proj-1' };
jest.mock('next/navigation', () => ({
  useParams: () => params,
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push }),
}));

const access = { canWrite: true, isViewer: false, isLoading: false };
jest.mock('@/lib/property/usePropertyWriteAccess', () => ({ usePropertyWriteAccess: () => access }));

const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => toast(...args) }));

const api = {
  getDiyProject: jest.fn(), updateDiyProjectStep: jest.fn(), abandonDiyProject: jest.fn(), completeDiyProject: jest.fn(),
  getDiyTemplateDetail: jest.fn(), getDiyDecision: jest.fn(), createDiyProject: jest.fn(),
  getDiySkillProfile: jest.fn(), getFeaturedDiyTemplates: jest.fn(), listDiyProjects: jest.fn(), getDiyAiGuide: jest.fn(),
};
jest.mock('@/lib/api/client', () => ({ api }));

import ProjectTrackerPage from '../projects/[id]/page';
import TemplateDetailPage from '../templates/[id]/page';
import DiyHubPage from '../page';

const project = {
  id: 'proj-1', title: 'Replace faucet', category: 'PLUMBING', status: 'IN_PROGRESS', aiGuideId: null, homeEventId: null,
  steps: [
    { id: 's1', stepNumber: 1, title: 'Shut off water', description: 'Close the valves.', status: 'COMPLETED', isOptional: false },
    { id: 's2', stepNumber: 2, title: 'Swap faucet', description: 'Fit the new faucet.', status: 'PENDING', isOptional: false },
  ],
  materials: [], tools: [],
};
const template = {
  id: 'tpl-1', title: 'Replace faucet', category: 'PLUMBING', difficultyLevel: 'EASY', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED',
  requiredSkillLevel: 'BEGINNER', estimatedMinutes: 60, shortDescription: 'Swap a faucet.', steps: [], materials: [], tools: [],
};

function as(role: 'viewer' | 'contributor') {
  Object.assign(access, role === 'viewer' ? { canWrite: false, isViewer: true, isLoading: false } : { canWrite: true, isViewer: false, isLoading: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  search = 'propertyId=prop-1';
  params = { id: 'proj-1' };
  api.getDiyProject.mockResolvedValue(project);
  api.getDiyTemplateDetail.mockResolvedValue(template);
  api.getDiyDecision.mockResolvedValue({ verdict: 'DIY_RECOMMENDED', score: 90, factors: [], blockers: [], reasoning: [], savingsEstimateCents: 0 });
  api.getDiySkillProfile.mockResolvedValue({ skillLevel: 'BEGINNER' });
  api.getFeaturedDiyTemplates.mockResolvedValue([]);
  api.listDiyProjects.mockResolvedValue({ items: [] });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('project page', () => {
  it('a viewer sees the steps and a notice but no way to change or stop the project', async () => {
    as('viewer');
    render(<ProjectTrackerPage />);
    expect(await screen.findByText('Replace faucet')).toBeInTheDocument();
    expect(document.querySelector('[data-view-only-notice]')).not.toBeNull();
    fireEvent.click(screen.getByText('Swap faucet'));
    expect(screen.getByText('Fit the new faucet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark done|start step|skip/i })).toBeNull();
    expect(screen.queryByText(/hire a pro instead/i)).toBeNull();
    expect(screen.queryByText('Complete Project')).toBeNull();
  });

  it('a contributor keeps the step controls and the stop action', async () => {
    as('contributor');
    render(<ProjectTrackerPage />);
    await screen.findByText('Replace faucet');
    expect(document.querySelector('[data-view-only-notice]')).toBeNull();
    expect(screen.getByText(/hire a pro instead/i)).toBeInTheDocument();
  });

  it('a failed "stop this project" stays on the page and says so (it used to navigate away as if it had worked)', async () => {
    as('contributor');
    api.abandonDiyProject.mockRejectedValue(new Error('This action requires the CONTRIBUTOR role for the property.'));
    render(<ProjectTrackerPage />);
    fireEvent.click(await screen.findByText(/hire a pro instead/i));
    expect(await screen.findByText(/requires the CONTRIBUTOR role/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('a successful stop still returns to the DIY hub', async () => {
    as('contributor');
    api.abandonDiyProject.mockResolvedValue(undefined);
    render(<ProjectTrackerPage />);
    fireEvent.click(await screen.findByText(/hire a pro instead/i));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/diy?propertyId=prop-1'));
  });

  it('a failed step update shows the error instead of an unhandled rejection', async () => {
    as('contributor');
    api.updateDiyProjectStep.mockRejectedValue(new Error('Could not save'));
    render(<ProjectTrackerPage />);
    fireEvent.click(await screen.findByText('Swap faucet'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText('Could not save')).toBeInTheDocument();
  });
});

describe('template page', () => {
  it('a viewer sees a disabled "View only" button instead of Start Project, and the notice', async () => {
    as('viewer');
    params = { id: 'tpl-1' };
    render(<TemplateDetailPage />);
    const button = await screen.findByRole('button', { name: 'View only' });
    expect(button).toBeDisabled();
    expect(document.querySelector('[data-view-only-notice]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Start Project' })).toBeNull();
  });

  it('a contributor can start the project', async () => {
    as('contributor');
    params = { id: 'tpl-1' };
    api.createDiyProject.mockResolvedValue({ id: 'new-1' });
    render(<TemplateDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start Project' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/diy/projects/new-1?propertyId=prop-1'));
  });
});

describe('DIY hub', () => {
  it('a viewer does not get the "describe your project" generator, and sees the notice', async () => {
    as('viewer');
    render(<DiyHubPage />);
    await screen.findByText('DIY Project Center');
    expect(document.querySelector('[data-view-only-notice]')).not.toBeNull();
    expect(screen.queryByText(/describe it/i)).toBeNull();
  });

  it('a contributor still gets the generator', async () => {
    as('contributor');
    render(<DiyHubPage />);
    await screen.findByText('DIY Project Center');
    expect(screen.getByText(/describe it/i)).toBeInTheDocument();
  });
});
