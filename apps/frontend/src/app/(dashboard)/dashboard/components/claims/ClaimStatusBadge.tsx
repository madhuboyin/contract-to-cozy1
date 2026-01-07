// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimStatusBadge.tsx
import React from 'react';
import type { ClaimStatus } from '../../properties/[id]/claims/claimsApi';

export default function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const tone =
    status === 'CLOSED'
      ? 'bg-gray-100 text-gray-700 border-gray-200'
      : status === 'SUBMITTED'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : status === 'UNDER_REVIEW'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'DENIED'
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-slate-50 text-slate-700 border-slate-200';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}
