/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkCoverageBar from '../BulkCoverageBar';

const item = (id: string, valueUsd: number, coverageState = 'MISSING') => ({ id, name: id, replacementCostCents: valueUsd * 100, coverageState }) as any;

describe('BulkCoverageBar', () => {
  it('renders nothing when no shown item is a candidate', () => {
    const { container } = render(<BulkCoverageBar items={[item('a', 900), item('b', 100, 'CONFIRMED')]} onConfirm={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many need details, and asks first with the count and the total before saving anything', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ done: 2, failed: 0 });
    render(<BulkCoverageBar items={[item('a', 150), item('b', 200), item('big', 900)]} onConfirm={onConfirm} />);
    expect(screen.getByText('2 items shown still need coverage details.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Mark 2 items as not needing coverage?');
    expect(dialog).toHaveTextContent('$350');
    expect(dialog).toHaveTextContent('1 item worth $500 or more is not included; review it one at a time.');
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Confirm saves only the eligible items and reports the result', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ done: 2, failed: 0 });
    render(<BulkCoverageBar items={[item('a', 150), item('b', 200), item('big', 900)]} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0].map((entry: any) => entry.id)).toEqual(['a', 'b']);
    expect(await screen.findByRole('status')).toHaveTextContent('Marked 2 items as not needing coverage.');
  });

  it('while saving, the dialog cannot be dismissed and Confirm cannot be pressed twice', async () => {
    let release: (v: { done: number; failed: number }) => void = () => {};
    const onConfirm = jest.fn(() => new Promise<{ done: number; failed: number }>((resolve) => { release = resolve; }));
    render(<BulkCoverageBar items={[item('a', 150)]} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    release({ done: 1, failed: 0 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reports partial failure plainly, and a thrown error as everything unsaved', async () => {
    const partial = jest.fn().mockResolvedValue({ done: 1, failed: 1 });
    const { unmount } = render(<BulkCoverageBar items={[item('a', 150), item('b', 200)]} onConfirm={partial} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Marked 1, and 1 could not be saved. Nothing else was changed.');
    unmount();
    render(<BulkCoverageBar items={[item('a', 150)]} onConfirm={jest.fn().mockRejectedValue(new Error('x'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Marked 0, and 1 could not be saved.');
  });

  it('after everything is saved the bar keeps showing the result even though no candidates remain', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ done: 1, failed: 0 });
    const { rerender } = render(<BulkCoverageBar items={[item('a', 150)]} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark all as not needed' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }));
    await screen.findByRole('status');
    rerender(<BulkCoverageBar items={[]} onConfirm={onConfirm} />);
    expect(screen.getByRole('status')).toHaveTextContent('Marked 1 item as not needing coverage.');
    expect(screen.queryByRole('button', { name: 'Mark all as not needed' })).toBeNull();
  });
});
