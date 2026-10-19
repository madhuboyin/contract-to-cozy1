import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AskWorkspace } from '../AskWorkspace';
import { api } from '@/lib/api/client';

// Record correction routing: the REAL AskWorkspace with the API mocked at the client boundary. A Record launch carries the record's own
// operation and entity to the first request, so the command opens for that record and not for a name the answer might not list.
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
const execution = {
  schemaVersion: '1.0', executionId: 'ex-1', sessionId: 's-1', question: 'Rename this room.', status: 'ANSWERED', property: { id: 'home-1', label: '1 Main St' },
  operation: { id: 'ROOM_RENAME', version: '1.0', family: 'COMMAND' }, contextVersion: null, blocks: [], captureRequests: [], confirmation: null, clarification: null,
  correctionCapabilities: { intent: false, entity: false, homeRecord: false, retryResponse: false }, suggestions: [], suggestedNextActionsGoverned: true, suggestedNextActions: [],
  createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:00:00.000Z',
};
const conciergeView = {
  propertyId: 'home-1', generatedAt: '2026-10-09T00:00:00.000Z',
  journeyContext: { state: 'UNKNOWN', ownershipState: null, operatingMode: 'UNKNOWN', entryPath: null, propertyOrigin: null, contextVersion: null, capturedAt: null },
  priorityList: { state: 'NO_ACTION', rankingPolicyVersion: null, generatedAt: null, items: [], truncated: false, href: '/dashboard' },
  changes: { state: 'NO_CHANGE', windowDays: 14, items: [], href: '/dashboard' }, decisions: { state: 'NO_DECISIONS', items: [], href: '/dashboard' },
  homeContinuity: { state: 'AVAILABLE', decisions: [], activeMajorMoment: null }, landingSpotlight: null, capabilityGroups: [], featuredPrompts: [], suggestedQuestions: [], discoveryTopics: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  Element.prototype.scrollTo = jest.fn();
  window.localStorage.clear();
  mocked.getConciergeHome.mockImplementation(() => ok(conciergeView));
  mocked.getRecentAskSessions.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
  mocked.searchAskSessions.mockImplementation(() => ok({ sessions: [], nextCursor: null }));
  mocked.getAskPendingWork.mockImplementation(() => ok({ items: [] }));
  mocked.getAskSession.mockImplementation(() => ok({ executions: [] }));
  mocked.getProperties.mockImplementation(() => ok({ properties: [] }));
  mocked.createAskExecution.mockImplementation(() => ok(execution));
});

const mount = (props: React.ComponentProps<typeof AskWorkspace>) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AskWorkspace mode="page" {...props} /></QueryClientProvider>);
const send = async () => {
  const input = await screen.findByRole('textbox');
  await waitFor(() => expect((input as HTMLTextAreaElement).value).not.toBe(''));
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  await waitFor(() => expect(mocked.createAskExecution).toHaveBeenCalled());
  return mocked.createAskExecution.mock.calls[0][0];
};

describe('AskWorkspace Record launch', () => {
  it('sends the record’s operation and entity with the first message it prefilled', async () => {
    mount({ initialPropertyId: 'home-1', initialQuestion: 'Rename this room.', launchRecord: { operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'room-9' } });
    const request = await send();
    expect(request.message).toBe('Rename this room.');
    expect(request.launchContext).toMatchObject({ operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'room-9' });
  });

  it('drops the record target once the homeowner edits the question, so a different request is never attached to that record', async () => {
    mount({ initialPropertyId: 'home-1', initialQuestion: 'Rename this room.', launchRecord: { operationId: 'ROOM_RENAME', entityType: 'INVENTORY_ROOM', entityId: 'room-9' } });
    const input = await screen.findByRole('textbox');
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe('Rename this room.'));
    fireEvent.change(input, { target: { value: 'What is my roof type?' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(mocked.createAskExecution).toHaveBeenCalled());
    const { launchContext } = mocked.createAskExecution.mock.calls[0][0];
    expect(launchContext.operationId).toBeUndefined();
    expect(launchContext.entityId).toBeUndefined();
  });

  it('sends no record target when the question was not launched from the Record', async () => {
    mount({ initialPropertyId: 'home-1', initialQuestion: 'Rename this room.' });
    const { launchContext } = await send();
    expect(launchContext.operationId).toBeUndefined();
  });
});
