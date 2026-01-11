'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { InventoryItem, InventoryItemCategory, InventoryItemCondition, InventoryRoom } from '@/types';
import DocumentPickerModal from './DocumentPickerModal';
import InventoryItemRecallPanel from './InventoryItemRecallPanel';
import BarcodeScannerModal, { BarcodeLookupResult } from './BarcodeScannerModal';
import LabelOcrModal from './LabelOcrModal';
import { ocrLabelToDraft, confirmInventoryDraft, dismissInventoryDraft } from './inventoryApi';


import {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  linkDocumentToInventoryItem,
  unlinkDocumentFromInventoryItem,
  getInventoryItem,
  uploadAndAnalyzeDocument,
  getDocumentAssetSuggestions,
  listPropertyWarranties,
  listPropertyInsurancePolicies,
} from '../../inventory/inventoryApi';

const CATEGORIES: InventoryItemCategory[] = [
  'APPLIANCE',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOF_EXTERIOR',
  'SAFETY',
  'SMART_HOME',
  'FURNITURE',
  'ELECTRONICS',
  'OTHER',
];
const CONDITIONS: InventoryItemCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN'];

function dollarsToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function centsToDollars(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

/**
 * Best-effort mapping from lookup category hint / name into your InventoryItemCategory enum.
 * Keep this conservative; user can still override.
 */
function inferCategoryFromLookup(lookup: BarcodeLookupResult): InventoryItemCategory {
  const hint = (lookup.categoryHint || '').toLowerCase();
  const name = (lookup.name || '').toLowerCase();

  const t = `${hint} ${name}`;

  if (t.includes('refrigerator') || t.includes('microwave') || t.includes('dishwasher') || t.includes('oven'))
    return 'APPLIANCE';
  if (t.includes('thermostat') || t.includes('hvac') || t.includes('furnace') || t.includes('air conditioner'))
    return 'HVAC';
  if (t.includes('smoke') || t.includes('carbon monoxide') || t.includes('detector') || t.includes('alarm'))
    return 'SAFETY';
  if (t.includes('tv') || t.includes('router') || t.includes('speaker') || t.includes('laptop') || t.includes('camera'))
    return 'ELECTRONICS';
  if (t.includes('sofa') || t.includes('chair') || t.includes('table') || t.includes('bed'))
    return 'FURNITURE';

  return 'OTHER';
}

export default function InventoryItemDrawer(props: {
  open: boolean;
  onClose: () => void;
  propertyId: string;
  rooms: InventoryRoom[];
  initialItem: InventoryItem | null;
  highlightRecallMatchId?: string | null;
  onSaved: () => void;
}) {
  const isEdit = !!props.initialItem;

  // core
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryItemCategory>('OTHER');
  const [condition, setCondition] = useState<InventoryItemCondition>('UNKNOWN');
  const [roomId, setRoomId] = useState<string | ''>('');

  // barcode/recall fields (Phase 2)
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [upc, setUpc] = useState('');
  const [sku, setSku] = useState('');

  // existing fields (kept)
  const [brand, setBrand] = useState(''); // legacy field used elsewhere in your UI
  const [model, setModel] = useState(''); // legacy
  const [serialNo, setSerialNo] = useState(''); // legacy

  const [purchaseCost, setPurchaseCost] = useState('');
  const [replacementCost, setReplacementCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // scanning UX
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  // ✅ Phase 3: OCR label -> draft
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string>('');
  const [confidenceByField, setConfidenceByField] = useState<Record<string, number>>({});

  // docs
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [manualDocId, setManualDocId] = useState('');
  const [linkedDocs, setLinkedDocs] = useState<any[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [autoCreateWarranty, setAutoCreateWarranty] = useState(true);

  // coverage links
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

    // Phase 2 fields (if present on InventoryItem type)
    setManufacturer((item as any)?.manufacturer ?? '');
    setModelNumber((item as any)?.modelNumber ?? '');
    setSerialNumber((item as any)?.serialNumber ?? '');
    setUpc((item as any)?.upc ?? '');
    setSku((item as any)?.sku ?? '');

    // legacy fields (kept)
    setBrand((item as any)?.brand ?? '');
    setModel((item as any)?.model ?? '');
    setSerialNo((item as any)?.serialNo ?? '');

    setPurchaseCost(centsToDollars(item?.purchaseCostCents));
    setReplacementCost(centsToDollars(item?.replacementCostCents));

    setLinkedDocs((item as any)?.documents ?? []);
    setManualDocId('');
    setUploadFile(null);
    setUploadError(null);

    setNotes((item as any)?.notes ?? '');

    setWarrantyId((item as any)?.warrantyId ?? '');
    setInsurancePolicyId((item as any)?.insurancePolicyId ?? '');

    // scanning state reset
    setScannerOpen(false);
    setLookupLoading(false);
    setLookupError(null);
    setLastScannedCode('');
    setLabelOpen(false);

    setOcrLoading(false);
    setOcrError(null);
    setDraftId('');
    setConfidenceByField({});

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

  async function refreshItemDocs() {
    if (!props.initialItem) return;
    const fresh = await getInventoryItem(props.propertyId, props.initialItem.id);
    setLinkedDocs((fresh as any).documents ?? []);
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

      await linkDocumentToInventoryItem(props.propertyId, props.initialItem.id, newDocId);

      const s = await getDocumentAssetSuggestions(newDocId, props.propertyId);
      setSuggestions(s);

      if (result.warranty?.id) {
        setWarrantyId(result.warranty.id);
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

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        category,
        condition,
        roomId: roomId || null,

        // keep legacy fields (if your backend accepts them)
        brand: brand || null,
        model: model || null,
        serialNo: serialNo || null,

        // Phase 2 fields (barcode/lookup/recall matching)
        manufacturer: manufacturer || null,
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        upc: upc || null,
        sku: sku || null,

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
        await refreshItemDocs();
      } else {
        if (draftId) {
          // ✅ confirm draft -> creates inventory item server-side
          await confirmInventoryDraft(props.propertyId, draftId);
        } else {
          await createInventoryItem(props.propertyId, payload);
        }
      }
      
      props.onSaved();
    } catch (error) {
      console.error('Failed to save inventory item:', error);
      alert('Save failed. Check console logs / API error message.');
    } finally {
      setSaving(false);
    }
  }

  // ---------- Barcode lookup ----------
  const LOOKUP_PATH = `/api/properties/${props.propertyId}/inventory/barcode/lookup`;

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLookupLoading(true);
    setLookupError(null);

    try {
      const res = await api.post(LOOKUP_PATH, { code: trimmed });
      const data: BarcodeLookupResult = res.data;

      // Prefill fields, but don’t overwrite user input if they already typed something meaningful
      setLastScannedCode(trimmed);

      // name/category (best-effort)
      if (!name.trim() && data?.name) setName(data.name);
      if (category === 'OTHER') setCategory(inferCategoryFromLookup(data));

      // barcode fields
      if (!manufacturer.trim() && data?.manufacturer) setManufacturer(data.manufacturer);
      if (!modelNumber.trim() && data?.modelNumber) setModelNumber(data.modelNumber);
      if (!upc.trim()) setUpc(data?.upc || trimmed);
      if (!sku.trim() && data?.sku) setSku(data.sku);

      // If you want to keep legacy fields synced too (optional)
      if (!brand.trim() && data?.manufacturer) setBrand(data.manufacturer);
      if (!model.trim() && data?.modelNumber) setModel(data.modelNumber);

      setScannerOpen(false);
    } catch (e: any) {
      console.error('Barcode lookup failed', e);
      setLookupError(e?.message || 'Lookup failed');
    } finally {
      setLookupLoading(false);
    }
  }

  async function runLabelOcr(file: File) {
    setOcrLoading(true);
    setOcrError(null);
    try {
      const r = await ocrLabelToDraft(props.propertyId, file);
  
      setDraftId(r.draftId || '');
      setConfidenceByField(r.confidence || {});
  
      // Best-effort prefill (don’t overwrite user edits)
      const ex = r.extracted || {};
      if (!manufacturer.trim() && ex.manufacturer) setManufacturer(ex.manufacturer);
      if (!modelNumber.trim() && ex.modelNumber) setModelNumber(ex.modelNumber);
      if (!serialNumber.trim() && ex.serialNumber) setSerialNumber(ex.serialNumber);
  
      // Optional: keep legacy fields synced too
      if (!brand.trim() && ex.manufacturer) setBrand(ex.manufacturer);
      if (!model.trim() && ex.modelNumber) setModel(ex.modelNumber);
      if (!serialNo.trim() && ex.serialNumber) setSerialNo(ex.serialNumber);
    } catch (e: any) {
      setOcrError(e?.message || 'OCR failed');
    } finally {
      setOcrLoading(false);
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
          {/* ✅ Phase 2: Scan BEFORE save */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Barcode scan</div>
                <div className="text-xs opacity-70">
                  Scan a product barcode to autofill details (works before saving).
                </div>
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                disabled={saving || lookupLoading}
                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
              >
                {lookupLoading ? 'Looking up…' : 'Scan'}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <div className="text-xs opacity-70">Last scanned</div>
                <input
                  value={lastScannedCode}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-black/5"
                  placeholder="—"
                />
              </div>

              <div className="col-span-2">
                <div className="text-xs opacity-70">UPC</div>
                <input
                  value={upc}
                  onChange={(e) => setUpc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  placeholder="Auto-filled from scan"
                />
              </div>
            </div>

            {lookupError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {lookupError}
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-sm font-medium">Name *</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              placeholder="e.g., Water Heater"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium">Category</div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm font-medium">Room</div>
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {props.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium">Condition</div>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div />
          </div>


          <div className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Label OCR</div>
                <div className="text-xs opacity-70">Scan model/serial plate to autofill details (creates a draft).</div>
              </div>
              <button
                onClick={() => setLabelOpen(true)}
                disabled={saving || ocrLoading}
                className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
              >
                {ocrLoading ? 'Extracting…' : 'Scan label'}
              </button>
            </div>

            {ocrError ? <div className="mt-2 text-xs text-red-600">{ocrError}</div> : null}

            {draftId ? (
              <div className="mt-2 text-[11px] opacity-70">
                Draft ready • manufacturer {Math.round((confidenceByField.manufacturer || 0) * 100)}% • model{' '}
                {Math.round((confidenceByField.modelNumber || 0) * 100)}% • serial{' '}
                {Math.round((confidenceByField.serialNumber || 0) * 100)}%
              </div>
            ) : null}
          </div>

          <LabelOcrModal
            open={labelOpen}
            onClose={() => setLabelOpen(false)}
            onCaptured={runLabelOcr}
          />

          {/* Phase 2 fields */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Product identifiers</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs opacity-70">Manufacturer</div>
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">Model number</div>
                <input
                  value={modelNumber}
                  onChange={(e) => setModelNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <div className="text-xs opacity-70">Serial number</div>
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">SKU</div>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">UPC</div>
                <input
                  value={upc}
                  onChange={(e) => setUpc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-2 text-[11px] opacity-60">
              These fields improve recall matching and later “safety/recall” automation.
            </div>
          </div>

          {/* Existing recall panel behavior */}
          {isEdit && props.initialItem ? (
            <InventoryItemRecallPanel open={props.open} propertyId={props.propertyId} inventoryItemId={props.initialItem.id} />
          ) : (
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm font-medium">Safety / Recall Alerts</div>
              <div className="text-xs opacity-70 mt-1">Save this item first to enable recall scanning.</div>
            </div>
          )}

          {/* Costs */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Costs</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs opacity-70">Purchase cost ($)</div>
                <input
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">Replacement cost ($)</div>
                <input
                  value={replacementCost}
                  onChange={(e) => setReplacementCost(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Coverage links */}
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
          </div>

          {/* Documents (existing behavior preserved) */}
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
                <div className="mt-3 rounded-xl border border-black/10 p-3">
                  <div className="text-xs font-medium opacity-80">Upload & auto-attach</div>
                  <div className="mt-2 flex flex-col md:flex-row gap-2 md:items-center">
                    <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="text-sm" />
                    <button
                      onClick={uploadAndAttach}
                      disabled={saving || !uploadFile}
                      className="rounded-xl px-4 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    >
                      {saving ? 'Uploading…' : 'Upload & attach'}
                    </button>
                  </div>
                  {uploadError ? <div className="mt-2 text-sm text-red-600">{uploadError}</div> : null}
                </div>

                {suggestions?.inventoryItemSuggestions?.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-black/10 p-3">
                    <div className="text-xs font-medium opacity-80">AI suggested matches</div>
                    <div className="text-xs opacity-70">Based on extracted model/serial/name. (You can ignore if incorrect.)</div>
                    <div className="mt-2 space-y-2">
                      {suggestions.inventoryItemSuggestions.slice(0, 5).map((it: any) => (
                        <div key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-black/10 p-2">
                          <div>
                            <div className="text-sm font-medium">{it.name}</div>
                            <div className="text-xs opacity-70">
                              Score {it.score} • {it.brand || '—'} • {it.model || '—'} • {it.serialNo || '—'}
                            </div>
                            {it.reasons?.length > 0 ? <div className="text-xs opacity-60 mt-1">{it.reasons.join(' • ')}</div> : null}
                          </div>
                          <div className="text-xs opacity-60">{it.id === props.initialItem?.id ? 'This item' : 'Other item'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

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
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm" rows={4} />
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

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        allowManualEntry
        onDetected={async (code) => {
          await lookupBarcode(code);
        }}
      />
    </div>
  );
}
