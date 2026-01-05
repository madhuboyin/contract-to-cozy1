// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { InventoryItem, InventoryItemCategory, InventoryItemCondition, InventoryRoom } from '@/types';
import DocumentPickerModal from './DocumentPickerModal';
import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  linkDocumentToInventoryItem,
  unlinkDocumentFromInventoryItem,
  getInventoryItem,
  uploadAndAnalyzeDocument,
  getDocumentAssetSuggestions,
  
} from '../../inventory/inventoryApi';

import { listPropertyWarranties, listPropertyInsurancePolicies } from '../../inventory/inventoryApi';

const CATEGORIES: InventoryItemCategory[] = [
  'APPLIANCE','HVAC','PLUMBING','ELECTRICAL','ROOF_EXTERIOR','SAFETY','SMART_HOME','FURNITURE','ELECTRONICS','OTHER'
];
const CONDITIONS: InventoryItemCondition[] = ['NEW','GOOD','FAIR','POOR','UNKNOWN'];

function dollarsToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function centsToDollars(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

export default function InventoryItemDrawer(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  rooms: InventoryRoom[];
  initialItem: InventoryItem | null;
  onSaved: () => void;
}) {
  const isEdit = !!props.initialItem;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryItemCategory>('OTHER');
  const [condition, setCondition] = useState<InventoryItemCondition>('UNKNOWN');
  const [roomId, setRoomId] = useState<string | ''>('');

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNo, setSerialNo] = useState('');

  const [purchaseCost, setPurchaseCost] = useState('');
  const [replacementCost, setReplacementCost] = useState('');

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [manualDocId, setManualDocId] = useState('');
  const [linkedDocs, setLinkedDocs] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [autoCreateWarranty, setAutoCreateWarranty] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  const [warranties, setWarranties] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [warrantyId, setWarrantyId] = useState<string | ''>('');
  const [insurancePolicyId, setInsurancePolicyId] = useState<string | ''>('');
  const [suggestions, setSuggestions] = useState<any | null>(null);

  
  useEffect(() => {
    if (!props.open) return;
    const item = props.initialItem;
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'OTHER');
    setCondition(item?.condition ?? 'UNKNOWN');
    setRoomId(item?.roomId ?? '');

    setBrand(item?.brand ?? '');
    setModel(item?.model ?? '');
    setSerialNo(item?.serialNo ?? '');

    setPurchaseCost(centsToDollars(item?.purchaseCostCents));
    setReplacementCost(centsToDollars(item?.replacementCostCents));
    setLinkedDocs(item?.documents ?? []);
    setManualDocId('');
    setUploadFile(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploading(false);
    setNotes(item?.notes ?? '');

    setWarrantyId(item?.warrantyId ?? '');
    setInsurancePolicyId(item?.insurancePolicyId ?? '');

  }, [props.open, props.initialItem]);

  useEffect(() => {
    if (!props.open) return;
    (async () => {
      try {
        const [w, p] = await Promise.all([
          listPropertyWarranties(props.propertyId),
          listPropertyInsurancePolicies(props.propertyId),
        ]);
        setWarranties(w);
        setPolicies(p);
      } catch {
        setWarranties([]);
        setPolicies([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.propertyId]);
  

  const canSave = name.trim().length > 0;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        category,
        condition,
        roomId: roomId || null,
        brand: brand || null,
        model: model || null,
        serialNo: serialNo || null,
        notes: notes || null,
        purchaseCostCents: purchaseCost ? dollarsToCents(purchaseCost) : null,
        replacementCostCents: replacementCost ? dollarsToCents(replacementCost) : null,
        currency: 'USD',
        tags: [],
        warrantyId: warrantyId || null,
        insurancePolicyId: insurancePolicyId || null,
      };

      if (isEdit && props.initialItem) {
        await updateInventoryItem(props.propertyId, props.initialItem.id, payload);
      } else {
        await createInventoryItem(props.propertyId, payload);
      }

      if (isEdit) {
        // make sure drawer shows latest docs if any other changes happened
        await refreshItemDocs();
      }
      props.onSaved();
    } catch (error) {
      console.error("Failed to save inventory item:", error);
    } finally {
      setSaving(false);
    }
  }

  async function refreshItemDocs() {
    if (!props.initialItem) return;
    const fresh = await getInventoryItem(props.propertyId, props.initialItem.id);
    setLinkedDocs(fresh.documents ?? []);
  }

  async function attachDocumentById(documentId: string) {
    if (!props.initialItem) return;
    const id = documentId.trim();
    if (!id) return;

    setSaving(true);
    try {
      await linkDocumentToInventoryItem(props.propertyId, props.initialItem.id, id);
      await refreshItemDocs();
      setManualDocId('');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAndAttach() {
    if (!props.initialItem) return;
    if (!uploadFile) return;
  
    setSaving(true);
    setUploadError(null);
    try {
      const result = await uploadAndAnalyzeDocument({
        file: uploadFile,
        propertyId: props.propertyId,
        autoCreateWarranty,
      });
  
      const newDocId = result.document?.id;
      if (!newDocId) throw new Error('Upload succeeded but document.id is missing');
  
      // 1) Link doc → item
      await linkDocumentToInventoryItem(props.propertyId, props.initialItem.id, newDocId);
      const s = await getDocumentAssetSuggestions(newDocId, props.propertyId);
      setSuggestions(s);
  
      // 2) If warranty auto-created, link it into the item form immediately (best UX)
      if (result.warranty?.id) {
        setWarrantyId(result.warranty.id);
      
        // Persist immediately so it sticks even if user closes drawer without hitting Save
        await updateInventoryItem(props.propertyId, props.initialItem.id, {
          warrantyId: result.warranty.id,
        });
      }
  
      await refreshItemDocs();
      setUploadFile(null);
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  }    

  async function unlinkDocument(documentId: string) {
    if (!props.initialItem) return;
    setSaving(true);
    try {
      await unlinkDocumentFromInventoryItem(props.propertyId, props.initialItem.id, documentId);
      await refreshItemDocs();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!props.initialItem) return;
    const ok = confirm(`Delete "${props.initialItem.name}"?`);
    if (!ok) return;
    setSaving(true);
    try {
      await deleteInventoryItem(props.propertyId, props.initialItem.id);
      props.onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={props.onClose} />
      <div className="w-full max-w-xl bg-white h-full shadow-xl p-6 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold">{isEdit ? 'Edit item' : 'Add item'}</div>
            <div className="text-sm opacity-70">Track assets, receipts, and replacement value.</div>
          </div>
          <button onClick={props.onClose} className="text-sm underline opacity-80 hover:opacity-100">
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <div className="text-sm font-medium">Name *</div>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" placeholder="e.g., Water Heater" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium">Category</div>
              <select value={category} onChange={(e)=>setCategory(e.target.value as any)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <div className="text-sm font-medium">Room</div>
              <select value={roomId} onChange={(e)=>setRoomId(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm">
                <option value="">Unassigned</option>
                {props.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium">Condition</div>
              <select value={condition} onChange={(e)=>setCondition(e.target.value as any)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div />
          </div>

          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Details</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs opacity-70">Brand</div>
                <input value={brand} onChange={(e)=>setBrand(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
              </div>
              <div>
                <div className="text-xs opacity-70">Model</div>
                <input value={model} onChange={(e)=>setModel(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <div className="text-xs opacity-70">Serial number</div>
                <input value={serialNo} onChange={(e)=>setSerialNo(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Costs</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs opacity-70">Purchase cost ($)</div>
                <input value={purchaseCost} onChange={(e)=>setPurchaseCost(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" placeholder="0.00" />
              </div>
              <div>
                <div className="text-xs opacity-70">Replacement cost ($)</div>
                <input value={replacementCost} onChange={(e)=>setReplacementCost(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" placeholder="0.00" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Coverage links</div>
              <div className="text-xs opacity-70">Link this inventory item to warranty and/or insurance.</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-xs opacity-70">Warranty</div>
                  <select
                    value={warrantyId}
                    onChange={(e) => setWarrantyId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {warranties.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.providerName}
                        {w.policyNumber ? ` • ${w.policyNumber}` : ''}
                        {w.expiryDate ? ` • exp ${new Date(w.expiryDate).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs opacity-70">Insurance policy</div>
                  <select
                    value={insurancePolicyId}
                    onChange={(e) => setInsurancePolicyId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {policies.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.carrierName}
                        {p.policyNumber ? ` • ${p.policyNumber}` : ''}
                        {p.expiryDate ? ` • exp ${new Date(p.expiryDate).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            {(warranties.length === 0 || policies.length === 0) && (
              <div className="mt-2 text-xs opacity-60">
                Tip: If dropdowns don’t appear, your backend list endpoints may be named differently. The manual ID field will still work.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Documents</div>
                <div className="text-xs opacity-70">
                  Upload and auto-attach receipts/manuals, or attach existing documents for this property.
                </div>
              </div>

              <button
                onClick={() => setDocPickerOpen(true)}
                disabled={!isEdit || saving}
                className="text-sm underline opacity-80 hover:opacity-100 disabled:opacity-50"
                title={!isEdit ? 'Save the item first to attach documents' : undefined}
              >
                Attach existing
              </button>
            </div>

            {!isEdit ? (
              <div className="mt-3 text-sm opacity-70">Save this item first to attach documents.</div>
            ) : (
              <>
                {/* Upload + auto-attach */}
                <div className="mt-3 rounded-xl border border-black/10 p-3">
                  <div className="text-xs font-medium opacity-80">Upload & auto-attach</div>
                  <div className="mt-2 flex flex-col md:flex-row gap-2 md:items-center">
                    <input
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="text-sm"
                    />
                    <button
                      onClick={uploadAndAttach}
                      disabled={saving || !uploadFile}
                      className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    >
                      {saving ? 'Uploading…' : 'Upload & attach'}
                    </button>
                  </div>
                  {uploadError && (
                    <div className="mt-2 text-sm text-red-600">{uploadError}</div>
                  )}
                </div>

                {suggestions?.inventoryItemSuggestions?.length > 0 && (
                <div className="mt-3 rounded-xl border border-black/10 p-3">
                  <div className="text-xs font-medium opacity-80">AI suggested matches</div>
                  <div className="text-xs opacity-70">
                    Based on extracted model/serial/name. (You can ignore if incorrect.)
                  </div>

                  <div className="mt-2 space-y-2">
                    {suggestions.inventoryItemSuggestions.slice(0, 5).map((it: any) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 p-2">
                        <div>
                          <div className="text-sm font-medium">{it.name}</div>
                          <div className="text-xs opacity-70">
                            Score {it.score} • {it.brand || '—'} • {it.model || '—'} • {it.serialNo || '—'}
                          </div>
                          {it.reasons?.length > 0 && (
                            <div className="text-xs opacity-60 mt-1">{it.reasons.join(' • ')}</div>
                          )}
                        </div>

                        {/* Since we are inside THIS item drawer, we only need to explain mapping.
                            If you later add suggestions in Documents page, this button will attach doc to selected item */}
                        <div className="text-xs opacity-60">
                          {it.id === props.initialItem?.id ? 'This item' : 'Other item'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                {/* Manual attach */}
                <div className="mt-3 flex gap-2">
                  <input
                    value={manualDocId}
                    onChange={(e) => setManualDocId(e.target.value)}
                    placeholder="Paste Document ID to attach…"
                    className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => attachDocumentById(manualDocId)}
                    disabled={saving || !manualDocId.trim()}
                    className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                  >
                    Attach
                  </button>
                </div>

                {/* Linked docs list */}
                <div className="mt-3">
                  {linkedDocs.length === 0 ? (
                    <div className="text-sm opacity-70">No documents attached.</div>
                  ) : (
                    <div className="rounded-xl border border-black/10 divide-y">
                      {linkedDocs.map((d: any) => (
                        <div key={d.id} className="p-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{d.name || d.title || d.fileName || d.id}</div>
                            <div className="text-xs opacity-70">{d.type || d.documentType || 'DOCUMENT'}</div>
                          </div>
                          <button
                            onClick={() => unlinkDocument(d.id)}
                            disabled={saving}
                            className="text-sm underline text-red-600 hover:text-red-700 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div>
            <div className="text-sm font-medium">Notes</div>
            <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" rows={4} />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {isEdit ? (
              <button onClick={onDelete} disabled={saving} className="text-sm underline text-red-600 hover:text-red-700 disabled:opacity-50">
                Delete
              </button>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              <button onClick={props.onClose} className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving || !canSave}
                className="rounded-xl px-4 py-2 text-sm font-medium shadow-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setDocPickerOpen(true)}
                disabled={!isEdit || saving}
                className="text-sm underline opacity-80 hover:opacity-100 disabled:opacity-50"
              >
                Attach existing
              </button>
            </div>
          </div>
        </div>
      </div>
      <DocumentPickerModal
        open={docPickerOpen}
        propertyId={props.propertyId}
        alreadyLinkedIds={new Set((linkedDocs ?? []).map((d: any) => d.id))}
        onClose={() => setDocPickerOpen(false)}
        onPick={async (doc) => {
          setDocPickerOpen(false);
          await attachDocumentById(doc.id);
        }}
      />
    </div>
  );
}
