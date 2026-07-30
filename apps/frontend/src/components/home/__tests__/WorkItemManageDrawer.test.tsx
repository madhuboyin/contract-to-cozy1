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
  },
}));

import { WorkItemManageDrawer } from '../WorkItemManageDrawer';

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
    dueAt: null,
    dueWindowEnd: null,
    ownerUserId: null,
    confidence: null,
    missingContext: [],
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
    executions: [],
    evidence: [],
    watchers: [],
    legalNextStates: ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'DEFERRED', 'REPORTED_COMPLETE', 'CLOSED'],
    closureDispositionRule: 'OPTIONAL',
    ...overrides,
  };
}

describe('WorkItemManageDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListHouseholdMembers.mockResolvedValue([]);
    mockListDocuments.mockResolvedValue({ success: true, data: { documents: [] } });
  });

  it('loads and renders the work item once opened', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    expect(await screen.findByText('Replace HVAC filter')).toBeInTheDocument();
    expect(mockGetWorkItem).toHaveBeenCalledWith('property-1', 'wi-1');
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('No one is watching this item.')).toBeInTheDocument();
  });

  it('shows a no-further-changes message instead of a status control when legalNextStates is empty', async () => {
    mockGetWorkItem.mockResolvedValue({
      success: true,
      data: baseDetail({ state: 'CLOSED', legalNextStates: [], closureDispositionRule: null }),
    });

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    expect(await screen.findByText(/no further status changes are possible/i)).toBeInTheDocument();
  });

  it('removing a watcher calls removeWorkItemWatcher with the right ids', async () => {
    mockGetWorkItem.mockResolvedValue({
      success: true,
      data: baseDetail({ watchers: [{ userId: 'user-2', addedAt: '2026-07-24T12:00:00.000Z' }] }),
    });
    mockRemoveWorkItemWatcher.mockResolvedValue({ success: true, data: baseDetail({ watchers: [] }) });

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    const removeButton = await screen.findByText('Remove');
    await act(async () => { fireEvent.click(removeButton); });

    await waitFor(() => {
      expect(mockRemoveWorkItemWatcher).toHaveBeenCalledWith('property-1', 'wi-1', 'user-2');
    });
  });

  it('opening the owner picker shows the household member list', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockListHouseholdMembers.mockResolvedValue([
      {
        id: 'member-1', propertyId: 'property-1', userId: 'user-2', role: 'CONTRIBUTOR', isPrimaryOwner: false,
        joinedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', user: { id: 'user-2', firstName: 'Sam', lastName: 'Rivera', email: 's@example.com' },
      },
    ]);

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    const assignButton = await screen.findByText('Assign owner');
    await act(async () => { fireEvent.click(assignButton); });

    expect(await screen.findByText('Sam Rivera')).toBeInTheDocument();
  });

  it('clicking a member in the owner picker calls assignWorkItemOwner', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockListHouseholdMembers.mockResolvedValue([
      {
        id: 'member-1', propertyId: 'property-1', userId: 'user-2', role: 'CONTRIBUTOR', isPrimaryOwner: false,
        joinedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', user: { id: 'user-2', firstName: 'Sam', lastName: 'Rivera', email: 's@example.com' },
      },
    ]);
    mockAssignWorkItemOwner.mockResolvedValue({ success: true, data: baseDetail({ ownerUserId: 'user-2' }) });

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    const assignButton = await screen.findByText('Assign owner');
    await act(async () => { fireEvent.click(assignButton); });
    const memberButton = await screen.findByText('Sam Rivera');
    await act(async () => { fireEvent.click(memberButton); });

    await waitFor(() => {
      expect(mockAssignWorkItemOwner).toHaveBeenCalledWith('property-1', 'wi-1', 'user-2');
    });
  });

  it('evidence section defaults to DOCUMENT and renders the real document picker', async () => {
    mockGetWorkItem.mockResolvedValue({ success: true, data: baseDetail() });
    mockListDocuments.mockResolvedValue({
      success: true,
      data: { documents: [{ id: 'doc-1', name: 'Inspection report.pdf' }] },
    });

    render(
      <WorkItemManageDrawer
        propertyId="property-1"
        workItemId="wi-1"
        open
        onOpenChange={() => {}}
        onChanged={() => Promise.resolve()}
      />,
    );

    await screen.findByText('Evidence');
    await waitFor(() => expect(mockListDocuments).toHaveBeenCalledWith('property-1'));
    // The free-text fallback's disclosure copy must not appear for the default DOCUMENT type.
    expect(screen.queryByText(/no separate notes field yet/i)).not.toBeInTheDocument();
  });
});
