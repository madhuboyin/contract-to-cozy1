import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkItemDetailDTO, HouseholdMember, Document as PropertyDocument } from '@/types';

const mockGetWorkItem = jest.fn<Promise<unknown>, unknown[]>();
const mockListHouseholdMembers = jest.fn<Promise<HouseholdMember[]>, unknown[]>(() => Promise.resolve([]));
const mockListDocuments = jest.fn<Promise<unknown>, unknown[]>(() => Promise.resolve({ success: true, data: { documents: [] as PropertyDocument[] } }));
const mockAssignWorkItemOwner = jest.fn<Promise<unknown>, unknown[]>();
const mockAddWorkItemWatcher = jest.fn<Promise<unknown>, unknown[]>();
const mockRemoveWorkItemWatcher = jest.fn<Promise<unknown>, unknown[]>();
const mockTransitionWorkItem = jest.fn<Promise<unknown>, unknown[]>();
const mockRecordWorkItemEvidence = jest.fn<Promise<unknown>, unknown[]>();
const mockSnoozeWorkItem = jest.fn<Promise<unknown>, unknown[]>();
const mockRescheduleWorkItem = jest.fn<Promise<unknown>, unknown[]>();
const mockCompleteWorkItem = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('@/lib/api/client', () => ({
  api: {
    getWorkItem: (...args: unknown[]) => mockGetWorkItem(...args),
    listHouseholdMembers: (...args: unknown[]) => mockListHouseholdMembers(...args),
    listDocuments: (...args: unknown[]) => mockListDocuments(...args),
    assignWorkItemOwner: (...args: unknown[]) => mockAssignWorkItemOwner(...args),
    addWorkItemWatcher: (...args: unknown[]) => mockAddWorkItemWatcher(...args),
    removeWorkItemWatcher: (...args: unknown[]) => mockRemoveWorkItemWatcher(...args),
    transitionWorkItem: (...args: unknown[]) => mockTransitionWorkItem(...args),
    recordWorkItemEvidence: (...args: unknown[]) => mockRecordWorkItemEvidence(...args),
    snoozeWorkItem: (...args: unknown[]) => mockSnoozeWorkItem(...args),
    rescheduleWorkItem: (...args: unknown[]) => mockRescheduleWorkItem(...args),
    completeWorkItem: (...args: unknown[]) => mockCompleteWorkItem(...args),
  },
}));

// The confirm-destructive-action hook resolves true immediately in tests.
jest.mock('@/components/system/ConfirmDestructiveActionDialog', () => ({
  useConfirmDestructiveAction: () => ({
    requestConfirmation: () => Promise.resolve(true),
    confirmationDialog: null,
  }),
}));

import { WorkItemManageDrawer } from '../WorkItemManageDrawer';

function member(userId: string, firstName: string): HouseholdMember {
  return {
    id: `member-${userId}`, propertyId: 'property-1', userId, role: 'CONTRIBUTOR', isPrimaryOwner: false,
    joinedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    user: { id: userId, firstName, lastName: 'Rivera', email: `${userId}@example.com` },
  } as HouseholdMember;
}

function baseDetail(overrides: Partial<WorkItemDetailDTO> = {}): WorkItemDetailDTO {
  return {
    id: 'wi-1',
    workKey: 'property:property-1:maintenance-item-1',
    subjectType: 'PROPERTY',
    subjectId: 'property-1',
    obligationType: 'MAINTENANCE_TASK',
    state: 'ACCEPTED',
    acceptanceState: 'ACCEPTED',
    disposition: null,
    priority: 'SOON',
    safetyTier: 'LOW_CONSEQUENCE',
    title: 'Replace HVAC filter',
    homeownerReason: 'Recommended by the seasonal checklist.',
    expectedOutcome: 'The filter is replaced.',
    dueWindowStart: null,
    dueAt: '2026-08-24T00:00:00.000Z',
    dueWindowEnd: null,
    ownerUserId: null,
    confidence: null,
    missingContext: [],
    snoozedUntil: null,
    scheduleOverrideAt: null,
    recurrenceTemplateKey: null,
    occurrenceKey: null,
    understoodAt: null,
    materialApprovalRequired: false,
    materialApprovedAt: null,
    isRoutine: false,
    reconciliationPending: false,
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:00:00.000Z',
    acceptedAt: null,
    startedAt: null,
    reportedCompletedAt: null,
    verifiedAt: null,
    deferredUntil: null,
    dismissedAt: null,
    closedAt: null,
    supersededByWorkItemId: null,
    sources: [],
    executions: [{ executionType: 'MAINTENANCE_TASK', executionEntityId: 'task-1', role: 'PRIMARY', responsibleParty: 'OWNER' }],
    evidence: [],
    watchers: [],
    materialApprovedByUserId: null,
    legalNextStates: ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
    closureDispositionRule: 'OPTIONAL',
    ...overrides,
  } as WorkItemDetailDTO;
}

function renderDrawer() {
  return render(
    <WorkItemManageDrawer
      propertyId="property-1"
      workItemId="wi-1"
      open
      onOpenChange={() => {}}
      onChanged={() => Promise.resolve()}
    />,
  );
}

describe('WorkItemManageDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListHouseholdMembers.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue({ success: true, data: { documents: [] } });
  });

  it('leads with the task title, its reason, and a friendly status — not the raw enum', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    renderDrawer();

    expect(await screen.findByText('Replace HVAC filter')).toBeInTheDocument();
    expect(screen.getByText('Recommended by the seasonal checklist.')).toBeInTheDocument();
    expect(screen.getByText('On your list')).toBeInTheDocument();
    expect(screen.queryByText('Manage work item')).not.toBeInTheDocument();
    // The everyday controls are present; the raw state machine is not surfaced up top.
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Snooze' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument();
  });

  it('hides "who\'s handling this?" for a single-member household', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    renderDrawer();
    await screen.findByText('Replace HVAC filter');
    expect(screen.queryByText(/who.s handling this/i)).not.toBeInTheDocument();
  });

  it('shows "who\'s handling this?" and assigns an owner when the household has more than one member', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockListHouseholdMembers.mockResolvedValue([member('user-1', 'Sam'), member('user-2', 'Alex')]);
    mockAssignWorkItemOwner.mockResolvedValue({ success: true, data: baseDetail({ ownerUserId: 'user-2' }) });
    renderDrawer();

    const choose = await screen.findByText('Choose someone');
    await act(async () => { fireEvent.click(choose); });
    const alex = await screen.findByText('Alex Rivera');
    await act(async () => { fireEvent.click(alex); });

    await waitFor(() => expect(mockAssignWorkItemOwner).toHaveBeenCalledWith('property-1', 'wi-1', 'user-2'));
  });

  it('snooze uses the dedicated snooze endpoint', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockSnoozeWorkItem.mockResolvedValue({ success: true, data: baseDetail({ snoozedUntil: '2026-09-06T12:00:00.000Z' }) });
    renderDrawer();
    await screen.findByText('Replace HVAC filter');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Snooze' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'In a week' })); });
    const confirm = screen.getAllByRole('button', { name: 'Snooze' }).at(-1)!;
    await act(async () => { fireEvent.click(confirm); });

    await waitFor(() => expect(mockSnoozeWorkItem).toHaveBeenCalledTimes(1));
    expect(mockSnoozeWorkItem.mock.calls[0][0]).toBe('property-1');
    expect(mockSnoozeWorkItem.mock.calls[0][1]).toBe('wi-1');
  });

  it('reschedule uses the dedicated reschedule endpoint', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockRescheduleWorkItem.mockResolvedValue({ success: true, data: baseDetail({ dueAt: '2026-09-10T12:00:00.000Z' }) });
    renderDrawer();
    await screen.findByText('Replace HVAC filter');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reschedule' })); });
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(dateInput, { target: { value: '2026-09-10' } }); });
    const confirm = screen.getAllByRole('button', { name: 'Reschedule' }).at(-1)!;
    await act(async () => { fireEvent.click(confirm); });

    await waitFor(() => expect(mockRescheduleWorkItem).toHaveBeenCalledTimes(1));
  });

  it('"Not for me" closes the item with a NOT_RELEVANT disposition', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockTransitionWorkItem.mockResolvedValue({ success: true, data: baseDetail({ state: 'CLOSED', disposition: 'NOT_RELEVANT' }) });
    renderDrawer();
    await screen.findByText('Replace HVAC filter');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Not for me' })); });

    await waitFor(() => expect(mockTransitionWorkItem).toHaveBeenCalledWith('property-1', 'wi-1', 'CLOSED', 'NOT_RELEVANT'));
  });

  it('keeps the operational controls (raw status, watchers, evidence, workKey) under Advanced', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    renderDrawer();
    await screen.findByText('Replace HVAC filter');

    // Still present (inside the collapsed <details>), just not up front.
    expect(screen.getByText('Advanced options')).toBeInTheDocument();
    expect(screen.getByText('Change status')).toBeInTheDocument();
    expect(screen.getByText('Watchers')).toBeInTheDocument();
    expect(screen.getByText('No one is watching this item.')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('property:property-1:maintenance-item-1')).toBeInTheDocument();
  });

  it('reframes material approval as "Confirm the result"', async () => {
    mockGetWorkItem.mockResolvedValue({
      success: true,
      data: baseDetail({
        materialApprovalRequired: true,
        safetyTier: 'MATERIAL_FINANCIAL',
        evidence: [{ id: 'ev-1', evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-1', verificationStatus: 'PENDING', observedAt: '2026-08-24T00:00:00.000Z' }],
      }),
    });
    renderDrawer();

    expect(await screen.findByText('Confirm the result')).toBeInTheDocument();
    expect(screen.queryByText(/manager approval required/i)).not.toBeInTheDocument();
  });

  it('for a closed item, shows a "nothing more to do" line instead of action buttons', async () => {
    mockGetWorkItem.mockResolvedValue({
      success: true,
      data: baseDetail({ state: 'CLOSED', legalNextStates: [], closureDispositionRule: null }),
    });
    renderDrawer();

    expect(await screen.findByText(/nothing more to do here/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
  });
});
