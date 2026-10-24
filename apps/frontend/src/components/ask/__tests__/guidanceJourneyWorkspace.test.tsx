import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GuidanceJourneyWorkspace } from '../GuidanceJourneyWorkspace';
import { TaskGuideBlock } from '../TaskGuideBlock';
import { AskBlockActionContext } from '../blocks/context';

type Block = Parameters<typeof GuidanceJourneyWorkspace>[0]['block'];
const base = {
  type: 'TASK_GUIDE', id: 'guidance-journey-workspace', title: 'Home expense planning: Out-of-Pocket Exposure', summary: 'Next: Compare Act Now vs Delay.',
  eyebrow: ['Guided journey'], icon: 'TASK', chips: [{ label: 'Add 2 details to continue', kind: 'STATUS' }],
  main: { title: 'Current step', body: 'See what waiting costs over time.', facts: [{ label: 'In Ask', value: 'Yes, and it is recorded on this journey' }, { label: 'Records', value: 'A saved simulation run is recorded as this step\'s proof.' }] },
  history: [{ label: 'Estimate Out-of-Pocket Cost: Cost Estimate', value: 'Recorded by the tool' }], notes: [],
  progress: { current: 2, total: 6, completed: 1, skipped: 0, label: 'Step 2 of 6 · 17% done', asOf: '2026-10-24T12:00:00.000Z' },
  outline: [
    { stepId: 's1', title: 'Estimate Out-of-Pocket Cost', state: 'DONE', optional: false }, { stepId: 's2', title: 'Compare Act Now vs Delay', state: 'CURRENT', optional: false },
    { stepId: 's3', title: 'Review Savings and Funding Options', state: 'UPCOMING', optional: true },
  ],
  actions: [
    { id: 'continue-step-in-ask', label: 'Run the simulation', interactionType: 'START_WORKFLOW', message: 'Run the do-nothing simulation.', operationId: 'DO_NOTHING_SIMULATION_RUN', entityType: 'GUIDANCE_STEP', entityId: 's2', style: 'PRIMARY' },
    { id: 'skip-guided-journey-step', label: 'Skip this step', interactionType: 'START_WORKFLOW', message: 'Skip this guided journey step.', operationId: 'GUIDANCE_STEP_SKIP', entityType: 'GUIDANCE_STEP', entityId: 's2', style: 'QUIET' },
    { id: 'dismiss-guided-journey', label: 'Dismiss this journey', interactionType: 'START_WORKFLOW', message: 'Dismiss this guided journey.', operationId: 'GUIDANCE_JOURNEY_DISMISS', entityType: 'GUIDANCE_JOURNEY', entityId: 'j1', style: 'QUIET' },
  ],
} as unknown as Block;

const renderWith = (block: Block, invoke = jest.fn()) => ({ invoke, ...render(<AskBlockActionContext.Provider value={{ disabled: false, invoke }}><GuidanceJourneyWorkspace block={block} /></AskBlockActionContext.Provider>) });

describe('Guidance journey workspace', () => {
  it('shows progress, an ordered rail with one current step, and the current step panel', () => {
    renderWith(base);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '17');
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 6 · 17% done');
    const rail = screen.getByRole('list', { name: 'Steps in this journey' });
    const items = within(rail).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(items[1]).toHaveTextContent('Compare Act Now vs Delay');
    expect(items[1]).toHaveTextContent('Current step');
    expect(items[0]).toHaveTextContent('Done');
    expect(items[2]).toHaveTextContent('Not started · Optional');
    expect(screen.getByText('Add 2 details to continue')).toBeInTheDocument();
    expect(screen.getByText('What has been recorded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(auto|list|cards)$/i })).toBeNull();
  });

  it('offers the step\'s own action as the primary button and keeps skip and dismiss behind the menu', () => {
    const { invoke } = renderWith(base);
    fireEvent.click(screen.getByRole('button', { name: 'Run the simulation' }));
    expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ operationId: 'DO_NOTHING_SIMULATION_RUN', entityType: 'GUIDANCE_STEP', entityId: 's2' }));
    const menu = screen.getByText('More').closest('details') as HTMLDetailsElement;
    expect(menu.open).toBe(false);
    expect(within(menu).getAllByRole('button').map((button) => button.textContent)).toEqual(['Skip this step', 'Dismiss this journey']);
    expect(screen.getAllByRole('button', { name: /skip this step|dismiss this journey/i }).every((button) => menu.contains(button))).toBe(true);
    menu.open = true;
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this journey' }));
    expect(invoke).toHaveBeenLastCalledWith(expect.objectContaining({ operationId: 'GUIDANCE_JOURNEY_DISMISS', entityId: 'j1' }));
    expect(menu.open).toBe(false);
  });

  it('with no way to do the step it offers no primary button, and a finished journey shows its completion note', () => {
    renderWith({ ...base, actions: (base as { actions: unknown[] }).actions.slice(1) } as unknown as Block);
    expect(screen.queryByRole('button', { name: 'Run the simulation' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Current step' })).toBeInTheDocument();
    const { container } = renderWith({ ...base, summary: 'Every step is done or set aside.', main: null, actions: [] } as unknown as Block);
    expect(container.querySelector('[data-journey-complete]')).toHaveTextContent('Every step is done or set aside.');
  });

  it('is what the task guide renders for the journey id, and not for another guide', () => {
    const { container } = render(<AskBlockActionContext.Provider value={{ disabled: false, invoke: jest.fn() }}><TaskGuideBlock {...({ block: base, executionId: 'e', itemActionsDisabled: false, onItemAction: jest.fn(), onFilterClick: jest.fn(), onCollectionPage: jest.fn(), onAccessLost: jest.fn() } as never)} /></AskBlockActionContext.Provider>);
    expect(container.querySelector('[data-guidance-journey]')).not.toBeNull();
    expect(container.querySelector('[data-task-guide]')).toBeNull();
  });
});
