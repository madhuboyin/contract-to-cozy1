'use client';

import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { Document } from '@/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

// Same ambiguity as InventoryResultList/HomeEventResultList's own
// errorCode: propertyAuthMiddleware's access-denial 404 ("Property not
// found or access denied.") and the document-not-found 404
// (DOCUMENT_NOT_FOUND, from GET /api/documents/property/:propertyId/:documentId)
// share the same HTTP status -- must distinguish by the response body's
// error code, not status alone.
function errorCode(error: unknown): string | null {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const code = payload && typeof payload === 'object' ? (payload as { error?: { code?: unknown } }).error?.code : null;
  return typeof code === 'string' ? code : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return 'Not recorded';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fieldLabel(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function DocumentDetail({ documentId, expectedPropertyId, fallbackItem, onAccessLost, onClose }: {
  documentId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  // Named `doc`, not `document` -- avoids shadowing the DOM global inside
  // this component's scope.
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError('REVALIDATION_FAILED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setDoc(null);
    api.getPropertyDocument(expectedPropertyId, documentId)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data?.document) throw new Error(response.message || 'This document is unavailable.');
        setDoc(response.data.document);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = errorCode(caught);
        if (status === 401 || (status === 404 && code !== 'DOCUMENT_NOT_FOUND')) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(status === 404 ? 'DOCUMENT_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, documentId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`document-detail-${documentId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Document detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`document-detail-${documentId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{doc?.name ?? fallbackItem.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close document detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current document record…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'DOCUMENT_NOT_FOUND' ? 'Document no longer exists' : 'Could not verify the current document'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'DOCUMENT_NOT_FOUND' ? 'This document was removed after the Ask result was created.' : 'The current canonical record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your documents.</p>
      </div>}
      {doc && <>
        {doc.description && <p className="mt-3 text-sm leading-6 text-slate-700">{doc.description}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Type</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(doc.type)}</dd></div>
          <div><dt className="text-xs text-slate-500">Verification</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(doc.verificationStatus)}</dd></div>
          <div><dt className="text-xs text-slate-500">Verified</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(doc.verifiedAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">File type</dt><dd className="mt-0.5 font-medium text-slate-900">{doc.mimeType || 'Not recorded'}</dd></div>
          <div><dt className="text-xs text-slate-500">File size</dt><dd className="mt-0.5 font-medium text-slate-900">{formatFileSize(doc.fileSize)}</dd></div>
          <div><dt className="text-xs text-slate-500">Uploaded</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(doc.createdAt)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Current canonical record{doc.updatedAt ? ` · updated ${formatDate(doc.updatedAt)}` : ''}</p>
      </>}
    </aside>
  );
}

// ASK_COZY_INLINE_WORKSPACE_FRD Phase 3: renders the `document-lookup-groups`
// block (Documents grouped by type) with the same inline-detail pattern as
// InventoryResultList/HomeEventResultList/MaintenanceResultList. No
// per-item mutation actions exist for this block either.
export function DocumentResultList({ block, propertyId, onFilter, onPage, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  onFilter: (message: string) => void;
  onPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailDocumentId, setLocalDetailDocumentId] = useState<string | null>(null);
  const detailDocumentId = controls?.view.detailTaskId ?? localDetailDocumentId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailDocumentId);
  const openDetail = (item: Item) => {
    if (controls) controls.change((view) => ({ ...view, selectedTaskId: item.id, detailTaskId: item.id }));
    else setLocalDetailDocumentId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailDocumentId;
    if (controls) controls.change((view) => ({ ...view, detailTaskId: null }));
    else setLocalDetailDocumentId(null);
    requestAnimationFrame(() => window.document.querySelector<HTMLElement>(`[data-document-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {block.filters.length > 0 && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Document filters">
        {block.filters.map((filter) => <button key={filter.id} type="button" aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>}
    </div>
    {block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const visible = controls?.view.visibleCounts[section.id] ?? 5;
      return <div key={section.id} className="border-b border-slate-100 p-4">
        <h4 className="font-semibold">{section.title} · {section.count}</h4>
        {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No matching documents.</p>}
        <ul className="mt-3 space-y-3">
          {section.items.slice(0, controls ? visible : section.items.length).map((item) => {
            const selected = controls?.view.selectedTaskId === item.id;
            return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-document-detail-trigger={item.id} aria-expanded={detailDocumentId === item.id} aria-controls={`document-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
                {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>
              {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
            </li>;
          })}
        </ul>
        {controls && visible < section.items.length && <button type="button" className="mt-3 min-h-10 text-sm font-semibold text-teal-800" onClick={() => controls.change((view) => ({ ...view, visibleCounts: { ...view.visibleCounts, [section.id]: Math.min(section.items.length, visible + 5) } }))}>Show more {section.title.toLowerCase()} documents ({offset + Math.min(visible, section.items.length)} of {section.count} reached)</button>}
        {(offset > 0 || offset + section.items.length < section.count) && <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3" aria-label={`${section.title} pages`}>
          <p className="text-xs text-slate-500">Server results {section.items.length ? offset + 1 : 0}–{offset + section.items.length} of {section.count}</p>
          <div className="flex gap-2">
            {offset > 0 && <button type="button" className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800" onClick={() => onPage(section.id, 'PREVIOUS')}>Previous page<span className="sr-only"> of {section.title}</span></button>}
            {offset + section.items.length < section.count && <button type="button" className="min-h-10 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => onPage(section.id, 'NEXT')}>Next page<span className="sr-only"> of {section.title}</span></button>}
          </div>
        </nav>}
      </div>;
    })}
    {detailDocumentId && detailItem && <DocumentDetail key={detailDocumentId} documentId={detailDocumentId} expectedPropertyId={propertyId} fallbackItem={detailItem} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span>)}</div>
  </section>;
}
