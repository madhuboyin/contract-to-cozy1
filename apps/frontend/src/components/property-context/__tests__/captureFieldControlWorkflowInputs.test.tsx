import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureFieldControl } from '../CaptureFieldControl';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi', () => ({ uploadRecordForWorkflow: jest.fn() }));
jest.mock('@/lib/api/client', () => ({ api: { uploadAskEvidence: jest.fn() } }));

test.each([
  [{ type: 'NUMBER' as const, min: 0, max: 100 }, 'Project amount'],
  [{ type: 'MONEY' as const, currency: 'USD', min: 0, max: 100 }, 'Payment amount'],
])('numeric workflow field %j renders and reports a number', (inputSchema, label) => {
  const onChange = jest.fn();
  render(<CaptureFieldControl compact field={{ key: 'amount', label, required: true, inputSchema }} value={undefined} disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText(label);
  expect(input).toHaveAttribute('type', 'number');
  fireEvent.change(input, { target: { value: '42.5' } });
  expect(onChange).toHaveBeenLastCalledWith(42.5);
});

test('a long workflow field renders as a compact textarea', () => {
  const onChange = jest.fn();
  render(<CaptureFieldControl compact field={{ key: 'notes', label: 'Project notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }} value="" disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText('Project notes');
  expect(input.tagName).toBe('TEXTAREA');
  expect(input).toHaveAttribute('rows', '2');
  fireEvent.change(input, { target: { value: 'Work starts Monday.' } });
  expect(onChange).toHaveBeenLastCalledWith('Work starts Monday.');
});

test('a long compact choice set starts bounded and can be expanded', () => {
  const options = Array.from({ length: 12 }, (_, index) => ({ value: `TYPE_${index}`, label: `Type ${index}` }));
  render(<CaptureFieldControl compact field={{ key: 'projectType', label: 'Project type', required: true, inputSchema: { type: 'SINGLE_SELECT', options } }} value="TYPE_11" disabled={false} onChange={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Type 11' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Type 8' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /More/ }));
  expect(screen.getByRole('button', { name: 'Type 8' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
});

test('a project document field selects existing Home Record documents', () => {
  const onChange = jest.fn();
  render(<CaptureFieldControl compact propertyId="home-1" field={{ key: 'receiptDocumentIds', label: 'Receipt', required: false, inputSchema: { type: 'DOCUMENT_MULTI_SELECT', options: [{ value: 'doc-1', label: 'Paid invoice.pdf' }], maxItems: 1, allowUpload: false } }} value={[]} disabled={false} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Paid invoice.pdf' }));
  expect(onChange).toHaveBeenCalledWith(['doc-1']);
});

describe('a document field that uploads to Home Records with its own metadata', () => {
  const uploadField = {
    key: 'recordIds', label: 'Document', required: true,
    inputSchema: {
      type: 'DOCUMENT_MULTI_SELECT' as const, options: [], maxItems: 1, allowUpload: true, uploadTarget: 'HOME_RECORDS' as const,
      uploadRecord: {
        description: 'Workflow document: Roof quote',
        notice: 'Uploading adds this file to this home’s shared Home Records immediately.',
        recordTypeFrom: { fieldKey: 'documentType', byValue: { PREMIUM_NOTICE: 'INSURANCE_POLICY', QUOTE: 'OTHER' } },
      },
    },
  };

  it('shows the notice before any file is picked and blocks the upload until the role it depends on is chosen', () => {
    const { container } = render(<CaptureFieldControl compact propertyId="home-1" field={uploadField} value={[]} siblingValues={{}} disabled={false} onChange={jest.fn()} />);
    expect(screen.getByText(/shared Home Records immediately/)).toBeInTheDocument();
    expect(screen.getByText('Choose what the document is first, then upload.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload document/ })).toBeDisabled();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('uploads with the neutral description and the record type for the chosen role, then selects the returned record', async () => {
    const workflow = jest.requireMock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi') as { uploadRecordForWorkflow: jest.Mock };
    workflow.uploadRecordForWorkflow.mockResolvedValue('record-9');
    const onChange = jest.fn();
    const { container } = render(<CaptureFieldControl compact propertyId="home-1" field={uploadField} value={[]} siblingValues={{ documentType: 'PREMIUM_NOTICE' }} disabled={false} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /Upload document/ })).toBeEnabled();
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'notice.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['record-9']));
    expect(workflow.uploadRecordForWorkflow).toHaveBeenCalledWith('home-1', expect.objectContaining({
      description: 'Workflow document: Roof quote', recordType: 'INSURANCE_POLICY', sensitivity: 'STANDARD', title: 'notice.pdf',
    }));
    expect(JSON.stringify(workflow.uploadRecordForWorkflow.mock.calls)).not.toContain('Project document');
  });

  it('keeps Project Tracker\'s values when a field declares no metadata', async () => {
    const workflow = jest.requireMock('@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi') as { uploadRecordForWorkflow: jest.Mock };
    workflow.uploadRecordForWorkflow.mockClear(); workflow.uploadRecordForWorkflow.mockResolvedValue('record-3');
    const plain = { ...uploadField, inputSchema: { type: 'DOCUMENT_MULTI_SELECT' as const, options: [], maxItems: 1, allowUpload: true, uploadTarget: 'HOME_RECORDS' as const } };
    const { container } = render(<CaptureFieldControl compact propertyId="home-1" field={plain} value={[]} disabled={false} onChange={jest.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'r.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(workflow.uploadRecordForWorkflow).toHaveBeenCalled());
    expect(workflow.uploadRecordForWorkflow.mock.calls[0][1]).toEqual(expect.objectContaining({ description: 'Project document: Document', recordType: 'OTHER' }));
  });
});
