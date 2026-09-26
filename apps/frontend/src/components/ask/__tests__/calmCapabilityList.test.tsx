import { fireEvent, render, screen } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { CalmChromeContext, CalmSecondaryContext } from '../blocks/calmContext';
import { AskBlockActionContext } from '../blocks/context';
import type { AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 (IW-CONV-001/002/003, FRD v1.112): the "What comes next" tool list is one quiet row per tool.
const capability = (id: string, overrides = {}) => ({
  id, label: `Tool ${id}`, description: `Does the ${id} job.`, expectedOutput: 'A practical maintenance or prevention action.', href: `/dashboard/tools/${id}`,
  inlineLaunch: { interactionType: 'CONVERSATION_CONTINUE', operationId: 'X', message: `Explore ${id}` }, inlineBoundary: 'You can inspect current records here. Further tool actions may still require opening the full page.',
  readiness: 'READY', readinessLabel: 'Ready for this home', readinessReasons: [], releaseStage: 'ACTIVE', ...overrides,
});
const block = (capabilities: unknown[]) => ({ type: 'CAPABILITY_LIST', id: 'next', title: 'What comes next', description: 'Ranked for what you just did.', capabilities } as unknown as AskPresentationBlock);
const view = (value: AskPresentationBlock, secondary = false, invoke = jest.fn()) => render(
  <CalmChromeContext.Provider value><CalmSecondaryContext.Provider value={secondary}><AskBlockActionContext.Provider value={{ disabled: false, invoke }}>
    <BlockView block={value} executionId="e" propertyId="home" itemActionsDisabled={false} onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </AskBlockActionContext.Provider></CalmSecondaryContext.Provider></CalmChromeContext.Provider>,
);

describe('calm capability list', () => {
  it('shows one row per tool without the long per-tool paragraphs', () => {
    view(block([capability('a'), capability('b')]));
    expect(screen.getByText('Tool a')).toBeInTheDocument();
    expect(screen.getByText('Does the a job.')).toBeInTheDocument();
    expect(screen.queryByText(/Full tool:/)).toBeNull();
    expect(screen.queryByText('Ready for this home')).toBeNull();
    expect(screen.queryByText(/Further tool actions may still require/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Explore/ })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Open Tool a' })).toHaveAttribute('href', expect.stringContaining('/dashboard/tools/a'));
  });

  it('collapses a supporting list behind one line, and still says what is not ready', () => {
    const { container } = view(block([capability('a', { readiness: 'NEEDS_CONTEXT', readinessLabel: 'More home details will improve the result', readinessReasons: ['Add current mortgage facts.'] }), capability('b')]), true);
    const details = container.querySelector('details[data-calm-secondary]') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByText('What comes next · 2 tools')).toBeInTheDocument();
    fireEvent.click(screen.getByText('What comes next · 2 tools'));
    expect(screen.getByText('More home details will improve the result · Add current mortgage facts.')).toBeInTheDocument();
  });

  it('says a tool without an inline launch opens the full page, and an unavailable tool has no launch control', () => {
    view(block([capability('a', { inlineLaunch: null }), capability('b', { readiness: 'UNAVAILABLE', readinessLabel: 'Not available right now', readinessReasons: [] })]));
    expect(screen.getByText('Opens the full page')).toBeInTheDocument();
    expect(screen.getByLabelText('Tool b unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Tool b' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Explore.*Tool b/ })).toBeNull();
    expect(screen.getByText('Not available right now')).toBeInTheDocument();
  });

  it('starts the tool in Ask from the row', () => {
    const invoke = jest.fn();
    view(block([capability('a')]), false, invoke);
    fireEvent.click(screen.getByRole('button', { name: /Explore/ }));
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'X', message: 'Explore a', interactionType: 'START_WORKFLOW' }));
  });
});
