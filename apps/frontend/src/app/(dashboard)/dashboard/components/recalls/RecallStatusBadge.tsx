// apps/frontend/src/app/(dashboard)/dashboard/components/recalls/RecallStatusBadge.tsx
'use client';

import React from 'react';
import type { RecallMatchStatus } from '@/types/recalls.types';

function cls(status: RecallMatchStatus) {
  switch (status) {
    case 'OPEN':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'NEEDS_CONFIRMATION':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'DISMISSED':
      return 'bg-slate-50 text-slate-600 border-slate-200';
    case 'RESOLVED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

export default function RecallStatusBadge({ status }: { status: RecallMatchStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls(status)}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
