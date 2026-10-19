'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { buildAskWorkspaceHref } from '@/lib/navigation/askNavigation';
import type { AskRecordDetail, AskRecordFacet } from '@/features/ask/types';
import { askFailureCode, askServiceIsPaused } from '../workspace/support';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const when = (iso: string) => dateFormat.format(new Date(iso));

/** One provenance facet: the fact when the canonical owner has it, otherwise the plain reason it is missing. Never blank. */
function FacetValue({ facet }: { facet: AskRecordFacet }) {
  if (facet.state === 'AVAILABLE') return <>{facet.value}{facet.at ? ` · ${when(facet.at)}` : ''}</>;
  return <span className="text-slate-600">{facet.state === 'NOT_RECORDED' ? 'Not recorded' : 'Not available'}{facet.reason ? ` — ${facet.reason}` : ''}</span>;
}

export function RecordDetailPanel({ detail, propertyId, backTo }: { detail: AskRecordDetail; propertyId: string; backTo: string }) {
  const { provenance } = detail;
  const facets: Array<[string, AskRecordFacet]> = [
    ['Source', provenance.source], ['Observed', provenance.observed], ['Verification', provenance.verification], ['Who can see it', provenance.visibility],
  ];
  return (
    <div className="space-y-4 text-sm" data-record-detail-panel={detail.recordId}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3" aria-label="Details">
        {detail.facts.map((fact) => <div key={fact.label}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{fact.label}</dt><dd className="text-slate-900">{fact.value}</dd></div>)}
      </dl>

      <section aria-label="Where this came from">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provenance</h4>
        <dl className="mt-1 space-y-1">
          {facets.map(([label, facet]) => <div key={label} data-provenance={label.toLowerCase()} data-provenance-state={facet.state.toLowerCase()}><dt className="inline font-semibold text-slate-800">{label}: </dt><dd className="inline text-slate-900"><FacetValue facet={facet} /></dd></div>)}
          <div data-provenance="related" data-provenance-state={provenance.related.state.toLowerCase()}>
            <dt className="inline font-semibold text-slate-800">Related records: </dt>
            <dd className="inline text-slate-900">
              {provenance.related.records.length > 0
                ? provenance.related.records.map((record, index) => <span key={`${record.kindLabel}:${record.label}`}>{index > 0 ? '; ' : ''}{record.kindLabel}: {record.label}{record.broken === true ? ' (link is broken)' : ''}</span>)
                : <span className="text-slate-600">{provenance.related.state === 'NOT_RECORDED' ? 'None recorded' : 'Not available'}{provenance.related.reason ? ` — ${provenance.related.reason}` : ''}</span>}
            </dd>
          </div>
          <div data-provenance="history" data-provenance-state={provenance.history.state.toLowerCase()}>
            <dt className="inline font-semibold text-slate-800">History: </dt>
            <dd className="inline text-slate-900">
              {provenance.history.entries.length > 0
                ? <ul className="mt-1 list-disc pl-5">{provenance.history.entries.map((entry) => <li key={`${entry.at}:${entry.label}`}>{entry.label} · {when(entry.at)}</li>)}</ul>
                : <span className="text-slate-600">{provenance.history.state === 'NOT_RECORDED' ? 'None recorded' : 'Not available'}{provenance.history.reason ? ` — ${provenance.history.reason}` : ''}</span>}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Corrections">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correct this record</h4>
        <ul className="mt-1 space-y-1">
          {detail.corrections.map((route) => (
            <li key={route.id} data-correction={route.id} data-correction-state={route.state.toLowerCase()} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              {route.state === 'AVAILABLE' && route.openQuestion ? (
                <Link href={buildAskWorkspaceHref({ propertyId, question: route.openQuestion, from: 'record', backTo })} className="inline-flex min-h-11 items-center rounded-xl border border-emerald-900/20 px-3 py-2 font-semibold text-emerald-950 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                  {route.label}
                </Link>
              ) : (
                <>
                  <span className="font-semibold text-slate-700">{route.label}</span>
                  <span className="text-slate-600" role="note">Not available — {route.reason}</span>
                </>
              )}
              {route.state === 'AVAILABLE' && route.note && <span className="text-xs text-slate-600" role="note">{route.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** The "Details" disclosure under a Record row. Detail is read only when it is opened, so a collection page costs nothing extra. */
export function RecordRowDetail({ sectionId, recordId, propertyId, label, backTo }: { sectionId: string; recordId: string; propertyId: string; label: string; backTo: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: 'IDLE' | 'LOADING' | 'READY' | 'MISSING' | 'ERROR' | 'PAUSED'; detail: AskRecordDetail | null }>({ status: 'IDLE', detail: null });
  const [attempt, setAttempt] = useState(0);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState({ status: 'LOADING', detail: null });
    api.getAskRecordDetail(sectionId, propertyId, recordId, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response.success || !response.data) throw new Error(response.message || 'Could not load this record.');
        setState({ status: 'READY', detail: response.data });
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        const code = askFailureCode(caught);
        const gone = code === 'ASK_RECORD_NOT_FOUND' || code === 'ASK_PERMISSION_REQUIRED' || code === 'ASK_PROPERTY_NOT_FOUND';
        setState({ status: askServiceIsPaused(caught) ? 'PAUSED' : gone ? 'MISSING' : 'ERROR', detail: null });
      });
    return () => controller.abort();
  }, [open, sectionId, propertyId, recordId, attempt]);

  return (
    <li className="!border-t-0 -mt-2 px-3 pb-3" data-record-detail-for={recordId}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} className="min-h-11 rounded-xl px-2 text-sm font-semibold text-emerald-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
        {open ? 'Hide details' : 'Details and history'}<span className="sr-only"> for {label}</span>
      </button>
      {open && (
        <div id={panelId} className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {state.status === 'LOADING' && <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading details…</p>}
          {state.status === 'PAUSED' && <p className="text-sm text-amber-950" role="status">Ask Cozy is temporarily paused. Your saved data is unchanged.</p>}
          {state.status === 'MISSING' && <p className="text-sm text-slate-700" role="status">This record is no longer available to you.</p>}
          {state.status === 'ERROR' && <p className="text-sm text-amber-900" role="alert">Details could not be loaded. <button type="button" onClick={() => setAttempt((value) => value + 1)} className="font-semibold underline">Try again</button></p>}
          {state.status === 'READY' && state.detail && <RecordDetailPanel detail={state.detail} propertyId={propertyId} backTo={backTo} />}
        </div>
      )}
    </li>
  );
}
