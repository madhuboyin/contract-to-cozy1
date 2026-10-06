import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Slice 1d of docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md: what an admin sees and can do now that published content is a frozen revision.
const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const api = { adminUpdateDiyTemplate: jest.fn(), adminCreateDiyTemplate: jest.fn(), adminGetDiyTemplate: jest.fn() };
jest.mock('@/lib/api/client', () => ({ api }));
const transitionDiyTemplate = jest.fn();
jest.mock('@/lib/api/adminContentGovernance', () => ({ transitionDiyTemplate: (...args: unknown[]) => transitionDiyTemplate(...args) }));

import TemplateForm from '../TemplateForm';
import TemplateStatusActions from '../TemplateStatusActions';
import AdminTemplateTable from '../AdminTemplateTable';
import LiveRevisionBadge from '../LiveRevisionBadge';
import { actionsForTemplate } from '../templateAdminActions';
import type { AdminDiyTemplateDetail, AdminDiyTemplateSummary, DiyLiveRevision, DiyTemplateStatus } from '@/types';

const reviewed: DiyLiveRevision = { revision: 2, provenance: 'GOVERNED', publishedAt: '2026-10-01T00:00:00.000Z' };
const legacy: DiyLiveRevision = { revision: 1, provenance: 'LEGACY_BACKFILL', publishedAt: null };

const detail = (status: DiyTemplateStatus, liveRevision: DiyLiveRevision | null = null): AdminDiyTemplateDetail => ({
  id: 't1', slug: 'replace-filter', title: 'Replace a filter', shortDescription: 'Swap it.', longDescription: undefined, category: 'HVAC', difficultyLevel: 'EASY',
  requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', permitRequirement: 'NOT_REQUIRED', estimatedMinutes: 15, tags: ['hvac'], featuredOrder: undefined, geminiPromptHint: undefined,
  steps: [{ id: 's1', stepNumber: 1, title: 'Turn it off', description: 'Use the thermostat.', isOptional: false }], materials: [], tools: [], status, liveRevision,
} as unknown as AdminDiyTemplateDetail);

const summary = (status: DiyTemplateStatus, liveRevision: DiyLiveRevision | null = null): AdminDiyTemplateSummary => ({
  id: 't1', slug: 'replace-filter', title: 'Replace a filter', category: 'HVAC', difficultyLevel: 'EASY', requiredSkillLevel: 'BEGINNER', safetyLevel: 'LOW', status,
  stepCount: 1, liveRevision, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
} as unknown as AdminDiyTemplateSummary);

beforeEach(() => { jest.clearAllMocks(); api.adminUpdateDiyTemplate.mockResolvedValue({}); });

describe('the actions offered for a template', () => {
  const labels = (status: DiyTemplateStatus, live?: DiyLiveRevision | null) => actionsForTemplate(status, live).map((entry) => entry.action);

  it('follows the lifecycle with no live head', () => {
    expect(labels('DRAFT')).toEqual(['SUBMIT_FOR_REVIEW']);
    expect(labels('REVIEW')).toEqual(['APPROVE', 'RETURN_TO_DRAFT']);
    expect(labels('APPROVED')).toEqual(['PUBLISH', 'RETURN_TO_DRAFT', 'ARCHIVE']);
    expect(labels('ACTIVE')).toEqual(['UNPUBLISH', 'ARCHIVE']);
    expect(labels('ARCHIVED')).toEqual(['REVIVE_TO_DRAFT']);
  });

  it('offers a reviewer "Return to draft" for an approved template', () => {
    expect(labels('APPROVED')).toContain('RETURN_TO_DRAFT');
  });

  it('always lets a live template be unpublished or archived, whatever the status of its draft', () => {
    for (const status of ['DRAFT', 'REVIEW'] as DiyTemplateStatus[]) {
      expect(labels(status, reviewed)).toEqual(expect.arrayContaining(['UNPUBLISH', 'ARCHIVE']));
      expect(labels(status)).not.toContain('UNPUBLISH');
    }
    expect(labels('APPROVED', reviewed)).toContain('UNPUBLISH');
  });

  it('shows those actions in the row menu and refreshes the row after one runs', async () => {
    const onStatusChange = jest.fn();
    transitionDiyTemplate.mockResolvedValue({ previousStatus: 'DRAFT', status: 'DRAFT', action: 'UNPUBLISH' });
    render(<TemplateStatusActions template={summary('DRAFT', reviewed)} onStatusChange={onStatusChange} onDuplicate={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'safety correction' } });
    fireEvent.click(screen.getAllByRole('button').find((button) => /unpublish|confirm|submit/i.test(button.textContent ?? '') && !(button as HTMLButtonElement).disabled)!);
    await waitFor(() => expect(transitionDiyTemplate).toHaveBeenCalledWith('t1', 'UNPUBLISH', 'safety correction'));
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('t1', 'DRAFT'));
  });
});

describe('the live revision badge', () => {
  it('says which revision is live and whether it was reviewed, and flags a legacy one', () => {
    const { rerender, container } = render(<LiveRevisionBadge liveRevision={reviewed} status="DRAFT" />);
    expect(screen.getByText('Live: revision 2 · reviewed')).toBeInTheDocument();
    expect(container.querySelector('[data-live-revision="reviewed"]')).not.toBeNull();
    rerender(<LiveRevisionBadge liveRevision={legacy} status="ACTIVE" />);
    expect(screen.getByText(/Live: revision 1 · legacy, not re-reviewed/)).toBeInTheDocument();
    expect(container.querySelector('[data-live-revision="legacy"]')).not.toBeNull();
  });

  it('shows nothing when nothing is live, except a warning for an ACTIVE template with no published revision', () => {
    const { container, rerender } = render(<LiveRevisionBadge liveRevision={null} status="DRAFT" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<LiveRevisionBadge liveRevision={null} status="ACTIVE" />);
    expect(screen.getByText('Live: no published revision')).toBeInTheDocument();
  });

  it('appears next to the status badge in the templates table', () => {
    render(<AdminTemplateTable templates={[summary('DRAFT', reviewed)]} onStatusChange={jest.fn()} onDuplicate={jest.fn()} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Live: revision 2 · reviewed')).toBeInTheDocument();
  });
});

describe('the edit form in each state', () => {
  const contentInputs = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-content-fields] input, [data-content-fields] textarea, [data-content-fields] select, [data-content-fields] button'));

  it.each(['REVIEW', 'APPROVED', 'ARCHIVED'] as DiyTemplateStatus[])('%s: content is read-only with an explanation, and only featured order and the Gemini hint can be saved', async (status) => {
    const { container } = render(<TemplateForm templateId="t1" initial={detail(status, status === 'ARCHIVED' ? null : reviewed)} />);
    expect(container.querySelector(`[data-template-state-notice="${status}"]`)).not.toBeNull();
    expect(screen.getByPlaceholderText('Replace HVAC Air Filter')).toBeDisabled();
    expect(contentInputs(container).length).toBeGreaterThan(5);
    expect(contentInputs(container).every((element) => (element as HTMLInputElement).closest('fieldset')?.disabled)).toBe(true);
    const featured = screen.getByPlaceholderText('Leave blank for non-featured');
    expect(featured).not.toBeDisabled();
    fireEvent.change(featured, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.adminUpdateDiyTemplate).toHaveBeenCalledTimes(1));
    expect(Object.keys(api.adminUpdateDiyTemplate.mock.calls[0][1]).sort()).toEqual(['featuredOrder', 'geminiPromptHint']);
    expect(api.adminUpdateDiyTemplate.mock.calls[0][1].featuredOrder).toBe(3);
  });

  it('REVIEW tells the editor to have a reviewer return it to draft, and mentions the live version if there is one', () => {
    render(<TemplateForm templateId="t1" initial={detail('REVIEW', reviewed)} />);
    expect(screen.getByText(/content is frozen/i)).toBeInTheDocument();
    expect(screen.getByText(/live version \(revision 2\) stays published/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Reviews' })).toHaveAttribute('href', '/dashboard/admin/content-reviews');
  });

  it('ACTIVE: says that saving creates a draft and names the live revision, and sends the full content', async () => {
    const { container } = render(<TemplateForm templateId="t1" initial={detail('ACTIVE', reviewed)} />);
    expect(screen.getByText(/Saving creates a new draft\. The live version \(revision 2\) stays published until you publish the new one\./)).toBeInTheDocument();
    expect(contentInputs(container).every((element) => !(element as HTMLInputElement).closest('fieldset')?.disabled)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.adminUpdateDiyTemplate).toHaveBeenCalledTimes(1));
    expect(api.adminUpdateDiyTemplate.mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'Replace a filter', steps: expect.any(Array) }));
  });

  it('a DRAFT with a live version says the draft is not live; a plain DRAFT and a new template show no notice', () => {
    const { container, rerender } = render(<TemplateForm templateId="t1" initial={detail('DRAFT', reviewed)} />);
    expect(screen.getByText(/A live version \(revision 2\) is published\. This draft is not live until it is reviewed and published\./)).toBeInTheDocument();
    rerender(<TemplateForm templateId="t1" initial={detail('DRAFT')} />);
    expect(container.querySelector('[data-template-state-notice]')).toBeNull();
    rerender(<TemplateForm />);
    expect(container.querySelector('[data-template-state-notice]')).toBeNull();
  });

  it('a template that is not frozen keeps every field editable', () => {
    const { container } = render(<TemplateForm templateId="t1" initial={detail('DRAFT')} />);
    expect(contentInputs(container).every((element) => !(element as HTMLInputElement).closest('fieldset')?.disabled)).toBe(true);
    expect(within(container).getAllByRole('textbox').length).toBeGreaterThan(3);
  });
});
