'use client';
import { useState } from 'react';
import { FileDown, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { PermitDisclosureExportItem } from '@/types';
import { api } from '@/lib/api/client';

interface Props {
  propertyId: string;
}

export default function DisclosureExportButton({ propertyId }: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'polling' | 'ready' | 'error'>('idle');
  const [exportItem, setExportItem] = useState<PermitDisclosureExportItem | null>(null);
  const [error, setError] = useState('');

  async function handleRequest() {
    setState('requesting');
    setError('');
    try {
      const { exportId } = await api.requestDisclosureExport(propertyId);
      setState('polling');

      const poll = setInterval(async () => {
        try {
          const exp = await api.getDisclosureExport(propertyId, exportId);
          if (exp.status === 'COMPLETED') {
            clearInterval(poll);
            setExportItem(exp);
            setState('ready');
          } else if (exp.status === 'FAILED') {
            clearInterval(poll);
            setError(exp.errorMessage ?? 'Export failed. Please try again.');
            setState('error');
          }
        } catch {
          clearInterval(poll);
          setError('Failed to check export status.');
          setState('error');
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(poll);
        if (state === 'polling') {
          setError('Export is taking longer than expected. Refresh to check.');
          setState('error');
        }
      }, 120000);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to request export.');
      setState('error');
    }
  }

  if (state === 'ready' && exportItem?.fileUrl) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-emerald-800">Disclosure PDF ready</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            {exportItem.totalPermits} permits · {exportItem.openFlags} open flags
          </p>
        </div>
        <a
          href={exportItem.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download
        </a>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-800">Export failed</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
        </div>
        <button
          onClick={() => setState('idle')}
          className="shrink-0 text-xs text-red-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleRequest}
      disabled={state === 'requesting' || state === 'polling'}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white py-3 text-sm font-medium text-neutral-700 disabled:opacity-60"
    >
      {(state === 'requesting' || state === 'polling') ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {state === 'requesting' ? 'Requesting…' : 'Generating PDF…'}
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Generate Disclosure PDF
        </>
      )}
    </button>
  );
}
