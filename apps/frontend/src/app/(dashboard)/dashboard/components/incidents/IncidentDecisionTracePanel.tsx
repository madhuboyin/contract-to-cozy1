// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentDecisionTracePanel.tsx
'use client';

import React, { useState } from 'react';

export default function IncidentDecisionTracePanel({ trace }: { trace: any | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Decision trace</h3>
        <button
          className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {!trace ? (
        <p className="mt-2 text-sm text-slate-600">
          No decision trace yet. Click <b>Re-evaluate</b> to generate proposals.
        </p>
      ) : open ? (
        <pre className="mt-3 max-h-[420px] overflow-auto rounded-lg border bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify(trace, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-xs text-slate-600">
          Trace captured from the latest <b>ACTION_PROPOSED</b> event.
        </p>
      )}
    </div>
  );
}
