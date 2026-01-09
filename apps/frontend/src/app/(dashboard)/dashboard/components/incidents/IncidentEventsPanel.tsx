// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentEventsPanel.tsx
import React from 'react';
import type { IncidentEventDTO } from '@/types/incidents.types';

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function IncidentEventsPanel({ events }: { events: IncidentEventDTO[] }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-semibold">Incident Timeline</h3>
      {events.length ? (
        <div className="mt-3 space-y-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">{e.type}</p>
                <p className="text-xs text-slate-500">{fmt(e.createdAt)}</p>
              </div>
              {e.message ? <p className="mt-1 text-sm text-slate-700">{e.message}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">No events yet.</p>
      )}
    </div>
  );
}
