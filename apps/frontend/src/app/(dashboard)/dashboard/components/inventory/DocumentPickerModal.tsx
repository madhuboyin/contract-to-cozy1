// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/DocumentPickerModal.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { listUserDocuments } from '../../inventory/inventoryApi';

type Doc = {
  id: string;
  propertyId?: string | null;
  type?: string | null; // DocumentType enum in backend
  name?: string | null; // file original name
  createdAt?: string | null;
};

export default function DocumentPickerModal(props: {
  open: boolean;
  propertyId: string;
  alreadyLinkedIds: Set<string>;
  onClose: () => void;
  onPick: (doc: Doc) => void;
}) {
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const all = (await listUserDocuments()) as Doc[];
      // Filter to same property (best UX, avoids cross-property mistakes)
      const scoped = all.filter((d) => (d.propertyId || null) === (props.propertyId || null));
      setDocs(scoped);
    } catch (e: any) {
      setError(e?.message || 'Failed to load documents');
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!props.open) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((d) => {
      const hay = `${d.name || ''} ${d.type || ''} ${d.id}`.toLowerCase();
      return hay.includes(term);
    });
  }, [docs, q]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={props.onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl border border-black/10 shadow-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Attach existing document</div>
            <div className="text-sm opacity-70">Shows documents uploaded for this property.</div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
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
            {filtered.map((d) => {
              const disabled = props.alreadyLinkedIds.has(d.id);
              return (
                <button
                  key={d.id}
                  disabled={disabled}
                  onClick={() => props.onPick(d)}
                  className="w-full text-left p-3 hover:bg-black/5 disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{d.name || d.id}</div>
                      <div className="text-xs opacity-70">
                        {d.type || 'DOCUMENT'} • {d.createdAt ? new Date(d.createdAt).toLocaleString() : ''}
                      </div>
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
