'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { AskPresentationBlock } from '@/features/ask/types';
import { ActionLink } from './context';
import type { AskBlockRenderer } from './types';

function MonitorView({ block }: { block: Extract<AskPresentationBlock, { type: 'MONITOR' }> }) {
  const [status, setStatus] = useState(block.status);
  const [saving, setSaving] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.getAskMonitor(block.monitorId).then((response) => {
      if (active && response.success && response.data) setStatus(response.data.status);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [block.monitorId]);
  const update = async (action: 'PAUSE' | 'RESUME' | 'STOP') => {
    setSaving(true); setError(null);
    try {
      const response = await api.updateAskMonitor(block.monitorId, action);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not update this monitor.');
      setStatus(response.data.status); setConfirmStop(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this monitor.'); }
    finally { setSaving(false); }
  };
  const editAction = block.actions.find((action) => action.id === 'edit-monitor');
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><BellRing className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{block.title}</h3><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{status}</span></div><p className="mt-1 text-sm text-slate-700">{block.product} · {block.threshold}</p></div></div>
      <dl className="mt-4 grid gap-2 rounded-xl bg-white/80 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Delivery</dt><dd className="font-medium text-slate-800">{block.channel} · {block.cadence.replace(/_/g, ' ').toLowerCase()}</dd></div><div><dt className="text-xs text-slate-500">Quiet hours</dt><dd className="font-medium text-slate-800">{block.quietHours ?? 'None'}</dd></div></dl>
      <p className="mt-3 text-xs leading-5 text-slate-600">{block.sourceBoundary}</p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {editAction && <ActionLink action={editAction} />}
        {status === 'ACTIVE' && <button type="button" disabled={saving} onClick={() => void update('PAUSE')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Pause</button>}
        {status === 'PAUSED' && <button type="button" disabled={saving} onClick={() => void update('RESUME')} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Resume</button>}
        {status !== 'STOPPED' && !confirmStop && <button type="button" disabled={saving} onClick={() => setConfirmStop(true)} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-red-700">Stop</button>}
      </div>
      {confirmStop && <div className="mt-3 rounded-xl border border-red-200 bg-white p-3"><p className="text-sm text-slate-700">Stop this monitor? It will no longer evaluate new rate snapshots.</p><div className="mt-2 flex gap-2"><button type="button" disabled={saving} onClick={() => void update('STOP')} className="min-h-10 rounded-xl bg-red-700 px-3 py-2 text-sm font-semibold text-white">Confirm stop</button><button type="button" disabled={saving} onClick={() => setConfirmStop(false)} className="min-h-10 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600">Keep active</button></div></div>}
    </section>
  );
}

export const MonitorBlock: AskBlockRenderer<'MONITOR'> = ({ block }) => <MonitorView block={block} />;
