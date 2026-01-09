// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentActionsPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { IncidentActionDTO } from '@/types/incidents.types';
import { executeIncidentAction } from '@/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi';

export default function IncidentActionsPanel({
  propertyId,
  incidentId,
  actions,
  decisionTrace,
  onExecuted,
}: {
  propertyId: string;
  incidentId: string;
  actions: IncidentActionDTO[];
  decisionTrace?: any | null;
  onExecuted?: () => void;
}) {
  // ✅ Enforce product rule in UI: do not surface BOOKING actions (legacy only)
  const visibleActions = useMemo(() => actions.filter((a) => a.type !== 'BOOKING'), [actions]);

  const proposed = useMemo(() => visibleActions.filter((a) => a.status === 'PROPOSED'), [visibleActions]);
  const created = useMemo(() => visibleActions.filter((a) => a.status === 'CREATED'), [visibleActions]);

  const [openWhyId, setOpenWhyId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function findWhyForAction(a: IncidentActionDTO) {
    const actionKey = a?.payload?.actionKey;
    if (!actionKey) return null;
  
    const proposed = decisionTrace?.proposedActions ?? [];
    const matchProposed = Array.isArray(proposed)
      ? proposed.find((x: any) => x?.actionKey === actionKey)
      : null;
  
    if (matchProposed) return matchProposed;
  
    const rec = decisionTrace?.recommended ?? [];
    const matchRec = Array.isArray(rec)
      ? rec.find((x: any) => x?.actionKey === actionKey)
      : null;
  
    return matchRec ?? null;
  }  

  async function onExecute(actionId: string) {
    setErr(null);
    setBusyId(actionId);
    try {
      await executeIncidentAction({ propertyId, incidentId, actionId });
      // close any open "Why" panel if that action is being executed
      if (openWhyId === actionId) setOpenWhyId(null);
      onExecuted?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to execute action');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Actions</h3>
      </div>

      {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}

      {proposed.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-700">Recommended</p>

          <div className="mt-2 space-y-2">
            {proposed.map((a) => {
              const why = findWhyForAction(a);
              const isWhyOpen = openWhyId === a.id;
              const isBusy = busyId === a.id;

              return (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.ctaLabel ?? `${a.type} action`}</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Type: {a.type} • Status: {a.status}
                      </p>
                      {a?.payload?.actionKey ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Key: {String(a.payload.actionKey)}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                        disabled={!why || !!busyId}
                        onClick={() => setOpenWhyId(isWhyOpen ? null : a.id)}
                        title={why ? 'Why was this action recommended?' : 'No decision trace available for this action yet'}
                      >
                        {isWhyOpen ? 'Hide why' : 'Why?'}
                      </button>

                      <button
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() => onExecute(a.id)}
                      >
                        {isBusy ? 'Creating…' : 'Create'}
                      </button>
                    </div>
                  </div>

                  {isWhyOpen ? (
                    <div className="mt-3 rounded-lg border bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">Why this action</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Pulled from the latest <b>ACTION_PROPOSED</b> decision trace.
                      </p>

                      <pre className="mt-2 max-h-[240px] overflow-auto text-xs text-slate-700">
                        {JSON.stringify(why ?? a.payload ?? {}, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No recommended actions.</p>
      )}

      {created.length ? (
        <div className="mt-6">
          <p className="text-xs font-medium text-slate-700">Created</p>

          <div className="mt-2 space-y-2">
            {created.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{a.ctaLabel ?? `${a.type} created`}</p>
                  <span className="text-xs text-slate-600">CREATED</span>
                </div>

                <p className="mt-1 text-xs text-slate-600">
                  Linked: {a.entityType ?? '—'} {a.entityId ? `• ${a.entityId}` : ''}
                </p>

                {a.ctaUrl ? (
                  <a
                    className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
                    href={a.ctaUrl}
                  >
                    Open
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
