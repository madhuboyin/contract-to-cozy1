// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentCard.tsx
import React from 'react';
import Link from 'next/link';
import type { IncidentDTO } from '@/types/incidents.types';
import IncidentSeverityBadge from './IncidentSeverityBadge';
import IncidentStatusBadge from './IncidentStatusBadge';

export default function IncidentCard({ incident, propertyId }: { incident: IncidentDTO; propertyId: string }) {
  const score = incident.severityScore ?? null;
  const conf = incident.confidence ?? null;

  return (
    <Link
      href={`/dashboard/properties/${propertyId}/incidents/${incident.id}`}
      className="block rounded-xl border bg-white p-4 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{incident.title}</h3>
            {incident.isSuppressed ? (
              <span className="text-xs text-slate-500">(suppressed)</span>
            ) : null}
          </div>
          {incident.summary ? (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{incident.summary}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="rounded-md bg-slate-50 px-2 py-1">Type: {incident.typeKey}</span>
            {incident.category ? <span className="rounded-md bg-slate-50 px-2 py-1">Cat: {incident.category}</span> : null}
            {score != null ? <span className="rounded-md bg-slate-50 px-2 py-1">Score: {score}</span> : null}
            {conf != null ? <span className="rounded-md bg-slate-50 px-2 py-1">Conf: {conf}</span> : null}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <IncidentSeverityBadge severity={incident.severity} />
          <IncidentStatusBadge status={incident.status} />
        </div>
      </div>

      {!!incident.actions?.length && (
        <div className="mt-3 text-xs text-slate-700">
          <span className="font-medium">{incident.actions.length}</span> action(s) attached
        </div>
      )}
    </Link>
  );
}
