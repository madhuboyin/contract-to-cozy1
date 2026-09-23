import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import type { AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getAskMonitor: jest.fn(), updateAskMonitor: jest.fn() } }));
const mockedGet = api.getAskMonitor as jest.MockedFunction<typeof api.getAskMonitor>;
const mockedUpdate = api.updateAskMonitor as jest.MockedFunction<typeof api.updateAskMonitor>;

// FRD v1.45 mortgage-refinance-radar slice: the refinance analysis now shows the homeowner's rate monitors through
// MonitorBlock, which is the only place a monitor can be paused, resumed or stopped.
const block = (status: 'ACTIVE' | 'PAUSED' | 'STOPPED' = 'ACTIVE'): Extract<AskPresentationBlock, { type: 'MONITOR' }> => ({
  type: 'MONITOR', id: 'rate-monitor-m1', monitorId: 'm1', title: 'Your mortgage-rate monitor', status,
  threshold: '5.500% or lower', product: '30-year fixed national benchmark', channel: 'Email plus in-app', cadence: 'IMMEDIATE', quietHours: null,
  sourceBoundary: 'Evaluates governed national benchmark snapshots; this is not a personalized lender offer.',
  actions: [{ id: 'edit-monitor', label: 'Alert delivery settings', href: '/dashboard/properties/home/tools/mortgage-refinance-radar#refinance-evidence-settings', style: 'SECONDARY' }],
});
const renderBlock = (value = block()) => render(<BlockView block={value} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
const live = (status: 'ACTIVE' | 'PAUSED' | 'STOPPED') => ({ success: true, data: { id: 'm1', status } }) as Awaited<ReturnType<typeof api.getAskMonitor>>;

beforeEach(() => jest.clearAllMocks());

test('shows the LIVE status, not the one in the answer, with the matching control', async () => {
  mockedGet.mockResolvedValueOnce(live('PAUSED'));
  renderBlock(block('ACTIVE'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledWith('m1');
});

test('Pause writes through the monitor endpoint and flips to Resume', async () => {
  mockedGet.mockResolvedValueOnce(live('ACTIVE'));
  mockedUpdate.mockResolvedValueOnce(live('PAUSED'));
  renderBlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument());
  expect(mockedUpdate).toHaveBeenCalledWith('m1', 'PAUSE');
});

test('Stop asks first, then stops; a stopped monitor offers no controls', async () => {
  mockedGet.mockResolvedValueOnce(live('ACTIVE'));
  mockedUpdate.mockResolvedValueOnce(live('STOPPED'));
  renderBlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
  expect(mockedUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm stop' }));
  await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('m1', 'STOP'));
  await waitFor(() => expect(screen.queryByRole('button', { name: /Pause|Resume|Stop/ })).not.toBeInTheDocument());
});

test('a failed update is shown and the control stays', async () => {
  mockedGet.mockResolvedValueOnce(live('ACTIVE'));
  mockedUpdate.mockRejectedValueOnce(new Error('Rate monitor not found.'));
  renderBlock();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Rate monitor not found.');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
});

test('the only link is the radar page\'s alert delivery settings', async () => {
  mockedGet.mockResolvedValueOnce(live('ACTIVE'));
  renderBlock();
  expect(screen.getByRole('link', { name: /Alert delivery settings/ })).toHaveAttribute('href', '/dashboard/properties/home/tools/mortgage-refinance-radar#refinance-evidence-settings');
  await waitFor(() => expect(mockedGet).toHaveBeenCalled());
});
