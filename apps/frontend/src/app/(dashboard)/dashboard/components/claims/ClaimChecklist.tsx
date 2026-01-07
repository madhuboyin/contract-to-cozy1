// apps/frontend/src/app/(dashboard)/dashboard/components/claims/ClaimChecklist.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { ClaimDTO, ChecklistItemStatus, ClaimChecklistItem } from '../../properties/[id]/claims/claimsApi';
import { updateChecklistItem } from '../../properties/[id]/claims/claimsApi';

function statusLabel(s: ChecklistItemStatus) {
  if (s === 'DONE') return 'Done';
  if (s === 'NOT_APPLICABLE') return 'N/A';
  return 'Open';
}

export default function ClaimChecklist({
  propertyId,
  claim,
  onChanged,
}: {
  propertyId: string;
  claim: ClaimDTO;
  onChanged: () => Promise<void>;
}) {
  const items = useMemo(() => (claim.checklistItems ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex), [claim]);

  const [busyId, setBusyId] = useState<string | null>(null);

  async function setItemStatus(item: ClaimChecklistItem, status: ChecklistItemStatus) {
    setBusyId(item.id);
    try {
      await updateChecklistItem(propertyId, claim.id, item.id, { status });
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <div className="text-sm text-gray-600">No checklist items yet.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-900">
                  {it.orderIndex}. {it.title}
                </div>
                {it.required ? (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                    Required
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    Optional
                  </span>
                )}
              </div>
              {it.description ? (
                <div className="mt-1 text-sm text-gray-600">{it.description}</div>
              ) : null}
            </div>

            <div className="shrink-0">
              <select
                className="rounded-lg border px-2 py-1 text-sm"
                value={it.status}
                disabled={busyId === it.id}
                onChange={(e) => setItemStatus(it, e.target.value as ChecklistItemStatus)}
              >
                <option value="OPEN">{statusLabel('OPEN')}</option>
                <option value="DONE">{statusLabel('DONE')}</option>
                <option value="NOT_APPLICABLE">{statusLabel('NOT_APPLICABLE')}</option>
              </select>
            </div>
          </div>

          {busyId === it.id ? (
            <div className="mt-2 text-xs text-gray-500">Updating…</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
