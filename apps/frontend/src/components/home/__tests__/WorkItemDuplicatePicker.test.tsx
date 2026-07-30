import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkItemListEntryDTO } from '@/types';

const mockListWorkItems = jest.fn();

jest.mock('@/lib/api/client', () => ({
  api: { listWorkItems: (...args: unknown[]) => mockListWorkItems(...args) },
}));

import { WorkItemDuplicatePicker } from '../WorkItemDuplicatePicker';

function item(overrides: Partial<WorkItemListEntryDTO> = {}): WorkItemListEntryDTO {
  return {
    id: 'wi-other',
    workKey: 'property:property-1:maintenance-item-2',
    subjectType: 'PROPERTY',
    subjectId: 'property-1',
    obligationType: 'MAINTENANCE_TASK',
    state: 'ACCEPTED',
    acceptanceState: 'ACCEPTED',
    disposition: null,
    priority: 'SOON',
    safetyTier: 'LOW_CONSEQUENCE',
    title: 'Replace HVAC filter (duplicate)',
    homeownerReason: 'r',
    expectedOutcome: 'o',
    dueWindowStart: null,
    dueAt: null,
    dueWindowEnd: null,
    ownerUserId: null,
    confidence: null,
    missingContext: [],
    createdAt: '2026-07-24T12:00:00.000Z',
    updatedAt: '2026-07-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('WorkItemDuplicatePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes the current work item and CLOSED items from the candidate list', async () => {
    mockListWorkItems.mockResolvedValue({
      success: true,
      data: {
        items: [
          item({ id: 'wi-self', title: 'Self item' }),
          item({ id: 'wi-closed', title: 'Closed item', state: 'CLOSED' }),
          item({ id: 'wi-open', title: 'Open item' }),
        ],
      },
    });

    render(
      <WorkItemDuplicatePicker propertyId="property-1" excludeWorkItemId="wi-self" onSelect={() => {}} />,
    );

    expect(await screen.findByText('Open item')).toBeInTheDocument();
    expect(screen.queryByText('Self item')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed item')).not.toBeInTheDocument();
  });

  it('filters candidates by the search input', async () => {
    mockListWorkItems.mockResolvedValue({
      success: true,
      data: { items: [item({ id: 'wi-a', title: 'Replace HVAC filter' }), item({ id: 'wi-b', title: 'Paint the shed' })] },
    });

    render(
      <WorkItemDuplicatePicker propertyId="property-1" excludeWorkItemId="wi-self" onSelect={() => {}} />,
    );

    await screen.findByText('Replace HVAC filter');
    fireEvent.change(screen.getByPlaceholderText('Search work items…'), { target: { value: 'paint' } });

    expect(screen.queryByText('Replace HVAC filter')).not.toBeInTheDocument();
    expect(screen.getByText('Paint the shed')).toBeInTheDocument();
  });

  it('calls onSelect with the chosen candidate', async () => {
    const onSelect = jest.fn();
    mockListWorkItems.mockResolvedValue({
      success: true,
      data: { items: [item({ id: 'wi-a', title: 'Replace HVAC filter' })] },
    });

    render(
      <WorkItemDuplicatePicker propertyId="property-1" excludeWorkItemId="wi-self" onSelect={onSelect} />,
    );

    const candidate = await screen.findByText('Replace HVAC filter');
    await act(async () => { fireEvent.click(candidate); });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'wi-a' }));
    });
  });
});
