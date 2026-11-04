/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AskIntakeDialog } from '../intake/AskIntakeDialog';
import { ExecutionFeedback } from '../workspace/ExecutionCard';
import { api } from '@/lib/api/client';
import type { AskExecutionResponse } from '@/features/ask/types';

jest.mock('@/lib/api/client', () => ({ api: {
  getAskIntakeConfig: jest.fn(), uploadAskIntakeFile: jest.fn(), getAskIntake: jest.fn(),
  requestAskCorrection: jest.fn(), submitAskFeedback: jest.fn(),
} }));
const mocks = api as unknown as Record<string, jest.Mock>;

const config = {
  contractVersion: 'ask-intake-v1', acceptedTypes: ['application/pdf'], maxBytes: 1024 * 1024, sensitivities: ['STANDARD'], kinds: [], reportTypes: [],
  disclosures: { retention: '', sharing: '', modelProcessing: '', localProcessing: '', confirmation: '' }, safetyChecks: { engine: 'NONE', statement: '' },
};

describe('UX-07 workspace file seed', () => {
  beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.getAskIntakeConfig.mockResolvedValue({ success: true, data: config }); mocks.uploadAskIntakeFile.mockResolvedValue({ success: false, message: 'stop' }); });

  it('takes a seeded single file through the existing upload path once, and only after the dialog is open', async () => {
    const consumed = jest.fn();
    const file = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });
    render(<AskIntakeDialog open onOpenChange={jest.fn()} propertyId="home-1" seedFiles={[file]} onSeedConsumed={consumed} />);
    await waitFor(() => expect(mocks.uploadAskIntakeFile).toHaveBeenCalledTimes(1));
    expect(mocks.uploadAskIntakeFile.mock.calls[0]).toContain(file);
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('explains several seeded files instead of uploading any', async () => {
    const files = [new File(['a'], 'a.pdf', { type: 'application/pdf' }), new File(['b'], 'b.pdf', { type: 'application/pdf' })];
    render(<AskIntakeDialog open onOpenChange={jest.fn()} propertyId="home-1" seedFiles={files} onSeedConsumed={jest.fn()} />);
    expect(await screen.findByText('Add one file at a time.')).toBeInTheDocument();
    expect(mocks.uploadAskIntakeFile).not.toHaveBeenCalled();
  });

  it('does not upload anything when nothing was seeded', async () => {
    render(<AskIntakeDialog open onOpenChange={jest.fn()} propertyId="home-1" />);
    await screen.findByLabelText('Choose a file to add');
    expect(mocks.uploadAskIntakeFile).not.toHaveBeenCalled();
  });
});

describe('UX-05 in-place correction', () => {
  const capabilities = { intent: true, entity: true, homeRecord: false, retryResponse: false } as AskExecutionResponse['correctionCapabilities'];
  const assign = jest.fn();
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    assign.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
  });

  it('merges the created clarification and does not navigate', async () => {
    const created = { executionId: 'correction' } as AskExecutionResponse;
    mocks.requestAskCorrection.mockResolvedValue({ success: true, data: { executionId: 'correction', href: '/dashboard/ask?x', execution: created } });
    const merge = jest.fn();
    render(<ExecutionFeedback executionId="e1" propertyId="p1" capabilities={capabilities} onCorrectionExecution={merge} />);
    fireEvent.click(screen.getByText('That’s not what I meant'));
    await waitFor(() => expect(merge).toHaveBeenCalledWith(created));
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to the href when the reply carries no execution', async () => {
    mocks.requestAskCorrection.mockResolvedValue({ success: true, data: { executionId: 'correction', href: '/dashboard/ask?x' } });
    render(<ExecutionFeedback executionId="e1" propertyId="p1" capabilities={capabilities} onCorrectionExecution={jest.fn()} />);
    fireEvent.click(screen.getByText('Wrong item'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/ask?x'));
  });

  it('keeps home-record correction on its navigation path', async () => {
    mocks.requestAskCorrection.mockResolvedValue({ success: true, data: { executionId: 'e1', href: '/dashboard/properties/p1', execution: { executionId: 'x' } } });
    const merge = jest.fn();
    render(<ExecutionFeedback executionId="e1" propertyId="p1" capabilities={{ ...capabilities, homeRecord: true }} onCorrectionExecution={merge} />);
    fireEvent.click(screen.getByText('Correct home information'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/properties/p1'));
    expect(merge).not.toHaveBeenCalled();
  });
});
