'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { AskRecordExportReview, AskRecordExportReviewSection, HomeReportExportStatus, HomeReportExportSummary } from '@/features/ask/types';
import { AskCollection, AskCollectionState, AskCompactRow } from '../presentation/AskLayoutPrimitives';
import { askServiceIsPaused } from '../workspace/support';

const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const words = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Cents$/, '').toLowerCase();
const list = (fields: readonly string[]) => fields.map(words).join(', ');

const STATUS_COPY: Record<HomeReportExportStatus, string> = {
  PENDING: 'Waiting to be generated', GENERATING: 'Being generated', READY: 'Ready to download', FAILED: 'Could not be generated', EXPIRED: 'Expired', DELETED: 'Deleted',
};

function SectionRow({ section }: { section: AskRecordExportReviewSection }) {
  const notApplicable = section.applicability === 'NOT_APPLICABLE';
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-export-section={section.id} data-export-state={section.state.toLowerCase()}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{section.label}{notApplicable ? <span className="ml-2 text-xs font-normal text-slate-500">Not applicable at your home’s stage</span> : null}</p>
        {section.state === 'INCLUDED' ? (
          <>
            <p className="mt-0.5 text-xs text-slate-600">Your copy has: {list(section.ownerFields)}.</p>
            {section.withheldFromShared.length > 0 && <p className="mt-0.5 text-xs font-semibold text-amber-800">Only in your copy, never in a shared link: {list(section.withheldFromShared)}.</p>}
            {section.note && <p className="mt-0.5 text-xs text-slate-500">{section.note}</p>}
          </>
        ) : (
          <p className="mt-0.5 text-xs text-slate-500">{section.reason}</p>
        )}
      </div>
    </AskCompactRow>
  );
}

export function RecordExportReview({ propertyId, backHref }: { propertyId: string; backHref: string }) {
  const [review, setReview] = useState<AskRecordExportReview | null>(null);
  const [status, setStatus] = useState<'LOADING' | 'READY' | 'ERROR' | 'PAUSED'>('LOADING');
  const [attempt, setAttempt] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ exportId: string; createdAt: string; review: AskRecordExportReview; summary: HomeReportExportSummary | null; initialStatus: HomeReportExportStatus } | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('LOADING');
    api.getAskRecordExportReview(propertyId, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load the export review.');
        setReview(response.data);
        setStatus('READY');
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setStatus(askServiceIsPaused(caught) ? 'PAUSED' : 'ERROR');
      });
    return () => controller.abort();
  }, [propertyId, attempt]);

  const create = useCallback(async () => {
    if (!review || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.createHomeReportExport(propertyId);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not create the export.');
      setReceipt({ exportId: response.data.exportId, createdAt: new Date().toISOString(), review, summary: null, initialStatus: response.data.status });
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : 'Could not create the export.');
    } finally {
      setCreating(false);
    }
  }, [review, creating, propertyId]);

  const checkStatus = useCallback(async () => {
    if (!receipt || checking) return;
    setChecking(true);
    try {
      const response = await api.listHomeReportExports(propertyId);
      const found = response.success ? response.data?.exports.find((entry) => entry.id === receipt.exportId) ?? null : null;
      if (found) setReceipt((current) => (current ? { ...current, summary: found } : current));
    } finally {
      setChecking(false);
    }
  }, [receipt, checking, propertyId]);

  const download = useCallback(async () => {
    if (!receipt) return;
    setDownloadError(null);
    try {
      const response = await api.getHomeReportExportDownloadUrl(receipt.exportId);
      if (!response.success || !response.data?.url) throw new Error(response.message || 'The download is not ready.');
      window.location.assign(response.data.url);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : 'The download is not ready.');
    }
  }, [receipt]);

  const included = review?.sections.filter((section) => section.state === 'INCLUDED') ?? [];
  const excluded = review?.sections.filter((section) => section.state === 'EXCLUDED') ?? [];
  const currentStatus: HomeReportExportStatus | null = receipt ? receipt.summary?.status ?? receipt.initialStatus : null;
  const propertyLabel = review?.property ? (review.property.name?.trim() || `${review.property.address}, ${review.property.city}`) : null;

  return (
    <section aria-labelledby="ask-record-export-title" data-record-export>
      <Link href={backHref} className="text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">← All record sections</Link>
      <h2 id="ask-record-export-title" className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-slate-950">Export home record</h2>
      <p className="mt-1 text-sm text-slate-600">Review exactly what the export includes before you create it. Nothing is created until you confirm.</p>

      {status === 'PAUSED' ? (
        <AskCollectionState kind="UNAVAILABLE" className="mt-4 border-amber-200 bg-amber-50 text-amber-950" description="Ask Cozy is temporarily paused. Your saved data is unchanged." />
      ) : status === 'ERROR' ? (
        <AskCollectionState kind="UNAVAILABLE" className="mt-4" description="The export review could not be loaded." action={<button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">Try again</button>} />
      ) : status === 'LOADING' || !review ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-6 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Preparing the export review…</div>
      ) : (
        <div className="mt-4 space-y-5">
          <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2" data-export-facts>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home</dt><dd className="text-slate-900">{propertyLabel ?? 'This home'}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewed</dt><dd className="text-slate-900">{dateTime.format(new Date(review.generatedAt))}</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Format</dt><dd className="text-slate-900">PDF. The sections above are fixed; you cannot choose a subset.</dd></div>
            <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Who can download</dt><dd className="text-slate-900">Only you, the person who creates it. It is kept for {review.pack.recordExpiresInDays} days.</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sharing</dt><dd className="text-slate-900">A shared link carries a redacted copy only, never this full export, and lasts {review.sharing.defaultExpiryDays} days by default. Creating a link needs the {review.sharing.requiredRole.toLowerCase()} role.</dd></div>
          </dl>

          <div>
            <h3 className="text-base font-semibold text-slate-950">Included ({included.length})</h3>
            <AskCollection className="mt-2 rounded-2xl border border-slate-200 bg-white" aria-label="Included sections">{included.map((section) => <SectionRow key={section.id} section={section} />)}</AskCollection>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-950">Not included ({excluded.length})</h3>
            <AskCollection className="mt-2 rounded-2xl border border-slate-200 bg-white" aria-label="Excluded sections">{excluded.map((section) => <SectionRow key={section.id} section={section} />)}</AskCollection>
          </div>

          {receipt ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" role="status" data-export-receipt>
              <p className="font-semibold">Export requested</p>
              <p className="mt-1">Requested {dateTime.format(new Date(receipt.createdAt))} for {propertyLabel ?? 'this home'}. {STATUS_COPY[currentStatus ?? 'PENDING']}.</p>
              <p className="mt-1">Included: {receipt.review.sections.filter((section) => section.state === 'INCLUDED').map((section) => section.label).join(', ')}.</p>
              <p className="mt-1">Not included: {receipt.review.sections.filter((section) => section.state === 'EXCLUDED').map((section) => section.label).join(', ')}.</p>
              <p className="mt-1">Reviewed {dateTime.format(new Date(receipt.review.generatedAt))}. Kept for {receipt.review.pack.recordExpiresInDays} days. No share link has been created.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void checkStatus()} disabled={checking} className="min-h-11 rounded-xl border border-emerald-900/30 bg-white px-3 py-2 font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-60">{checking ? 'Checking…' : 'Check status'}</button>
                {currentStatus === 'READY' && <button type="button" onClick={() => void download()} className="min-h-11 rounded-xl bg-emerald-950 px-3 py-2 font-semibold text-white hover:bg-emerald-900">Download</button>}
              </div>
              {currentStatus === 'FAILED' && <p className="mt-2 font-semibold text-red-800" role="alert">{receipt.summary?.errorMessage ?? 'The export could not be generated.'}</p>}
              {downloadError && <p className="mt-2 font-semibold text-red-800" role="alert">{downloadError}</p>}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {!review.create.allowed ? (
                <p className="text-sm font-semibold text-slate-800" role="status">{review.create.reason}</p>
              ) : (
                <>
                  <label className="flex items-start gap-3 text-sm text-slate-800">
                    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 h-5 w-5" />
                    <span>I understand my copy includes the sensitive fields listed above, such as serial numbers, policy numbers, premiums, and costs, and only I can download it.</span>
                  </label>
                  <button type="button" onClick={() => void create()} disabled={!acknowledged || creating} className="mt-3 min-h-11 rounded-xl bg-emerald-950 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{creating ? 'Creating…' : 'Create export'}</button>
                </>
              )}
              {createError && <p className="mt-2 text-sm font-semibold text-red-800" role="alert">{createError}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
