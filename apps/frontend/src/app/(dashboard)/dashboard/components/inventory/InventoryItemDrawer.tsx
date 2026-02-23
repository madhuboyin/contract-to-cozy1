// apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { InventoryItem, InventoryItemCategory, InventoryItemCondition, InventoryRoom } from '@/types';
import DocumentPickerModal from './DocumentPickerModal';
import DocumentUploadZone from './DocumentUploadZone';
import BarcodeScannerModal, { BarcodeLookupResult } from './BarcodeScannerModal';
import LabelOcrModal from './LabelOcrModal';
import { lookupBarcode as lookupInventoryBarcode } from '../../inventory/inventoryApi';
import QrScannerModal from './QrScannerModal';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Loader2,
  ScanLine,
  Shield,
  ShieldAlert as ShieldAlertIcon,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { titleCase, titleCaseCategory } from '@/lib/utils/string';


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
import { listInventoryItemRecalls } from '../../properties/[id]/recalls/recallsApi';
import { verifyItem } from '../verification/verificationApi';

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
 * Map of keywords to canonical appliance types
 */
const KEYWORD_TO_TYPE: Record<string, string> = {
  'dishwasher': 'DISHWASHER',
  'refrigerator': 'REFRIGERATOR',
  'fridge': 'REFRIGERATOR',
  'freezer': 'REFRIGERATOR',
  'oven': 'OVEN_RANGE',
  'range': 'OVEN_RANGE',
  'stove': 'OVEN_RANGE',
  'cooktop': 'OVEN_RANGE',
  'washer': 'WASHER_DRYER',
  'dryer': 'WASHER_DRYER',
  'laundry': 'WASHER_DRYER',
  'microwave': 'MICROWAVE_HOOD',
  'water softener': 'WATER_SOFTENER',
  'softener': 'WATER_SOFTENER',
};

/**
 * Infer major appliance type from name (client-side version)
 */
function inferApplianceType(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  
  for (const [keyword, type] of Object.entries(KEYWORD_TO_TYPE)) {
    if (normalized.includes(keyword)) {
      return type;
    }
  }
  return null;
}

/**
 * Format appliance type for display
 */
function formatApplianceType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase();
}
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
  const value = cents / 100;
  if (value % 1 === 0) return String(value);
  return value.toFixed(2);
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
  existingItems?: InventoryItem[];
}) {
  const router = useRouter();
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
  const [linkedDocs, setLinkedDocs] = useState<any[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const autoCreateWarranty = true;
  const [mounted, setMounted] = useState(false);

  // coverage links
  const [warranties, setWarranties] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [warrantyId, setWarrantyId] = useState<string | ''>('');
  const [insurancePolicyId, setInsurancePolicyId] = useState<string | ''>('');
  const [suggestions, setSuggestions] = useState<any | null>(null);
  const [installYear, setInstallYear] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // verification state
  const [verifying, setVerifying] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
  const [recallMatches, setRecallMatches] = useState<any[]>([]);

  /**
 * Check for duplicate major appliances (client-side)
 */
useEffect(() => {
  // Skip for edit mode
  if (isEdit) {
    setDuplicateError(null);
    return;
  }

  // Only check APPLIANCE category
  if (category !== 'APPLIANCE') {
    setDuplicateError(null);
    return;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    setDuplicateError(null);
    return;
  }

  // Infer the appliance type from name
  const inferredType = inferApplianceType(trimmedName);
  if (!inferredType) {
    setDuplicateError(null);
    return;
  }

  // Check if any existing item has the same type
  const existingItems = props.existingItems || [];
  const sourceHashToFind = `property_appliance::${inferredType}`;
  
  const duplicate = existingItems.find(item => 
    item.sourceHash === sourceHashToFind ||
    (item.category === 'APPLIANCE' && inferApplianceType(item.name || '') === inferredType)
  );

  if (duplicate) {
    const friendlyName = formatApplianceType(inferredType);
    setDuplicateError(`A ${friendlyName} already exists for this property.`);
  } else {
    setDuplicateError(null);
  }
}, [name, category, isEdit, props.existingItems]);
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
    setUploadError(null);
    setDocumentUploading(false);
    setShowDeleteConfirm(false);

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
    if (!props.open || !props.initialItem?.id) {
      setRecallMatches([]);
      setRecallError(null);
      setRecallLoading(false);
      return;
    }

    let cancelled = false;
    setRecallLoading(true);
    setRecallError(null);

    (async () => {
      try {
        const response = await listInventoryItemRecalls(props.propertyId, props.initialItem!.id);
        if (cancelled) return;
        setRecallMatches(response?.matches ?? []);
      } catch (error: any) {
        if (cancelled) return;
        setRecallError(error?.message || 'Failed to load recall alerts');
        setRecallMatches([]);
      } finally {
        if (!cancelled) setRecallLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [props.open, props.propertyId, props.initialItem?.id]);
  
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const canSave = name.trim().length > 0 && !duplicateError;

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
    } finally {
      setSaving(false);
    }
  }

  async function uploadAndAttach(file: File) {
    if (!props.initialItem) return;
    if (!file) return;

    setDocumentUploading(true);
    setSaving(true);
    setUploadError(null);
    try {
      const result = await uploadAndAnalyzeDocument({
        file,
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
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed');
    } finally {
      setDocumentUploading(false);
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

  async function handleConfirmedDelete() {
    if (!props.initialItem) return;
    setSaving(true);
    try {
      await deleteInventoryItem(props.propertyId, props.initialItem.id);
      props.onSaved();
    } finally {
      setSaving(false);
    }
  }

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
    } catch {
      // non-blocking; still clear local state so user can retry cleanly
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
    if (category === 'APPLIANCE') {
      const year = Number(installYear);
      if (!installYear || !Number.isFinite(year) || year < 1900 || year > CURRENT_YEAR + 1) {
        alert('Install Year is required for appliances.');
        return;
      }
    }

    if (duplicateError) {
      return;
    }

    const shouldVerifyOnSave =
      Boolean(isEdit && props.initialItem && !(props.initialItem as any).isVerified) &&
      [manufacturer, modelNumber, serialNumber].every((value) => value.trim().length > 0);

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
        purchasedOnValue = purchaseDate ? new Date(purchaseDate).toISOString() : null;
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

      if (shouldVerifyOnSave && props.initialItem) {
        try {
          await verifyItem(props.propertyId, props.initialItem.id, { source: 'MANUAL' });
        } catch (verifyError) {
          console.error('Auto-verify on save failed:', verifyError);
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

  function openGetCoverage() {
    if (!props.initialItem?.id) return;
    props.onClose();
    router.push(
      `/dashboard/properties/${props.propertyId}/inventory/items/${props.initialItem.id}/coverage`
    );
  }

  function handleDeleteIntent() {
    setShowDeleteConfirm(true);
  }

  function openReplaceRepair() {
    if (!props.initialItem?.id) return;
    props.onClose();
    router.push(
      `/dashboard/properties/${props.propertyId}/inventory/items/${props.initialItem.id}/replace-repair`
    );
  }

  const isUnverified = Boolean(isEdit && props.initialItem && !(props.initialItem as any).isVerified);
  const identifierFields = [
    { label: 'Manufacturer', value: manufacturer.trim() },
    { label: 'Model #', value: modelNumber.trim() },
    { label: 'Serial #', value: serialNumber.trim() },
  ];
  const allIdentifiersFilled = identifierFields.every((field) => field.value.length > 0);
  const activeRecallMatches = recallMatches.filter((match) => {
    const status = String(match?.status || '').toUpperCase();
    return status !== 'RESOLVED' && status !== 'DISMISSED';
  });

  if (!props.open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={props.onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[640px] bg-white shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit item' : 'Add item'}</h2>
              <p className="mt-0.5 text-sm text-gray-500">Track assets, receipts, and replacement value.</p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-6 py-5">
            {isUnverified ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <ShieldAlertIcon className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800">Unverified Item</p>
                </div>

                <p className="mb-3 text-xs leading-relaxed text-amber-700">
                  Add identifiers below to unlock lifespan predictions and recall monitoring.
                </p>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {identifierFields.map((field) => (
                    <div
                      key={field.label}
                      className={[
                        'flex cursor-default select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                        field.value
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-white text-amber-600',
                      ].join(' ')}
                    >
                      {field.value ? (
                        <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-3 w-3 flex-shrink-0 text-amber-400" />
                      )}
                      <span>{field.value || field.label}</span>
                    </div>
                  ))}
                </div>

                {allIdentifiersFilled ? (
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    All identifiers filled - item will be verified on save.
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLabelOpen(true)}
                    disabled={verifying || ocrLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                  >
                    <ScanLine className="h-3.5 w-3.5" />
                    Scan Label
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!props.initialItem) return;
                      setVerifying(true);
                      try {
                        await verifyItem(props.propertyId, props.initialItem.id, { source: 'MANUAL' });
                        props.onSaved();
                      } catch (err) {
                        console.error('Manual verification failed:', err);
                      } finally {
                        setVerifying(false);
                      }
                    }}
                    disabled={verifying}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                  >
                    <BadgeCheck className="h-3.5 w-3.5" />
                    {verifying ? 'Verifying...' : 'Mark as Verified'}
                  </button>
                  <p className="text-[10px] leading-relaxed text-amber-500">
                    Fill identifiers in Product identifiers below to auto-verify
                  </p>
                </div>
              </div>
            ) : null}

            {!isEdit ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Scan & autofill</div>
                    <div className="text-xs text-gray-500">
                      Scan first to autofill details before saving. Barcode finds product info; label OCR extracts model/serial.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      disabled={saving || lookupLoading}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-white disabled:opacity-50"
                    >
                      {lookupLoading ? 'Looking up...' : 'Scan barcode'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLabelOpen(true)}
                      disabled={saving || ocrLoading}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-white disabled:opacity-50"
                    >
                      {ocrLoading ? 'Extracting...' : 'Scan label'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setQrOpen(true)}
                      disabled={saving || lookupLoading}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-white disabled:opacity-50"
                    >
                      {lookupLoading ? 'Looking up...' : 'Scan QR'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Barcode (UPC/EAN)</div>
                    <input
                      value={lastScannedCode}
                      readOnly
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      placeholder="No barcode scanned yet"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">QR code</div>
                    <input
                      value={lastQrText ? (lastQrText.length > 60 ? `${lastQrText.slice(0, 60)}...` : lastQrText) : ''}
                      readOnly
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      placeholder="No QR scanned yet"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">Label OCR draft</div>
                      {draftId ? (
                        <button
                          type="button"
                          onClick={onDismissDraft}
                          disabled={saving || ocrLoading}
                          className="text-[11px] text-gray-500 underline transition-colors hover:text-gray-700 disabled:opacity-50"
                        >
                          Dismiss draft
                        </button>
                      ) : null}
                    </div>
                    <input
                      value={draftId ? `Draft created (${draftId.slice(0, 8)}...)` : ''}
                      readOnly
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                      placeholder="No label scan yet"
                    />
                    {draftId ? (
                      <div className="mt-1 text-[11px] text-gray-500">
                        Confidence: manufacturer {pct(confidenceByField.manufacturer)} · model {pct(confidenceByField.modelNumber)} · serial{' '}
                        {pct(confidenceByField.serialNumber)}
                        <span className="ml-2">Draft is confirmed when you hit Save.</span>
                      </div>
                    ) : null}
                  </div>
                  {lookupError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{lookupError}</div> : null}
                  {ocrError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{ocrError}</div> : null}
                  {qrError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{qrError}</div> : null}
                </div>
              </div>
            ) : null}

            <section className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-800">Name *</div>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setTouched((t) => ({ ...t, name: true }));
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="e.g. Samsung Dishwasher"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Category</div>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as any);
                      setTouched((t) => ({ ...t, category: true }));
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {titleCaseCategory(c)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-800">Room</div>
                  <select
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
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

              {duplicateError ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-700">{duplicateError}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Condition</div>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as any)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {titleCase(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hidden sm:block" />
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Product identifiers</h3>
                <p className="mt-0.5 text-xs text-gray-500">Improves recall matching and maintenance predictions.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">Manufacturer</div>
                  <input
                    value={manufacturer}
                    onChange={(e) => {
                      setManufacturer(e.target.value);
                      setTouched((t) => ({ ...t, manufacturer: true }));
                    }}
                    placeholder="e.g. Samsung"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">Model number</div>
                  <input
                    value={modelNumber}
                    onChange={(e) => {
                      setModelNumber(e.target.value);
                      setTouched((t) => ({ ...t, modelNumber: true }));
                    }}
                    placeholder="e.g. DW80R9950US"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-xs text-gray-500">Serial number</div>
                <input
                  value={serialNumber}
                  onChange={(e) => {
                    setSerialNumber(e.target.value);
                    setTouched((t) => ({ ...t, serialNumber: true }));
                  }}
                  placeholder="e.g. 0A1B2C3D4E5F"
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">SKU</div>
                  <input
                    value={sku}
                    onChange={(e) => {
                      setSku(e.target.value);
                      setTouched((t) => ({ ...t, sku: true }));
                    }}
                    placeholder="Optional"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-gray-500">UPC</div>
                  <input
                    value={upc}
                    onChange={(e) => {
                      setUpc(e.target.value);
                      setTouched((t) => ({ ...t, upc: true }));
                    }}
                    placeholder="Optional"
                    className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Safety / Recall Alerts</h3>
              {isEdit ? (
                recallLoading ? (
                  <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mt-0.5 rounded-full bg-gray-200 p-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Checking recall data...</p>
                      <p className="mt-0.5 text-xs text-gray-500">Scanning current CPSC matches for this item.</p>
                    </div>
                  </div>
                ) : recallError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <p className="text-sm font-semibold text-red-700">Unable to load recall alerts</p>
                    </div>
                    <p className="mt-1 text-xs text-red-600">{recallError}</p>
                  </div>
                ) : activeRecallMatches.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mt-0.5 rounded-full bg-emerald-100 p-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">No active recalls found</p>
                      <p className="mt-0.5 text-xs text-gray-500">We monitor CPSC data for your appliance models.</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <p className="text-sm font-semibold text-red-700">
                        {activeRecallMatches.length} active recall{activeRecallMatches.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {activeRecallMatches.map((recallMatch) => (
                      <p key={recallMatch.id} className="mt-1 text-xs text-red-600">
                        {recallMatch?.recall?.title || 'Recall notice'}
                      </p>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mt-0.5 rounded-full bg-emerald-100 p-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">No active recalls found</p>
                    <p className="mt-0.5 text-xs text-gray-500">Save this item first to enable recall monitoring.</p>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800">
                {INSTALL_YEAR_CATEGORIES.includes(category) ? 'Installation' : 'Purchase Information'}
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {INSTALL_YEAR_CATEGORIES.includes(category) ? (
                  <div className="min-w-0">
                    <div className="mb-1 text-xs text-gray-500">
                      Install Year {category === 'APPLIANCE' ? <span className="text-red-500">*</span> : null}
                    </div>
                    <input
                      type="number"
                      min="1900"
                      max={CURRENT_YEAR + 1}
                      step="1"
                      placeholder="e.g. 2019"
                      value={installYear}
                      onChange={(e) => setInstallYear(e.target.value)}
                      required={category === 'APPLIANCE'}
                      className={[
                        'w-full rounded-xl border px-3 py-2 text-sm',
                        category === 'APPLIANCE' && !installYear ? 'border-red-300' : 'border-gray-200',
                      ].join(' ')}
                    />
                    {category === 'APPLIANCE' && !installYear ? (
                      <div className="mt-1 text-xs text-red-500">Required for appliances</div>
                    ) : null}
                  </div>
                ) : null}

                {PURCHASE_DATE_CATEGORIES.includes(category) ? (
                  <div className="min-w-0">
                    <div className="mb-1 text-xs text-gray-500">Purchase Date</div>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                <div className="min-w-0">
                  <div className="mb-1 text-xs text-gray-500">Purchase Cost ($)</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-xs text-gray-500">Replacement Cost ($)</div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={replacementCost}
                    onChange={(e) => setReplacementCost(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Coverage links</h3>
                  <p className="mt-0.5 text-xs text-gray-500">Link this item to warranty and/or insurance.</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={openGetCoverage}
                    disabled={!isEdit}
                    title={!isEdit ? 'Save this item first to run analysis' : undefined}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-teal-600 px-3 py-1.5 text-xs font-medium text-teal-600 transition-colors hover:bg-teal-50 disabled:opacity-50"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Get coverage
                  </button>
                  <button
                    type="button"
                    onClick={openReplaceRepair}
                    disabled={!isEdit}
                    title={!isEdit ? 'Save this item first to run analysis' : undefined}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Replace/Repair
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-500">Warranty</div>
                  <select
                    value={warrantyId}
                    onChange={(e) => setWarrantyId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {warranties.map((w: any) => (
                      <option key={w.id} value={w.id}>
                        {w.providerName}
                        {w.policyNumber ? ` · ${w.policyNumber}` : ''}
                        {w.expiryDate ? ` · exp ${new Date(w.expiryDate).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Insurance policy</div>
                  <select
                    value={insurancePolicyId}
                    onChange={(e) => setInsurancePolicyId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">None</option>
                    {policies.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.carrierName}
                        {p.policyNumber ? ` · ${p.policyNumber}` : ''}
                        {p.expiryDate ? ` · exp ${new Date(p.expiryDate).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 p-4">
              <DocumentUploadZone
                disabled={!isEdit || saving}
                uploading={documentUploading}
                uploadError={uploadError}
                documents={linkedDocs}
                onAttachExisting={() => setDocPickerOpen(true)}
                onUpload={(file) => {
                  void uploadAndAttach(file);
                }}
                onRemove={(docId) => {
                  void unlinkDocument(docId);
                }}
              />
              {!isEdit ? <p className="mt-3 text-xs text-gray-500">Save this item first to attach documents.</p> : null}

              {suggestions?.inventoryItemSuggestions?.length > 0 ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold text-gray-700">AI suggested matches</div>
                  <div className="text-xs text-gray-500">Based on extracted model/serial/name. You can ignore if incorrect.</div>
                  <div className="mt-2 space-y-2">
                    {suggestions.inventoryItemSuggestions.slice(0, 5).map((it: any) => (
                      <div key={it.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-2">
                        <div>
                          <div className="text-sm font-medium text-gray-800">{it.name}</div>
                          <div className="text-xs text-gray-500">
                            Score {it.score} · {it.brand || '—'} · {it.model || '—'} · {it.serialNo || '—'}
                          </div>
                          {it.reasons?.length > 0 ? <div className="mt-1 text-xs text-gray-400">{it.reasons.join(' · ')}</div> : null}
                        </div>
                        <div className="text-xs text-gray-400">{it.id === props.initialItem?.id ? 'This item' : 'Other item'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800">Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px] w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm"
                rows={4}
                placeholder="Purchase notes, condition details, service history, warranty info..."
              />
            </section>
          </div>

          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-6 py-4">
            {showDeleteConfirm ? (
              <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">Delete this item permanently?</p>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleConfirmedDelete();
                    }}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    Yes, delete
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              {isEdit ? (
                <button
                  type="button"
                  onClick={handleDeleteIntent}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={props.onClose}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || !canSave}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? 'Saving...' : draftId ? 'Save (confirm draft)' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <LabelOcrModal open={labelOpen} onClose={() => setLabelOpen(false)} onCaptured={runLabelOcr} />

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
    </div>,
    document.body
  );
}
