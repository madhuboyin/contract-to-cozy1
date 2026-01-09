// apps/frontend/src/app/(dashboard)/dashboard/components/incidents/IncidentStatusBadge.tsx
import React from 'react';
import type { IncidentStatus } from '@/types/incidents.types';

export default function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const cls =
    status === 'ACTIVE'
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : status === 'SUPPRESSED'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : status === 'RESOLVED'
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
