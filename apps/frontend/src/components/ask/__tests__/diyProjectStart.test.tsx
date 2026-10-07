import { fireEvent, render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Step 8, slice 8D of docs/architecture/ASK_COZY_DIY_PROJECT_START_PLAN.md: the browse card's start row action, the DIY projects card's browse launch and the receipt's guide launch send exactly
// the producer's declared fields through the generic renderer (no per-operation frontend code). Jest component tests only: no browser ran here, so real-browser behavior, the calm shell and
// focus are unverified.
const startRow = { id: 'diy-template-start', label: 'Start this project', message: 'Start this project.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'DIY_PROJECT_START' };
const browseList = (withAction = true) => ({
  type: 'GROUPED_LIST', id: 'diy-template-browse', title: 'Projects you can start', description: 'Reviewed templates that fit this home.', filters: [], actions: [],
  sections: [{
    id: 'diy-templates', title: 'Reviewed projects', count: 2, items: [
      { id: 't1', title: 'Repaint a hallway', description: 'Fresh coat of paint.', meta: ['Painting', '5 steps', 'About 2 hr'], entityType: 'DIY_TEMPLATE', ...(withAction ? { actions: [startRow] } : {}) },
      { id: 't2', title: 'Replace a furnace filter', description: 'Swap the filter.', meta: ['HVAC', '3 steps'], status: 'Already started', entityType: 'DIY_TEMPLATE', href: '/dashboard/diy/projects/p9?propertyId=home' },
    ],
  }],
} as unknown as AskPresentationBlock);
const browseAction = {
  id: 'diy-template-browse', label: 'See projects you can start', interactionType: 'START_WORKFLOW', message: 'Show the DIY projects I can start.', operationId: 'DIY_TEMPLATE_BROWSE', style: 'PRIMARY',
};
const empty = { type: 'EMPTY_STATE', id: 'x', title: 'No projects', body: 'none', actions: [] };
const summary = (actions: unknown[]) => ({ type: 'SUMMARY', id: 'diy-summary', title: 'No DIY projects in progress', body: 'See the reviewed low-risk projects you can start.', tone: 'DEFAULT', actions } as unknown as AskPresentationBlock);
const receipt = {
  type: 'WORKFLOW_PROGRESS', id: 'diy-project-start-receipt', title: 'Project started', status: 'COMPLETED', description: 'The project and its steps were created, and you are on step 1.',
  details: [{ label: 'Project', value: 'Repaint a hallway' }],
  actions: [
    { id: 'diy-start-guide', label: 'Guide me through this project', interactionType: 'START_WORKFLOW', message: 'Guide me through this project.', operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: 'p9', style: 'PRIMARY' },
    { id: 'open-diy-project', label: 'Open this project', href: '/dashboard/diy/projects/p9?propertyId=home', style: 'SECONDARY' },
  ],
} as unknown as AskPresentationBlock;

const execution = (blocks: AskPresentationBlock[]): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-1', question: 'q', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-07T12:00:00.000Z', updatedAt: '2026-10-07T12:00:00.000Z', viewState: null, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entityType: false, entityId: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const props = (ask: jest.Mock) => ({
  isSuperseded: false, justUpdatedExecutionId: null, updateExecution: jest.fn(), loading: false, ask, selectedPropertyId: 'home', setInput: jest.fn(), visibleSuggestions: [],
  activeSessionRef: { current: 'session' }, refreshResult: jest.fn(), refreshPending: false, onAccessLost: jest.fn(), contextOpen: false, onOpenContext: jest.fn(),
});
const card = (blocks: AskPresentationBlock[], ask = jest.fn()) => ({ ask, ...render(<ExecutionCard execution={execution(blocks)} {...props(ask)} />) });

describe('starting a DIY project from Ask', () => {
  it('the row action on a reviewed template launches the declared start for that template with the exact canned message', () => {
    const view = card([browseList()]);
    fireEvent.click(screen.getByRole('button', { name: /Start this project/ }));
    expect(view.ask).toHaveBeenCalledTimes(1);
    const call = view.ask.mock.calls[0];
    expect(call[0]).toBe('Start this project.');
    expect(JSON.stringify(call)).toContain('DIY_PROJECT_START');
    expect(JSON.stringify(call)).toContain('DIY_TEMPLATE');
    expect(JSON.stringify(call)).toContain('"t1"');
  });

  it('a card without the row action (a viewer) offers no control that starts a project, and an already-started template shows its status and links to the project', () => {
    const view = card([browseList(false)]);
    expect(screen.queryByRole('button', { name: /Start this project/ })).toBeNull();
    expect(view.container.textContent).toContain('Already started');
  });

  it('the DIY projects card launches the browse with its declared message, and the receipt launches the guide of the new project', () => {
    const first = card([summary([browseAction])]);
    fireEvent.click(screen.getByRole('button', { name: /See projects you can start/ }));
    expect(first.ask).toHaveBeenLastCalledWith('Show the DIY projects I can start.', undefined, expect.objectContaining({ operationId: 'DIY_TEMPLATE_BROWSE', sourceExecutionId: 'exec-1' }));
    first.unmount();
    const second = card([receipt]);
    fireEvent.click(screen.getByRole('button', { name: /Guide me through this project/ }));
    expect(second.ask).toHaveBeenLastCalledWith('Guide me through this project.', undefined, expect.objectContaining({ operationId: 'DIY_PROJECT_GUIDE', entityType: 'DIY_PROJECT', entityId: 'p9' }));
  });

  it('an empty browse says so', () => {
    const view = card([empty as unknown as AskPresentationBlock]);
    expect(view.container.textContent).toContain('No projects');
  });
});
