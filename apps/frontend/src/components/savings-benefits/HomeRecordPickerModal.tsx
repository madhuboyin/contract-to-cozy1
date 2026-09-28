'use client';

// A "Attach existing" picker sourced from Home Records (PropertyRecord), for domains already
// converted off the legacy Document Vault (Documents slice S5f). Deliberately not a change to the
// shared DocumentPickerModal — that component still backs InventoryItemDrawer.tsx, whose domain
// (inventory attachments) has not converted yet.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';

type Record = { id: string; title: string; recordType: string };

export default function HomeRecordPickerModal(props: {
  open: boolean;
  propertyId: string;
  alreadyLinkedIds: Set<string>;
  onClose: () => void;
  onPick: (doc: { id: string; name: string }) => void;
}) {
  const [q, setQ] = useState('');
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listPropertyRecords(props.propertyId);
      if (!response.success) throw new Error(response.message || 'Failed to load documents');
      setRecords(response.data.records);
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [props.propertyId]);

  useEffect(() => {
    if (!props.open) return;
    refresh();
  }, [props.open, props.propertyId, refresh]);

  useEffect(() => {
    if (!props.open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') props.onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [props.open, props.onClose]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return records;
    return records.filter((r) => `${r.title} ${r.recordType} ${r.id}`.toLowerCase().includes(term));
  }, [records, q]);

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-record-picker-modal-title"
    >
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div id="home-record-picker-modal-title" className="text-base font-semibold">Attach existing document</div>
            <div className="text-sm opacity-70">Shows Home Records for this property.</div>
          </div>
          <button onClick={props.onClose} className="inline-flex min-h-[44px] items-center text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name/type/id…"
            className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm"
          />
          <button
            onClick={refresh}
            className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : loading ? (
          <div className="mt-4 text-sm opacity-70">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 text-sm opacity-70">No documents found for this property.</div>
        ) : (
          <div className="mt-4 max-h-[420px] overflow-y-auto rounded-xl border border-black/10 divide-y">
            {filtered.map((r) => {
              const disabled = props.alreadyLinkedIds.has(r.id);
              return (
                <button
                  key={r.id}
                  disabled={disabled}
                  onClick={() => props.onPick({ id: r.id, name: r.title })}
                  className="w-full text-left p-3 hover:bg-black/5 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{r.title || r.id}</div>
                      <div className="text-xs opacity-70">{r.recordType}</div>
                    </div>
                    {disabled && <div className="text-xs opacity-60">Already attached</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
