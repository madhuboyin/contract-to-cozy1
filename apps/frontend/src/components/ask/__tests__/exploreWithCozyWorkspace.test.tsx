import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskWorkspace } from '../AskWorkspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

// Explore with Cozy, Phase 2: the REAL AskWorkspace wiring with the API mocked at the client boundary. Nothing is mocked inside the workspace.
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, ...rest }: any) => <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a> }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { firstName: 'Sam', lastName: 'Lee', email: 's@example.com' }, logout: jest.fn() }) }));
jest.mock('@/lib/property/PropertyContext', () => ({ usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }) }));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/lib/api/client', () => ({
  api: {
    getConciergeHome: jest.fn(), createAskExecution: jest.fn(), getRecentAskSessions: jest.fn(), searchAskSessions: jest.fn(), getAskPendingWork: jest.fn(),
    getAskSession: jest.fn(), getProperties: jest.fn(),
  },
}));

const mocked = api as unknown as Record<string, jest.Mock>;
const ok = (data: unknown) => Promise.resolve({ success: true, data });
const starter = (id: string, operationId: string, extra = {}) => ({ id, label: `Label ${id}`, message: `Message ${id}`, operationId, interactionType: 'CONVERSATION_CONTINUE', availability: 'AVAILABLE', reasonCodes: [], entityContext: { propertyId: 'home-1' }, ...extra });
const conciergeView = (propertyId = 'home-1') => ({
  propertyId, generatedAt: '2026-10-09T00:00:00.000Z',
  journeyContext: { state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'NO_ACTION', rankingPolicyVersion: null, generatedAt: null, items: [], truncated: false, href: '/dashboard' },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' }, decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  homeContinuity: { state: 'AVAILABLE', decisions: [], activeMajorMoment: null }, landingSpotlight: null, capabilityGroups: [], featuredPrompts: [], suggestedQuestions: [],
  discoveryTopics: [
    { id: 'HOME_CARE', label: 'Home care', order: 1, indicator: null, starters: [starter('care-seasonal', 'SEASONAL_HOME_CARE', { interactionType: 'START_WORKFLOW' })] },
    { id: 'DIY_PROJECTS', label: 'DIY & Projects', order: 2, indicator: null, starters: [] },
    { id: 'HOME_RECORD', label: 'My Home Record', order: 3, indicator: null, starters: [starter('record-summary', 'PROPERTY_SUMMARY')] },
  ],
});
const execution = {
  schemaVersion: '1.0', executionId: 'ex-1', sessionId: 's-1', question: 'Message care-seasonal', status: 'ANSWERED', property: { id: 'home-1', label: '1 Main St' },
  operation: { id: 'SEASONAL_HOME_CARE', version: '1.0', family: 'STATUS_SUMMARY' }, contextVersion: null, blocks: [], captureRequests: [], confirmation: null, clarification: null,
  correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [], suggestedNextActionsGoverned: true, suggestedNextActions: [],
  createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom does not implement element scrolling; the workspace scrolls the transcript while a request is in flight.
  Element.prototype.scrollTo = jest.fn();
  window.localStorage.clear();
  mocked.getConciergeHome.mockImplementation((propertyId: string) => ok(conciergeView(propertyId)));
  mocked.getRecentAskSessions.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
  mocked.searchAskSessions.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
  mocked.getAskPendingWork.mockImplementation(() => ok({ items: [] }));
  mocked.getAskSession.mockImplementation(() => ok({ executions: [] }));
  mocked.getProperties.mockImplementation(() => ok({ properties: [] }));
  mocked.createAskExecution.mockImplementation(() => ok(execution));
});

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AskWorkspace mode="page" /></QueryClientProvider>);

// The calm landing starts the desktop rail collapsed, so these enter through the narrow-screen disclosure (jsdom applies no breakpoint CSS)
// and the collapsed rail's own Explore button -- the two routes that must always exist.
const disclosureToggle = () => screen.getAllByRole('button', { name: 'Explore with Cozy' }).find((button) => button.hasAttribute('aria-expanded')) as HTMLElement;
const openTopicViaDisclosure = async (name: string) => {
  await waitFor(() => expect(mocked.getConciergeHome).toHaveBeenCalled());
  await waitFor(() => { fireEvent.click(disclosureToggle()); expect(screen.getByRole('button', { name })).toBeInTheDocument(); });
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('AskWorkspace Explore with Cozy wiring', () => {
  it('a topic click sends no request; a starter sends exactly one with its message, operationId and property; Not now sends nothing', async () => {
    mount();
    await openTopicViaDisclosure('Home care');
    expect(screen.getByRole('heading', { name: 'Home care' })).toBeInTheDocument();
    expect(mocked.getConciergeHome).toHaveBeenCalledWith('home-1', expect.anything());
    expect(mocked.createAskExecution).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('heading', { name: 'Home care' })).toBeNull();
    expect(mocked.createAskExecution).not.toHaveBeenCalled();

    await openTopicViaDisclosure('Home care');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Label care-seasonal' })); });
    expect(mocked.createAskExecution).toHaveBeenCalledTimes(1);
    const request = mocked.createAskExecution.mock.calls[0][0];
    expect(request.message).toBe('Message care-seasonal');
    expect(request.propertyId).toBe('home-1');
    expect(request.launchContext).toEqual(expect.objectContaining({ operationId: 'SEASONAL_HOME_CARE', surface: 'ASK_PAGE' }));
  });

  it('the collapsed rail button opens the first topic without sending anything', async () => {
    mount();
    await waitFor(() => expect(mocked.getConciergeHome).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Explore with Cozy' }).some((button) => !button.hasAttribute('aria-expanded'))).toBe(true));
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Explore with Cozy' }).find((button) => !button.hasAttribute('aria-expanded')) as HTMLElement); });
    expect(await screen.findByRole('heading', { name: 'Home care' })).toBeInTheDocument();
    expect(mocked.createAskExecution).not.toHaveBeenCalled();
  });

  it('an empty topic says so honestly and sends nothing', async () => {
    mount();
    await openTopicViaDisclosure('DIY & Projects');
    expect(screen.getByText(/Nothing to suggest here right now/)).toBeInTheDocument();
    expect(mocked.createAskExecution).not.toHaveBeenCalled();
  });

  it('keeps the draft typed in the composer across Explore and Not now', async () => {
    mount();
    const box = await screen.findByPlaceholderText(/.+/);
    fireEvent.change(box, { target: { value: 'is my roof ok' } });
    await openTopicViaDisclosure('Home care');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(((await screen.findByPlaceholderText(/.+/)) as HTMLTextAreaElement).value).toBe('is my roof ok');
    expect(mocked.createAskExecution).not.toHaveBeenCalled();
  });

  it('Explore stays available mid-conversation: the overview loaded once is kept instead of vanishing when the landing is left', async () => {
    mocked.getAskSession.mockImplementation(() => ok({ executions: [] }));
    mount();
    await openTopicViaDisclosure('Home care');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Label care-seasonal' })); });
    await waitFor(() => expect(mocked.createAskExecution).toHaveBeenCalledTimes(1));
    // The conversation is now showing, the landing is gone, and the topics are still offered without another overview request.
    await waitFor(() => expect(screen.queryByPlaceholderText(/Ask/i) ?? screen.queryAllByRole('button', { name: 'Explore with Cozy' })[0]).toBeTruthy());
    expect(disclosureToggle()).toBeInTheDocument();
    // Mid-conversation the desktop rail is expanded and carries the group too; the narrow disclosure offers the same topics.
    expect(within(screen.getByRole('region', { name: 'Explore with Cozy' })).getByRole('button', { name: 'My Home Record' })).toBeInTheDocument();
    fireEvent.click(disclosureToggle());
    expect(within(document.getElementById('ask-explore-disclosure-panel') as HTMLElement).getByRole('button', { name: 'My Home Record' })).toBeInTheDocument();
    expect(mocked.getConciergeHome).toHaveBeenCalledTimes(1);
  });
});
