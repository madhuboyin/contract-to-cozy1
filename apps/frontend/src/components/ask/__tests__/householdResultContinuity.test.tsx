import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { HouseholdResultList } from '../HouseholdResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { HouseholdMember } from '@/types';

jest.mock('@/lib/api/client', () => ({ api: { listHouseholdMembers: jest.fn() } }));
const mockedListHouseholdMembers = api.listHouseholdMembers as jest.MockedFunction<typeof api.listHouseholdMembers>;

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'property-household', title: 'Household access', filters: [],
  description: 'Select a household member to inspect their current canonical role without leaving Ask Cozy.',
  sections: [{ id: 'household', title: 'Household members', count: 2, items: [
    { id: 'member-0', title: 'Sarah Homeowner', entityType: 'HOUSEHOLD_MEMBER', meta: ['Owner', 'Joined Sep 18, 2026'], description: null, status: 'PRIMARY OWNER', href: null },
    { id: 'member-1', title: 'Sam Contributor', entityType: 'HOUSEHOLD_MEMBER', meta: ['Contributor', 'Joined Sep 17, 2026'], description: null, status: null, href: null },
  ] }],
  actions: [{ id: 'open-household', label: 'Open household access', href: '/dashboard/properties/home/household', style: 'SECONDARY' }],
};

function execution(revision = 1): AskExecutionResponse {
  return { executionId: 'execution', sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'property-summary', revision, domainScopePhrase: 'property summary', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}

function List({ response, onAccessLost = () => {} }: { response: AskExecutionResponse; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><HouseholdResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onAccessLost={onAccessLost} link={(href, content) => <a href={href}>{content}</a>} /></ResultViewContext.Provider>;
}

function canonicalMember(overrides: Partial<HouseholdMember> = {}): HouseholdMember {
  return {
    id: 'member-0', propertyId: 'home', userId: 'user-0', role: 'OWNER', isPrimaryOwner: true,
    displayName: null, joinedAt: '2026-09-18T00:00:00.000Z', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
    user: { id: 'user-0', firstName: 'Sarah', lastName: 'Homeowner', email: 'sarah@example.com' },
    ...overrides,
  };
}

beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); });

test('Property Summary household member titles dispatch through the registry and open canonical member detail inline', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  mockedListHouseholdMembers.mockResolvedValueOnce([canonicalMember()]);

  render(<BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Sarah Homeowner' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open household access/ })).toHaveAttribute('href', '/dashboard/properties/home/household');
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Homeowner' }));

  await waitFor(() => expect(screen.getByText('sarah@example.com')).toBeInTheDocument());
  expect(mockedListHouseholdMembers).toHaveBeenCalledWith('home');
  expect(window.location.pathname).toBe('/dashboard/ask');
});

test('household member selection persists in result view state', async () => {
  mockedListHouseholdMembers.mockResolvedValueOnce([canonicalMember()]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Homeowner' }));
  await waitFor(() => expect(screen.getByText('sarah@example.com')).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBe('member-0');
});

test('a member removed from the household is distinct from an access-loss failure', async () => {
  mockedListHouseholdMembers.mockResolvedValueOnce([canonicalMember({ id: 'member-1' })]);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Homeowner' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No longer a household member'));
});

test('property access denial redacts the whole result instead of exposing a household state', async () => {
  const onAccessLost = jest.fn();
  mockedListHouseholdMembers.mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Homeowner' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a member leaving the refreshed result clears selection without choosing a substitute', () => {
  mockedListHouseholdMembers.mockResolvedValueOnce([canonicalMember()]);
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Sarah Homeowner' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 1, items: block.sections[0].items.filter((item) => item.id !== 'member-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'property-summary')).detailTaskId).toBeNull();
});
