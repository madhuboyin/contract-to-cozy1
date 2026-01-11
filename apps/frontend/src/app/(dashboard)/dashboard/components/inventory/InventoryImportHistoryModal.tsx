// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryImportHistoryModal.tsx
'use client';

import React from 'react';
import { api } from '@/lib/api/client';

type Batch = {
  id: string;
  fileName: string | null;
  templateVersion: number;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'ROLLED_BACK';
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: string;
};

export default function InventoryImportHistoryModal(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  onChanged: () => Promise<void> | void; // refresh inventory
}) {
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [rollingId, setRollingId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ batches: Batch[] }>(
        `/api/properties/${props.propertyId}/inventory/import-batches`
      );
      setBatches(res.data?.batches || []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load import history');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (props.open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.propertyId]);

  if (!props.open) return null;

  async function rollback(batchId: string) {
    const ok = confirm(
      'Rollback will remove items created by this batch (documents will be detached). Continue?'
    );
    if (!ok) return;

    setRollingId(batchId);
    setErr(null);
    try {
      await api.post(
        `/api/properties/${props.propertyId}/inventory/import-batches/${batchId}/rollback`,
        {}
      );
      await load();
      await props.onChanged();
    } catch (e: any) {
      setErr(e?.message || 'Rollback failed');
    } finally {
      setRollingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Import history</div>
            <div className="text-sm opacity-70 mt-1">
              Review past bulk imports and rollback a batch if needed.
            </div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        {loading ? (
          <div className="mt-4 text-sm opacity-70">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-black/10 p-4 text-sm opacity-70">
            No import batches yet.
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/10 divide-y">
            {batches.map((b) => {
              const canRollback = b.status !== 'ROLLED_BACK';
              return (
                <div key={b.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {b.fileName || 'XLSX import'}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(b.createdAt).toLocaleString()} • v{b.templateVersion} •{' '}
                      <span className="font-mono">{b.id}</span>
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      Status: <span className="font-mono">{b.status}</span> • Created: {b.createdCount} •
                      Skipped: {b.skippedCount} • Errors: {b.errorCount}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      disabled={!canRollback || rollingId === b.id}
                      onClick={() => rollback(b.id)}
                      className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    >
                      {rollingId === b.id ? 'Rolling back…' : 'Rollback'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
