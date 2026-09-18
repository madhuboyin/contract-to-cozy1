import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentResultList } from '../DocumentResultList';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { Document } from '@/types';

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'document-lookup-groups', title: 'Documents by type', filters: [], actions: [
    { id: 'open-documents', label: 'Open Documents', href: '/dashboard/properties/home/documents', style: 'SECONDARY' },
  ],
  sections: [{ id: 'document-lookup-insurance', title: 'Insurance', count: 2, items: [
    { id: 'doc-0', title: 'Homeowners policy declaration', entityType: 'DOCUMENT', meta: ['verified', 'Jan 10, 2024'], description: null, status: 'VERIFIED' },
    { id: 'doc-1', title: 'Flood policy declaration', entityType: 'DOCUMENT', meta: ['unverified', 'Feb 2, 2024'], description: null, status: 'UNVERIFIED' },
  ] }],
};
function execution(revision = 1, executionId = 'execution'): AskExecutionResponse {
  return { executionId, sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'result', revision, domainScopePhrase: 'documents', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}
function List({ response, onPage = () => {}, onAccessLost = () => {} }: { response: AskExecutionResponse; onPage?: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><DocumentResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onFilter={() => {}} onPage={onPage} onAccessLost={onAccessLost} link={(_, label) => label} /></ResultViewContext.Provider>;
}
function canonicalDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 'doc-0', name: 'Homeowners policy declaration', fileUrl: undefined, fileSignedUrl: 'https://example.test/signed',
    type: 'INSURANCE_CERTIFICATE' as Document['type'], description: 'Annual declarations page from the carrier.',
    fileSize: 245_760, mimeType: 'application/pdf', propertyId: 'home', warrantyId: null, policyId: null,
    createdAt: '2024-01-10T00:00:00.000Z', verificationStatus: 'VERIFIED', verifiedAt: '2024-01-12T00:00:00.000Z', updatedAt: '2024-01-12T00:00:00.000Z',
    ...overrides,
  } as Document;
}
beforeEach(() => { window.sessionStorage.clear(); jest.restoreAllMocks(); });

test('clicking a document title opens canonical detail inline without navigating', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getPropertyDocument').mockResolvedValueOnce({ success: true, data: { document: canonicalDocument() } } as Awaited<ReturnType<typeof api.getPropertyDocument>>);

  render(<List response={execution()} />);
  expect(screen.queryByRole('link', { name: 'Homeowners policy declaration' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));

  await waitFor(() => expect(screen.getByText('Annual declarations page from the carrier.')).toBeInTheDocument());
  expect(screen.getByText('240.0 KB')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard/ask');
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBe('doc-0');
});

test('deleted document detail is distinct from an access-loss failure', async () => {
  jest.spyOn(api, 'getPropertyDocument').mockRejectedValueOnce({ status: 404, payload: { success: false, error: { message: 'Document not found', code: 'DOCUMENT_NOT_FOUND' } } });
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Document no longer exists'));
});

test('a 404 without DOCUMENT_NOT_FOUND (property-level access denial) invokes whole-result redaction, not a not-found message', async () => {
  const onAccessLost = jest.fn();
  jest.spyOn(api, 'getPropertyDocument').mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('an unauthenticated 401 also invokes whole-result redaction', async () => {
  const onAccessLost = jest.fn();
  jest.spyOn(api, 'getPropertyDocument').mockRejectedValueOnce({ status: 401 });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
});

test('a document leaving the result clears selection rather than selecting a substitute', () => {
  jest.spyOn(api, 'getPropertyDocument').mockResolvedValueOnce({ success: true, data: { document: canonicalDocument() } } as Awaited<ReturnType<typeof api.getPropertyDocument>>);
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], items: block.sections[0].items.filter((item) => item.id !== 'doc-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBeNull();
});

test('"Open Documents" remains available as a separate, secondary option', () => {
  render(<List response={execution()} />);
  expect(screen.getByText('Open Documents')).toBeInTheDocument();
});

test('Property Summary documents dispatch through the registry and open canonical detail inline', async () => {
  const propertySummaryBlock: typeof block = {
    ...block,
    id: 'property-documents',
    title: 'Documents',
    description: 'Select a document to inspect its current canonical details without leaving Ask Cozy.',
    sections: [{ ...block.sections[0], id: 'documents', title: 'Recorded documents', count: 2 }],
  };
  jest.spyOn(api, 'getPropertyDocument').mockResolvedValueOnce({ success: true, data: { document: canonicalDocument() } } as Awaited<ReturnType<typeof api.getPropertyDocument>>);

  render(<BlockView block={propertySummaryBlock} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  expect(screen.queryByRole('link', { name: 'Homeowners policy declaration' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open Documents/ })).toHaveAttribute('href', '/dashboard/properties/home/documents');
  fireEvent.click(screen.getByRole('button', { name: 'Homeowners policy declaration' }));

  await waitFor(() => expect(screen.getByText('Annual declarations page from the carrier.')).toBeInTheDocument());
  expect(api.getPropertyDocument).toHaveBeenCalledWith('home', 'doc-0');
});
