'use client';
import { useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { PermitFetchJobSummary } from '@/types';
import { relativeTime } from './PermitUtils';

interface Props {
  fetchJob: PermitFetchJobSummary | null;
  city?: string;
  onTrigger: () => Promise<void>;
}

export default function FetchStatusBanner({ fetchJob, city, onTrigger }: Props) {
  const [triggering, setTriggering] = useState(false);

  async function handleTrigger() {
    setTriggering(true);
    try { await onTrigger(); } finally { setTriggering(false); }
  }

  const cityLabel = city ?? 'your area';

  if (!fetchJob) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <Info className="h-5 w-5 text-neutral-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Check for public permit records</p>
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))] mt-0.5">
            We may be able to pull permit records from {cityLabel}'s open data.
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="shrink-0 rounded-xl bg-[hsl(var(--mobile-brand-strong))] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Look Up'}
        </button>
      </div>
    );
  }

  if (fetchJob.status === 'NO_DATA_SOURCE') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
        <Info className="h-5 w-5 text-neutral-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Open data not available for {cityLabel}</p>
          <p className="text-xs text-[hsl(var(--mobile-text-secondary))] mt-0.5">
            Add permits manually using the button below.
          </p>
        </div>
      </div>
    );
  }

  if (fetchJob.status === 'QUEUED' || fetchJob.status === 'RUNNING') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
        <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">Fetching permit records from {cityLabel}…</p>
          <p className="text-xs text-blue-600 mt-0.5">This may take a moment.</p>
        </div>
      </div>
    );
  }

  if (fetchJob.status === 'FAILED') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-800">Could not reach {cityLabel} open data</p>
          <p className="text-xs text-red-600 mt-0.5">Try again later.</p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="shrink-0 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
        >
          {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry'}
        </button>
      </div>
    );
  }

  if (fetchJob.status === 'COMPLETED') {
    const found = fetchJob.permitsFound ?? 0;
    if (found === 0) {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <Info className="h-5 w-5 text-neutral-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">No records found in {cityLabel} open data</p>
            <p className="text-xs text-[hsl(var(--mobile-text-secondary))] mt-0.5">
              Add permits manually if you have records. Last checked {relativeTime(fetchJob.completedAt)}.
            </p>
          </div>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            className="shrink-0 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-50"
          >
            {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-emerald-800">
            Found {found} permit{found !== 1 ? 's' : ''}
            {fetchJob.dataSourceName ? ` from ${fetchJob.dataSourceName}` : ''}
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Last updated {relativeTime(fetchJob.completedAt)}.
            {fetchJob.permitsInserted ? ` ${fetchJob.permitsInserted} new.` : ''}
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="shrink-0 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
        >
          {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }

  return null;
}
