import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskCaptureRequest } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import { InlineCaptureCard } from '../workspace/CaptureCards';
import { editorFieldProblem, fieldSpans, normalizeEditorFieldValue } from '../recordEditor/RecordEditor';

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

const hoaFields = [
  { key: 'name', label: 'Association name', kind: 'TEXT', section: 'association', required: true },
  { key: 'managementCompany', label: 'Management company', kind: 'TEXT', section: 'association', required: false },
  { key: 'contactName', label: 'Contact name', kind: 'TEXT', section: 'contact', required: false },
  { key: 'contactEmail', label: 'Contact email', kind: 'TEXT', inputType: 'email', section: 'contact', required: false },
  { key: 'contactPhone', label: 'Contact phone', kind: 'TEXT', inputType: 'tel', section: 'contact', required: false },
  { key: 'duesAmount', label: 'Dues amount', kind: 'MONEY', section: 'dues', required: false },
  { key: 'duesFrequency', label: 'Payment frequency', kind: 'SELECT', section: 'dues', required: false, options: [{ label: 'Monthly', value: 'MONTHLY' }], emptyLabel: 'Not recorded' },
  { key: 'nextDueDate', label: 'Next due date', kind: 'DATE', section: 'dues', required: false },
  { key: 'notes', label: 'Notes', kind: 'TEXTAREA', section: 'additional', required: false },
];
const emptyHoa = Object.fromEntries(hoaFields.map((field) => [field.key, '']));
const hoaRequest = {
  requirementId: 'hoa-association-inputs', captureKey: 'HOA_ASSOCIATION', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
  title: 'Set up HOA details', question: 'Add the details you know.', helpText: null, allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: null, confirmationText: null,
  expectedContextVersion: 'hoa-v1', inputSchema: { type: 'GROUP', fields: [] }, currentAnswer: emptyHoa,
  editor: { recordLabel: 'HOA details', sections: [{ id: 'association', title: 'Association' }, { id: 'contact', title: 'Contact' }, { id: 'dues', title: 'Dues' }, { id: 'additional', title: 'Additional information' }], fields: hoaFields, original: emptyHoa },
} as unknown as AskCaptureRequest;

test('HOA setup is a compact sectioned editor with native contact controls, paired dues validation, financial acknowledgement and guarded Cancel', async () => {
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: { executionId: 'hoa1' } } as never);
  jest.spyOn(api, 'cancelAskExecution').mockResolvedValue({ success: true, data: { executionId: 'hoa1', status: 'CANCELLED' } } as never);
  render(<InlineCaptureCard executionId="hoa1" request={hoaRequest} onCompleted={jest.fn()} />);
  expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['Association', 'Contact', 'Dues', 'Additional information']);
  expect(screen.getByLabelText(/^Contact email/)).toHaveAttribute('type', 'email');
  expect(screen.getByLabelText(/^Contact phone/)).toHaveAttribute('type', 'tel');
  fireEvent.change(screen.getByLabelText(/^Association name/), { target: { value: 'Maple HOA' } });
  fireEvent.change(screen.getByLabelText(/^Dues amount/), { target: { value: '250' } });
  expect(screen.getByText('Choose how often these dues are paid.')).toBeVisible();
  fireEvent.change(screen.getByLabelText(/^Payment frequency/), { target: { value: 'MONTHLY' } });
  const consent = screen.getByRole('checkbox', { name: 'I’m ready to review these financial details.' });
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  fireEvent.click(consent);
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
  await waitFor(() => expect(api.submitAskCapture).toHaveBeenCalledWith('hoa1', expect.objectContaining({
    sensitiveDataConfirmed: true, answer: expect.objectContaining({ name: 'Maple HOA', duesAmount: '250.00', duesFrequency: 'MONTHLY' }),
  })));
});

// Timeline event editor needs (FRD v1.386): disabled-with-reason fields, explicit empty choices, changed markers, an unsaved-changes guard and full rows.
const eventOriginal = { title: 'Roof replacement', type: 'VERIFIED_RESOLUTION', occurredAt: '2026-09-01', importance: 'NORMAL', summary: '', amount: '', visibility: 'HOUSEHOLD', roomId: '', inventoryItemId: '' };
const eventRequest = {
  requirementId: 'home-event-update-e1', captureKey: 'HOME_EVENT_UPDATE_INPUTS', classification: 'WORKFLOW_INPUT', state: 'KNOWN', presentation: 'FORM',
  title: 'Edit event', question: 'q', helpText: null, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null, expectedContextVersion: 'v1',
  inputSchema: { type: 'GROUP', fields: [] }, currentAnswer: eventOriginal,
  editor: {
    recordLabel: 'Roof replacement',
    sections: [{ id: 'event', title: 'Event' }, { id: 'details', title: 'Details' }, { id: 'links', title: 'Links' }],
    fields: [
      { key: 'title', label: 'Title', kind: 'TEXT', section: 'event', required: true },
      { key: 'type', label: 'Type', kind: 'SELECT', section: 'event', required: true, options: [{ label: 'Guided plan completion', value: 'VERIFIED_RESOLUTION' }, { label: 'Note', value: 'NOTE' }], disabledReason: 'Type is fixed because this event records completion of a guided plan.' },
      { key: 'occurredAt', label: 'Date', kind: 'DATE', section: 'event', required: true, helpText: 'This date is recorded by month. Choosing a day makes the date exact.' },
      { key: 'importance', label: 'Importance', kind: 'SELECT', section: 'event', required: true, options: [{ label: 'Normal', value: 'NORMAL' }] },
      { key: 'summary', label: 'Summary', kind: 'TEXTAREA', section: 'details', required: false },
      { key: 'amount', label: 'Amount (USD)', kind: 'MONEY', section: 'details', required: false },
      { key: 'visibility', label: 'Visibility', kind: 'SELECT', section: 'details', required: true, options: [{ label: 'Household', value: 'HOUSEHOLD' }, { label: 'Resale pack', value: 'RESALE_PACK' }] },
      { key: 'roomId', label: 'Room', kind: 'SELECT', section: 'links', required: false, options: [{ label: 'Kitchen', value: 'room-1' }], emptyLabel: 'No room' },
      { key: 'inventoryItemId', label: 'Inventory item', kind: 'SELECT', section: 'links', required: false, options: [], emptyLabel: 'No item' },
    ],
    original: eventOriginal,
  },
} as unknown as AskCaptureRequest;

test('a disabled field is shown disabled with its reason directly beneath it; a field note explains month precision', () => {
  render(<InlineCaptureCard executionId="ev1" request={eventRequest} onCompleted={jest.fn()} />);
  const type = screen.getByLabelText(/^Type/);
  expect(type).toBeDisabled();
  expect(type).toHaveAccessibleDescription(/Type is fixed because this event records completion of a guided plan/);
  expect(screen.getByText('Type is fixed because this event records completion of a guided plan.')).toBeVisible();
  expect(screen.getByLabelText(/^Date/)).toBeEnabled();
  expect(screen.getByText(/Choosing a day makes the date exact/)).toBeVisible();
});

test('link fields offer an explicit empty choice, and clearing back to it counts as a change that is sent as an empty value', async () => {
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: { executionId: 'ev1' } } as never);
  render(<InlineCaptureCard executionId="ev1" request={eventRequest} onCompleted={jest.fn()} />);
  const room = screen.getByLabelText(/^Room/);
  expect(room).toHaveDisplayValue('No room');
  fireEvent.change(room, { target: { value: 'room-1' } });
  expect(screen.getAllByText('Changed')).toHaveLength(1);
  fireEvent.change(room, { target: { value: '' } });
  expect(screen.queryByText('Changed')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review changes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: 'Full tear-off.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
  await waitFor(() => expect(api.submitAskCapture).toHaveBeenCalled());
  expect((api.submitAskCapture as jest.Mock).mock.calls[0][1].answer).toEqual({ ...eventOriginal, summary: 'Full tear-off.' });
});

test('Cancel with unsaved edits asks before discarding; Keep editing returns, Discard cancels the execution', async () => {
  jest.spyOn(api, 'cancelAskExecution').mockResolvedValue({ success: true, data: { executionId: 'ev1', status: 'CANCELLED' } } as never);
  render(<InlineCaptureCard executionId="ev1" request={eventRequest} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Roof replaced' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeVisible();
  expect(api.cancelAskExecution).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText(/^Title/)).toHaveValue('Roof replaced');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(api.cancelAskExecution).toHaveBeenCalledWith('ev1'));
});

test('field spans fill every row: four fields as 2x2, three as thirds, two as halves, multiline full width', () => {
  const f = (key: string, kind = 'TEXT') => ({ key, label: key, kind, section: 's', required: false }) as never;
  expect(Object.values(fieldSpans([f('a'), f('b'), f('c'), f('d')]))).toEqual(Array(4).fill('md:col-span-6'));
  expect(Object.values(fieldSpans([f('a'), f('b'), f('c')]))).toEqual(Array(3).fill('md:col-span-4'));
  expect(fieldSpans([f('a'), f('t', 'TEXTAREA'), f('b')])).toEqual({ t: 'md:col-span-12', a: 'md:col-span-6', b: 'md:col-span-6' });
});

// Add event on the shared editor (FRD v1.394): a date with precision, details that appear only for the right type, folded optional details.
const typeOptions = [{ label: 'Purchase', value: 'PURCHASE' }, { label: 'Repair', value: 'REPAIR' }, { label: 'Note', value: 'NOTE' }];
const eventAddRequest = (errors?: Record<string, string>) => ({
  requirementId: 'capture-event-add', captureKey: 'CAPTURE_EVENT_ADD', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Add a timeline event', question: 'q', helpText: null,
  allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null, expectedContextVersion: 'ev-v1', inputSchema: { type: 'GROUP', fields: [] },
  currentAnswer: { title: '', type: '', occurredAt: '', summary: '', amount: '', providerName: '', importance: 'NORMAL', visibility: 'HOUSEHOLD', roomId: '', inventoryItemId: '' },
  editor: {
    recordLabel: 'Add a timeline event', mode: 'add', saveLabel: 'Continue to review',
    sections: [{ id: 'event', title: 'Event' }, { id: 'details', title: 'Details' }, { id: 'more', title: 'More details', collapsed: true }],
    fields: [
      { key: 'title', label: 'Title', kind: 'TEXT', section: 'event', required: true, maxLength: 140 },
      { key: 'type', label: 'Type', kind: 'SELECT', section: 'event', required: true, options: typeOptions },
      { key: 'occurredAt', label: 'When did it happen?', shortLabel: 'date', kind: 'APPROX_DATE', section: 'event', required: true },
      { key: 'summary', label: 'What happened?', kind: 'TEXTAREA', section: 'details', required: false },
      { key: 'amount', label: 'Amount (USD)', kind: 'MONEY', section: 'details', required: false, visibleWhen: { field: 'type', in: ['PURCHASE', 'REPAIR'] } },
      { key: 'providerName', label: 'Provider or contractor', kind: 'TEXT', section: 'details', required: false, visibleWhen: { field: 'type', in: ['PURCHASE', 'REPAIR'] } },
      { key: 'importance', label: 'Importance', kind: 'SELECT', section: 'more', required: true, options: [{ label: 'Normal', value: 'NORMAL' }, { label: 'High', value: 'HIGH' }] },
      { key: 'visibility', label: 'Who can see it', kind: 'SELECT', section: 'more', required: true, options: [{ label: 'Household', value: 'HOUSEHOLD' }, { label: 'Private (only you)', value: 'PRIVATE' }] },
      { key: 'roomId', label: 'Room', kind: 'SELECT', section: 'more', required: false, emptyLabel: 'No room', options: [{ label: 'Kitchen', value: 'room-1' }] },
      { key: 'inventoryItemId', label: 'Inventory item', kind: 'SELECT', section: 'more', required: false, emptyLabel: 'No item', options: [] },
    ],
    original: { title: '', type: '', occurredAt: '', summary: '', amount: '', providerName: '', importance: 'NORMAL', visibility: 'HOUSEHOLD', roomId: '', inventoryItemId: '' }, ...(errors ? { errors } : {}),
  },
}) as unknown as AskCaptureRequest;

test('Add event: amount and provider stay hidden until a type that can have them is chosen, and More details starts folded', () => {
  const view = render(<InlineCaptureCard executionId="ev1" request={eventAddRequest()} onCompleted={jest.fn()} />);
  expect(screen.queryByLabelText(/^Amount/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Provider or contractor/)).not.toBeInTheDocument();
  expect(view.container.querySelector('[data-record-editor-more]')).not.toHaveAttribute('open');
  expect(screen.getByText('Optional')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'NOTE' } });
  expect(screen.queryByLabelText(/^Amount/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'REPAIR' } });
  expect(screen.getByLabelText(/^Amount/)).toBeVisible();
  expect(screen.getByLabelText(/^Provider or contractor/)).toBeVisible();
  expect(screen.getByText('$')).toBeVisible();
});

test('Add event: the date keeps its precision on one control; switching starts the date over; Continue explains what is missing', () => {
  render(<InlineCaptureCard executionId="ev1" request={eventAddRequest()} onCompleted={jest.fn()} />);
  const group = screen.getByRole('group', { name: 'When did it happen? precision' });
  expect(Array.from(group.querySelectorAll('button')).map((button) => button.textContent)).toEqual(['Exact date', 'Month', 'Year', 'Date range']);
  expect(screen.getByRole('button', { name: 'Exact date' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
  expect(screen.getByText('Add the title, type and date to continue.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
  expect(screen.getByLabelText('When did it happen? from')).toHaveAttribute('type', 'date');
  expect(screen.getByLabelText('When did it happen? to')).toHaveAttribute('type', 'date');
  fireEvent.click(screen.getByRole('button', { name: 'Month' }));
  expect(screen.getByLabelText('When did it happen? value')).toHaveAttribute('type', 'month');
  fireEvent.click(screen.getByRole('button', { name: 'Year' }));
  expect(screen.getByLabelText('When did it happen? value')).toHaveAttribute('type', 'number');
});

test('Add event: a complete entry submits strings (date as PRECISION|value, hidden fields empty) and a reversed range blocks Continue', async () => {
  jest.spyOn(api, 'submitAskCapture').mockResolvedValue({ success: true, data: { executionId: 'ev1' } } as never);
  render(<InlineCaptureCard executionId="ev1" request={eventAddRequest()} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Water heater replaced' } });
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'REPAIR' } });
  fireEvent.change(screen.getByLabelText('When did it happen? value'), { target: { value: '2026-08-15' } });
  fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '99' } });
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'NOTE' } });
  expect(screen.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
  await waitFor(() => expect(api.submitAskCapture).toHaveBeenCalledTimes(1));
  expect((api.submitAskCapture as jest.Mock).mock.calls[0][1].answer).toEqual({
    title: 'Water heater replaced', type: 'NOTE', occurredAt: 'EXACT_DATE|2026-08-15', summary: '', amount: '', providerName: '', importance: 'NORMAL', visibility: 'HOUSEHOLD', roomId: '', inventoryItemId: '',
  });
});

test('Add event: a problem inside More details opens it, and the date field takes its own server problem', () => {
  const view = render(<InlineCaptureCard executionId="ev1" request={eventAddRequest({ roomId: 'That room is not in this home.', occurredAt: 'A timeline records what has happened, so the date cannot be in the future.' })} onCompleted={jest.fn()} />);
  expect(view.container.querySelector('[data-record-editor-more]')).toHaveAttribute('open');
  expect(screen.getByText('That room is not in this home.')).toBeVisible();
  expect(screen.getByText(/cannot be in the future/)).toBeVisible();
});

test('field spans: a date takes its own row so its control is never squeezed', () => {
  const f = (key: string, kind = 'TEXT') => ({ key, label: key, kind, section: 's', required: false }) as never;
  expect(fieldSpans([f('title'), f('type', 'SELECT'), f('when', 'APPROX_DATE')])).toEqual({ when: 'md:col-span-12', title: 'md:col-span-6', type: 'md:col-span-6' });
  expect(fieldSpans([f('amount', 'MONEY'), f('provider')])).toEqual({ amount: 'md:col-span-6', provider: 'md:col-span-6' });
  expect(fieldSpans([f('provider')])).toEqual({ provider: 'md:col-span-12' });
});

test('an empty required field is not flagged when it loses focus, only after a submit attempt, so nothing shifts under the pointer', () => {
  render(<InlineCaptureCard executionId="ev1" request={eventAddRequest()} onCompleted={jest.fn()} />);
  fireEvent.blur(screen.getByLabelText(/^Title/));
  expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'x'.repeat(141) } });
  fireEvent.blur(screen.getByLabelText(/^Title/));
  expect(screen.getByText(/at most 140/)).toBeVisible();
});

const financingWorkflowRequest = {
  requirementId: 'financing-profile-update-inputs', captureKey: 'FINANCING_PROFILE_UPDATE', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
  title: 'Your mortgage and purchase details', question: 'What should change?', helpText: 'Change only what is wrong. Nothing is saved until you confirm.',
  allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Used to prepare this change', confirmationText: 'I’m ready to review changes to these recorded financial details.', expectedContextVersion: 'finance-v1',
  currentAnswer: { mortgageStatus: 'MORTGAGED', mortgageType: 'FIXED_30', purchasePrice: 452000, currentBalance: 320000, hasSecondMortgage: 'NO' },
  inputSchema: { type: 'GROUP', groups: [
    { id: 'purchase', title: 'Purchase and mortgage', fieldKeys: ['mortgageStatus', 'purchasePrice'] },
    { id: 'loan', title: 'Primary mortgage', fieldKeys: ['mortgageType', 'currentBalance'] },
    { id: 'more', title: 'Additional loans and costs', fieldKeys: ['hasSecondMortgage', 'secondBalance'] },
  ], fields: [
    { key: 'mortgageStatus', label: 'Mortgage', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'I have a mortgage', value: 'MORTGAGED' }, { label: 'I have no mortgage', value: 'NO_MORTGAGE' }] } },
    { key: 'purchasePrice', label: 'Purchase price ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 10000000 } },
    { key: 'mortgageType', label: 'Mortgage type', required: false, when: { fieldKey: 'mortgageStatus', operator: 'EQUALS', value: 'MORTGAGED' }, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: '30-year fixed', value: 'FIXED_30' }] } },
    { key: 'currentBalance', label: 'Current balance ($)', required: false, when: { fieldKey: 'mortgageStatus', operator: 'EQUALS', value: 'MORTGAGED' }, inputSchema: { type: 'NUMBER', min: 0, max: 10000000 } },
    { key: 'hasSecondMortgage', label: 'Second mortgage', required: false, when: { fieldKey: 'mortgageStatus', operator: 'EQUALS', value: 'MORTGAGED' }, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }] } },
    { key: 'secondBalance', label: 'Second mortgage balance ($)', required: false, when: { fieldKey: 'hasSecondMortgage', operator: 'EQUALS', value: 'YES' }, inputSchema: { type: 'NUMBER', min: 0, max: 10000000 } },
  ] },
} as unknown as AskCaptureRequest;

test('Sell/Hold/Rent financing uses a progressive editor, hides inapplicable loan fields, and offers a route back', () => {
  const view = render(<InlineCaptureCard executionId="finance1" request={financingWorkflowRequest} onCompleted={jest.fn()} />);
  expect(screen.getByText('Step 1 of 3')).toBeVisible();
  expect(screen.getAllByText('Purchase and mortgage')[0]).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Mortgage type' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Back to comparison' })).toBeVisible();
  expect(screen.getByText('No changes yet')).toBeVisible();
  expect(screen.getByLabelText('Purchase price ($)').parentElement).toHaveClass('w-56');
  expect(screen.getByLabelText('Purchase price ($)').parentElement).toHaveTextContent('$');
  expect(view.container.querySelector('[data-decision-input-workflow="FINANCING_PROFILE_UPDATE"]')).toHaveClass('max-w-[900px]');
  fireEvent.change(screen.getByLabelText('Purchase price ($)'), { target: { value: '460000' } });
  expect(screen.getByText('1 changed')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next: Primary mortgage' }));
  expect(screen.getByRole('group', { name: 'Mortgage type' })).toBeVisible();
});

test('Sell/Hold/Rent assumption consent describes planning settings instead of a Home Record write', () => {
  const request = { ...financingWorkflowRequest, requirementId: 'sell-hold-rent-assumptions-inputs', captureKey: 'sell-hold-rent-assumptions', title: 'Scenario assumptions',
    confirmationText: 'I’m ready to review these planning assumptions. They won’t change my Home Record.', currentAnswer: { appreciationPct: 4, resetAll: 'NO' },
    inputSchema: { type: 'GROUP', fields: [
      { key: 'appreciationPct', label: 'Appreciation rate (%)', required: false, inputSchema: { type: 'NUMBER', min: -20, max: 30 } },
      { key: 'resetAll', label: 'Reset saved assumptions', required: false, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Keep these assumptions', value: 'NO' }, { label: 'Reset all to model defaults', value: 'YES' }] } },
    ] },
  } as unknown as AskCaptureRequest;
  const view = render(<InlineCaptureCard executionId="scenario1" request={request} onCompleted={jest.fn()} />);
  expect(screen.getByText('Growth assumptions')).toBeVisible();
  expect(screen.getByText('Defaults')).toBeVisible();
  expect(screen.getByText(/They won’t change my Home Record/)).toBeVisible();
  expect(screen.queryByText('I confirm this information can be saved to the home record.')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Appreciation rate (%)').parentElement).toHaveClass('w-32');
  expect(screen.getByLabelText('Appreciation rate (%)').parentElement).toHaveTextContent('%');
  expect(view.container.querySelector('[data-decision-input-workflow="sell-hold-rent-assumptions"]')).toHaveClass('max-w-[760px]');
});

test('Changed markers belong to Edit: Add never shows them', () => {
  render(<InlineCaptureCard executionId="ev1" request={eventAddRequest()} onCompleted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Roof' } });
  expect(screen.queryByText('Changed')).not.toBeInTheDocument();
});
