import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskWorkspace } from '../AskWorkspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { track } from '@/lib/analytics/events';

// Record, Work and Saved are blocks in the conversation: the REAL AskWorkspace with the API mocked at the client boundary.
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, ...rest }: any) => <a href={typeof href === 'string' ? href : '#'} {...rest}>{children}</a> }));
jest.mock('@/lib/auth/AuthContext', () => ({ useAuth: () => ({ user: { firstName: 'Sam', lastName: 'Lee', email: 's@example.com' }, logout: jest.fn() }) }));
jest.mock('@/lib/property/PropertyContext', () => ({ usePropertyContext: () => ({ selectedPropertyId: 'home-1', setSelectedPropertyId: jest.fn() }) }));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('@/lib/api/client', () => ({
  api: {
    getConciergeHome: jest.fn(), createAskExecution: jest.fn(), getRecentAskSessions: jest.fn(), searchAskSessions: jest.fn(), getAskPendingWork: jest.fn(),
    getAskSession: jest.fn(), getProperties: jest.fn(), getAskTargetSelection: jest.fn(),
  },
}));

const mocked = api as unknown as Record<string, jest.Mock>;
const ok = (data: unknown) => Promise.resolve({ success: true, data });
const starter = (id: string, operationId: string, extra = {}) => ({ id, entryId: `entry-${id}`, capabilityId: `cap-${id}`, selectorId: null, label: `Label ${id}`, message: `Message ${id}`, operationId, interactionType: 'CONVERSATION_CONTINUE', availability: 'AVAILABLE', reasonCodes: [], entityContext: { propertyId: 'home-1' }, ...extra });
const conciergeView = (propertyId = 'home-1') => ({
  propertyId, generatedAt: '2026-10-09T00:00:00.000Z',
  journeyContext: { state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'NO_ACTION', rankingPolicyVersion: null, generatedAt: null, items: [], truncated: false, href: '/dashboard' },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' }, decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  homeContinuity: { state: 'AVAILABLE', decisions: [], activeMajorMoment: null }, landingSpotlight: null,
  capabilityGroups: [
    { id: 'PROTECT', label: 'Protect your home', description: 'Find coverage gaps, risks, and important changes.', capabilityIds: ['coverage'], prompts: [
      { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', label: 'Which items are missing coverage?', question: 'Which items are missing coverage?', operationId: 'COVERAGE_GAPS', aliases: ['insurance'] },
    ] },
    { id: 'MAINTAIN', label: 'Maintain and prevent', description: 'Stay ahead of maintenance.', capabilityIds: ['maintenance'], prompts: [
      { id: 'maintain-seasonal', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', label: 'Home care for this season', question: 'What home care should I do this season?', operationId: 'SEASONAL_HOME_CARE', aliases: ['winter', 'seasonal checklist'] },
    ] },
  ], featuredPrompts: [], suggestedQuestions: [],
  discoveryTopics: [
    { id: 'HOME_CARE', label: 'Home care', order: 1, indicator: null, starters: [starter('care-seasonal', 'SEASONAL_HOME_CARE', { interactionType: 'START_WORKFLOW' })] },
    { id: 'DIY_PROJECTS', label: 'DIY & Projects', order: 2, indicator: null, starters: [] },
    { id: 'HOME_RECORD', label: 'My Home Record', order: 3, indicator: null, starters: [starter('record-summary', 'PROPERTY_SUMMARY'), starter('record-add-detail', 'PROPERTY_CONTEXT_AREA_CAPTURE', { interactionType: 'SELECT_TARGET', selectorId: 'PROPERTY_AREA' })] },
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



// jsdom applies no breakpoint CSS, so the shortcuts are reached through the narrow-screen Explore disclosure.
const openShortcut = async (name: string) => {
  await waitFor(() => expect(mocked.getConciergeHome).toHaveBeenCalled());
  const toggle = () => screen.getAllByRole('button', { name: 'Explore with Cozy' }).find((button) => button.hasAttribute('aria-expanded')) as HTMLElement;
  await waitFor(() => { fireEvent.click(toggle()); expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument(); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: new RegExp(name) })); });
};

describe('AskWorkspace: everything is a turn of the conversation', () => {
  it('a sidebar hint asks its question as the next turn; there is no page to go to', async () => {
    mount();
    await openShortcut('Browse my home record');
    expect(mocked.createAskExecution).toHaveBeenCalledTimes(1);
    expect(mocked.createAskExecution.mock.calls[0][0]).toMatchObject({ message: 'Browse my home record', propertyId: 'home-1' });
    expect(await screen.findByRole('form', { name: 'Ask Cozy question' })).toBeInTheDocument();
    expect(document.querySelector('a[href*="/dashboard/ask/"]')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Ask Cozy destinations' })).toBeNull();
    expect(document.querySelector('[data-ask-inline-view]')).toBeNull();
  });

  it.each([['What needs me', 'What needs me?'], ['Find something saved', 'Show my saved results']])('"%s" asks %s', async (name, question) => {
    mount();
    await openShortcut(name);
    expect(mocked.createAskExecution.mock.calls[0][0]).toMatchObject({ message: question });
  });

  it('exporting is a question too: the confirmation, not a form, is where the export is reviewed', async () => {
    mount();
    await openShortcut('Export my home record');
    expect(mocked.createAskExecution.mock.calls[0][0]).toMatchObject({ message: 'Export my home record', propertyId: 'home-1' });
    expect(document.querySelector('[data-ask-inline-view]')).toBeNull();
  });
});
