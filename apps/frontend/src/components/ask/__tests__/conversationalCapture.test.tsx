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
  it('offers Cancel only to flows that can be abandoned, only while a question is being asked, and never submits by cancelling', () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    const { rerender } = render(<ConversationalCapture request={request} fields={[task]} values={{}} saving={false} error={null} onChange={() => undefined} onSubmit={onSubmit} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    rerender(<ConversationalCapture request={request} fields={[task]} values={{}} saving={false} error={null} onChange={() => undefined} onSubmit={onSubmit} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    // Once every question is answered the review owns Cancel, so this one goes away.
    rerender(<ConversationalCapture request={request} fields={[task]} values={{ taskId: 't2' }} saving={false} error={null} onChange={() => undefined} onSubmit={onSubmit} onCancel={onCancel} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

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

describe('Plant Advisor compact capture', () => {
  it('uses the compact redesign without guessing pet access or skipping review', () => {
    const plantRequest = {
      requirementId: 'room-plant-recommendation-inputs', captureKey: 'ROOM_PLANT_RECOMMENDATION_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
      title: 'Find plants for a room', question: 'Choose the room and the growing conditions you want recommendations for.',
      helpText: 'Light level is required because Plant Advisor does not guess it. Care effort, pets and goals refine the fit.',
      allowNotSure: false, sensitivity: 'STANDARD', expectedContextVersion: 'v1', confirmationText: null,
      destinationLabel: 'You’ll review these preferences before Cozy updates this room’s recommendations',
      inputSchema: { type: 'GROUP', fields: [
        { key: 'roomId', label: 'Room', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Kitchen', value: 'kitchen' }, { label: 'Dining', value: 'dining' }] } },
        { key: 'lightLevel', label: 'Light level', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Low', value: 'LOW' }, { label: 'Bright indirect', value: 'BRIGHT_INDIRECT' }] } },
        { key: 'maintenancePreference', label: 'Care effort (optional)', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Low', value: 'LOW' }, { label: 'Medium', value: 'MEDIUM' }] } },
        { key: 'hasPets', label: 'Can pets access this room?', helpText: 'Choose Unsure if you cannot confidently rule out pet access.', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No', unknownLabel: 'Unsure' } },
        { key: 'goals', label: 'Goals (optional)', helpText: 'Choose any that matter to you.', required: false, inputSchema: { type: 'MULTI_SELECT', options: [{ label: 'Decor', value: 'DECOR' }, { label: 'Low maintenance', value: 'LOW_MAINTENANCE' }], maxItems: 5 } },
        { key: 'notes', label: 'Placement notes (optional)', helpText: 'For example, an AC vent, a narrow shelf or limited floor space.', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
      ] }, currentAnswer: { goals: [] },
    } as unknown as AskCaptureRequest;
    const { container } = render(<InlineCaptureCard executionId="plant-capture" request={plantRequest} onCompleted={jest.fn()} />);

    expect(container.querySelector('[data-plant-advisor-redesign="compact"]')).toBeInTheDocument();
    expect(screen.getByText('Choose any that matter to you.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Unsure' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByLabelText('Placement notes (optional)').tagName).toBe('TEXTAREA');

    fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bright indirect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unsure' }));
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  });
});

describe('Service Price Radar contractor quote compact capture', () => {
  it('renders a compact white card with full-width service selector, $ currency prefix, live summary pill, and Cancel button', () => {
    const priceCheckRequest = {
      requirementId: 'service-price-check-inputs',
      captureKey: 'SERVICE_PRICE_CHECK_INPUTS',
      classification: 'WORKFLOW_INPUT',
      state: 'UNKNOWN',
      title: 'Check a contractor quote',
      question: 'Which service is the quote for, and what is the amount?',
      helpText: 'The check compares the amount with typical local prices for the service. You will review it before it is checked.',
      allowNotSure: false,
      sensitivity: 'STANDARD',
      expectedContextVersion: 'v1',
      confirmationText: null,
      destinationLabel: 'Used to prepare this check; nothing is checked until you confirm',
      inputSchema: {
        type: 'GROUP',
        fields: [
          {
            key: 'serviceCategory',
            label: 'Service',
            required: true,
            inputSchema: {
              type: 'SINGLE_SELECT',
              options: [
                { label: 'HVAC', value: 'HVAC' },
                { label: 'Plumbing', value: 'PLUMBING' },
                { label: 'Water Heater', value: 'WATER_HEATER' },
              ],
            },
          },
          {
            key: 'quoteAmount',
            label: 'Quote amount',
            helpText: 'In dollars, up to $250,000.',
            required: true,
            inputSchema: { type: 'DECIMAL', min: 1, max: 250000, unit: 'USD' },
          },
          {
            key: 'quoteVendorName',
            label: 'Contractor',
            required: false,
            inputSchema: { type: 'SHORT_TEXT', maxLength: 160 },
          },
          {
            key: 'serviceLabelRaw',
            label: 'What the quote covers',
            helpText: 'Optional: for example, replace the water heater.',
            required: false,
            inputSchema: { type: 'SHORT_TEXT', maxLength: 160 },
          },
        ],
      },
      currentAnswer: {},
    } as unknown as AskCaptureRequest;

    const { container } = render(<InlineCaptureCard executionId="price-check-capture" request={priceCheckRequest} onCompleted={jest.fn()} />);

    const form = container.querySelector('[data-service-price-check-capture]');
    expect(form).toHaveClass('max-w-[680px]', 'bg-white');
    expect(container.querySelector('[data-service-price-check-redesign="compact"]')).toBeInTheDocument();
    expect(screen.getByText('Service Price Radar')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2 · Quote details')).toBeInTheDocument();
    expect(screen.queryByText('Complete this workflow')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();

    // USD DECIMAL field renders with a '$' currency prefix
    const amountInput = screen.getByLabelText('Quote amount');
    expect(amountInput.parentElement).toHaveTextContent('$');

    // Selecting a service and entering an amount updates the live header pill and enables Continue to review
    fireEvent.click(screen.getByRole('button', { name: 'HVAC' }));
    fireEvent.change(amountInput, { target: { value: '7000' } });
    expect(screen.getByText('HVAC · $7,000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
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

  it('shows Project Tracker setup as four focused stages instead of one wall of fields', () => {
    const projectRequest = {
      requirementId: 'project-create', captureKey: 'PROJECT_TRACKER_CREATE_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
      title: 'Start a project', question: 'What work are you planning?', helpText: null, allowNotSure: false, sensitivity: 'STANDARD',
      destinationLabel: 'Nothing is created until you confirm', fallbackHref: null, confirmationText: null, expectedContextVersion: 'v1', presentation: 'FORM',
      inputSchema: { type: 'GROUP', groups: [
        { id: 'project', title: 'Project', fieldKeys: ['name', 'projectType'] },
        { id: 'team-budget', title: 'Team and budget', fieldKeys: ['fulfillmentMode', 'contractorName', 'contractAmountDollars'] },
        { id: 'schedule', title: 'Schedule and milestone', fieldKeys: ['startDate', 'initialMilestoneName'] },
        { id: 'requirements', title: 'Requirements and documents', fieldKeys: ['permitApplicability', 'hoaApplicability'] },
      ], fields: [
        { key: 'name', label: 'Project name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
        { key: 'projectType', label: 'Project type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'ROOF', label: 'Roof replacement' }, { value: 'CUSTOM', label: 'Custom project' }] } },
        { key: 'fulfillmentMode', label: 'Who will do the work?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'PROVIDER', label: 'Contractor / provider' }, { value: 'DIY', label: 'DIY / household' }] } },
        { key: 'contractorName', label: 'Contractor or company', required: true, when: { fieldKey: 'fulfillmentMode', operator: 'EQUALS', value: 'PROVIDER' }, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
        { key: 'contractAmountDollars', label: 'Contract or project amount ($)', required: true, inputSchema: { type: 'NUMBER', min: 0, max: 100000000 } },
        { key: 'startDate', label: 'Start date', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 20 } },
        { key: 'initialMilestoneName', label: 'First milestone', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 200 } },
        { key: 'permitApplicability', label: 'Permit', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'UNKNOWN', label: 'Not sure yet' }] } },
        { key: 'hoaApplicability', label: 'HOA approval', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ value: 'UNKNOWN', label: 'Not sure yet' }] } },
      ] }, currentAnswer: { projectType: 'CUSTOM', fulfillmentMode: 'PROVIDER', permitApplicability: 'UNKNOWN', hoaApplicability: 'UNKNOWN' },
    } as unknown as AskCaptureRequest;
    const { container } = render(<InlineCaptureCard executionId="project-create-execution" request={projectRequest} onCompleted={jest.fn()} />);

    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contractor or company')).toBeNull();
    expect(container.querySelector('[data-compact-capture="project-create"] > div')).toHaveClass('md:col-span-6');
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Replace the roof' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: Team and budget' }));
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    expect(screen.getByLabelText('Contractor or company')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).toBeNull();
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

  it('renders the work-item due-date change as one compact, non-repeating review form', () => {
    const dueDateRequest = {
      requirementId: 'home-work-item-reschedule-inputs', captureKey: 'WORK_ITEM_RESCHEDULE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
      title: 'Change due date', question: 'Consider replacing your Washer Dryer.', helpText: 'Current due date: Oct 31, 2026',
      destinationLabel: 'You’ll review this change before saving', allowNotSure: false, sensitivity: 'STANDARD', expectedContextVersion: 'v1', confirmationText: null,
      inputSchema: { type: 'GROUP', fields: [{ key: 'dueAt', label: 'New due date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } }] },
      currentAnswer: { dueAt: '2026-10-31' },
    } as unknown as AskCaptureRequest;
    const view = render(<InlineCaptureCard executionId="reschedule-execution" request={dueDateRequest} onCompleted={jest.fn()} />);

    const form = view.container.querySelector('[data-work-item-reschedule]');
    expect(form).toHaveClass('max-w-[680px]', 'p-4');
    expect(screen.getAllByText('Change due date')).toHaveLength(1);
    expect(screen.getByText('Consider replacing your Washer Dryer.')).toBeInTheDocument();
    expect(screen.getByText('Current due date: Oct 31, 2026')).toBeInTheDocument();
    expect(screen.getByText('You’ll review this change before saving.')).toBeInTheDocument();
    expect(screen.queryByText('Complete this workflow')).not.toBeInTheDocument();
    expect(screen.queryByText(/Used to prepare this change/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review change' })).toBeInTheDocument();
  });
});
