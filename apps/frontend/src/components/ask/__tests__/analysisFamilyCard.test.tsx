import { render, screen } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Owner review of the first five UI slices: the declared family selects the permitted anatomy at the client. A producer that declares ANALYSIS and still sends a list never gets the list on screen.
const blocks = (): AskPresentationBlock[] => [
  { type: 'SUMMARY', id: 'analysis', title: 'Owning beats renting starting in year 3.', body: 'At $3,200 a month in rent.', headline: 'Owning beats renting starting in year 3.', tone: 'DEFAULT', presentationFamily: 'ANALYSIS', actions: [] },
  { type: 'GROUPED_LIST', id: 'stray-list', title: 'Own-vs-rent break-even analysis', filters: [], actions: [], sections: [{ id: 's', title: '', count: 1, items: [{ id: 'p', title: 'Own-vs-rent break-even analysis', meta: [] }] }] },
];
const execution = (presentationFamily: AskExecutionResponse['presentationFamily']) => ({
  sessionId: 'session', executionId: 'execution', question: 'How long until owning beats renting?', status: 'ANSWERED', property: { id: 'home', label: 'Main' }, presentationFamily,
  createdAt: '2026-11-21T10:00:00.000Z', updatedAt: '2026-11-21T10:00:00.000Z', viewState: null, blocks: blocks(), captureRequests: [], confirmation: null, clarification: null,
  correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);
const card = (value: AskExecutionResponse) => render(
  <ExecutionCard execution={value} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);

describe('declared presentation family selects the anatomy', () => {
  beforeEach(() => { window.localStorage.clear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());

  it('an ANALYSIS answer shows its conclusion and no list', async () => {
    const { container } = card(execution('ANALYSIS'));
    expect(await screen.findByText('Owning beats renting starting in year 3.')).toBeInTheDocument();
    expect(container.querySelector('[data-grouped-list-presentation]')).toBeNull();
    expect(screen.queryByText('Own-vs-rent break-even analysis')).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('an answer with no declared family is shown as before', async () => {
    const { container } = card(execution(null));
    expect(await screen.findByText('Owning beats renting starting in year 3.')).toBeInTheDocument();
    expect(container.querySelector('[data-grouped-list-presentation]')).not.toBeNull();
  });
});
