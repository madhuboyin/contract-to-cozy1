import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import { CALM_ANSWERS_STORAGE_KEY } from '@/features/ask/calmAnswers';
import type { AskExecutionResponse } from '@/features/ask/types';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getRadarEventDetail: jest.fn(() => new Promise(() => undefined)) } }));

// Radar R-1 (FRD v1.132): the monitored-event feed in the calm anatomy.
const event = (id: string, title: string, status = 'new') => ({ id, title, description: `${title} is in effect.`, meta: ['high', 'National Weather Service'], status, entityType: 'RADAR_MATCH', href: `/dashboard/properties/home/tools/home-event-radar?matchId=${id}`, actions: [] });
const filters = [
  { id: 'radar-lifecycle-all', label: 'Any time', message: 'Show my home event radar feed', active: true },
  { id: 'radar-lifecycle-now', label: 'Happening now', message: 'Only show events happening now', active: false },
  { id: 'radar-family-all', label: 'All sources', message: 'Show my home event radar feed', active: true },
  { id: 'radar-family-weather', label: 'Weather', message: 'Only show weather events', active: false },
  { id: 'radar-hide-dismissed', label: 'Hide dismissed', message: 'Show my home event radar feed', active: true },
  { id: 'radar-include-dismissed', label: 'Include dismissed', message: 'Now show events including dismissed ones', active: false },
];
const withClear = [...filters, { id: 'radar-clear-all', label: 'Clear filters', message: 'Now show all events with no filters', active: false }];
const blocks = () => [
  { type: 'SUMMARY', id: 'home-event-radar-summary', title: 'Monitored home events', headline: '2 events are happening now.', supportLine: 'Most important: Heat advisory.', body: 'x', tone: 'DEFAULT',
    chips: [{ label: '1 high priority', tone: 'CRITICAL' }, { label: '2 happening now', tone: 'CAUTION' }], actions: [] },
  { type: 'GROUPED_LIST', id: 'home-event-radar-feed', title: 'Home Event Radar feed', filters,
    sections: [{ id: 'radar-weather', title: 'Weather', count: 2, items: [event('m1', 'Heat advisory'), event('m2', 'Air quality alert')] }],
    actions: [{ id: 'open-radar', label: 'Open Home Event Radar', href: '/dashboard/properties/home/tools/home-event-radar', style: 'SECONDARY' }] },
  { type: 'BOUNDARY', id: 'radar-feed-boundary', title: 'Recorded information only', body: 'This is not an emergency alert service and does not confirm that nothing else is happening.', severity: 'INFO', suggestions: [] },
];
const execution = () => ({
  sessionId: 'session', executionId: 'execution', question: 'Show my home event radar feed', status: 'ANSWERED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-09-26T19:32:55.000Z', updatedAt: '2026-09-26T19:32:55.000Z', viewState: null, blocks: blocks(),
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const askMock = jest.fn();
const card = (value: AskExecutionResponse = execution()) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={askMock} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); askMock.mockClear(); });

describe('calm Home Event Radar answer', () => {
  it('leads with the counted sentence and chips, and states the boundary as a quiet footnote', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: '2 events are happening now.' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'At a glance' })).toHaveTextContent('1 high priority');
    expect(screen.getByText('Most important: Heat advisory.')).toBeInTheDocument();
    expect(container.querySelector('[data-calm-footnote]')).toHaveTextContent('not an emergency alert service');
  });

  it('offers one dominant step, the top-ranked event, and no other filled button', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const { container } = card();
    const step = await screen.findByRole('button', { name: 'Review: Heat advisory' });
    expect(container.querySelectorAll('[data-radar-review-top]')).toHaveLength(1);
    expect(container.querySelectorAll('button.bg-teal-700')).toHaveLength(1);
    fireEvent.click(step);
    // The step opens the event's canonical detail inline; it does not navigate.
    expect(api.getRadarEventDetail).toHaveBeenCalledWith('home', 'm1');
  });

  it('shows the filters as quiet groups and sends a chip as a message', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    card();
    const timing = await screen.findByRole('group', { name: 'Filter by timing' });
    const source = screen.getByRole('group', { name: 'Filter by source' });
    expect(within(timing).getByRole('button', { name: 'Any time' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Dismissed events' })).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(source).getByRole('button', { name: 'Weather' }));
    // A chip continues this result through its source execution, so the earlier one collapses instead of stacking a second live feed.
    expect(askMock).toHaveBeenCalledWith('Only show weather events', undefined, { sourceExecutionId: 'execution' });
  });

  it('offers "Clear filters" only while a filter is applied', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const value = execution();
    ((value.blocks as unknown[])[1] as { filters: unknown }).filters = withClear;
    card(value);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    expect(askMock).toHaveBeenCalledWith('Now show all events with no filters', undefined, { sourceExecutionId: 'execution' });
    expect(screen.queryAllByRole('button', { name: 'Clear filters' })).toHaveLength(1);
  });

  it('says nothing matches, and keeps the chips, when a filter leaves no events', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '1');
    const value = execution();
    ((value.blocks as unknown[])[1] as { filters: unknown; sections: unknown[] }).filters = withClear;
    ((value.blocks as unknown[])[1] as { sections: unknown[] }).sections = [{ id: 'radar-no-match', title: 'No matching events', count: 0, items: [] }];
    card(value);
    expect(await screen.findByRole('group', { name: 'Filter by timing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Review:/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  it('keeps the previous presentation, with no review step, when the setting is off', async () => {
    window.localStorage.setItem(CALM_ANSWERS_STORAGE_KEY, '0');
    const { container } = card();
    expect(await screen.findByRole('heading', { name: 'Monitored home events' })).toBeInTheDocument();
    expect(container.querySelector('[data-radar-review-top]')).toBeNull();
    expect(container.querySelector('[data-radar-filters]')).toBeNull();
  });
});
