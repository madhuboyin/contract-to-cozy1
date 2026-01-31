'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  startRoomScanAi,
  listInventoryDraftsFiltered,
  bulkConfirmInventoryDrafts,
  bulkDismissInventoryDrafts,
  updateInventoryDraft,
  // OPTIONAL Phase-3 helper:
  // If your inventoryApi already has this, the modal will automatically load boxes + images + deltas.
  // If not present, this import will fail — see NOTE below.
  // getRoomScanSession,
} from '../../inventory/inventoryApi';

type Props = {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  roomId: string;
  roomName?: string | null;
  initialSessionId?: string | null;
};

function safeArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

const CATEGORY_OPTIONS = [
  'APPLIANCE',
  'ELECTRONICS',
  'FURNITURE',
  'HVAC',
  'PLUMBING',
  'SECURITY',
  'TOOL',
  'DOCUMENT',
  'OTHER',
] as const;

function TierBadge({ tier }: { tier?: string | null }) {
  const t = String(tier || '').toUpperCase();
  if (!t) return null;

  const cls =
    t === 'HIGH'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : t === 'MEDIUM'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800';

  return <span className={`ml-2 text-[11px] rounded-full px-2 py-0.5 border ${cls}`}>{t}</span>;
}

function DraftBoxesOverlay({
  image,
  boxes,
  active,
}: {
  image: any;
  boxes: any[];
  active: boolean;
}) {
  if (!image?.url) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-black/[0.02]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} alt="" className="block w-full h-auto" />
      {active
        ? (boxes || []).map((b, idx) => (
            <div
              key={idx}
              className="absolute border-2 border-white/90 shadow-sm rounded-md"
              style={{
                left: `${(Number(b?.x) || 0) * 100}%`,
                top: `${(Number(b?.y) || 0) * 100}%`,
                width: `${(Number(b?.w) || 0) * 100}%`,
                height: `${(Number(b?.h) || 0) * 100}%`,
              }}
              title={b?.confidence != null ? `Box confidence: ${Math.round(Number(b.confidence) * 100)}%` : undefined}
            />
          ))
        : null}
    </div>
  );
}

export default function RoomScanModal({ open, onClose, propertyId, roomId, roomName, initialSessionId }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Phase 2 UX toggles
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('OTHER');

  // Phase 3: images + box overlays
  const [scanImages, setScanImages] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  const draftsById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const d of drafts) if (d?.id) m[d.id] = d;
    return m;
  }, [drafts]);

  const effectiveSelectedIds = useMemo(() => {
    if (includeDuplicates) return selectedIds;
    return selectedIds.filter((id) => !draftsById[id]?.duplicateOfItemId);
  }, [selectedIds, includeDuplicates, draftsById]);

  const grouped = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const d of drafts) {
      const key = String(d?.groupLabel || d?.groupKey || 'Detected items');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(d);
    }
    return Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items: items.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    }));
  }, [drafts]);

  const boxesByDraft = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const b of boxes) {
      const did = b?.draftItemId;
      if (!did) continue;
      (m[did] ||= []).push(b);
    }
    return m;
  }, [boxes]);

  function resetAll() {
    setFiles([]);
    setBusy(false);
    setSessionId(null);
    setDrafts([]);
    setSelected({});
    setError(null);
    setIncludeDuplicates(false);
    setEditingId(null);

    setScanImages([]);
    setBoxes([]);
    setActiveDraftId(null);
  }

  function defaultSelectedForDraft(row: any): boolean {
    if (typeof row?.autoSelected === 'boolean') return row.autoSelected;
    const conf = Number(row?.confidenceJson?.name ?? 0.65);
    return conf >= 0.7;
  }

  async function loadDraftsForSession(sid: string) {
    const rows = await listInventoryDraftsFiltered(propertyId, { scanSessionId: sid });
    const list = safeArray(rows);

    setDrafts(list);

    const next: Record<string, boolean> = {};
    for (const row of list) {
      if (!row?.id) continue;

      const isDuplicate = !!row?.duplicateOfItemId;
      const auto = defaultSelectedForDraft(row);

      next[row.id] = isDuplicate ? false : auto;
    }
    setSelected(next);
  }

  /**
   * Phase 3: best-effort session hydrate.
   * If you have a "getRoomScanSession" API, uncomment the import above and this will
   * automatically pull images+boxes+drafts for the session.
   *
   * If it doesn't exist yet, this function safely no-ops.
   */
  async function hydrateSessionPhase3(sid: string) {
    try {
      const anyApi: any = await import('../../inventory/inventoryApi');
      const fn = anyApi?.getRoomScanSession;
      if (typeof fn !== 'function') return;

      const session = await fn(propertyId, roomId, sid);

      // Expect shape: { images, drafts, boxes, deltas, ... }
      const imgs = safeArray(session?.images);
      const ds = safeArray(session?.drafts);
      const bx = safeArray(session?.boxes);

      if (imgs.length) setScanImages(imgs);
      if (bx.length) setBoxes(bx);

      if (ds.length) {
        setDrafts(ds);

        const next: Record<string, boolean> = {};
        for (const row of ds) {
          if (!row?.id) continue;
          const isDuplicate = !!row?.duplicateOfItemId;
          const auto = defaultSelectedForDraft(row);
          next[row.id] = isDuplicate ? false : auto;
        }
        setSelected(next);
      }
    } catch {
      // ignore: Phase 3 hydration is optional
    }
  }

  useEffect(() => {
    if (!open) return;
    if (!initialSessionId) return;

    if (!sessionId) {
      setSessionId(initialSessionId);

      // Phase 2 drafts
      loadDraftsForSession(initialSessionId).catch(() => {});

      // Phase 3 hydrate (optional)
      hydrateSessionPhase3(initialSessionId).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSessionId]);

  async function runScan() {
    setError(null);
    setBusy(true);

    try {
      const result = await startRoomScanAi(propertyId, roomId, files);

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('[RoomScanModal] startRoomScanAi result:', result);
      }

      const sid = (result as any)?.sessionId;
      if (!sid || typeof sid !== 'string') {
        throw new Error('Room scan did not return a sessionId (response shape mismatch)');
      }

      setSessionId(sid);

      // Phase 3: images can be returned inline
      const inlineImages = safeArray((result as any)?.images);
      if (inlineImages.length) setScanImages(inlineImages);

      // drafts can be returned inline OR fetched
      const inlineDrafts = safeArray((result as any)?.drafts);
      if (inlineDrafts.length > 0) {
        setDrafts(inlineDrafts);

        const next: Record<string, boolean> = {};
        for (const row of inlineDrafts) {
          if (!row?.id) continue;
          const isDuplicate = !!row?.duplicateOfItemId;
          const auto = defaultSelectedForDraft(row);
          next[row.id] = isDuplicate ? false : auto;
        }
        setSelected(next);
      } else {
        await loadDraftsForSession(sid);
      }

      // Phase 3: best-effort hydrate boxes + explanations (if API exists)
      await hydrateSessionPhase3(sid);
    } catch (e: any) {
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
      await bulkConfirmInventoryDrafts(propertyId, effectiveSelectedIds);
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
      await bulkDismissInventoryDrafts(propertyId, effectiveSelectedIds);

      if (!sessionId) return;
      await loadDraftsForSession(sessionId);

      // Phase 3: refresh boxes/drafts if session API exists
      await hydrateSessionPhase3(sessionId);
    } catch (e: any) {
      setError(e?.message || 'Bulk dismiss failed');
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(d: any) {
    setEditingId(d.id);
    setEditName(String(d?.name || ''));
    setEditCategory(String(d?.category || 'OTHER'));
  }

  async function saveEdit(draftId: string) {
    setBusy(true);
    setError(null);
    try {
      await updateInventoryDraft(propertyId, draftId, {
        name: editName,
        category: editCategory,
      });

      if (sessionId) {
        await loadDraftsForSession(sessionId);
        await hydrateSessionPhase3(sessionId);
      }
      setEditingId(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to update draft');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const dupCount = drafts.filter((d) => !!d?.duplicateOfItemId).length;

  // For overlay: show boxes for active draft on up to first 2 images
  const imagesToShow = scanImages.slice(0, 2);
  const activeBoxes = activeDraftId ? boxesByDraft[activeDraftId] || [] : [];

  // group boxes by imageId so we can overlay per image
  const boxesByImage = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const b of activeBoxes) {
      const iid = b?.imageId;
      if (!iid) continue;
      (m[iid] ||= []).push(b);
    }
    return m;
  }, [activeBoxes]);

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
              <div className="flex items-center gap-2 text-xs opacity-70 flex-wrap">
                <span className="rounded-full border border-black/10 px-2 py-1">
                  Session: {sessionId.slice(0, 8)}…
                </span>
                <span className="rounded-full border border-black/10 px-2 py-1">Drafts: {drafts.length}</span>

                {dupCount > 0 ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                    {dupCount} possible duplicate{dupCount === 1 ? '' : 's'}
                  </span>
                ) : null}

                <span className="ml-auto rounded-full border border-black/10 px-2 py-1">
                  Selected: {effectiveSelectedIds.length}
                </span>
              </div>

              {/* Phase 3: Visual Trust - images + overlay (best-effort) */}
              {imagesToShow.length > 0 ? (
                <div className="rounded-2xl border border-black/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Visual explainability</div>
                    <div className="text-xs opacity-70">
                      Tap an item to highlight where it was detected.
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {imagesToShow.map((img) => (
                      <DraftBoxesOverlay
                        key={img.id || img.key}
                        image={img}
                        boxes={boxesByImage[img.id] || []}
                        active={!!activeDraftId}
                      />
                    ))}
                  </div>

                  {!activeDraftId ? (
                    <div className="mt-2 text-xs opacity-70">
                      Tip: click an item in the list to see bounding boxes.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {dupCount > 0 ? (
                <label className="flex items-center gap-2 text-sm rounded-xl border border-black/10 p-3">
                  <input
                    type="checkbox"
                    checked={includeDuplicates}
                    onChange={(e) => setIncludeDuplicates(e.target.checked)}
                  />
                  <span className="font-medium">Include duplicates</span>
                  <span className="opacity-70">
                    (By default, possible duplicates are not selected to avoid double-adding.)
                  </span>
                </label>
              ) : null}

              <div className="max-h-[45vh] overflow-auto rounded-xl border border-black/10">
                {drafts.length === 0 ? (
                  <div className="p-4 text-sm opacity-70">No drafts created.</div>
                ) : (
                  <div className="divide-y divide-black/10">
                    {grouped.map((g) => (
                      <div key={g.label}>
                        <div className="px-3 py-2 text-xs uppercase tracking-wide opacity-60 bg-black/[0.02] border-b border-black/10">
                          {g.label} · {g.items.length}
                        </div>

                        <div className="divide-y divide-black/10">
                          {g.items.map((d: any) => {
                            const conf = Number(d?.confidenceJson?.name ?? 0.65);
                            const low = conf < 0.7;
                            const isDup = !!d?.duplicateOfItemId;

                            const checked = !!selected[d.id];
                            const disabled = busy || (!includeDuplicates && isDup);

                            const isEditing = editingId === d.id;

                            const tier = d?.explanationJson?.tier;
                            const why: string[] = Array.isArray(d?.explanationJson?.why) ? d.explanationJson.why : [];

                            return (
                              <div
                                key={d.id}
                                className="p-3 hover:bg-black/[0.02] cursor-pointer"
                                onClick={() => {
                                  if (!d?.id) return;
                                  setActiveDraftId(d.id);
                                }}
                              >
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={(e) => setSelected((m) => ({ ...m, [d.id]: e.target.checked }))}
                                    className="mt-1"
                                    onClick={(e) => e.stopPropagation()}
                                  />

                                  <div className="min-w-0 flex-1">
                                    {!isEditing ? (
                                      <>
                                        <div className="font-medium truncate">
                                          {d.name || 'New item'}
                                          {isDup ? (
                                            <span className="ml-2 text-xs rounded-full px-2 py-0.5 border border-amber-200 bg-amber-50 text-amber-800">
                                              Possible duplicate
                                            </span>
                                          ) : null}
                                          <TierBadge tier={tier} />
                                        </div>

                                        <div className="text-xs opacity-70 mt-0.5">
                                          Category: <span className="font-medium">{d.category || '—'}</span> · Confidence:{' '}
                                          <span className={low ? 'font-medium text-amber-700' : 'font-medium'}>
                                            {Math.round(conf * 100)}%
                                          </span>
                                          {typeof d?.autoSelected === 'boolean' ? (
                                            <span className="ml-2 opacity-70">
                                              · Auto-select: <span className="font-medium">{d.autoSelected ? 'Yes' : 'No'}</span>
                                            </span>
                                          ) : null}
                                          {isDup && d?.duplicateReason ? (
                                            <span className="ml-2 opacity-70">
                                              · Reason: <span className="font-medium">{String(d.duplicateReason)}</span>
                                            </span>
                                          ) : null}
                                        </div>

                                        {/* Phase 3: Why detected */}
                                        {why.length > 0 ? (
                                          <div className="mt-1 text-[12px] text-gray-600">
                                            <span className="font-medium">Why:</span> {why.slice(0, 2).join(' · ')}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                                            <div className="text-xs uppercase tracking-wide opacity-60">Name</div>
                                            <input
                                              value={editName}
                                              onChange={(e) => setEditName(e.target.value)}
                                              className="mt-1 w-full text-sm bg-transparent outline-none"
                                            />
                                          </div>

                                          <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
                                            <div className="text-xs uppercase tracking-wide opacity-60">Category</div>
                                            <select
                                              value={editCategory}
                                              onChange={(e) => setEditCategory(e.target.value)}
                                              className="mt-1 w-full text-sm bg-transparent outline-none"
                                            >
                                              {CATEGORY_OPTIONS.map((c) => (
                                                <option key={c} value={c}>
                                                  {c}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => saveEdit(d.id)}
                                            disabled={busy || !editName.trim()}
                                            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                                          >
                                            Save
                                          </button>
                                          <button
                                            onClick={() => setEditingId(null)}
                                            disabled={busy}
                                            className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {!isEditing ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        beginEdit(d);
                                      }}
                                      disabled={busy}
                                      className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                </div>

                                {!includeDuplicates && isDup ? (
                                  <div className="mt-2 text-xs text-amber-800 rounded-xl border border-amber-200 bg-amber-50 p-2">
                                    This looks like an item already in this room. Turn on “Include duplicates” to select it anyway.
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={dismissSelected}
                  disabled={busy || effectiveSelectedIds.length === 0}
                  className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                >
                  Dismiss selected
                </button>

                <button
                  onClick={confirmSelected}
                  disabled={busy || effectiveSelectedIds.length === 0}
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
