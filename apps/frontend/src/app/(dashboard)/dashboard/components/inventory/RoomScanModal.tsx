// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/RoomScanModal.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  startRoomScanAi,
  listInventoryDraftsFiltered,
  bulkConfirmInventoryDrafts,
  bulkDismissInventoryDrafts,
} from '../../inventory/inventoryApi';

type Props = {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  roomId: string;
  roomName?: string | null;
};

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

function safeArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

export default function RoomScanModal({ open, onClose, propertyId, roomId, roomName }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  function resetAll() {
    setFiles([]);
    setBusy(false);
    setSessionId(null);
    setDrafts([]);
    setSelected({});
    setError(null);
  }

  function seedSelection(rows: any[]) {
    const next: Record<string, boolean> = {};
    for (const row of rows) {
      if (!row?.id) continue;
      const conf = Number(row?.confidenceJson?.name ?? 0.65);
      next[row.id] = conf >= 0.7;
    }
    setSelected(next);
  }

  async function runScan() {
    setError(null);

    // Basic guardrails (also enforced server-side)
    if (!propertyId || !roomId) {
      setError('Missing propertyId or roomId');
      return;
    }
    if (!files.length) {
      setError('Please upload at least 1 photo.');
      return;
    }

    setBusy(true);
    try {
      const result = await startRoomScanAi(propertyId, roomId, files);

      if (isDev()) {
        // ✅ helps you confirm shape immediately without guessing
        // eslint-disable-next-line no-console
        console.log('[room-scan] startRoomScanAi result:', result);
      }

      const sid = result?.sessionId;

      if (!sid) {
        throw new Error('Room scan did not return a sessionId');
      }

      setSessionId(sid);

      // ✅ never call drafts endpoint with undefined
      const rows = safeArray(await listInventoryDraftsFiltered(propertyId, { scanSessionId: sid }));

      setDrafts(rows);
      seedSelection(rows);
    } catch (e: any) {
      // Your api client throws APIError with message already extracted from backend {success:false,error:{message}}
      // so don’t mask it.
      // eslint-disable-next-line no-console
      console.error('[room-scan] failed', e);
      setError(e?.message || 'Room scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSelected() {
    setBusy(true);
    setError(null);
    try {
      await bulkConfirmInventoryDrafts(propertyId, selectedIds);
      onClose();
      resetAll();
    } catch (e: any) {
      setError(e?.message || 'Bulk confirm failed');
    } finally {
      setBusy(false);
    }
  }

  async function dismissSelected() {
    setBusy(true);
    setError(null);
    try {
      await bulkDismissInventoryDrafts(propertyId, selectedIds);

      if (!sessionId) {
        // If somehow called without session, just reset safely
        setDrafts([]);
        setSelected({});
        return;
      }

      const rows = safeArray(await listInventoryDraftsFiltered(propertyId, { scanSessionId: sessionId }));

      setDrafts(rows);
      seedSelection(rows);
    } catch (e: any) {
      setError(e?.message || 'Bulk dismiss failed');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-black/10">
        <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">AI Scan Room</div>
            <div className="text-sm opacity-70 truncate">
              {roomName ? roomName : 'Room'} · Upload 3–10 photos from different angles.
            </div>
          </div>

          <button
            onClick={() => {
              resetAll();
              onClose();
            }}
            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
            disabled={busy}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          {!sessionId ? (
            <>
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm">
                <div className="font-medium">Tips</div>
                <ul className="list-disc ml-5 mt-1 opacity-80 space-y-1">
                  <li>Stand near the doorway and capture corners.</li>
                  <li>Include major surfaces: entertainment wall, seating area, storage.</li>
                  <li>Avoid extreme zoom; use wide shots.</li>
                </ul>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={(e) => {
                    const next = Array.from(e.target.files || []);
                    setFiles((prev) => [...prev, ...next].slice(0, 10));
                  }}
                  className="text-sm"
                  disabled={busy}
                />

                <button
                  onClick={runScan}
                  disabled={busy || files.length === 0}
                  className="rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5 disabled:opacity-50"
                >
                  {busy ? 'Scanning…' : `Scan (${files.length || 0} photos)`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span className="rounded-full border border-black/10 px-2 py-1">Session: {sessionId.slice(0, 8)}…</span>
                <span className="rounded-full border border-black/10 px-2 py-1">Drafts: {drafts.length}</span>
                <span className="ml-auto rounded-full border border-black/10 px-2 py-1">Selected: {selectedIds.length}</span>
              </div>

              <div className="max-h-[45vh] overflow-auto rounded-xl border border-black/10">
                {drafts.length === 0 ? (
                  <div className="p-4 text-sm opacity-70">No drafts created.</div>
                ) : (
                  <div className="divide-y divide-black/10">
                    {drafts.map((d: any) => {
                      const id = d?.id;
                      if (!id) return null;

                      const conf = Number(d?.confidenceJson?.name ?? 0.65);
                      const low = conf < 0.7;

                      return (
                        <label key={id} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-black/[0.02]">
                          <input
                            type="checkbox"
                            checked={!!selected[id]}
                            onChange={(e) => setSelected((m) => ({ ...m, [id]: e.target.checked }))}
                            className="mt-1"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{d.name || 'New item'}</div>
                            <div className="text-xs opacity-70 mt-0.5">
                              Category: <span className="font-medium">{d.category || '—'}</span> · Confidence:{' '}
                              <span className={low ? 'font-medium text-amber-700' : 'font-medium'}>
                                {Math.round(conf * 100)}%
                              </span>
                              {low ? <span className="ml-2">(review)</span> : null}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={dismissSelected}
                  disabled={busy || selectedIds.length === 0}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                >
                  Dismiss selected
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={confirmSelected}
                    disabled={busy || selectedIds.length === 0}
                    className="rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5 disabled:opacity-50"
                  >
                    Add selected to inventory
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
