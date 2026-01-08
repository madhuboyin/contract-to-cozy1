// apps/frontend/src/app/(dashboard)/dashboard/components/recalls/ResolveRecallModal.tsx
'use client';

import React, { useMemo, useState } from 'react';
import type { RecallResolutionType } from '@/types/recalls.types';

const OPTIONS: RecallResolutionType[] = [
  'FIXED',
  'REPLACED',
  'REFUNDED',
  'NOT_APPLICABLE',
  'IGNORED',
  'OTHER',
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { resolutionType: RecallResolutionType; resolutionNotes?: string }) => Promise<void> | void;
};

export default function ResolveRecallModal({ open, onClose, onSubmit }: Props) {
  const [resolutionType, setResolutionType] = useState<RecallResolutionType>('FIXED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => !!resolutionType && !saving, [resolutionType, saving]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Resolve recall</h2>
          <button className="text-sm text-slate-600 hover:text-slate-900" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Resolution</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={resolutionType}
              onChange={(e) => setResolutionType(e.target.value as RecallResolutionType)}
            >
              {OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any details…"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={!canSubmit}
            onClick={async () => {
              setSaving(true);
              try {
                await onSubmit({ resolutionType, resolutionNotes: notes.trim() || undefined });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
