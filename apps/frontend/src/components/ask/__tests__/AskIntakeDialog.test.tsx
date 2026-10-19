/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AskIntakeDialog } from '../intake/AskIntakeDialog';
import { ComposerIntakeButton } from '../intake/ComposerIntakeButton';
import { canAddToHome, intakeFailureMessage, intakeResultHref, pickSingleFile } from '../intake/intakePresentation';
import { api } from '@/lib/api/client';
import type { AskIntakeCandidate, AskIntakeConfig, AskIntakeView } from '@/features/ask/types';

jest.mock('@/lib/api/client', () => ({ api: {
  getAskIntakeConfig: jest.fn(), uploadAskIntakeFile: jest.fn(), getAskIntake: jest.fn(), analyzeAskIntake: jest.fn(), reviewAskIntakeCandidate: jest.fn(), promoteAskIntake: jest.fn(),
  updateAskIntakeLabel: jest.fn(), confirmAskIntakeLabel: jest.fn(), dismissAskIntakeLabel: jest.fn(), discardAskIntake: jest.fn(),
} }));
const mocks = api as unknown as Record<string, jest.Mock>;

const DISCLOSURES = {
  retention: 'The original file is kept in your Home Records until you remove it.', sharing: 'Household members can see the file according to the sensitivity you choose.',
  modelProcessing: 'To read a warranty, receipt, insurance policy or inspection report, the file is sent to Google Gemini, an AI service. Nothing is sent until you choose to read it.',
  localProcessing: 'An appliance label photo is read on our server with text recognition. It is not sent to an AI service.', confirmation: 'Reading a file only proposes details. Nothing is added to your home until you confirm it.',
};
const config = (): AskIntakeConfig => ({
  contractVersion: 'ask-intake-v1', acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], maxBytes: 10 * 1024 * 1024, sensitivities: ['STANDARD', 'PERSONAL', 'FINANCIAL', 'INSURANCE', 'LEGAL'],
  kinds: [
    { kind: 'WARRANTY', label: 'A warranty', description: 'Provider and dates.', acceptsImages: true, readsWith: 'MODEL' },
    { kind: 'RECEIPT', label: 'A receipt or invoice', description: 'What was paid.', acceptsImages: true, readsWith: 'MODEL' },
    { kind: 'INSURANCE_POLICY', label: 'An insurance policy', description: 'Carrier and limits.', acceptsImages: true, readsWith: 'MODEL' },
    { kind: 'APPLIANCE_LABEL', label: 'An appliance or product label', description: 'Brand, model and serial.', acceptsImages: true, readsWith: 'LOCAL_OCR' },
    { kind: 'INSPECTION_REPORT', label: 'An inspection report', description: 'Findings you review.', acceptsImages: false, readsWith: 'MODEL' },
  ],
  reportTypes: ['GENERAL', 'ROOF'], disclosures: DISCLOSURES,
});
const view = (overrides: Partial<AskIntakeView> = {}): AskIntakeView => ({
  contractVersion: 'ask-intake-v1', generatedAt: `2026-10-20T12:00:0${Math.floor(Math.random() * 9)}.000Z`, propertyId: 'home-1', recordId: 'rec-1', versionId: 'ver-1', title: 'receipt', state: 'UPLOADED', kind: null, choice: null, needsDetails: null,
  classification: null, candidates: [], missingRequired: [], labelDraft: null, inspection: null, result: null,
  provenance: {
    original: { recordId: 'rec-1', versionId: 'ver-1', fileName: 'receipt.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'abcdef', uploadedAt: '2026-10-20T12:00:00.000Z', scanStatus: 'CLEAN', contentChecks: 'Checked that the file type matches its contents.' },
    reader: { status: 'NOT_RECORDED', reason: 'This file has not been read yet.' },
    pageAndRegion: { status: 'NOT_RECORDED', reason: 'The readers report one overall confidence for the file and do not say where on a page a detail was found.' },
  },
  disclosures: DISCLOSURES, ...overrides,
});
const candidate = (overrides: Partial<AskIntakeCandidate>): AskIntakeCandidate => ({
  id: 'c1', fieldKey: 'description', label: 'What it was for', proposedValue: 'Water heater', reviewedValue: null, effectiveValue: 'Water heater', confidence: 0.9, required: true, reviewStatus: 'PENDING', citation: 'AI extraction', promoted: false, ...overrides,
});
const ok = (data: AskIntakeView) => ({ success: true, data });
const pdf = () => new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' });

function renderDialog() { return render(<AskIntakeDialog open onOpenChange={jest.fn()} propertyId="home-1" />); }
async function upload(file = pdf()) {
  const input = await screen.findByLabelText('Choose a file to add');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('AskIntakeDialog', () => {
  beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.getAskIntakeConfig.mockResolvedValue({ success: true, data: config() }); });

  it('states retention, sharing and that nothing is read before the person chooses, and offers a plain file chooser as well as the camera', async () => {
    renderDialog();
    expect(await screen.findByText(/kept in your Home Records until you remove it/)).toBeInTheDocument();
    expect(screen.getByText(/Household members can see the file/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is read until you choose to/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose a file/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Take a photo/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Who can see this file')).toHaveValue('STANDARD');
    expect(mocks.uploadAskIntakeFile).not.toHaveBeenCalled();
    expect(mocks.analyzeAskIntake).not.toHaveBeenCalled();
  });

  it('keeps the file first with the chosen sensitivity, and reading needs the model-processing acknowledgement', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view()));
    mocks.analyzeAskIntake.mockResolvedValue(ok(view({ state: 'REVIEW', kind: 'RECEIPT', candidates: [candidate({})] })));
    renderDialog();
    fireEvent.change(await screen.findByLabelText('Who can see this file'), { target: { value: 'FINANCIAL' } });
    await upload();
    await waitFor(() => expect(mocks.uploadAskIntakeFile).toHaveBeenCalledWith('home-1', expect.any(File), 'FINANCIAL'));
    expect(await screen.findByText(/It has not been read yet/)).toBeInTheDocument();
    const read = screen.getByRole('button', { name: 'Read this file' });
    expect(read).toBeDisabled();
    expect(mocks.analyzeAskIntake).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /A warranty/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /appliance or product label/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I understand this file will be sent to an AI service/));
    expect(read).toBeEnabled();
    fireEvent.click(read);
    await waitFor(() => expect(mocks.analyzeAskIntake).toHaveBeenCalledWith('home-1', 'rec-1', { kind: 'AUTO', acknowledgedProcessing: true, inspection: undefined }));
    expect(await screen.findByText(/Check each detail/)).toBeInTheDocument();
  });

  it('reads a label photo locally with no AI acknowledgement, and never offers an inspection for a photo', async () => {
    const photo = view({ provenance: { ...view().provenance, original: { ...view().provenance.original, fileName: 'label.png', mimeType: 'image/png' } } });
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(photo));
    mocks.analyzeAskIntake.mockResolvedValue(ok(view({ state: 'REVIEW', kind: 'APPLIANCE_LABEL', labelDraft: { id: 'd1', status: 'DRAFT', itemId: null, fields: [{ key: 'manufacturer', label: 'Brand', value: 'Rheem', confidence: 0.8 }] } })));
    renderDialog();
    await upload(new File(['x'], 'label.png', { type: 'image/png' }));
    await screen.findByText(/It has not been read yet/);
    expect(screen.queryByRole('radio', { name: /inspection report/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /appliance or product label/ }));
    expect(screen.getByText(/read on our server with text recognition/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/I understand this file will be sent/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read this file' }));
    await waitFor(() => expect(mocks.analyzeAskIntake).toHaveBeenCalledWith('home-1', 'rec-1', { kind: 'APPLIANCE_LABEL', acknowledgedProcessing: false, inspection: undefined }));
    expect(await screen.findByDisplayValue('Rheem')).toBeInTheDocument();
  });

  it('asks the one question the server could not answer, limited to what the file can be', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view()));
    mocks.analyzeAskIntake.mockResolvedValue(ok(view({ choice: { reason: 'We are not sure what kind of document this is.', options: [{ kind: 'WARRANTY', label: 'A warranty', description: '' }, { kind: 'RECEIPT', label: 'A receipt or invoice', description: '' }] } })));
    renderDialog();
    await upload();
    await screen.findByText(/It has not been read yet/);
    fireEvent.click(screen.getByLabelText(/I understand this file/));
    fireEvent.click(screen.getByRole('button', { name: 'Read this file' }));
    expect(await screen.findByText('We are not sure what kind of document this is.')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([expect.stringContaining('A warranty'), expect.stringContaining('A receipt or invoice')]);
    expect(screen.queryByText('Let Cozy decide')).not.toBeInTheDocument();
  });

  it('asks an inspection report for its type and date before reading, and sends them', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view()));
    mocks.analyzeAskIntake.mockResolvedValue(ok(view({ state: 'REVIEW', kind: 'INSPECTION_REPORT', inspection: { reportId: 'rep-1', status: 'REVIEW_PENDING', findingCount: 4 } })));
    renderDialog();
    await upload();
    await screen.findByText(/It has not been read yet/);
    fireEvent.click(screen.getByRole('radio', { name: /inspection report/ }));
    fireEvent.click(screen.getByLabelText(/I understand this file/));
    const read = screen.getByRole('button', { name: 'Read this file' });
    expect(read).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Inspection date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'ROOF' } });
    fireEvent.click(read);
    await waitFor(() => expect(mocks.analyzeAskIntake).toHaveBeenCalledWith('home-1', 'rec-1', { kind: 'INSPECTION_REPORT', acknowledgedProcessing: true, inspection: { reportType: 'ROOF', inspectionDate: '2026-09-01' } }));
    expect(await screen.findByText(/4 findings were found. None of them has been added to your home/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review the findings' })).toHaveAttribute('href', '/dashboard/ask/record?propertyId=home-1&section=inspections');
  });

  it('shows each proposed detail with its confidence, lets the person accept, edit or reject it, and blocks adding until the needed ones are decided', async () => {
    const pending = view({ state: 'REVIEW', kind: 'RECEIPT', classification: { kind: 'RECEIPT', modelLabel: 'RECEIPT', confidence: 0.92 }, missingRequired: ['Amount'], candidates: [
      candidate({}), candidate({ id: 'c2', fieldKey: 'amount', label: 'Amount', proposedValue: '1200', effectiveValue: '1200', confidence: 0.4 }), candidate({ id: 'c3', fieldKey: 'category', label: 'Category', proposedValue: 'APPLIANCE', effectiveValue: 'APPLIANCE', required: false }),
    ] });
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(pending));
    renderDialog();
    await upload();
    expect(await screen.findByText(/Cozy read this as/)).toHaveTextContent('92% sure');
    const amount = document.querySelector('[data-intake-candidate="amount"]') as HTMLElement;
    expect(within(amount).getByText('40% sure')).toHaveClass('text-amber-800');
    expect(screen.getByText(/Still needed before this can be added: Amount/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to my home' })).toBeDisabled();
    mocks.reviewAskIntakeCandidate.mockResolvedValue(ok({ ...pending, candidates: pending.candidates.map((c) => c.id === 'c1' ? { ...c, reviewStatus: 'CONFIRMED' as const } : c) }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept What it was for' }));
    await waitFor(() => expect(mocks.reviewAskIntakeCandidate).toHaveBeenCalledWith('home-1', 'rec-1', 'c1', { action: 'CONFIRM', value: undefined }));
    mocks.reviewAskIntakeCandidate.mockResolvedValue(ok({ ...pending, missingRequired: [], candidates: pending.candidates.map((c) => c.id === 'c2' ? { ...c, reviewStatus: 'CORRECTED' as const, effectiveValue: '1250' } : c.id === 'c1' ? { ...c, reviewStatus: 'CONFIRMED' as const } : c) }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Amount' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.reviewAskIntakeCandidate).toHaveBeenLastCalledWith('home-1', 'rec-1', 'c2', { action: 'CORRECT', value: '1250' }));
    expect(await screen.findByRole('button', { name: 'Add to my home' })).toBeEnabled();
    expect(screen.getByText('Edited', { exact: false })).toBeInTheDocument();
    expect(mocks.promoteAskIntake).not.toHaveBeenCalled();
  });

  it('adds to the home only on the explicit action, then says what was created and where to see it', async () => {
    const ready = view({ state: 'REVIEW', kind: 'RECEIPT', candidates: [candidate({ reviewStatus: 'CONFIRMED' })] });
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(ready));
    mocks.promoteAskIntake.mockResolvedValue(ok({ ...ready, state: 'COMPLETED', result: { entityType: 'EXPENSE', entityId: 'exp-1' } }));
    renderDialog();
    await upload();
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my home' }));
    expect(await screen.findByText('Expense added to your home.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See it in your home record' })).toHaveAttribute('href', '/dashboard/ask/record?propertyId=home-1&section=documents&recordId=rec-1');
  });

  it('rejecting a label adds nothing to inventory and says so', async () => {
    const draft = view({ state: 'REVIEW', kind: 'APPLIANCE_LABEL', labelDraft: { id: 'd1', status: 'DRAFT', itemId: null, fields: [{ key: 'manufacturer', label: 'Brand', value: 'Rheem', confidence: 0.8 }, { key: 'modelNumber', label: 'Model number', value: null, confidence: null }] } });
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(draft));
    mocks.dismissAskIntakeLabel.mockResolvedValue(ok({ ...draft, state: 'COMPLETED', labelDraft: { ...draft.labelDraft!, status: 'DISMISSED' } }));
    renderDialog();
    await upload();
    expect(await screen.findByText(/This is a draft; it is not in your inventory yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText(/Rejected. Nothing was added to your home/)).toBeInTheDocument();
    expect(mocks.confirmAskIntakeLabel).not.toHaveBeenCalled();
  });

  it('edits label details before adding: adding is blocked until the changes are saved', async () => {
    const draft = view({ state: 'REVIEW', kind: 'APPLIANCE_LABEL', labelDraft: { id: 'd1', status: 'DRAFT', itemId: null, fields: [{ key: 'manufacturer', label: 'Brand', value: 'Rheem', confidence: 0.8 }] } });
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(draft));
    mocks.updateAskIntakeLabel.mockResolvedValue(ok({ ...draft, labelDraft: { ...draft.labelDraft!, fields: [{ key: 'manufacturer', label: 'Brand', value: 'Rheem Corp', confidence: 0.8 }] } }));
    mocks.confirmAskIntakeLabel.mockResolvedValue(ok({ ...draft, state: 'COMPLETED', result: { entityType: 'INVENTORY_ITEM', entityId: 'item-1' } }));
    renderDialog();
    await upload();
    fireEvent.change(await screen.findByLabelText(/Brand/), { target: { value: 'Rheem Corp' } });
    expect(screen.getByRole('button', { name: 'Add to inventory' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocks.updateAskIntakeLabel).toHaveBeenCalledWith('home-1', 'rec-1', { manufacturer: 'Rheem Corp' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to inventory' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Add to inventory' }));
    expect(await screen.findByText('Item added to your inventory.')).toBeInTheDocument();
  });

  it('keeping a file without reading calls nothing and points at the original', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view()));
    renderDialog();
    await upload();
    fireEvent.click(await screen.findByRole('button', { name: 'Keep without reading' }));
    expect(await screen.findByText(/Kept in your Home Records without being read/)).toBeInTheDocument();
    expect(mocks.analyzeAskIntake).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Open it in Home Records' })).toHaveAttribute('href', '/dashboard/ask/record?propertyId=home-1&section=documents&recordId=rec-1');
  });

  it('removing a file goes to the recoverable trash and says so', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view()));
    mocks.discardAskIntake.mockResolvedValue(ok(view({ state: 'DISCARDED' })));
    renderDialog();
    await upload();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove file' }));
    expect(await screen.findByText(/stays in the Home Records trash for 30 days/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add another file' }));
    expect(await screen.findByLabelText('Choose a file to add')).toBeInTheDocument();
  });

  it('shows where the result came from, including that the page and place are not recorded', async () => {
    mocks.uploadAskIntakeFile.mockResolvedValue(ok(view({ state: 'REVIEW', kind: 'RECEIPT', candidates: [candidate({})], provenance: { ...view().provenance, reader: { status: 'AVAILABLE', value: { kind: 'MODEL', name: 'gemini-2.0-flash' } } } })));
    renderDialog();
    await upload();
    const provenance = await screen.findByText('Where this came from');
    fireEvent.click(provenance);
    const panel = document.querySelector('[data-intake-provenance]') as HTMLElement;
    expect(panel).toHaveTextContent('receipt.pdf');
    expect(panel).toHaveTextContent('abcdef');
    expect(panel).toHaveTextContent('gemini-2.0-flash');
    expect(panel).toHaveTextContent('do not say where on a page');
  });

  it('accepts a dropped or pasted file, refuses several at once, and explains failures in plain words', async () => {
    mocks.uploadAskIntakeFile.mockRejectedValueOnce(Object.assign(new Error('dup'), { payload: { error: { code: 'PROPERTY_RECORD_DUPLICATE_CONTENT' } } }));
    renderDialog();
    const zone = await screen.findByText('Add a PDF or photo');
    const dialog = zone.closest('[role="dialog"]') as HTMLElement;
    fireEvent.drop(dialog, { dataTransfer: { files: [pdf(), pdf()] } });
    expect(await screen.findByText('Add one file at a time.')).toBeInTheDocument();
    expect(mocks.uploadAskIntakeFile).not.toHaveBeenCalled();
    fireEvent.paste(dialog, { clipboardData: { files: [pdf()] } });
    expect(await screen.findByText('This exact file is already in your Home Records.')).toBeInTheDocument();
    mocks.uploadAskIntakeFile.mockResolvedValueOnce(ok(view()));
    fireEvent.drop(dialog, { dataTransfer: { files: [pdf()] } });
    expect(await screen.findByText(/It has not been read yet/)).toBeInTheDocument();
  });

  it('shows a calm message when the service is paused and when no home is selected', async () => {
    mocks.getAskIntakeConfig.mockRejectedValue(Object.assign(new Error('paused'), { code: 'ASK_ACCOUNT_ROLE_ELIGIBILITY_DISABLED' }));
    const { unmount } = renderDialog();
    expect(await screen.findByText(/temporarily unavailable. Nothing was lost./)).toBeInTheDocument();
    unmount();
    render(<AskIntakeDialog open onOpenChange={jest.fn()} propertyId={undefined} />);
    expect(await screen.findByText('Select a home to add a file to it.')).toBeInTheDocument();
  });
});

describe('ComposerIntakeButton', () => {
  beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); mocks.getAskIntakeConfig.mockResolvedValue({ success: true, data: config() }); });
  it('is a named button that opens the dialog, and loads nothing until it does', async () => {
    render(<ComposerIntakeButton propertyId="home-1" />);
    expect(mocks.getAskIntakeConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add a file to your home' }));
    expect(await screen.findByText('Add a file to your home', { selector: 'h2' })).toBeInTheDocument();
    expect(mocks.getAskIntakeConfig).toHaveBeenCalled();
  });
});

describe('intake presentation', () => {
  it('only allows adding once a needed detail is decided and none is missing', () => {
    const base = view({ candidates: [candidate({ reviewStatus: 'PENDING' })] });
    expect(canAddToHome(base)).toBe(false);
    expect(canAddToHome({ ...base, candidates: [candidate({ reviewStatus: 'CONFIRMED' })] })).toBe(true);
    expect(canAddToHome({ ...base, candidates: [candidate({ reviewStatus: 'CONFIRMED' })], missingRequired: ['Amount'] })).toBe(false);
    expect(canAddToHome(view())).toBe(false);
  });
  it('links each result to where it lives, and nothing when nothing was created', () => {
    expect(intakeResultHref(view({ result: { entityType: 'WARRANTY', entityId: 'w1' } }))).toBe('/dashboard/ask/record?propertyId=home-1&section=warranties');
    expect(intakeResultHref(view({ result: { entityType: 'INVENTORY_ITEM', entityId: 'i1' } }))).toBe('/dashboard/ask/record?propertyId=home-1&section=inventory&recordId=i1');
    expect(intakeResultHref(view())).toBeNull();
  });
  it('turns failure codes into plain sentences and files into one file', () => {
    expect(intakeFailureMessage(Object.assign(new Error('x'), { code: 'ASK_INTAKE_TOO_LARGE' }), 'fallback')).toBe('That file is larger than 10MB.');
    expect(intakeFailureMessage(new Error('HTTP Error: 500'), 'fallback')).toBe('fallback');
    expect(pickSingleFile([pdf(), pdf()]).problem).toBe('Add one file at a time.');
    expect(pickSingleFile([]).file).toBeNull();
  });
});
