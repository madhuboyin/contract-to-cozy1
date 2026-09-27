'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { getRecord } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/homeRecordsApi';
import type { PropertyRecordDetail } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/types';

// Documents on the canonical inventory (FRD v1.136): the inline, read-only detail of a Home Record, read through the record route so the
// record-level visibility rule applies (a record the caller cannot see is "not found", exactly as anywhere else). Nothing here changes a record:
// downloading, versions and review happen on the Home Records page.
function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
}

// The record-not-found 404 (PROPERTY_RECORD_NOT_FOUND) and the property access-denial 404 share a status: only the body's code tells them apart.
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

function fieldLabel(value: string | null | undefined): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

export function PropertyRecordAskDetail({ recordId, expectedPropertyId, fallbackTitle, href, onAccessLost, onClose, link }: {
  recordId: string;
  expectedPropertyId?: string;
  fallbackTitle: string;
  href: string | null;
  onAccessLost: () => void;
  onClose: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const [record, setRecord] = useState<PropertyRecordDetail | null>(null);
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
    setRecord(null);
    getRecord(expectedPropertyId, recordId)
      .then((response) => { if (active) setRecord(response); })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        const code = errorCode(caught);
        if (status === 401 || (status === 404 && code !== 'PROPERTY_RECORD_NOT_FOUND')) {
          callbacksRef.current.onAccessLost();
          return;
        }
        setError(status === 404 ? 'PROPERTY_RECORD_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, recordId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`document-detail-${recordId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Home record</p>
          <h4 ref={headingRef} tabIndex={-1} id={`document-detail-${recordId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{record?.title ?? fallbackTitle}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close record detail for ${fallbackTitle}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current record…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'PROPERTY_RECORD_NOT_FOUND' ? 'Record no longer available' : 'Could not verify the current record'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'PROPERTY_RECORD_NOT_FOUND' ? 'This record was removed, or is no longer visible to you, after the Ask result was created.' : 'The current canonical record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with your records.</p>
      </div>}
      {record && <>
        {record.description && <p className="mt-3 text-sm leading-6 text-slate-700">{record.description}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Type</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(record.recordType)}</dd></div>
          <div><dt className="text-xs text-slate-500">Review</dt><dd className="mt-0.5 font-medium text-slate-900">{record.needsReview ? 'Extracted details await review' : 'Nothing awaiting review'}</dd></div>
          <div><dt className="text-xs text-slate-500">Expiry</dt><dd className="mt-0.5 font-medium text-slate-900">{record.expiryStatus ? fieldLabel(record.expiryStatus) : 'No end date recorded'}</dd></div>
          <div><dt className="text-xs text-slate-500">Effective from</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(record.effectiveFrom)}</dd></div>
          <div><dt className="text-xs text-slate-500">Effective to</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(record.effectiveTo)}</dd></div>
          <div><dt className="text-xs text-slate-500">Added</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(record.createdAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Sensitivity</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(record.sensitivity)}</dd></div>
          <div><dt className="text-xs text-slate-500">Versions</dt><dd className="mt-0.5 font-medium text-slate-900">{record._count.versions}</dd></div>
          <div><dt className="text-xs text-slate-500">Linked to</dt><dd className="mt-0.5 font-medium text-slate-900">{record._count.links === 0 ? 'Nothing yet' : `${record._count.links} ${record._count.links === 1 ? 'item' : 'items'}`}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Current canonical record · updated {formatDate(record.updatedAt)}</p>
        {href && <p className="mt-3 text-sm font-semibold text-teal-800">{link(href, <>Open in Home Records<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</p>}
      </>}
    </aside>
  );
}
