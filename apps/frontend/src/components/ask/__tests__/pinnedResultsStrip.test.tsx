/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { PinnedResultsStrip } from '../PinnedResultsStrip';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getAskSavedPage: jest.fn(), resolveAskSavedArtifact: jest.fn(), setAskSavedArchive: jest.fn() } }));

describe('pinning is a presentation preference, not saving', () => {
  it('the pinned strip never calls the API, and saving is a separate thing', () => {
    const execution = { executionId: 'e1', updatedAt: '2026-10-20T12:00:00.000Z', question: 'Is my roof ok?', status: 'ANSWERED', blocks: [] } as never;
    const onUnpin = jest.fn();
    render(<PinnedResultsStrip executions={[execution]} onUnpin={onUnpin} />);
    fireEvent.click(screen.getByRole('button', { name: /^Unpin/ }));
    expect(onUnpin).toHaveBeenCalledWith('e1');
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });
});
