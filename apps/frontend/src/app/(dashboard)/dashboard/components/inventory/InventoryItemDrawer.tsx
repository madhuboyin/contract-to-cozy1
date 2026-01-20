// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { InventoryItem, InventoryItemCategory, InventoryItemCondition, InventoryRoom } from '@/types';
import DocumentPickerModal from './DocumentPickerModal';
import InventoryItemRecallPanel from './InventoryItemRecallPanel';
import BarcodeScannerModal, { BarcodeLookupResult } from './BarcodeScannerModal';
import LabelOcrModal from './LabelOcrModal';
import { lookupBarcode as lookupInventoryBarcode } from '../../inventory/inventoryApi';
import QrScannerModal from './QrScannerModal';


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
  ocrLabelToDraft,
  confirmInventoryDraft,
  dismissInventoryDraft,
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

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Major appliance types managed from Property Details page
 */
const MAJOR_APPLIANCE_KEYWORDS = [
  'dishwasher',
  'refrigerator',
  'fridge',
  'freezer',
  'oven',
  'range',
  'stove',
  'cooktop',
  'washer',
  'dryer',
  'laundry',
  'microwave',
  'water softener',
];

/**
 * Categories that use Install Year (year picker) vs Purchase Date (date picker)
 */
const INSTALL_YEAR_CATEGORIES: InventoryItemCategory[] = ['APPLIANCE'];
const PURCHASE_DATE_CATEGORIES: InventoryItemCategory[] = ['ELECTRONICS', 'FURNITURE', 'OTHER'];

/**
 * Check if an item is managed from Property Details page
 */
function isPropertyManagedAppliance(item: InventoryItem | null): boolean {
  if (!item) return false;
  return item.sourceHash?.startsWith('property_appliance::') ?? false;
}

/**
 * Check if a name matches a major appliance type
 */
function isMajorApplianceName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  return MAJOR_APPLIANCE_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * Convert DateTime to year number for display
 */
function dateToYear(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return String(d.getUTCFullYear());
}

/**
 * Convert year number to DateTime (Jan 1 UTC)
 */
function yearToDate(year: string | number): Date | null {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1900 || y > CURRENT_YEAR + 1) return null;
  return new Date(Date.UTC(y, 0, 1));
}

/**
 * Format date string for date input (YYYY-MM-DD)
 */
function formatDateForInput(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}
function dollarsToCents(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function centsToDollars(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

function unwrapBarcodeLookupResponse(raw: any): Partial<BarcodeLookupResult> {
  // supports:
  // 1) { success: true, data: {...} }
  // 2) direct {...}
  if (!raw || typeof raw !== 'object') return {};
  if ('success' in raw && 'data' in raw) {
    const d = (raw as any).data;
    return d && typeof d === 'object' ? d : {};
  }
  return raw as any;
}

function unwrapOcrResponse(raw: any): any {
  // supports:
  // 1) { success: true, data: {...} }
  // 2) direct {...}
  if (!raw || typeof raw !== 'object') return null;
  if ('success' in raw && 'data' in raw) return (raw as any).data;
  return raw;
}

/**
 * Best-effort mapping from lookup category hint / name into your InventoryItemCategory enum.
 * Keep this conservative; user can still override.
 */
function inferCategoryFromLookup(lookup?: Partial<BarcodeLookupResult> | null): InventoryItemCategory {
  const hint = String(lookup?.categoryHint || '').toLowerCase();
  const name = String(lookup?.name || '').toLowerCase();
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

function extractDigitsCandidate(text: string): string | null {
  const t = String(text || '').trim();
  if (!t) return null;

  // 1) if it’s a URL, try common params first
  try {
    const u = new URL(t);
    const candidates = [
      u.searchParams.get('upc'),
      u.searchParams.get('gtin'),
      u.searchParams.get('ean'),
      u.searchParams.get('code'),
      u.searchParams.get('barcode'),
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      const d = c.replace(/\D/g, '');
      if (d.length >= 8) return d;
    }
  } catch {
    // not a URL; ignore
  }

  // 2) raw text: look for explicit tokens
  const tokenMatch = t.match(/(upc|gtin|ean|barcode)\s*[:=]\s*([0-9\- ]{8,})/i);
  if (tokenMatch?.[2]) {
    const d = tokenMatch[2].replace(/\D/g, '');
    if (d.length >= 8) return d;
  }

  // 3) fallback: the longest digit run
  const runs = t.match(/[0-9]{8,}/g);
  if (runs?.length) {
    // choose the longest run
    runs.sort((a, b) => b.length - a.length);
    return runs[0];
  }

  return null;
}

function extractModelSerialCandidate(text: string): { modelNumber?: string; serialNumber?: string; manufacturer?: string } {
  const t = String(text || '');

  const model =
    t.match(/model\s*(no\.|number|#)?\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[2] ||
    t.match(/\bmdl\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[1] ||
    undefined;

  const serial =
    t.match(/serial\s*(no\.|number|#)?\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[2] ||
    t.match(/\bs\/n\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)?.[1] ||
    undefined;

  const mfg =
    t.match(/manufacturer\s*[:=]\s*([A-Za-z0-9 &.'\-]+)/i)?.[1] ||
    t.match(/\bmfg\s*[:=]\s*([A-Za-z0-9 &.'\-]+)/i)?.[1] ||
    undefined;

  return { modelNumber: model, serialNumber: serial, manufacturer: mfg };
}

function pct(n?: number) {
  const v = typeof n === 'number' ? n : 0;
  return `${Math.round(v * 100)}%`;
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

  // product identifiers (Phase 2+)
  const [manufacturer, setManufacturer] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [upc, setUpc] = useState('');
  const [sku, setSku] = useState('');

  // track manual edits so barcode/ocr doesn't overwrite user input
  const [touched, setTouched] = useState({
    name: false,
    category: false,
    manufacturer: false,
    modelNumber: false,
    serialNumber: false,
    upc: false,
    sku: false,
  });

  // legacy fields (kept)
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNo, setSerialNo] = useState('');

  const [purchaseCost, setPurchaseCost] = useState('');
  const [replacementCost, setReplacementCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // scanning UX
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  // Phase 3: OCR label -> draft
  const [labelOpen, setLabelOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string>('');
  const [confidenceByField, setConfidenceByField] = useState<Record<string, number>>({});

  const touchedRef = React.useRef(touched);
  const valuesRef = React.useRef({
    manufacturer,
    modelNumber,
    serialNumber,
    upc,
    sku,
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [lastQrText, setLastQrText] = useState<string>('');

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
  const [installYear, setInstallYear] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  
  
  // UPDATE the useEffect that initializes form from props.initialItem
  // Add these lines to handle date fields:
  // ----------------------------------------------------------------------------
  
  useEffect(() => {
    if (props.initialItem) {
      // ... existing field initialization ...
      
      // Initialize category-specific date fields
      if (props.initialItem.installedOn) {
        setInstallYear(dateToYear(props.initialItem.installedOn));
      } else {
        setInstallYear('');
      }
      
      if (props.initialItem.purchasedOn) {
        setPurchaseDate(formatDateForInput(props.initialItem.purchasedOn));
      } else {
        setPurchaseDate('');
      }
    } else {
      // Reset for new item
      setInstallYear('');
      setPurchaseDate('');
    }
  }, [props.initialItem, props.open]);
  
  useEffect(() => {
    if (!props.open) return;
    const item = props.initialItem;
    console.log('[InventoryItemDrawer] reset effect fired', { open: props.open, initialItem: props.initialItem });
    console.log('[InventoryItemDrawer] initialItem:', props.initialItem);
    setName(item?.name ?? '');
    setCategory(item?.category ?? 'OTHER');
    setCondition(item?.condition ?? 'UNKNOWN');
    setRoomId(item?.roomId ?? '');

    setManufacturer((item as any)?.manufacturer ?? '');
    setModelNumber((item as any)?.modelNumber ?? '');
    setSerialNumber((item as any)?.serialNumber ?? '');
    setUpc((item as any)?.upc ?? '');
    setSku((item as any)?.sku ?? '');

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
    setTouched({
      name: false,
      category: false,
      manufacturer: false,
      modelNumber: false,
      serialNumber: false,
      upc: false,
      sku: false,
    });

    setOcrLoading(false);
    setOcrError(null);
    setDraftId('');
    setConfidenceByField({});

    setQrOpen(false);
    setQrError(null);
    setLastQrText('');
  }, [props.open]);
  
  useEffect(() => {
    touchedRef.current = touched;
  }, [touched]);
  
  useEffect(() => {
    valuesRef.current = {
      manufacturer,
      modelNumber,
      serialNumber,
      upc,
      sku,
    };
  }, [manufacturer, modelNumber, serialNumber, upc, sku]);
  
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

  function shouldAutofill(touchedField: boolean, currentValue: string, incoming: any) {
    if (!incoming) return false;
  
    // If user never edited, always autofill
    if (!touchedField) return true;
  
    // If user "touched" but left empty, still autofill
    return !String(currentValue || '').trim();
  }  

  function normalizeSerial(v: any): string {
    const s = String(v ?? '').trim();
    if (!s) return '';
  
    // Heuristic: OCR sometimes reads leading 4 as 'A' (A092... instead of 4092...)
    // Only do this when: starts with A + rest are digits
    if (/^A\d+$/.test(s)) return `4${s.slice(1)}`;
  
    return s;
  }
  
  function applyAutofillString(
    field: keyof typeof touched,
    incoming: any,
    setter: (v: string) => void,
    normalizer?: (v: any) => string
  ) {
    const incRaw = incoming;
    const inc = normalizer ? normalizer(incRaw) : String(incRaw ?? '').trim();
    if (!inc) return;
  
    const t = touchedRef.current[field];
    const current = String((valuesRef.current as any)[field] ?? '').trim();
  
    // Same rule we used for barcode: fill if user hasn't edited OR field is still blank
    if (!t || !current) {
      setter(inc);
    }
  }
  

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

  // ---------- Barcode lookup ----------
  const LOOKUP_PATH = `/api/properties/${props.propertyId}/inventory/barcode/lookup`;

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
  
    setLookupLoading(true);
    setLookupError(null);
  
    try {
      // ✅ use shared API helper (normalizes wrapper shapes)
      const raw = await lookupInventoryBarcode(props.propertyId, trimmed);
  
      // IMPORTANT: backend returns {success:true,data:{...}} now
      const data = unwrapBarcodeLookupResponse(raw);
  
      console.log('[InventoryItemDrawer] barcode lookup response:', data);
  
      setLastScannedCode(trimmed);
  
      // name/category (best-effort)
      if (!touched.name && !name.trim() && data?.name) setName(String(data.name));
  
      // only auto-infer category if user hasn't touched category
      if (!touched.category && category === 'OTHER') setCategory(inferCategoryFromLookup(data));
  
      // identifiers (fill unless user edited)
      if (!touched.manufacturer && data?.manufacturer) setManufacturer(String(data.manufacturer));
      if (!touched.modelNumber && data?.modelNumber) setModelNumber(String(data.modelNumber));
  
      // UPC: always set from scan unless user typed a different UPC
      if (!touched.upc) setUpc(String((data as any)?.upc || trimmed));
  
      // SKU: fill unless user edited
      if (!touched.sku && (data as any)?.sku) setSku(String((data as any).sku));
  
      // legacy sync (optional)
      if (!brand.trim() && data?.manufacturer) setBrand(String(data.manufacturer));
      if (!model.trim() && data?.modelNumber) setModel(String(data.modelNumber));
  
      setScannerOpen(false);
    } catch (e: any) {
      console.error('Barcode lookup failed', e);
      const msg = e?.message || 'Lookup failed';
      setLookupError(msg);
    } finally {
      setLookupLoading(false);
    }
  }  
   
  async function runLabelOcr(file: File) {
    setOcrLoading(true);
    setOcrError(null);
  
    try {
      const raw = await ocrLabelToDraft(props.propertyId, file);
      const r = unwrapOcrResponse(raw) as any;
  
      if (!r || typeof r !== 'object') {
        throw new Error('OCR upload succeeded but response was empty/invalid');
      }
  
      setDraftId(r.draftId || '');
      setConfidenceByField(r.confidence || {});
  
      const ex = r.extracted || {};
  
      applyAutofillString('manufacturer', ex.manufacturer, setManufacturer);
      applyAutofillString('modelNumber', ex.modelNumber, setModelNumber);
      applyAutofillString('serialNumber', ex.serialNumber, setSerialNumber, normalizeSerial);
      applyAutofillString('upc', ex.upc, setUpc);
      applyAutofillString('sku', ex.sku, setSku);
  
      // legacy sync (optional)
      if (!serialNo.trim() && ex.serialNumber) setSerialNo(normalizeSerial(ex.serialNumber));
      if (!brand.trim() && ex.manufacturer) setBrand(String(ex.manufacturer));
      if (!model.trim() && ex.modelNumber) setModel(String(ex.modelNumber));
    } catch (e: any) {
      console.error('OCR failed', e);
      setOcrError(e?.message || 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  }
  

  async function onDismissDraft() {
    if (!draftId) return;
    try {
      await dismissInventoryDraft(props.propertyId, draftId);
    } catch (e) {
      // non-blocking; still clear local state so user can retry cleanly
      console.warn('Dismiss draft failed', e);
    } finally {
      setDraftId('');
      setConfidenceByField({});
    }
  }
  async function onQrDetected(text: string) {
    const trimmedText = String(text || '').trim();
    if (!trimmedText) return;
  
    setQrError(null);
    setLastQrText(trimmedText);
  
    // 1) Try to find UPC/GTIN digits → use barcode lookup for rich autofill
    const digits = extractDigitsCandidate(trimmedText);
    if (digits) {
      try {
        setLookupLoading(true);
        const data = await lookupInventoryBarcode(props.propertyId, digits);
  
        // name/category
        if (!touched.name && !name.trim() && (data as any)?.name) setName(String((data as any).name));
        if (!touched.category && category === 'OTHER') setCategory(inferCategoryFromLookup(data));
  
        // identifiers
        if (!touched.manufacturer && (data as any)?.manufacturer) setManufacturer(String((data as any).manufacturer));
        if (!touched.modelNumber && (data as any)?.modelNumber) setModelNumber(String((data as any).modelNumber));
        if (!touched.upc) setUpc(String((data as any)?.upc || digits));
        if (!touched.sku && (data as any)?.sku) setSku(String((data as any).sku));
  
        // legacy sync (optional)
        if (!brand.trim() && (data as any)?.manufacturer) setBrand(String((data as any).manufacturer));
        if (!model.trim() && (data as any)?.modelNumber) setModel(String((data as any).modelNumber));
  
        return;
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.detail ||
          e?.message ||
          'QR lookup failed';
        setQrError(msg);
        return;
      } finally {
        setLookupLoading(false);
      }
    }
  
    // 2) If not UPC-like, try to extract model/serial/manufacturer and fill those
    const ms = extractModelSerialCandidate(trimmedText);
  
    if (!touched.manufacturer && ms.manufacturer && !manufacturer.trim()) setManufacturer(ms.manufacturer);
    if (!touched.modelNumber && ms.modelNumber && !modelNumber.trim()) setModelNumber(ms.modelNumber);
    if (!touched.serialNumber && ms.serialNumber && !serialNumber.trim()) setSerialNumber(ms.serialNumber);
  
    // If nothing matched, show a gentle error
    if (!ms.manufacturer && !ms.modelNumber && !ms.serialNumber) {
      setQrError('QR code did not contain a recognizable UPC/GTIN or model/serial info.');
    }
  }
  
  async function onSave() {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }
  
    setSaving(true);
    try {
      // Determine which date field to send based on category
      let installedOnValue: string | null = null;
      let purchasedOnValue: string | null = null;
      
      if (INSTALL_YEAR_CATEGORIES.includes(category)) {
        // APPLIANCE: use install year
        const yearDate = yearToDate(installYear);
        installedOnValue = yearDate ? yearDate.toISOString() : null;
      } else {
        // ELECTRONICS, FURNITURE, OTHER: use purchase date
        purchasedOnValue = purchaseDate || null;
      }
  
      const payload = {
        name: name.trim(),
        category,
        condition,
        roomId: roomId || null,
  
        // Legacy identity fields
        brand: brand || null,
        model: model || null,
        serialNo: serialNo || null,
  
        // Phase 2 product identifiers
        manufacturer: manufacturer || null,
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        upc: upc || null,
        sku: sku || null,
  
        notes: notes || null,
        
        // Category-specific date fields
        installedOn: installedOnValue,
        purchasedOn: purchasedOnValue,
  
        // Cost fields
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
          await confirmInventoryDraft(props.propertyId, draftId);
        } else {
          await createInventoryItem(props.propertyId, payload);
        }
      }
  
      props.onSaved();
    } catch (error: any) {
      console.error('Failed to save inventory item:', error);
      
      // Show simple error message for duplicate appliance
      const message = error?.message || 'Save failed. Please try again.';
      alert(message);
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
          {/* ✅ Unified "Smart scan" section */}
          {!isEdit ? (
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Scan & autofill</div>
                  <div className="text-xs opacity-70">
                    Scan first to autofill details before saving. Barcode finds product info; label OCR extracts model/serial.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setScannerOpen(true)}
                    disabled={saving || lookupLoading}
                    className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    title="Scan barcode (UPC/EAN)"
                  >
                    {lookupLoading ? 'Looking up…' : 'Scan barcode'}
                  </button>

                  <button
                    onClick={() => setLabelOpen(true)}
                    disabled={saving || ocrLoading}
                    className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    title="Scan appliance label (OCR)"
                  >
                    {ocrLoading ? 'Extracting…' : 'Scan label'}
                  </button>
                  {/* QR scanner */}
                  <button
                    onClick={() => setQrOpen(true)}
                    disabled={saving || lookupLoading}
                    className="rounded-xl px-3 py-2 text-sm border border-black/10 hover:bg-black/5 disabled:opacity-50"
                    title="Scan QR code"
                  >
                    {lookupLoading ? 'Looking up…' : 'Scan QR'}
                  </button>

                </div>
              </div>

              {/* Lightweight status rows */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <div className="text-xs opacity-70">Barcode (UPC/EAN)</div>
                  <input
                    value={lastScannedCode}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-black/5"
                    placeholder="No barcode scanned yet"
                  />
                  <div className="mt-1 text-[11px] opacity-60">Autofills: name, category (best effort), UPC, manufacturer/model (when available).</div>
                </div>

                <div className="col-span-2">
                  <div className="text-xs opacity-70">QR code</div>
                  <input
                    value={lastQrText ? (lastQrText.length > 60 ? `${lastQrText.slice(0, 60)}…` : lastQrText) : ''}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-black/5"
                    placeholder="No QR scanned yet"
                  />
                  <div className="mt-1 text-[11px] opacity-60">
                    Autofills: UPC/name/manufacturer/model (when QR contains UPC/GTIN), or model/serial if present.
                  </div>
                </div>

                <div className="col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs opacity-70">Label OCR draft</div>
                    {draftId ? (
                      <button
                        onClick={onDismissDraft}
                        disabled={saving || ocrLoading}
                        className="text-[11px] underline opacity-70 hover:opacity-100 disabled:opacity-50"
                        title="Dismiss this draft (does not delete any saved item)"
                      >
                        Dismiss draft
                      </button>
                    ) : null}
                  </div>

                  <input
                    value={draftId ? `Draft created (${draftId.slice(0, 8)}…)` : ''}
                    readOnly
                    className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-black/5"
                    placeholder="No label scan yet"
                  />

                  {draftId ? (
                    <div className="mt-1 text-[11px] opacity-60">
                      Confidence: manufacturer {pct(confidenceByField.manufacturer)} • model {pct(confidenceByField.modelNumber)} • serial{' '}
                      {pct(confidenceByField.serialNumber)}
                      <span className="ml-2 opacity-70">Draft is confirmed when you hit Save.</span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[11px] opacity-60">Autofills: manufacturer, model number, serial number (creates a draft).</div>
                  )}
                </div>

                {lookupError ? (
                  <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {lookupError}
                  </div>
                ) : null}

                {ocrError ? (
                  <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {ocrError}
                  </div>
                ) : null}
                {qrError ? (
                  <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {qrError}
                  </div>
                ) : null}

              </div>
            </div>
          ) : null}

          <div>
            <div className="text-sm font-medium">Name *</div>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched((t) => ({ ...t, name: true }));
              }}
              
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              placeholder="e.g., Water Heater"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium">Category</div>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as any);
                  setTouched((t) => ({ ...t, category: true }));
                }}
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

          {/* OCR modal */}
          <LabelOcrModal open={labelOpen} onClose={() => setLabelOpen(false)} onCaptured={runLabelOcr} />

          {/* Phase 2 fields */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium">Product identifiers</div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="text-xs opacity-70">Manufacturer</div>
                <input
                  value={manufacturer}
                  onChange={(e) => {
                    setManufacturer(e.target.value);
                    setTouched((t) => ({ ...t, manufacturer: true }));
                  }}
                  
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">Model number</div>
                <input
                  value={modelNumber}
                  onChange={(e) => {
                    setModelNumber(e.target.value);
                    setTouched((t) => ({ ...t, modelNumber: true }));
                  }}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <div className="text-xs opacity-70">Serial number</div>
                <input
                  value={serialNumber}
                  onChange={(e) => {
                    setSerialNumber(e.target.value);
                    setTouched((t) => ({ ...t, serialNumber: true }));
                  }}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">SKU</div>
                <input
                  value={sku}
                  onChange={(e) => {
                    setSku(e.target.value);
                    setTouched((t) => ({ ...t, sku: true }));
                  }}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs opacity-70">UPC</div>
                <input
                  value={upc}
                  onChange={(e) => {
                    setUpc(e.target.value);
                    setTouched((t) => ({ ...t, upc: true }));
                  }}
                  className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-2 text-[11px] opacity-60">
              These fields improve recall matching and later “safety/recall” automation.
            </div>
          </div>

          {isEdit && isPropertyManagedAppliance(props.initialItem) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2">
                <svg 
                  className="w-4 h-4 text-blue-600" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" 
                  />
                </svg>
                <span className="text-sm text-blue-800">
                  Synced from Property Details • 
                  <a 
                    href={`/dashboard/properties/${props.propertyId}/edit`}
                    className="underline hover:text-blue-900 ml-1"
                  >
                    Edit there
                  </a>
                </span>
              </div>
            </div>
          )}
          {/* Existing recall panel behavior */}
          {isEdit && props.initialItem ? (
            <InventoryItemRecallPanel
              open={props.open}
              propertyId={props.propertyId}
              inventoryItemId={props.initialItem.id}
            />
          ) : (
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm font-medium">Safety / Recall Alerts</div>
              <div className="text-xs opacity-70 mt-1">Save this item first to enable recall scanning.</div>
            </div>
          )}

          {/* Category-specific date field */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="text-sm font-medium mb-3">
              {INSTALL_YEAR_CATEGORIES.includes(category) ? 'Installation' : 'Purchase Information'}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* APPLIANCE category: Install Year (year picker) */}
              {INSTALL_YEAR_CATEGORIES.includes(category) && (
                <div>
                  <div className="text-xs opacity-70 mb-1">Install Year</div>
                  <input
                    type="number"
                    min="1900"
                    max={CURRENT_YEAR + 1}
                    step="1"
                    placeholder="e.g. 2019"
                    value={installYear}
                    onChange={(e) => setInstallYear(e.target.value)}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* ELECTRONICS, FURNITURE, OTHER categories: Purchase Date (date picker) */}
              {PURCHASE_DATE_CATEGORIES.includes(category) && (
                <div>
                  <div className="text-xs opacity-70 mb-1">Purchase Date</div>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Purchase/Replacement cost (shown for all categories) */}
              <div>
                <div className="text-xs opacity-70 mb-1">Purchase Cost ($)</div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Replacement Cost ($)</div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={replacementCost}
                  onChange={(e) => setReplacementCost(e.target.value)}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
              rows={4}
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            {isEdit ? (
              <button
                onClick={onDelete}
                disabled={saving}
                className="text-sm underline text-red-600 hover:text-red-700 disabled:opacity-50"
              >
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
                {saving ? 'Saving…' : draftId ? 'Save (confirm draft)' : 'Save'}
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
      {/* QR scanner */}
      <QrScannerModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        onDetected={onQrDetected}
      />
    </div>
  );
}
