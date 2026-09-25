/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoverageTab from '../CoverageTab';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));

const item = (id: string, name: string, valueUsd: number, extra: Record<string, unknown> = {}) => ({ id, name, displayName: name, replacementCostCents: valueUsd * 100, roomId: 'r1', room: { name: 'Office' }, ...extra }) as any;
const rooms = [{ id: 'r1', name: 'Office' }] as any;

function setup(items: any[], onSet: jest.Mock | null = jest.fn().mockResolvedValue(undefined)) {
  const onOpenCoverage = jest.fn();
  render(<CoverageTab items={items} rooms={rooms} onOpenCoverage={onOpenCoverage} onOpenActions={jest.fn()} onSetCoverageNotRequired={onSet ?? undefined} />);
  return { onSet, onOpenCoverage };
}
const gap = (id: string, name: string, value: number) => item(id, name, value, { coverageState: 'MISSING', coverageActionable: true });
const waived = (id: string, name: string, value: number) => item(id, name, value, { coverageNotRequired: true, coverageState: 'NOT_REQUIRED' });

describe('Coverage tab with waived items', () => {
  it('shows a "Coverage waived" legend row with the waived dollars only when something is waived', () => {
    setup([gap('a', 'Desk', 150), waived('b', 'Mirror', 200)]);
    const row = screen.getByText('Coverage waived').closest('div')!;
    expect(row).toHaveTextContent('$200');
  });

  it('has no waived legend row or waived section when nothing is waived', () => {
    setup([gap('a', 'Desk', 150)]);
    expect(screen.queryByText('Coverage waived')).toBeNull();
    expect(document.querySelector('[data-coverage-section="waived"]')).toBeNull();
  });

  it('lists waived items in a collapsible "Coverage not required" section, not in the items-needing-coverage list, and restores one', async () => {
    const { onSet } = setup([gap('a', 'Desk', 150), waived('b', 'Mirror', 200)]);
    const section = document.querySelector('[data-coverage-section="waived"]') as HTMLElement;
    expect(within(section).getByText('Coverage not required (1 item)')).toBeInTheDocument();
    expect(within(section).getByText('Mirror')).toBeInTheDocument();
    expect(screen.getByText('Items needing coverage (1)')).toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), false));
  });

  it('shows a plain message and changes nothing when restoring fails', async () => {
    setup([waived('b', 'Mirror', 200)], jest.fn().mockRejectedValue(new Error('x')));
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not restore that item. Nothing was changed.');
  });

  it('the row menu offers Get coverage and Mark as not needed; a low-value item is marked straight away', async () => {
    const { onSet, onOpenCoverage } = setup([gap('a', 'Desk', 150)]);
    await userEvent.click(screen.getByRole('button', { name: 'More options for Desk' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as not needed' }));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true));
    onSet!.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'More options for Desk' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Get coverage' }));
    expect(onOpenCoverage).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(onSet).not.toHaveBeenCalled();
  });

  it('an item worth $500 or more asks first: Go back changes nothing, Confirm marks it', async () => {
    const { onSet } = setup([gap('a', 'Sofa', 500)]);
    await userEvent.click(screen.getByRole('button', { name: 'More options for Sofa' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as not needed' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("Sofa is valued at $500. Are you sure you don't need coverage?");
    await userEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onSet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'More options for Sofa' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mark as not needed' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true));
  });

  it('a room whose items are all waived shows a dash, not 0%', () => {
    setup([waived('b', 'Mirror', 200)]);
    const card = screen.getByText('Coverage by Room').parentElement!;
    expect(card).toHaveTextContent('Office—');
    expect(card).not.toHaveTextContent('0%');
  });

  it('without a save handler there is no row menu and no Restore button', () => {
    setup([gap('a', 'Desk', 150), waived('b', 'Mirror', 200)], null);
    expect(screen.queryByRole('button', { name: /More options/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });
});
