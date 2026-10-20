import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskCaptureRequest } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import { InlineCaptureCard } from '../workspace/CaptureCards';
import { editorFieldProblem, normalizeEditorFieldValue } from '../recordEditor/RecordEditor';

// Shared RecordEditor (FRD v1.385) as the warranty reference implementation, and the compact Add warranty form.

const original = { providerName: 'Acme Home Warranty', category: 'HOME_WARRANTY_PLAN', policyNumber: 'POL-123', coverageDetails: 'HVAC.', startDate: '2026-01-01', expiryDate: '2027-12-01', cost: '450.00' };
const editRequest = (errors?: Record<string, string>, currentAnswer: Record<string, string> = original) => ({
  requirementId: 'warranty-update-w1', captureKey: 'WARRANTY_UPDATE_INPUTS', classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM',
  title: 'Edit warranty', question: 'What should change?', helpText: null, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null,
  expectedContextVersion: 'v1', inputSchema: { type: 'GROUP', fields: [] }, currentAnswer,
  editor: {
    recordLabel: 'Acme Home Warranty warranty',
    sections: [{ id: 'warranty', title: 'Warranty' }, { id: 'coverage', title: 'Coverage' }, { id: 'dates-cost', title: 'Dates and cost' }],
    fields: [
      { key: 'providerName', label: 'Provider', kind: 'TEXT', section: 'warranty', required: true, maxLength: 120 },
      { key: 'category', label: 'Coverage type', kind: 'SELECT', section: 'warranty', required: true, options: [{ label: 'Home warranty plan', value: 'HOME_WARRANTY_PLAN' }, { label: 'HVAC', value: 'HVAC' }] },
      { key: 'policyNumber', label: 'Policy number', kind: 'TEXT', section: 'coverage', required: false },
      { key: 'coverageDetails', label: 'Coverage details', kind: 'TEXTAREA', section: 'coverage', required: false },
      { key: 'startDate', label: 'Start date', kind: 'DATE', section: 'dates-cost', required: true },
      { key: 'expiryDate', label: 'Expiration date', kind: 'DATE', section: 'dates-cost', required: true, pastDateNote: 'This date has already passed, so the warranty will show as expired.' },
      { key: 'cost', label: 'Cost (USD)', kind: 'MONEY', section: 'dates-cost', required: false },
    ],
    original, ...(errors ? { errors } : {}),
  },
}) as unknown as AskCaptureRequest;

afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

test('the editor shows every field prefilled in three sections, with friendly labels, native dates and a $ prefix; Save is disabled until something changes', () => {
  const view = render(<InlineCaptureCard executionId="e1" request={editRequest()} onCompleted={jest.fn()} />);
  expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['Warranty', 'Coverage', 'Dates and cost']);
  expect(screen.getByLabelText(/^Provider/)).toHaveValue('Acme Home Warranty');
  expect(screen.getByLabelText(/^Coverage type/)).toHaveDisplayValue('Home warranty plan');
  expect(screen.getByLabelText(/^Start date/)).toHaveAttribute('type', 'date');
  expect(screen.getByLabelText(/^Coverage details/).tagName).toBe('TEXTAREA');
  expect(screen.getByLabelText(/^Cost/)).toHaveValue('450.00');
  expect(view.container.querySelector('[data-record-editor]')).not.toHaveAttribute('role', 'dialog');
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  expect(screen.getByText('Change a detail to enable review.')).toBeVisible();
});

test('submitting sends every field once, normalised; "850" and "850.00" are not a change', async () => {
  const completed = jest.fn();
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: { executionId: 'e1' } } as never);
  render(<InlineCaptureCard executionId="e1" request={editRequest()} onCompleted={completed} />);
  fireEvent.change(screen.getByLabelText(/^Cost/), { target: { value: '450' } });
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^Provider/), { target: { value: '  Better Warranty ' } });
  fireEvent.change(screen.getByLabelText(/^Cost/), { target: { value: '525.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  await waitFor(() => expect(api.submitAskCapture).toHaveBeenCalledTimes(1));
  expect(api.submitAskCapture).toHaveBeenCalledWith('e1', expect.objectContaining({
    captureKey: 'WARRANTY_UPDATE_INPUTS', expectedContextVersion: 'v1', answer: { ...original, providerName: 'Better Warranty', cost: '525.50' },
  }));
  await waitFor(() => expect(completed).toHaveBeenCalled());
});

test('a required field cleared explains why and keeps the focus on the problem instead of submitting', () => {
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: {} } as never);
  render(<InlineCaptureCard executionId="e1" request={editRequest()} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Provider/), { target: { value: '' } });
  expect(screen.getByText('Fix 1 field to continue.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Provider is required.');
  expect(screen.getByLabelText(/^Provider/)).toHaveAttribute('aria-invalid', 'true');
  expect(api.submitAskCapture).not.toHaveBeenCalled();
});

test('server field errors (including the cross-field date rule) show on the field and clear when that field is edited', () => {
  render(<InlineCaptureCard executionId="e1" request={editRequest({ expiryDate: 'The expiration date must be after the start date.' }, { ...original, expiryDate: '2025-12-31' })} onCompleted={jest.fn()} />);
  expect(screen.getByLabelText(/^Expiration date/)).toHaveValue('2025-12-31');
  expect(screen.getByRole('alert')).toHaveTextContent('The expiration date must be after the start date.');
  fireEvent.change(screen.getByLabelText(/^Expiration date/), { target: { value: '2028-01-01' } });
  expect(screen.queryByText('The expiration date must be after the start date.')).not.toBeInTheDocument();
});

test('a past expiry date is allowed and only shows a soft note', () => {
  render(<InlineCaptureCard executionId="e1" request={editRequest()} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Expiration date/), { target: { value: '2026-02-01' } });
  expect(screen.getByRole('note')).toHaveTextContent('already passed');
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeEnabled();
});

test('Cancel uses the governed execution cancellation', async () => {
  const completed = jest.fn();
  jest.spyOn(api, 'cancelAskExecution').mockResolvedValueOnce({ success: true, data: { executionId: 'e1', status: 'CANCELLED' } } as never);
  render(<InlineCaptureCard executionId="e1" request={editRequest()} onCompleted={completed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(api.cancelAskExecution).toHaveBeenCalledWith('e1');
  await waitFor(() => expect(completed).toHaveBeenCalled());
});

test('client helpers: money is canonical and shape problems are reported', () => {
  expect(normalizeEditorFieldValue({ kind: 'MONEY' }, ' 850 ')).toBe('850.00');
  expect(normalizeEditorFieldValue({ kind: 'TEXT' }, ' a ')).toBe('a');
  expect(editorFieldProblem({ key: 'cost', label: 'Cost', kind: 'MONEY', section: 's', required: false }, '1.234')).toMatch(/dollars/);
  expect(editorFieldProblem({ key: 'cost', label: 'Cost', kind: 'MONEY', section: 's', required: false }, '')).toBeNull();
});

const addRequest = {
  requirementId: 'capture-warranty-edit', captureKey: 'CAPTURE_WARRANTY_EDIT', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Add a warranty',
  question: 'Which warranty?', helpText: 'x', allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null, expectedContextVersion: 'add-v1',
  currentAnswer: { providerName: null, category: null, policyNumber: null, coverageDetails: null, startDate: null, expiryDate: null, cost: null },
  inputSchema: { type: 'GROUP', fields: [
    { key: 'providerName', label: 'Provider', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
    { key: 'category', label: 'Coverage type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Home warranty plan', value: 'HOME_WARRANTY_PLAN' }, { label: 'HVAC', value: 'HVAC' }] } },
    { key: 'policyNumber', label: 'Policy number', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
    { key: 'coverageDetails', label: 'Coverage details', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } },
    { key: 'startDate', label: 'Start date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'expiryDate', label: 'Expiration date', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: true } },
    { key: 'cost', label: 'Cost (USD)', required: false, inputSchema: { type: 'MONEY', currency: 'USD', min: 0, max: 10000000 } },
  ] },
} as unknown as AskCaptureRequest;

test('Add warranty uses the same editor as Edit: same sections, select, native dates, multiline details, $ cost, Cancel, and a reason Continue is disabled', () => {
  const view = render(<InlineCaptureCard executionId="a1" request={addRequest} onCompleted={jest.fn()} />);
  expect(view.container.querySelector('[data-record-editor]')).toBeInTheDocument();
  expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['Warranty', 'Coverage', 'Dates and cost']);
  expect(screen.getByLabelText(/^Coverage type/).tagName).toBe('SELECT');
  expect(screen.getByLabelText(/^Start date/)).toHaveAttribute('type', 'date');
  expect(screen.getByLabelText(/^Coverage details/).tagName).toBe('TEXTAREA');
  expect(screen.getByText('$')).toBeVisible();
  expect(screen.getAllByText('(optional)')).toHaveLength(3);
  expect(screen.queryByText(/Optional\. What you paid/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  expect(screen.getByText('Add the provider, coverage type, start date and expiration date to continue.')).toBeVisible();
});

test('Add warranty: Continue enables once required fields are valid and submits exact-day dates and a numeric cost; a reversed date range blocks it with the reason', async () => {
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: { executionId: 'a1' } } as never);
  render(<InlineCaptureCard executionId="a1" request={addRequest} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Provider/), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText(/^Coverage type/), { target: { value: 'HVAC' } });
  fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2026-06-01' } });
  fireEvent.change(screen.getByLabelText(/^Expiration date/), { target: { value: '2026-01-01' } });
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('The expiration date must be after the start date.');
  fireEvent.change(screen.getByLabelText(/^Start date/), { target: { value: '2019-01-01' } });
  fireEvent.change(screen.getByLabelText(/^Expiration date/), { target: { value: '2020-01-01' } });
  fireEvent.change(screen.getByLabelText(/^Cost/), { target: { value: '99.5' } });
  expect(screen.getByRole('note')).toHaveTextContent('already passed');
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
  await waitFor(() => expect(api.submitAskCapture).toHaveBeenCalledTimes(1));
  expect((api.submitAskCapture as jest.Mock).mock.calls[0][1].answer).toMatchObject({
    providerName: 'Acme', category: 'HVAC', startDate: { precision: 'EXACT_DATE', value: '2019-01-01' }, expiryDate: { precision: 'EXACT_DATE', value: '2020-01-01' }, cost: 99.5,
  });
});
