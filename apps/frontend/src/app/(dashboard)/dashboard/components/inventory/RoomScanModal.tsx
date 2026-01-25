// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/RoomScanModal.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  startRoomScanAi,
  listInventoryDraftsFiltered,
  bulkConfirmInventoryDrafts,
  bulkDismissInventoryDrafts,
  updateInventoryDraft,
} from '../../inventory/inventoryApi';

function asArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeDrafts(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && Array.isArray((v as any).drafts)) return (v as any).drafts;
  return [];
}

function norm(s: any) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Heuristic grouping for “similar items”
function groupKeyForDraft(d: any) {
  const name = norm(d?.name);
  const cat = String(d?.category || 'OTHER');

  const beddingWords = ['pillow', 'comforter', 'blanket', 'duvet', 'sheet', 'bedding'];
  if (beddingWords.some((w) => name.includes(w))) return 'BEDDING';

  const bedWords = ['bed', 'mattress', 'headboard', 'frame'];
  if (bedWords.some((w) => name.includes(w))) return 'BED';

  if (cat === 'ELECTRONICS') return 'ELECTRONICS';
  if (cat === 'FURNITURE') return 'FURNITURE';
  if (cat === 'APPLIANCE') return 'APPLIANCE';

  return 'OTHER';
}

const CATEGORY_OPTIONS = [
  'APPLIANCE',
  'ELECTRONICS',
  'FURNITURE',
  'FIXTURE',
  'SAFETY',
  'DOCUMENT',
  'OTHER',
] as const;

export function RoomScanModal(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  roomId: string;
  roomName?: string | null;
}) {
  const { open, onClose, propertyId, roomId, roomName } = props;

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Enhancements
  const [threshold, setThreshold] = useState<number>(0.7);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('OTHER');

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

  const groups = useMemo(() => {
    const arr = asArray(drafts);
    const map: Record<string, any[]> = {};
    for (const d of arr) {
      const k = groupKeyForDraft(d);
      map[k] = map[k] || [];
      map[k].push(d);
    }
    const orderedKeys = Object.keys(map).sort((a, b) => a.localeCompare(b));
    return orderedKeys.map((k) => ({ key: k, rows: map[k] }));
  }, [drafts]);

  function resetAll() {
    setFiles([]);
    setBusy(false);
    setSessionId(null);
    setDrafts([]);
    setSelected({});
    setError(null);
    setThreshold(0.7);
    setExpandedGroups({});
    setEditingId(null);
    setEditName('');
    setEditCategory('OTHER');
  }

  function applyDefaultSelection(rows: any[]) {
    const next: Record<string, boolean> = {};
    for (const row of rows) {
      if (!row?.id) continue;
      const conf = Number(row?.confidenceJson?.name ?? 0.65);

      // Confidence based selection + avoid auto-selecting duplicates
      const isDup = !!row?.isDuplicate;
      next[row.id] = !isDup && conf >= threshold;
    }
    setSelected(next);
  }

  async function runScan() {
    setError(null);
    setBusy(true);

    try {
      const result = await startRoomScanAi(propertyId, roomId, files);

      // dev-only debug (shows unwrap issues immediately)
      if (process.env.NODE_ENV !== 'production') {
        console.log('[RoomScanModal] startRoomScanAi result:', result);
      }

      const sid = (result as any)?.sessionId ?? null;
      if (!sid) throw new Error('Room scan did not return a sessionId');

      setSessionId(sid);

      // Always re-fetch drafts from server so we get enriched fields (dup detection, confidenceJson, etc.)
      const rows = await listInventoryDraftsFiltered(propertyId, { scanSessionId: sid });
      const d = normalizeDrafts(rows);
      setDrafts(d);
      applyDefaultSelection(d);

      // expand all groups by default on first result
      const eg: Record<string, boolean> = {};
      for (const g of groups) eg[g.key] = true;
      setExpandedGroups(eg);
    } catch (e: any) {
      console.error('[room-scan] failed', e);
      setError(e?.message || 'Room scan failed');
    } finally {
      setBusy(false);
    }
  }

  async function refreshDrafts() {
    if (!sessionId) return;
    const rows = await listInventoryDraftsFiltered(propertyId, { scanSessionId: sessionId });
    const d = normalizeDrafts(rows);
    setDrafts(d);
    applyDefaultSelection(d);
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
      await refreshDrafts();
    } catch (e: any) {
      setError(e?.message || 'Bulk dismiss failed');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: any) {
    setEditingId(d?.id || null);
    setEditName(String(d?.name || ''));
    setEditCategory(String(d?.category || 'OTHER'));
  }

  async function saveEdit(d: any) {
    if (!d?.id) return;
    setBusy(true);
    setError(null);
    try {
      await updateInventoryDraft(propertyId, d.id, {
        name: editName,
        category: editCategory,
        roomId: d?.roomId ?? roomId,
      });
      setEditingId(null);
      await refreshDrafts();
    } catch (e: any) {
      setError(e?.message || 'Draft update failed');
    } finally {
      setBusy(false);
    }
  }

  function toggleGroupSelection(groupRows: any[], checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const d of groupRows) {
        if (!d?.id) continue;
        next[d.id] = checked;
      }
      return next;
    });
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
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
                <span className="rounded-full border border-black/10 px-2 py-1">
                  Session: {sessionId.slice(0, 8)}…
                </span>
                <span className="rounded-full border border-black/10 px-2 py-1">
                  Drafts: {drafts.length}
                </span>
                <span className="ml-auto rounded-full border border-black/10 px-2 py-1">
                  Selected: {selectedIds.length}
                </span>
              </div>

              <div className="rounded-xl border border-black/10 p-3 text-sm flex items-center gap-3 flex-wrap">
                <div className="text-xs opacity-70">Auto-select threshold</div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={Math.round(threshold * 100)}
                  onChange={(e) => setThreshold(Number(e.target.value) / 100)}
                  disabled={busy}
                />
                <div className="text-xs font-medium">{Math.round(threshold * 100)}%</div>
                <button
                  onClick={() => applyDefaultSelection(drafts)}
                  disabled={busy}
                  className="ml-auto rounded-xl px-3 py-2 text-xs border border-black/10 hover:bg-black/5"
                >
                  Re-apply auto-selection
                </button>
              </div>

              <div className="max-h-[45vh] overflow-auto rounded-xl border border-black/10">
                {drafts.length === 0 ? (
                  <div className="p-4 text-sm opacity-70">No drafts created.</div>
                ) : (
                  <div className="divide-y divide-black/10">
                    {groups.map((g) => {
                      const isOpen = expandedGroups[g.key] ?? true;
                      const groupSelectedCount = g.rows.filter((r) => selected[r.id]).length;
                      const allSelected = groupSelectedCount === g.rows.length && g.rows.length > 0;

                      return (
                        <div key={g.key}>
                          <div className="flex items-center gap-2 px-3 py-2 bg-black/[0.02]">
                            <button
                              className="text-xs opacity-70 hover:opacity-100"
                              onClick={() =>
                                setExpandedGroups((m) => ({ ...m, [g.key]: !isOpen }))
                              }
                              type="button"
                            >
                              {isOpen ? '▾' : '▸'}
                            </button>

                            <div className="text-xs font-medium">{g.key}</div>

                            <div className="text-xs opacity-60">({g.rows.length})</div>

                            <div className="ml-auto flex items-center gap-2">
                              <label className="text-xs opacity-70 flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={(e) => toggleGroupSelection(g.rows, e.target.checked)}
                                />
                                Select all
                              </label>
                            </div>
                          </div>

                          {isOpen ? (
                            <div className="divide-y divide-black/10">
                              {g.rows.map((d: any) => {
                                const conf = Number(d?.confidenceJson?.name ?? 0.65);
                                const low = conf < threshold;
                                const isDup = !!d?.isDuplicate;

                                const isEditing = editingId === d.id;

                                return (
                                  <div key={d.id} className="p-3 hover:bg-black/[0.02]">
                                    <div className="flex items-start gap-3">
                                      <input
                                        type="checkbox"
                                        checked={!!selected[d.id]}
                                        onChange={(e) =>
                                          setSelected((m) => ({ ...m, [d.id]: e.target.checked }))
                                        }
                                        className="mt-1"
                                      />

                                      <div className="min-w-0 flex-1">
                                        {isEditing ? (
                                          <div className="space-y-2">
                                            <input
                                              value={editName}
                                              onChange={(e) => setEditName(e.target.value)}
                                              className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                                              disabled={busy}
                                              placeholder="Item name"
                                            />

                                            <div className="flex items-center gap-2 flex-wrap">
                                              <select
                                                value={editCategory}
                                                onChange={(e) => setEditCategory(e.target.value)}
                                                className="rounded-xl border border-black/10 px-3 py-2 text-sm"
                                                disabled={busy}
                                              >
                                                {CATEGORY_OPTIONS.map((c) => (
                                                  <option key={c} value={c}>
                                                    {c}
                                                  </option>
                                                ))}
                                              </select>

                                              <button
                                                type="button"
                                                onClick={() => saveEdit(d)}
                                                disabled={busy}
                                                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                                              >
                                                Save
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => setEditingId(null)}
                                                disabled={busy}
                                                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <div className="flex items-center gap-2">
                                              <div className="font-medium truncate">
                                                {d.name || 'New item'}
                                              </div>

                                              {isDup ? (
                                                <span className="text-[11px] rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                                                  Possible duplicate
                                                </span>
                                              ) : null}
                                            </div>

                                            <div className="text-xs opacity-70 mt-0.5">
                                              Category:{' '}
                                              <span className="font-medium">{d.category || '—'}</span>{' '}
                                              · Confidence:{' '}
                                              <span
                                                className={
                                                  low
                                                    ? 'font-medium text-amber-700'
                                                    : 'font-medium'
                                                }
                                              >
                                                {Math.round(conf * 100)}%
                                              </span>
                                              {low ? <span className="ml-2">(review)</span> : null}
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {!isEditing ? (
                                        <button
                                          type="button"
                                          onClick={() => startEdit(d)}
                                          disabled={busy}
                                          className="rounded-xl px-3 py-2 text-xs border border-black/10 hover:bg-black/5"
                                        >
                                          Edit
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
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

                <button
                  onClick={confirmSelected}
                  disabled={busy || selectedIds.length === 0}
                  className="rounded-xl px-4 py-2 text-sm font-medium border border-black/10 hover:bg-black/5 disabled:opacity-50"
                >
                  Add selected to inventory
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
