// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentActionsPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { IncidentActionDTO } from '@/types/incidents.types';
import { executeIncidentAction } from '@/app/(dashboard)/dashboard/properties/[id]/incidents/incidentsApi';

export default function IncidentActionsPanel({
  incidentId,
  actions,
  onExecuted,
}: {
  incidentId: string;
  actions: IncidentActionDTO[];
  onExecuted?: () => void;
}) {
  const proposed = useMemo(() => actions.filter((a) => a.status === 'PROPOSED'), [actions]);
  const created = useMemo(() => actions.filter((a) => a.status === 'CREATED'), [actions]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onExecute(actionId: string) {
    setErr(null);
    setBusyId(actionId);
    try {
      await executeIncidentAction({ incidentId, actionId });
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
            {proposed.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.ctaLabel ?? `${a.type} action`}</p>
                  <p className="text-xs text-slate-600">
                    Type: {a.type} • Status: {a.status}
                  </p>
                </div>
                <button
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  disabled={busyId === a.id}
                  onClick={() => onExecute(a.id)}
                >
                  {busyId === a.id ? 'Creating…' : 'Create'}
                </button>
              </div>
            ))}
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
                  <a className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline" href={a.ctaUrl}>
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
