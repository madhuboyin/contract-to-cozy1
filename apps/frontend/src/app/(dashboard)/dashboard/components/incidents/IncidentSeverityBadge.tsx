// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentSeverityBadge.tsx
import React from 'react';
import type { IncidentSeverity } from '@/types/incidents.types';

export default function IncidentSeverityBadge({ severity }: { severity?: IncidentSeverity | null }) {
  const s = severity ?? 'INFO';
  const cls =
    s === 'CRITICAL'
      ? 'bg-red-100 text-red-800 border-red-200'
      : s === 'WARNING'
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-slate-100 text-slate-800 border-slate-200';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {s}
    </span>
  );
}
