import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClarificationCard } from '../workspace/CaptureCards';
import { api } from '@/lib/api/client';
import type { AskClarification, AskExecutionResponse } from '@/features/ask/types';

jest.mock('@/lib/api/client', () => ({ api: { submitAskClarification: jest.fn() } }));

// A card's buttons used to send only the operation id, so two options running the same operation were one choice shown twice (and shared a React key). A typed option now
// sends its own option id (its payload stays on the server); a plain option sends its operation id as before.
const FUTURE = new Date(Date.now() + 30 * 60 * 1000).toISOString();
const submit = api.submitAskClarification as unknown as jest.Mock;
const completed = jest.fn();
const renderCard = (clarification: AskClarification) => render(<ClarificationCard executionId="exec-1" clarification={clarification} onCompleted={completed} />);

beforeEach(() => { submit.mockReset(); completed.mockReset(); submit.mockResolvedValue({ success: true, data: { executionId: 'exec-1' } as unknown as AskExecutionResponse }); });

describe('clarification card payload', () => {
  const typed: AskClarification = {
    version: 1, question: 'Your question can be read two ways. Which do you mean?', allowFreeText: true, expiresAt: FUTURE,
    options: [
      { operationId: 'DATA_POINT_READ', optionId: 'option-1', label: 'Items with no warranty, and items with maintenance due' },
      { operationId: 'DATA_POINT_READ', optionId: 'option-2', label: 'Items with no warranty and no maintenance due' },
    ],
  };

  it('sends the option id of the button pressed, not the operation both buttons share', async () => {
    renderCard(typed);
    fireEvent.click(screen.getByRole('button', { name: 'Items with no warranty and no maintenance due' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const payload = submit.mock.calls[0][1];
    expect(payload.optionId).toBe('option-2');
    expect(payload.operationId).toBeUndefined();
    expect(payload.answer).toBeUndefined();
  });

  it('renders both buttons even though they run the same operation (no key collision)', () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    renderCard(typed);
    expect(screen.getAllByRole('button').filter((button) => /Items with no warranty/.test(button.textContent ?? ''))).toHaveLength(2);
    expect(errors.mock.calls.some((call) => /same key|unique "key"/i.test(String(call[0])))).toBe(false);
    errors.mockRestore();
  });

  it('a plain option still sends its operation id', async () => {
    renderCard({ version: 1, question: 'Which?', allowFreeText: false, expiresAt: FUTURE, options: [{ operationId: 'MAINTENANCE_STATUS', label: 'Review maintenance' }, { operationId: 'INVENTORY_LOOKUP', label: 'Look up an item' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Look up an item' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][1].operationId).toBe('INVENTORY_LOOKUP');
    expect(submit.mock.calls[0][1].optionId).toBeUndefined();
  });

  it('a typed answer still sends free text', async () => {
    renderCard(typed);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'no warranty and no maintenance due' } });
    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][1].answer).toBe('no warranty and no maintenance due');
    expect(submit.mock.calls[0][1].optionId).toBeUndefined();
  });
});
