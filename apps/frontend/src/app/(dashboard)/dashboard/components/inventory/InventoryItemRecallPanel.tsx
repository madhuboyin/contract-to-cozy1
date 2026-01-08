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
    setLoading(true);
    setError(null);
    try {
      const res = await listInventoryItemRecalls(props.propertyId, props.inventoryItemId);
      setRows(res.recallMatches || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load recall alerts');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    if (!props.inventoryItemId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.inventoryItemId, props.propertyId]);

  async function onConfirm(matchId: string) {
    await confirmRecallMatch(matchId);
    await refresh();
  }
  async function onDismiss(matchId: string) {
    await dismissRecallMatch(matchId);
    await refresh();
  }
  async function onResolve(matchId: string, payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }) {
    await resolveRecallMatch({ matchId, ...payload });
    await refresh();
  }

  return (
    <div className="rounded-2xl border border-black/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Safety / Recall Alerts</div>
          <div className="text-xs opacity-70">Matches based on make/model. Confirm or resolve to keep your home safe.</div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-xl px-3 py-1.5 text-xs border border-black/10 hover:bg-black/5 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="mt-3 text-sm opacity-70">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="mt-3 text-sm opacity-70">No recalls detected for this item.</div>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((m) => (
            <div key={m.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium truncate">{m.recall.title}</div>
                    <RecallStatusBadge status={m.status} />
                  </div>
                  <div className="mt-1 text-xs opacity-70">
                    Confidence <span className="font-medium">{m.confidencePct}%</span>
                    {m.recall.severity ? (
                      <>
                        {' '}
                        • Severity <span className="font-medium">{m.recall.severity}</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {m.recall.recallUrl ? (
                  <a
                    href={m.recall.recallUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl px-3 py-1.5 text-xs border border-black/10 hover:bg-black/5"
                  >
                    Details
                  </a>
                ) : null}
              </div>

              {(m.recall.hazard || m.recall.remedy || m.rationale) && (
                <div className="mt-2 space-y-1 text-sm">
                  {m.rationale ? <div className="text-xs opacity-70">{m.rationale}</div> : null}
                  {m.recall.hazard ? (
                    <div>
                      <span className="font-medium">Hazard:</span> {m.recall.hazard}
                    </div>
                  ) : null}
                  {m.recall.remedy ? (
                    <div>
                      <span className="font-medium">Recommended:</span> {m.recall.remedy}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {m.status === 'NEEDS_CONFIRMATION' ? (
                  <>
                    <button
                      onClick={() => onConfirm(m.id)}
                      className="rounded-xl px-3 py-2 text-xs bg-black text-white hover:bg-black/90"
                    >
                      Confirm match
                    </button>
                    <button
                      onClick={() => onDismiss(m.id)}
                      className="rounded-xl px-3 py-2 text-xs border border-black/10 hover:bg-black/5"
                    >
                      Not my model
                    </button>
                  </>
                ) : null}

                {m.status === 'OPEN' ? (
                  <>
                    <button
                      onClick={() => setResolveFor(m.id)}
                      className="rounded-xl px-3 py-2 text-xs bg-black text-white hover:bg-black/90"
                    >
                      Mark resolved
                    </button>
                    <button
                      onClick={() => onDismiss(m.id)}
                      className="rounded-xl px-3 py-2 text-xs border border-black/10 hover:bg-black/5"
                    >
                      Dismiss
                    </button>
                  </>
                ) : null}

                {m.status === 'RESOLVED' ? (
                  <div className="text-xs text-emerald-700">
                    Resolved{m.resolutionType ? ` • ${m.resolutionType.replace('_', ' ')}` : ''}
                  </div>
                ) : null}

                {m.maintenanceTaskId ? (
                  <div className="text-xs opacity-70">Action created</div>
                ) : null}
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
