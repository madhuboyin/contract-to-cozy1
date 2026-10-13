import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationalCapture } from '../calm/ConversationalCapture';
import { InlineCaptureCard } from '../workspace/CaptureCards';
import type { AskCaptureRequest } from '@/features/ask/types';
import type { StructuredCaptureField } from '@/components/property-context/featureContextTypes';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.12 IW-CONV-004/005 (FRD v1.112).
const task: StructuredCaptureField = { key: 'taskId', label: 'Open task', prompt: 'Which task did you complete?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Chimney cleaning', value: 't1' }, { label: 'Furnace', value: 't2' }] } };
const cost: StructuredCaptureField = { key: 'actualCostUsd', label: 'Actual cost', prompt: 'Was there an actual cost?', helpText: 'Optional', required: false, inputSchema: { type: 'DECIMAL', min: 0, unit: 'USD' } };
const many: StructuredCaptureField = { key: 'taskId', label: 'Open task', prompt: 'Which task?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Array.from({ length: 12 }, (_, i) => ({ label: `Task ${i}`, value: `t${i}` })) } };
const request = { question: 'Which task was completed?', allowNotSure: false, destinationLabel: 'Nothing is saved until you confirm', fallbackHref: null } as unknown as AskCaptureRequest;

function Harness({ fields = [task, cost], initial = {}, onSubmit = jest.fn(), error = null }: { fields?: StructuredCaptureField[]; initial?: Record<string, unknown>; onSubmit?: jest.Mock; error?: string | null }) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  return <ConversationalCapture request={request} fields={fields} values={values} saving={false} error={error} autoFocus
    onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} onSubmit={onSubmit} />;
}

describe('ConversationalCapture', () => {
  it('asks one question at a time, advances on a tapped choice, and submits once with both answers', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    expect(screen.getByText('Which task did you complete?')).toBeInTheDocument();
    expect(screen.queryByText('Was there an actual cost?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Furnace' }));
    expect(screen.getByText('Was there an actual cost?')).toBeInTheDocument();
    expect(screen.getByText('(optional)')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Actual cost'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ taskId: 't2', actualCostUsd: 45 });
  });

  it('skips an optional question without inventing a value, and cannot skip a required one', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chimney cleaning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).toHaveBeenCalledWith({ taskId: 't1', actualCostUsd: undefined });
  });

  it('lets an earlier answer be changed before submitting', () => {
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chimney cleaning' }));
    fireEvent.click(screen.getByRole('button', { name: /Change Open task/ }));
    expect(screen.getByText('Which task did you complete?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Furnace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't2' }));
  });

  it('never submits by itself when it opens with everything already answered; it waits for Continue', () => {
    const onSubmit = jest.fn();
    render(<Harness initial={{ taskId: 't1', actualCostUsd: -5 }} onSubmit={onSubmit} />);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('list', { name: 'Your answers so far' })).toHaveTextContent('Chimney cleaning');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('uses a picker instead of chips for a long list, and shows a save error without resubmitting', () => {
    const onSubmit = jest.fn();
    const { rerender } = render(<Harness fields={[many]} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Task 3' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Open task'), { target: { value: 't3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(<Harness fields={[many]} onSubmit={onSubmit} error="Could not save this home detail." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save this home detail.');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('after a rejected save with everything answered, offers Continue again instead of leaving no way forward', () => {
    const onSubmit = jest.fn();
    const { rerender } = render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chimney cleaning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rerender(<Harness onSubmit={onSubmit} error="Enter a valid estimate." />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('keeps the reassurance line and drops the long form copy', () => {
    render(<Harness />);
    expect(screen.getByText('Nothing is saved until you confirm.')).toBeInTheDocument();
  });
});

describe('grouped workflow capture', () => {
  beforeEach(() => window.localStorage.clear());

  it('moves through declared groups while retaining draft values and submits only from the final group', () => {
    const groupedRequest = {
      requirementId: 'project-completion', captureKey: 'PROJECT_TRACKER_COMMAND_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
      title: 'Complete this project', question: 'Confirm every closeout category.', helpText: null, allowNotSure: false, sensitivity: 'STANDARD',
      destinationLabel: 'Completes the project after confirmation', fallbackHref: null, confirmationText: null, expectedContextVersion: 'v1', presentation: 'FORM',
      inputSchema: { type: 'GROUP', groups: [
        { id: 'readiness', title: 'Readiness', fieldKeys: ['actualCost'] },
        { id: 'verification', title: 'Verification', fieldKeys: ['verified'] },
        { id: 'closeout', title: 'Closeout declarations', fieldKeys: ['closeout'] },
        { id: 'provider', title: 'Provider and warranty', fieldKeys: ['warranty'] },
      ], fields: [
        { key: 'actualCost', label: 'Actual cost', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 1000 } },
        { key: 'verified', label: 'Verified', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' } },
        { key: 'closeout', label: 'Closeout', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Done', falseLabel: 'Not done' } },
        { key: 'warranty', label: 'Warranty months', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 1200 } },
      ] }, currentAnswer: { verified: true, closeout: true },
    } as unknown as AskCaptureRequest;
    render(<InlineCaptureCard executionId="completion-execution" request={groupedRequest} onCompleted={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Actual cost'), { target: { value: '450' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: Verification' }));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText('Actual cost')).toHaveValue(450);
    fireEvent.click(screen.getByRole('button', { name: 'Next: Verification' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Closeout declarations' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Provider and warranty' }));
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((item) => item.getAttribute('aria-current') === 'step')).toHaveLength(1);
  });

  it('says a workflow form is reviewed next, without the awkward "after you continue" suffix, and steps a long figures form', () => {
    const longRequest = {
      requirementId: 'buyer-cd-draft-edit-inputs', captureKey: 'BUYER_CD_DRAFT_EDIT', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Edit your Closing Disclosure draft',
      question: 'Enter the figures as they appear on the document.', allowNotSure: false, sensitivity: 'STANDARD', expectedContextVersion: 'v1', confirmationText: null,
      destinationLabel: 'Used to prepare this change; nothing is saved until you confirm',
      inputSchema: { type: 'GROUP', groups: [
        { id: 'loan', title: 'The loan', fieldKeys: ['loanAmount', 'noteRate', 'apr', 'issuedDate'] },
        { id: 'close', title: 'Cash to close', fieldKeys: ['cashToClose'] },
      ], fields: [
        { key: 'loanAmount', label: 'Loan amount ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 1_000_000_000 } },
        { key: 'noteRate', label: 'Interest rate (%)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 50 } },
        { key: 'apr', label: 'APR (%)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 50 } },
        { key: 'issuedDate', label: 'Issued date', required: false, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
        { key: 'cashToClose', label: 'Cash to close ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 1_000_000_000 } },
      ] }, currentAnswer: {},
    } as unknown as AskCaptureRequest;
    render(<InlineCaptureCard executionId="cd-execution" request={longRequest} onCompleted={jest.fn()} />);
    expect(screen.getByText('Used to prepare this change; nothing is saved until you confirm.')).toBeInTheDocument();
    expect(screen.queryByText(/after you continue/)).toBeNull();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Loan amount ($)').closest('fieldset')).toHaveClass('border-0');
    expect(screen.getByLabelText('Loan amount ($)').closest('fieldset')).not.toHaveClass('p-4');
    expect(screen.queryByLabelText('Cash to close ($)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next: Cash to close' }));
    expect(screen.getByLabelText('Cash to close ($)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeInTheDocument();
  });
});
