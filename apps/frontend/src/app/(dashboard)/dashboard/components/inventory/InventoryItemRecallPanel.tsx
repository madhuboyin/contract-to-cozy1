// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemRecallPanel.tsx
'use client';

import React, { useEffect, useState } from 'react';
import type { RecallMatchDTO, RecallResolutionType } from '@/types/recalls.types';
import RecallStatusBadge from '@/app/(dashboard)/dashboard/components/recalls/RecallStatusBadge';
import ResolveRecallModal from '@/app/(dashboard)/dashboard/components/recalls/ResolveRecallModal';
import {
  listInventoryItemRecalls,
  confirmRecallMatch,
  dismissRecallMatch,
  resolveRecallMatch,
} from '../../properties/[id]/recalls/recallsApi';

export default function InventoryItemRecallPanel(props: {
  open: boolean;
  propertyId: string;
  inventoryItemId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RecallMatchDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [resolveFor, setResolveFor] = useState<string | null>(null);

  async function refresh() {
    if (!props.propertyId || !props.inventoryItemId) return;
  
    setLoading(true);
    setError(null);
    try {
      const res = await listInventoryItemRecalls(props.propertyId, props.inventoryItemId);
      // ✅ backend returns { matches: [...] }
      setRows(res?.matches ?? []);
    } catch (e: any) {
      console.error('Recall fetch error:', e);
      setError(e?.message || 'Failed to load recall alerts');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  console.log('rows', rows);

  useEffect(() => {
    if (!props.open) return;

    refresh();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.propertyId, props.inventoryItemId]);

  useEffect(() => {
    // Optional: when closing modal, clear state so next open is clean
    if (!props.open) {
      setError(null);
      setRows([]);
      setResolveFor(null);
    }
  }, [props.open]);

  async function onConfirm(id: string) {
    try {
      await confirmRecallMatch(props.propertyId, id);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Failed to confirm');
    }
  }

  async function onDismiss(id: string) {
    if (!confirm('Are you sure you want to dismiss this alert?')) return;
    try {
      await dismissRecallMatch(props.propertyId, id);
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Failed to dismiss');
    }
  }

  async function onResolve(
    id: string,
    payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }
  ) {
    try {
      await resolveRecallMatch({
        propertyId: props.propertyId,
        matchId: id,
        resolutionType: payload.resolutionType,
        resolutionNotes: payload.resolutionNotes,
      });
      await refresh();
    } catch (e: any) {
      alert(e.message || 'Failed to resolve');
    }
  }

  const safeRows = rows ?? [];

  // Optional: if you only want to show actionable statuses in this panel:
  // const visibleRows = safeRows.filter(m => m.status === 'OPEN' || m.status === 'DETECTED' || m.status === 'NEEDS_CONFIRMATION');
  const visibleRows = safeRows.filter(m =>
    ['OPEN', 'DETECTED', 'NEEDS_CONFIRMATION'].includes(m.status as any)
  );
  console.log('visibleRows', visibleRows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 text-sm">Safety / Recall Alerts</h3>
        {loading && (
          <span className="text-[10px] text-slate-400 animate-pulse font-medium uppercase tracking-wider">
            Scanning...
          </span>
        )}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{error}</div>
      ) : null}

      {!loading && visibleRows.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center">
          <p className="text-xs text-slate-500 font-medium">No active recalls found</p>
          <p className="mt-1 text-[10px] text-slate-400">We monitor CPSC data for your appliance models.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-black/5 bg-white p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Recall Alert</span>
                    <RecallStatusBadge status={m.status} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    {m.recall?.title || 'Product Safety Alert'}
                  </h4>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {m.recall?.hazard || 'Please review official notice for hazard details.'}
                  </p>
                </div>
              </div>

              {m.recall?.recallUrl && (
                <a
                  href={m.recall.recallUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  View Official CPSC Notice ↗
                </a>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-50 pt-3">
                {(m.status as string) === 'DETECTED' ? (
                  <>
                    <button
                      onClick={() => onConfirm(m.id)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                      Confirm Match
                    </button>
                    <button
                      onClick={() => onDismiss(m.id)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Not my model
                    </button>
                  </>
                ) : null}

                {(m.status as string) === 'OPEN' ? (
                  <>
                    <button
                      onClick={() => setResolveFor(m.id)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold bg-slate-900 text-white hover:bg-black transition-colors"
                    >
                      Mark Resolved
                    </button>
                    <button
                      onClick={() => onDismiss(m.id)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}

                {(m.status as string) === 'RESOLVED' ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Resolved{m.resolutionType ? `: ${m.resolutionType.replace(/_/g, ' ')}` : ''}
                  </div>
                ) : null}

                {m.maintenanceTaskId && (
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">• Linked to Task</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ResolveRecallModal
        open={!!resolveFor}
        onClose={() => setResolveFor(null)}
        onSubmit={async (payload) => {
          if (!resolveFor) return;
          await onResolve(resolveFor, payload);
          setResolveFor(null);
        }}
      />
    </div>
  );
}
