'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Plus, Search, X } from 'lucide-react';

import type { InventoryRoom, MaterialCategory, MaterialSpec, MaterialSpecExport, MaterialScopeLevel } from '@/types';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { useToolLaunchContext } from '@/features/tools/ToolLaunchContextBoundary';
import {
  createExport,
  createSpec,
  listExports,
  listSpecs,
  searchSpecs,
  type CreateSpecInput,
} from './materialSpecApi';
import { materialSpecLaunchPrefill } from './materialSpecLaunchContext';

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  PAINT: 'Paint',
  TILE: 'Tile',
  FLOORING: 'Flooring',
  GROUT: 'Grout',
  COUNTERTOP: 'Countertop',
  CABINET: 'Cabinet',
  HARDWARE: 'Hardware',
  TRIM_MOLDING: 'Trim & Molding',
  WALLPAPER: 'Wallpaper',
  ROOFING: 'Roofing',
  SIDING: 'Siding',
  WINDOW: 'Window',
  DOOR: 'Door',
  INSULATION: 'Insulation',
  OTHER: 'Other',
};

const ALL_CATEGORIES: MaterialCategory[] = [
  'PAINT', 'TILE', 'FLOORING', 'GROUT', 'COUNTERTOP', 'CABINET',
  'HARDWARE', 'TRIM_MOLDING', 'WALLPAPER', 'ROOFING', 'SIDING',
  'WINDOW', 'DOOR', 'INSULATION', 'OTHER',
];

function categoryBadgeClass(cat: MaterialCategory): string {
  switch (cat) {
    case 'PAINT': return 'bg-blue-100 text-blue-800';
    case 'TILE': return 'bg-purple-100 text-purple-800';
    case 'FLOORING': return 'bg-orange-100 text-orange-800';
    case 'COUNTERTOP': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function exportStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'bg-green-100 text-green-800';
    case 'GENERATING': return 'bg-blue-100 text-blue-800';
    case 'PENDING': return 'bg-yellow-100 text-yellow-800';
    case 'FAILED': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

interface SpecCardProps {
  spec: MaterialSpec;
  propertyId: string;
}

function SpecCard({ spec, propertyId }: SpecCardProps) {
  return (
    <Link href={`/dashboard/properties/${propertyId}/materials/${spec.id}`} className="block">
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all">
        <div className="flex items-start gap-2 mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${categoryBadgeClass(spec.category)}`}>
            {CATEGORY_LABELS[spec.category]}
          </span>
          {spec.room?.name && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-muted-foreground bg-gray-50 border border-gray-100">
              {spec.room.name}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            spec.lifecycleStatus === 'AS_BUILT'
              ? 'bg-emerald-100 text-emerald-800'
              : spec.lifecycleStatus === 'SUBSTITUTED'
                ? 'bg-gray-100 text-gray-500'
                : 'bg-indigo-100 text-indigo-800'
          }`}>
            {spec.lifecycleStatus.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          {spec.colorHex && (
            <span
              className="inline-block rounded-full border border-gray-200 flex-shrink-0"
              style={{ width: 16, height: 16, backgroundColor: spec.colorHex }}
            />
          )}
          <p className="text-sm font-medium text-gray-900 truncate">{spec.label}</p>
        </div>
        {(spec.manufacturer || spec.productName) && (
          <p className="text-xs text-muted-foreground truncate">
            {[spec.manufacturer, spec.productName].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  );
}

interface SpecFormProps {
  propertyId: string;
  initialValues?: Partial<MaterialSpec>;
  isEdit?: boolean;
  onSuccess: (spec: MaterialSpec) => void;
  onCancel: () => void;
  sourceContextLabel?: string;
}

function SpecForm({
  propertyId,
  initialValues,
  isEdit,
  onSuccess,
  onCancel,
  sourceContextLabel,
}: SpecFormProps) {
  const [label, setLabel] = useState(initialValues?.label ?? '');
  const [category, setCategory] = useState<MaterialCategory>(initialValues?.category ?? 'PAINT');
  const [scopeLevel, setScopeLevel] = useState<MaterialScopeLevel>(initialValues?.scopeLevel ?? 'PROPERTY');
  const [roomId, setRoomId] = useState<string>(initialValues?.roomId ?? '');
  const [manufacturer, setManufacturer] = useState(initialValues?.manufacturer ?? '');
  const [productName, setProductName] = useState(initialValues?.productName ?? '');
  const [colorCode, setColorCode] = useState(initialValues?.colorCode ?? '');
  const [finish, setFinish] = useState(initialValues?.finish ?? '');
  const [sku, setSku] = useState(initialValues?.sku ?? '');
  const [supplier, setSupplier] = useState(initialValues?.supplier ?? '');
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initialValues?.purchaseDate?.slice(0, 10) ?? '');
  const [quantityPurchased, setQuantityPurchased] = useState(initialValues?.quantityPurchased ?? '');
  const [lotBatch, setLotBatch] = useState(initialValues?.lotBatch ?? '');
  const [careInstructions, setCareInstructions] = useState(initialValues?.careInstructions ?? '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [rooms, setRooms] = useState<InventoryRoom[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (scopeLevel === 'ROOM') {
      api.get<{ rooms: InventoryRoom[] }>(`/api/properties/${propertyId}/inventory/rooms`)
        .then(r => setRooms(r.data.rooms))
        .catch(() => {});
    }
  }, [propertyId, scopeLevel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSubmitting(true);
    try {
      const body: CreateSpecInput & { isActive?: boolean } = {
        label: label.trim(),
        category,
        scopeLevel,
        roomId: scopeLevel === 'ROOM' && roomId ? roomId : null,
        manufacturer: manufacturer || null,
        productName: productName || null,
        colorCode: colorCode || null,
        finish: finish || null,
        sku: sku || null,
        supplier: supplier || null,
        notes: notes || null,
        projectId: initialValues?.projectId ?? null,
        purchaseDate: purchaseDate || null,
        quantityPurchased: quantityPurchased || null,
        lotBatch: lotBatch || null,
        careInstructions: careInstructions || null,
      };
      if (isEdit) body.isActive = isActive;

      let spec: MaterialSpec;
      if (isEdit && initialValues?.id) {
        const { updateSpec } = await import('./materialSpecApi');
        spec = await updateSpec(propertyId, initialValues.id, body);
      } else {
        spec = await createSpec(propertyId, body);
      }
      onSuccess(spec);
    } catch {
      toast({ title: 'Error', description: 'Failed to save material spec.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {sourceContextLabel ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          This record will stay linked to: <span className="font-medium">{sourceContextLabel}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-label">Label <span className="text-red-500">*</span></Label>
        <Input id="spec-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Living Room Walls" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-category">Category</Label>
        <Select value={category} onValueChange={v => setCategory(v as MaterialCategory)}>
          <SelectTrigger id="spec-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ALL_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-scope">Scope</Label>
        <Select value={scopeLevel} onValueChange={v => setScopeLevel(v as MaterialScopeLevel)}>
          <SelectTrigger id="spec-scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PROPERTY">Whole Property</SelectItem>
            <SelectItem value="ROOM">Room</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scopeLevel === 'ROOM' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spec-room">Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger id="spec-room"><SelectValue placeholder="Select a room" /></SelectTrigger>
            <SelectContent>
              {rooms.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-mfr">Manufacturer</Label>
        <Input id="spec-mfr" value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="e.g. Sherwin-Williams" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-product">Product Name</Label>
        <Input id="spec-product" value={productName} onChange={e => setProductName(e.target.value)} placeholder="e.g. Emerald Interior" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spec-color">Color Code</Label>
          <Input id="spec-color" value={colorCode} onChange={e => setColorCode(e.target.value)} placeholder="e.g. SW 7015" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spec-finish">Finish</Label>
          <Input id="spec-finish" value={finish} onChange={e => setFinish(e.target.value)} placeholder="e.g. Eggshell" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-batch">Lot / Batch</Label>
        <Input id="spec-batch" value={lotBatch} onChange={e => setLotBatch(e.target.value)} placeholder="Manufacturer batch or dye lot" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-care">Care Instructions</Label>
        <Textarea id="spec-care" value={careInstructions} onChange={e => setCareInstructions(e.target.value)} placeholder="Cleaning, repair, and maintenance guidance" rows={3} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-sku">SKU</Label>
        <Input id="spec-sku" value={sku} onChange={e => setSku(e.target.value)} placeholder="Product SKU" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-supplier">Supplier</Label>
        <Input id="spec-supplier" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Home Depot" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spec-date">Purchase Date</Label>
          <Input id="spec-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="spec-qty">Quantity</Label>
          <Input id="spec-qty" value={quantityPurchased} onChange={e => setQuantityPurchased(e.target.value)} placeholder="e.g. 2 gallons" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="spec-notes">Notes</Label>
        <Textarea id="spec-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." rows={3} />
      </div>

      {isEdit && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="spec-active"
            checked={isActive}
            onCheckedChange={checked => setIsActive(Boolean(checked))}
          />
          <Label htmlFor="spec-active">Active</Label>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Material'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export default function MaterialSpecsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();
  const toolLaunchContext = useToolLaunchContext();

  const [specs, setSpecs] = useState<MaterialSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<MaterialCategory | null>(null);

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exports, setExports] = useState<MaterialSpecExport[]>([]);
  const [exportTitle, setExportTitle] = useState('');
  const [exporting, setExporting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedLaunchContextRef = useRef<string | null>(null);
  const launchPrefill = useMemo(() => materialSpecLaunchPrefill({
    toolId: toolLaunchContext?.toolId,
    resolved: toolLaunchContext?.resolved,
  }), [toolLaunchContext?.toolId, toolLaunchContext?.resolved]);

  useEffect(() => {
    const sourceId = launchPrefill?.initialValues.projectId
      ?? launchPrefill?.initialValues.roomId
      ?? null;
    if (!sourceId || appliedLaunchContextRef.current === sourceId) return;
    appliedLaunchContextRef.current = sourceId;
    setAddSheetOpen(true);
  }, [launchPrefill]);

  const loadSpecs = useCallback(async (query: string, category: MaterialCategory | null) => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      let result: MaterialSpec[];
      if (query.trim()) {
        result = await searchSpecs(propertyId, query.trim());
      } else {
        result = await listSpecs(propertyId, category ? { category } : {});
      }
      setSpecs(result);
    } catch {
      setError('Failed to load material specs.');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadSpecs(searchQuery, activeCategory);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, activeCategory, loadSpecs]);

  async function loadExports() {
    if (!propertyId) return;
    try {
      const result = await listExports(propertyId);
      setExports(result);
    } catch {
      /* ignore */
    }
  }

  function handleOpenExportSheet() {
    setExportSheetOpen(true);
    loadExports();
  }

  async function handleCreateExport() {
    if (!propertyId || !exportTitle.trim()) return;
    setExporting(true);
    try {
      const exp = await createExport(propertyId, { scopeType: 'ALL', title: exportTitle.trim() });
      setExports(prev => [exp, ...prev]);
      setExportTitle('');
      toast({ title: 'Export requested', description: 'Your export is being generated.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to create export.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  function handleSpecCreated(spec: MaterialSpec) {
    setAddSheetOpen(false);
    setSpecs(prev => [spec, ...prev]);
    toast({ title: 'Material added', description: spec.label });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push(`/dashboard/properties/${propertyId}`)}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-gray-900">Material Specs</h1>
            <p className="text-sm text-muted-foreground">Track finishes, colors & products across your home</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenExportSheet}>
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
            <Button size="sm" onClick={() => setAddSheetOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add material
            </Button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search materials..."
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeCategory === null
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {ALL_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeCategory === cat
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 rounded-lg h-24 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-12">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={() => loadSpecs(searchQuery, activeCategory)}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && specs.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground mb-4">No material specs found.</p>
            <Button size="sm" onClick={() => setAddSheetOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add your first material
            </Button>
          </div>
        )}

        {!loading && !error && specs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {specs.map(spec => (
              <SpecCard key={spec.id} spec={spec} propertyId={propertyId} />
            ))}
          </div>
        )}
      </div>

      <Sheet open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Material Spec</SheetTitle>
          </SheetHeader>
          {addSheetOpen && (
            <SpecForm
              propertyId={propertyId}
              initialValues={launchPrefill?.initialValues}
              sourceContextLabel={launchPrefill?.sourceLabel}
              onSuccess={handleSpecCreated}
              onCancel={() => setAddSheetOpen(false)}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={exportSheetOpen} onOpenChange={setExportSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Export Material Specs</SheetTitle>
          </SheetHeader>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-title">Export Title</Label>
              <Input
                id="export-title"
                value={exportTitle}
                onChange={e => setExportTitle(e.target.value)}
                placeholder="e.g. Full Home Material List"
              />
            </div>
            <Button onClick={handleCreateExport} disabled={exporting || !exportTitle.trim()}>
              {exporting ? 'Requesting...' : 'Request Export'}
            </Button>

            {exports.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <p className="text-sm font-medium text-gray-700">Recent Exports</p>
                {exports.map(exp => (
                  <div key={exp.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{exp.title}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-0.5 ${exportStatusBadgeClass(exp.status)}`}>
                        {exp.status}
                      </span>
                    </div>
                    {exp.status === 'COMPLETED' && exp.signedUrl && (
                      <a
                        href={exp.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline ml-2"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export { SpecForm };
