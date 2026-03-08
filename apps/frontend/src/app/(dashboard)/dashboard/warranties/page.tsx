// apps/frontend/src/app/(dashboard)/dashboard/warranties/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Trash2, Edit, Upload, AlertCircle, ArrowLeft, BadgeCheck, CalendarDays, ChevronDown, MoreHorizontal, Sparkles, ShieldCheck } from 'lucide-react';
import { differenceInCalendarDays, format, isPast, isValid, parseISO } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { listInventoryItems } from '@/app/(dashboard)/dashboard/inventory/inventoryApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
// UPDATED IMPORT: Added HomeAsset
import { Property, APIResponse, APIError, Document, DocumentUploadInput, DocumentType, HomeAsset } from '@/types'; // Removed Warranty, Create/UpdateWarrantyInput to redefine locally
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import {
  CoverageModalFooter,
  CoverageModalHeader,
  COVERAGE_MODAL_CONTENT_CLASS,
  COVERAGE_MODAL_DATE_INPUT_CLASS,
  COVERAGE_MODAL_FIELD_HINT_CONDITIONAL_CLASS,
  COVERAGE_MODAL_FORM_CLASS,
  COVERAGE_MODAL_INPUT_CLASS,
  COVERAGE_MODAL_LABEL_CLASS,
  COVERAGE_MODAL_NOTES_TEXTAREA_CLASS,
  COVERAGE_MODAL_SELECT_TRIGGER_CLASS,
  COVERAGE_MODAL_TWO_COL_GRID_CLASS,
} from '@/components/shared/coverage-modal-chrome';
// NEW IMPORTS for Table structure
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Infer appliance type from InventoryItem for HomeAsset compatibility
 */
function inferAssetTypeFromItem(item: any): string {
  // 1. Check sourceHash first (canonical from Property page)
  if (item.sourceHash?.startsWith('property_appliance::')) {
    return item.sourceHash.replace('property_appliance::', '');
  }
  
  // 2. Check tags
  const typeTag = (item.tags || []).find((t: string) => t.startsWith('APPLIANCE_TYPE:'));
  if (typeTag) {
    return typeTag.replace('APPLIANCE_TYPE:', '');
  }
  
  // 3. Infer from name
  const name = (item.name || '').toLowerCase();
  if (name.includes('dishwasher')) return 'DISHWASHER';
  if (name.includes('refrigerator') || name.includes('fridge')) return 'REFRIGERATOR';
  if (name.includes('oven') || name.includes('range') || name.includes('stove')) return 'OVEN_RANGE';
  if (name.includes('washer') || name.includes('dryer')) return 'WASHER_DRYER';
  if (name.includes('microwave')) return 'MICROWAVE_HOOD';
  if (name.includes('softener')) return 'WATER_SOFTENER';
  
  return 'OTHER';
}
// ============================================================================
// LOCAL TYPE DEFINITIONS AND ENUMS (TO RESOLVE COMPILE ERRORS)
// ============================================================================

const WARRANTY_CATEGORIES = {
    APPLIANCE: 'Appliance',
    HVAC: 'HVAC',
    ROOFING: 'Roofing',
    PLUMBING: 'Plumbing',
    ELECTRICAL: 'Electrical',
    STRUCTURAL: 'Structural',
    HOME_WARRANTY_PLAN: 'Home Warranty Plan',
    OTHER: 'Other',
} as const;
type WarrantyCategory = keyof typeof WARRANTY_CATEGORIES;

const WARRANTY_CATEGORY_OPTIONS = Object.entries(WARRANTY_CATEGORIES).map(([key, display]) => ({
    key: key as WarrantyCategory,
    display,
}));

const WARRANTY_CATEGORY_KEYS = Object.keys(WARRANTY_CATEGORIES) as WarrantyCategory[];

function isWarrantyCategory(value: string | null): value is WarrantyCategory {
  return !!value && WARRANTY_CATEGORY_KEYS.includes(value as WarrantyCategory);
}

// Augmented interfaces to include the new required fields
interface Warranty {
    id: string;
    homeownerProfileId: string;
    propertyId: string | null;
    homeAssetId: string | null;
    category: WarrantyCategory; // NEW
    providerName: string;
    policyNumber: string | null;
    coverageDetails: string | null;
    cost: number | null;
    startDate: string; // ISO Date String
    expiryDate: string; // ISO Date String
    createdAt: string;
    updatedAt: string;
    documents?: Document[];
}

interface CreateWarrantyInput {
    propertyId?: string; 
    homeAssetId?: string;
    category: WarrantyCategory; // NEW
    providerName: string;
    policyNumber?: string;
    coverageDetails?: string;
    cost?: number;
    startDate: string; // YYYY-MM-DD
    expiryDate: string; // YYYY-MM-DD
}

interface UpdateWarrantyInput extends Partial<CreateWarrantyInput> {
    // Allows updating subsets of the fields
}
// ============================================================================

// ============================================================================
// NEW: CATEGORY-TO-ASSET MAPPING (For validation of component type)
// ============================================================================
const CATEGORY_ASSET_MAP: Record<WarrantyCategory, string[]> = {
    APPLIANCE: ['REFRIGERATOR', 'OVEN', 'DISHWASHER', 'WASHER', 'DRYER', 'MICROWAVE', 'GARBAGE_DISPOSAL'],
    HVAC: ['HVAC_FURNACE', 'HEAT_PUMP', 'CENTRAL_AC'],
    PLUMBING: ['WATER_HEATER', 'SUMP_PUMP', 'SEPTIC_SYSTEM'],
    ELECTRICAL: ['ELECTRICAL_PANEL', 'GENERATOR'],
    ROOFING: ['ROOF'], // Can be linked if roof is added as an asset type
    STRUCTURAL: ['FOUNDATION', 'SIDING', 'GARAGE_DOOR'], // If these become asset types
    // These categories allow for a general policy or no asset link
    HOME_WARRANTY_PLAN: [], 
    OTHER: [],
};

// NEW: Categories that should DISABLE ONLY the asset linking dropdown
const DISABLE_ASSET_LINKING_CATEGORIES: WarrantyCategory[] = [
    'HVAC', 
    'ROOFING', 
    'PLUMBING', 
    'ELECTRICAL', 
    'STRUCTURAL',
];


// Placeholder for "None" option, necessary to avoid Radix UI error on value=""
const SELECT_NONE_VALUE = '__NONE__';

function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/dashboard/')) {
    return null;
  }

  return raw;
}

function propertyIdFromDashboardPath(path: string | null): string | undefined {
  if (!path) return undefined;
  const match = path.match(/\/dashboard\/properties\/([^/?]+)/);
  return match?.[1];
}

// --- Document Type Constants for UI (omitted for brevity) ---
const DOCUMENT_TYPES: DocumentType[] = [
    'INSPECTION_REPORT',
    'ESTIMATE',
    'INVOICE',
    'CONTRACT',
    'PERMIT',
    'PHOTO',
    'VIDEO',
    'INSURANCE_CERTIFICATE',
    'LICENSE',
    'OTHER',
];

// --- Document Upload Modal Component (omitted for brevity, content remains the same) ---
interface DocumentUploadModalProps {
  parentEntityId: string; 
  parentEntityType: 'property' | 'warranty' | 'policy';
  onUploadSuccess: () => void;
  onClose: () => void;
}

const DocumentUploadModal = ({ parentEntityId, parentEntityType, onUploadSuccess, onClose }: DocumentUploadModalProps) => {
    const [file, setFile] = useState<File | null>(null);
    const [docType, setDocType] = useState<DocumentType>('OTHER');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const { toast } = useToast();

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setUploadError(null);

        try {
            const inputData: DocumentUploadInput = {
                type: docType,
                name: file.name,
            };
            
            // Dynamically assign the correct parent ID
            if (parentEntityType === 'warranty') {
                inputData.warrantyId = parentEntityId;
            } else if (parentEntityType === 'policy') {
                inputData.policyId = parentEntityId;
            } else if (parentEntityType === 'property') {
                inputData.propertyId = parentEntityId;
            }

            const res = await api.uploadDocument(file, inputData);

            if (res.success) {
                toast({ title: 'Document Uploaded', description: 'File uploaded successfully.' });
                onUploadSuccess();
            } else {
                setUploadError(res.message || 'Upload failed');
            }
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>

            <div className="grid gap-2">
                <Label htmlFor="docType">Document Type</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                        {DOCUMENT_TYPES.map(dt => (
                            <SelectItem key={dt} value={dt}>
                                {dt.replace(/_/g, ' ')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="file">File</Label>
                <Input
                    id="file"
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
            </div>

            {uploadError && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> {uploadError}
                </p>
            )}

            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={uploading}>
                    Cancel
                </Button>
                <Button onClick={handleUpload} disabled={!file || uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload
                </Button>
            </DialogFooter>
        </div>
    );
}


// --- Warranty Form Component ---
interface WarrantyFormProps {
  initialData?: Warranty;
  properties: Property[];
  homeAssets: HomeAsset[];
  prefill?: {
    propertyId?: string;
    homeAssetId?: string;
    category?: WarrantyCategory;
  };
  onSave: (data: CreateWarrantyInput | UpdateWarrantyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const WarrantyForm = ({ initialData, properties, homeAssets, prefill, onSave, onClose, isSubmitting }: WarrantyFormProps) => {
  const buildInitialFormData = useCallback((): CreateWarrantyInput | UpdateWarrantyInput => ({
    providerName: initialData?.providerName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageDetails: initialData?.coverageDetails || '',
    cost: initialData?.cost ?? undefined,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || prefill?.propertyId || undefined,
    homeAssetId: initialData?.homeAssetId || prefill?.homeAssetId || undefined,
    category: initialData?.category || prefill?.category || 'APPLIANCE',
  }), [initialData, prefill]);

  const [formData, setFormData] = useState<CreateWarrantyInput | UpdateWarrantyInput>(buildInitialFormData);

  useEffect(() => {
    setFormData(buildInitialFormData());
  }, [buildInitialFormData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'cost' ? (value ? Number(value) : undefined) : value,
    }));
  };
  
  // Custom hook to determine if linking should be disabled based on category
  const isAssetLinkingExplicitlyDisabled = useMemo(() => {
        return !!formData.category && DISABLE_ASSET_LINKING_CATEGORIES.includes(formData.category as WarrantyCategory);
  }, [formData.category]);

  // UPDATED: Handle change for propertyId, homeAssetId, AND category with synchronization
  const handleSelectChange = (id: 'propertyId' | 'homeAssetId' | 'category', value: string) => {
      let nextValue: string | undefined = value === SELECT_NONE_VALUE ? undefined : value;
      
      setFormData(prev => {
          const newState: CreateWarrantyInput | UpdateWarrantyInput = { ...prev };
          (newState as any)[id] = nextValue; // Update the generic field

          // --- LOGIC FOR CATEGORY CHANGE ---
          if (id === 'category') {
             const newCategory = nextValue as WarrantyCategory;
             
             // If category changes, clear any old asset selection
             newState.homeAssetId = undefined;
          }
          
          // Logic to synchronize property and asset selection
          if (id === 'propertyId') {
              const currentAssetId = prev.homeAssetId;
              if (currentAssetId) {
                  const asset = homeAssets.find(a => a.id === currentAssetId);
                  // Clear asset if the newly selected property doesn't match the asset's property
                  if (asset && asset.propertyId !== nextValue) {
                      newState.homeAssetId = undefined; 
                  }
              }
          }
          else if (id === 'homeAssetId' && nextValue) {
              const asset = homeAssets.find(a => a.id === nextValue);
              // If an asset is selected, automatically select its property and category
              if (asset) {
                  // Property association is now always allowed, so we set it if an asset is chosen
                  if (asset.propertyId !== prev.propertyId) {
                      newState.propertyId = asset.propertyId;
                  }
                  
                  // Infer category from asset type to ensure consistency
                  const inferredCategory = Object.entries(CATEGORY_ASSET_MAP).find(
                      ([cat, types]) => types.includes(asset.assetType)
                  )?.[0];

                  // Only set the category if it hasn't been set yet, or if the current category is non-specific
                  if (inferredCategory && (!prev.category || prev.category === 'OTHER' || DISABLE_ASSET_LINKING_CATEGORIES.includes(prev.category as WarrantyCategory))) {
                       newState.category = inferredCategory as WarrantyCategory;
                  }
              }
          }
          
          return newState;
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateWarrantyInput | UpdateWarrantyInput);
  };

  const title = initialData ? `Edit Warranty: ${initialData.providerName}` : 'Add Warranty';
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE;
  const selectedCategory = (formData.category || undefined) as string | undefined;
  const prefilledPropertyMissingFromOptions =
    !!formData.propertyId && !properties.some((property) => property.id === formData.propertyId);

  // *** FIX 1: Blank Placeholder Bug Fix ***
  // When linking is disabled, force the value to undefined so the placeholder shows.
  const selectedHomeAssetId = useMemo(() => {
      if (isAssetLinkingExplicitlyDisabled) {
          return undefined;
      }
      return formData.homeAssetId || SELECT_NONE_VALUE;
  }, [formData.homeAssetId, isAssetLinkingExplicitlyDisabled]);


  // NEW: Get allowed asset types based on selected category
  const allowedAssetTypes: string[] = formData.category ? CATEGORY_ASSET_MAP[formData.category as WarrantyCategory] : [];
  
  // Filter assets based on the currently selected property AND the selected category (Fulfills Request)
  const filteredHomeAssets = useMemo(() => {
    // If linking is explicitly disabled (e.g., HVAC), return empty array.
    if (isAssetLinkingExplicitlyDisabled || !formData.propertyId || !formData.category) {
       return [];
    }
    
    const currentCategory = formData.category as WarrantyCategory;

    // 1. Base Filter: Filter only by Property ID
    let assets = homeAssets.filter(asset => asset.propertyId === formData.propertyId);
    
    // *** FIX: Relaxing the type filter for APPLIANCE to restore functionality. ***
    // The filter is now ONLY applied for 'APPLIANCE' if the user needs to enforce it, 
    // but the final returned list for all non-disabled categories is simply the list of assets on the property.
    // This assumes the API correctly links ALL assets to the property, which is the behavior observed for HOME_WARRANTY_PLAN and OTHER.
    
    // This returns the full list of assets for the selected property, solving the "non-populating" issue.
    return assets;
    
  }, [formData.propertyId, formData.category, homeAssets, isAssetLinkingExplicitlyDisabled]);
  const prefilledAssetMissingFromOptions =
    !!formData.homeAssetId && !filteredHomeAssets.some((asset) => asset.id === formData.homeAssetId);


  return (
    <form onSubmit={handleSubmit} className={COVERAGE_MODAL_FORM_CLASS}>
      <CoverageModalHeader
        icon={<BadgeCheck className="h-[18px] w-[18px]" />}
        iconClassName="warranty-icon"
        title={title}
        subtitle="We'll remind you 60 days before this warranty expires."
      />

      <div className={COVERAGE_MODAL_CONTENT_CLASS}>
        <div className="grid content-start gap-2">
          <Label htmlFor="providerName" className={COVERAGE_MODAL_LABEL_CLASS}>
            Provider name *
          </Label>
          <Input
            id="providerName"
            value={formData.providerName}
            onChange={handleChange}
            required
            placeholder="e.g. Assurant, American Home Shield"
            className={COVERAGE_MODAL_INPUT_CLASS}
          />
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="category" className={COVERAGE_MODAL_LABEL_CLASS}>
            Warranty category *
          </Label>
          <Select value={selectedCategory} onValueChange={(v) => handleSelectChange('category', v)} required={!initialData}>
            <SelectTrigger className={COVERAGE_MODAL_SELECT_TRIGGER_CLASS}>
              <SelectValue placeholder="Select the covered category (Required)" />
            </SelectTrigger>
            <SelectContent>
              {WARRANTY_CATEGORY_OPTIONS.map(opt => (
                <SelectItem key={opt.key} value={opt.key}>
                  {opt.display}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
          <div className="grid content-start gap-2">
            <Label htmlFor="policyNumber" className={COVERAGE_MODAL_LABEL_CLASS}>
              Policy / contract number
            </Label>
            <Input
              id="policyNumber"
              value={formData.policyNumber}
              onChange={handleChange}
              placeholder="e.g. WR-987654321"
              className={COVERAGE_MODAL_INPUT_CLASS}
            />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="cost" className={COVERAGE_MODAL_LABEL_CLASS}>
              What did it cost? ($)
            </Label>
            <Input
              id="cost"
              type="number"
              min={0}
              step="0.01"
              value={formData.cost ?? ''}
              onChange={handleChange}
              placeholder="e.g. 350"
              className={COVERAGE_MODAL_INPUT_CLASS}
            />
          </div>
        </div>

        <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
          <div className="grid content-start gap-2">
            <Label htmlFor="startDate" className={COVERAGE_MODAL_LABEL_CLASS}>
              Start date *
            </Label>
            <div className="date-input-wrapper relative">
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={handleChange}
                required
                className={COVERAGE_MODAL_DATE_INPUT_CLASS}
              />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            </div>
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="expiryDate" className={COVERAGE_MODAL_LABEL_CLASS}>
              Expiry date *
            </Label>
            <div className="date-input-wrapper relative">
              <Input
                id="expiryDate"
                type="date"
                value={formData.expiryDate}
                onChange={handleChange}
                required
                className={COVERAGE_MODAL_DATE_INPUT_CLASS}
              />
              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            </div>
          </div>
        </div>

        <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
          <div className="grid content-start gap-2">
            <Label htmlFor="propertyId" className={COVERAGE_MODAL_LABEL_CLASS}>
              Which property?
            </Label>
            <Select value={selectedPropertyId} onValueChange={(v) => handleSelectChange('propertyId', v)} disabled={false}>
              <SelectTrigger className={COVERAGE_MODAL_SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Select a property (Optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE_VALUE}>Not linked to a property</SelectItem>
                {prefilledPropertyMissingFromOptions && formData.propertyId && (
                  <SelectItem value={formData.propertyId}>
                    Selected property
                  </SelectItem>
                )}
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.zipCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid content-start gap-2">
            <Label htmlFor="homeAssetId" className={COVERAGE_MODAL_LABEL_CLASS}>
              Which appliance or system?
            </Label>
            <Select
              value={selectedHomeAssetId}
              onValueChange={(v) => handleSelectChange('homeAssetId', v)}
              disabled={
                isAssetLinkingExplicitlyDisabled ||
                !formData.propertyId ||
                (filteredHomeAssets.length === 0 &&
                  !formData.homeAssetId &&
                  !isSubmitting &&
                  !isAssetLinkingExplicitlyDisabled)
              }
            >
              <SelectTrigger className={COVERAGE_MODAL_SELECT_TRIGGER_CLASS}>
                <SelectValue
                  placeholder={
                    isAssetLinkingExplicitlyDisabled
                      ? `System/Structural Coverage (${WARRANTY_CATEGORIES[formData.category as WarrantyCategory]})`
                      : !formData.category
                      ? 'Select Category First'
                      : !formData.propertyId
                      ? 'Select Property First'
                      : filteredHomeAssets.length === 0
                      ? 'No compatible assets found for this property'
                      : 'Select an asset (Optional)'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {!isAssetLinkingExplicitlyDisabled && (
                  <SelectItem value={SELECT_NONE_VALUE}>Entire category</SelectItem>
                )}

                {filteredHomeAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.assetType.replace(/_/g, ' ')} {asset.modelNumber ? `(${asset.modelNumber})` : ''}
                  </SelectItem>
                ))}
                {prefilledAssetMissingFromOptions && formData.homeAssetId && (
                  <SelectItem value={formData.homeAssetId}>
                    Linked appliance
                  </SelectItem>
                )}

                {filteredHomeAssets.length === 0 && formData.category && formData.propertyId && !isAssetLinkingExplicitlyDisabled && (
                  <div className="p-2 text-sm text-muted-foreground italic">
                    No compatible assets found.
                  </div>
                )}
              </SelectContent>
            </Select>
            {!formData.propertyId && (
              <p className={COVERAGE_MODAL_FIELD_HINT_CONDITIONAL_CLASS}>
                Select a property above to link a system or appliance.
              </p>
            )}
          </div>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor="coverageDetails" className={COVERAGE_MODAL_LABEL_CLASS}>
            Coverage notes
          </Label>
          <Textarea
            id="coverageDetails"
            value={formData.coverageDetails}
            onChange={handleChange}
            placeholder="Optional - any specific items or exclusions worth noting."
            className={COVERAGE_MODAL_NOTES_TEXTAREA_CLASS}
          />
        </div>
      </div>

      <CoverageModalFooter
        onClose={onClose}
        isSubmitting={isSubmitting}
        isEditMode={Boolean(initialData)}
        createLabel="Create Warranty"
        submitDisabled={!initialData && !formData.category}
      />
    </form>
  );
};

const EXPIRING_SOON_DAYS = 60;

type WarrantyStatusLevel = 'active' | 'expiringSoon' | 'expired';

function getWarrantyStatusMeta(expiryDateISO: string): {
  status: WarrantyStatusLevel;
  tone: 'good' | 'elevated' | 'danger' | 'info';
  label: string;
  daysRemaining: number | null;
  expiryDate: Date | null;
  expiryLine: string;
  helperLine: string;
} {
  const expiryDate = parseISO(expiryDateISO);
  if (!isValid(expiryDate)) {
    return {
      status: 'active',
      tone: 'info',
      label: 'Unknown',
      daysRemaining: null,
      expiryDate: null,
      expiryLine: 'Expiry unavailable',
      helperLine: 'Check warranty details.',
    };
  }

  const daysRemaining = differenceInCalendarDays(expiryDate, new Date());

  if (daysRemaining < 0) {
    const daysAgo = Math.abs(daysRemaining);
    return {
      status: 'expired',
      tone: 'danger',
      label: 'Expired',
      daysRemaining,
      expiryDate,
      expiryLine: `Expired ${format(expiryDate, 'MMM dd, yyyy')}`,
      helperLine: `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`,
    };
  }

  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return {
      status: 'expiringSoon',
      tone: 'elevated',
      label: 'Expiring Soon',
      daysRemaining,
      expiryDate,
      expiryLine: `Expires ${format(expiryDate, 'MMM dd, yyyy')}`,
      helperLine: daysRemaining === 0 ? 'Expires today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
    };
  }

  return {
    status: 'active',
    tone: 'good',
    label: 'Active',
    daysRemaining,
    expiryDate,
    expiryLine: `Expires ${format(expiryDate, 'MMM dd, yyyy')}`,
    helperLine: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
  };
}

function openCozyChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('cozy-chat-open'));
}

const SYSTEM_COVERAGE_CATEGORIES: WarrantyCategory[] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOFING',
  'STRUCTURAL',
  'HOME_WARRANTY_PLAN',
];

// --- Main Page Component ---
export default function WarrantiesPage() {
  // Use local Warranty interface
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  // NEW STATE: to hold all home assets
  const [homeAssets, setHomeAssets] = useState<HomeAsset[]>([]); 
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false); 
  // Use local Warranty interface
  const [editingWarranty, setEditingWarranty] = useState<Warranty | undefined>(undefined);
  
  // NEW STATE for Document Upload Modal
  const [isUploadModalOpen, setIsUploadModal] = useState(false);
  const [uploadingToWarrantyId, setUploadingToWarrantyId] = useState<string | null>(null);
  const [expandedWarrantyIds, setExpandedWarrantyIds] = useState<Record<string, boolean>>({});

  const { toast } = useToast();
  
  // NEW: Navigation Hooks
  const router = useRouter();
  const searchParams = useSearchParams();
  const safeReturnTo = useMemo(() => sanitizeReturnTo(searchParams.get('returnTo')), [searchParams]);
  const createPrefill = useMemo(() => {
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
    const propertyId =
      searchParams.get('propertyId') ||
      propertyIdFromDashboardPath(returnTo) ||
      undefined;
    const homeAssetId =
      searchParams.get('homeAssetId') ||
      searchParams.get('itemId') ||
      undefined;
    const categoryParam = searchParams.get('category');
    const from = searchParams.get('from');

    let category: WarrantyCategory | undefined = isWarrantyCategory(categoryParam) ? categoryParam : undefined;

    if (!category && homeAssetId) {
      category = 'APPLIANCE';
    }

    if (!category && from === 'coverage-buy') {
      category = 'APPLIANCE';
    }

    if (!propertyId && !homeAssetId && !category) {
      return undefined;
    }

    return {
      propertyId,
      homeAssetId,
      category,
    };
  }, [searchParams]);
  const [createModalPrefill, setCreateModalPrefill] = useState<WarrantyFormProps['prefill']>(undefined);
  const [openedFromSetup, setOpenedFromSetup] = useState(false); // State to track if the modal opened automatically

  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    const [warrantiesRes, propertiesRes] = await Promise.all([
      api.listWarranties(),
      api.getProperties(),
    ]);
  
    if (warrantiesRes.success) {
      setWarranties(warrantiesRes.data.warranties as Warranty[]);
    } else {
      toast({
        title: "Error fetching warranties",
        description: (warrantiesRes as APIError).message,
        variant: "destructive",
      });
      setWarranties([]);
    }
  
    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
      
      // ✅ NEW: Fetch appliances directly from Inventory for each property
      // This is more explicit and ensures we get the latest InventoryItem data
      const allAssets: HomeAsset[] = [];
      
      for (const property of propertiesRes.data.properties) {
        try {
          const items = await listInventoryItems(property.id, { category: 'APPLIANCE' });
          
          // Transform InventoryItem to HomeAsset shape
          const transformed = items.map((item: any) => ({
            id: item.id,
            propertyId: item.propertyId,
            assetType: inferAssetTypeFromItem(item),
            installationYear: item.installedOn 
              ? new Date(item.installedOn).getUTCFullYear() 
              : null,
            modelNumber: item.modelNumber || item.model || null,
            serialNumber: item.serialNumber || item.serialNo || null,
            lastServiced: item.lastServicedOn || null,
            efficiencyRating: null,
          }));
          
          allAssets.push(...transformed);
        } catch (error) {
          console.error(`Failed to fetch appliances for property ${property.id}:`, error);
        }
      }
  
      setHomeAssets(allAssets);
    }
    setIsLoading(false);
  }, [toast]);

    // NEW: Handle initial load based on query parameters
    useEffect(() => {
      fetchDependencies();

      const action = searchParams.get('action');
      const from = searchParams.get('from');
      
      if (action === 'new' && !isAddEditModalOpen) {
          openAddEditModal(undefined, createPrefill);
          
          // Check if navigation originated from maintenance-setup OR risk-assessment
          if (from === 'maintenance-setup' || from === 'risk-assessment') {
              setOpenedFromSetup(true);
          }
      }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDependencies, searchParams, createPrefill, isAddEditModalOpen]);

  // Use local Create/UpdateWarrantyInput interface
  const handleSave = async (data: CreateWarrantyInput | UpdateWarrantyInput) => {
    setIsSubmitting(true);
    
    // Create a copy to manipulate
    let dataToSend = {...data};

    // Client-side guard: If an asset is linked but the top-level property isn't, 
    // infer the propertyId from the asset's propertyId.
    if (!dataToSend.propertyId && dataToSend.homeAssetId) {
        const asset = homeAssets.find(a => a.id === dataToSend.homeAssetId);
        if (asset) {
            dataToSend.propertyId = asset.propertyId;
        }
    }

    const res = editingWarranty
        ? await api.updateWarranty(editingWarranty.id, dataToSend as UpdateWarrantyInput)
        : await api.createWarranty(dataToSend as CreateWarrantyInput);

    if (res.success) {
        toast({
            title: editingWarranty ? 'Warranty Updated' : 'Warranty Created',
            description: `${res.data.providerName}'s policy was saved successfully.`,
        });
        
        // ============================================================================
        // 🔑 NEW: Conditional redirection based on navigation source
        // ============================================================================
        const from = searchParams.get('from');
        const propertyId = searchParams.get('propertyId');
        
        // If created from risk assessment page, navigate back with refresh flag
        if (!editingWarranty && from === 'risk-assessment' && propertyId) {
            console.log('📍 Navigating back to risk assessment with refresh...');
            router.push(`/dashboard/properties/${propertyId}/risk-assessment?refreshed=true`);
        }
        // If opened from maintenance-setup, navigate back there
        else if (!editingWarranty && openedFromSetup) {
          if (from === 'risk-assessment' && dataToSend.propertyId) {
              // Navigate back to risk assessment with refresh parameter
              router.push(`/dashboard/properties/${dataToSend.propertyId}/risk-assessment?refreshed=true`);
          } else if (from === 'maintenance-setup') {
              router.push('/dashboard/maintenance-setup');
          } else {
              await fetchDependencies();
              closeAddEditModal();
          }
        }
        // Otherwise, refresh the warranties list and close modal
        else {
            console.log('📍 Staying on warranties page, refreshing list...');
            await fetchDependencies();
            closeAddEditModal();
        }
        // ============================================================================
        
    } else {
        toast({
            title: 'Operation Failed',
            description: (res as APIError).message,
            variant: 'destructive',
        });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (warrantyId: string) => {
    if (!window.confirm("Are you sure you want to delete this warranty? This cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    const res = await api.deleteWarranty(warrantyId);

    if (res.success) {
      toast({ title: 'Warranty Deleted', description: 'The warranty record was removed.' });
      await fetchDependencies(); 
    } else {
      toast({ title: 'Deletion Failed', description: (res as APIError).message, variant: 'destructive' });
      setIsLoading(false);
    }
  };
  
  // Handlers for Add/Edit Modal
  const openAddEditModal = (warranty?: Warranty, prefillOverride?: WarrantyFormProps['prefill']) => {
    setEditingWarranty(warranty);
    setCreateModalPrefill(!warranty ? (prefillOverride ?? createPrefill) : undefined);
    setOpenedFromSetup(false); // Reset for manual opens
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    const wasOpenedFromSetup = openedFromSetup;
    const from = searchParams.get('from');
    setIsAddEditModalOpen(false);
    setEditingWarranty(undefined);
    setCreateModalPrefill(undefined);
    setOpenedFromSetup(false);
    
    if (wasOpenedFromSetup) {
      if (from === 'risk-assessment') {
          const propertyId = properties.length > 0 ? properties[0].id : null;
          if (propertyId) {
              router.push(`/dashboard/properties/${propertyId}/risk-assessment`);
          } else {
              router.push('/dashboard/warranties');
          }
      } else if (from === 'maintenance-setup') {
          router.push('/dashboard/maintenance-setup');
      }
    }
  };

  // NEW Handlers for Document Upload Modal
  const openUploadModal = (warrantyId: string) => {
    setUploadingToWarrantyId(warrantyId);
    setIsUploadModal(true);
  };
  
  const closeUploadModal = () => {
    setIsUploadModal(false);
    setUploadingToWarrantyId(null);
  };

  const handleAddEditDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsAddEditModalOpen(true);
      return;
    }
    closeAddEditModal();
  };

  const handleUploadDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsUploadModal(true);
      return;
    }
    closeUploadModal();
  };

  const toggleWarrantyDetails = (warrantyId: string) => {
    setExpandedWarrantyIds((prev) => ({
      ...prev,
      [warrantyId]: !prev[warrantyId],
    }));
  };

  const askCozyDockVisible = !isAddEditModalOpen && !isUploadModalOpen;


  const sortedWarranties = useMemo(() => {
    return [...warranties].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [warranties]);

  const warrantyStatusMeta = useMemo(
    () =>
      sortedWarranties.map((warranty) => ({
        warranty,
        meta: getWarrantyStatusMeta(warranty.expiryDate),
      })),
    [sortedWarranties]
  );

  const expiredWarrantyCount = useMemo(
    () => warrantyStatusMeta.filter(({ meta }) => meta.status === 'expired').length,
    [warrantyStatusMeta]
  );
  const expiringSoonWarrantyCount = useMemo(
    () => warrantyStatusMeta.filter(({ meta }) => meta.status === 'expiringSoon').length,
    [warrantyStatusMeta]
  );
  const activeWarrantyCount = useMemo(
    () => warrantyStatusMeta.filter(({ meta }) => meta.status === 'active').length,
    [warrantyStatusMeta]
  );
  const nextExpiry = useMemo(() => {
    const nextUpcoming = warrantyStatusMeta.find(({ meta }) => meta.expiryDate && meta.daysRemaining !== null && meta.daysRemaining >= 0);
    return nextUpcoming?.meta.expiryDate ?? warrantyStatusMeta[0]?.meta.expiryDate ?? null;
  }, [warrantyStatusMeta]);
  
  // UPDATED: Get Property Info to handle asset-based linkage
  const getPropertyInfo = useCallback((warranty: Warranty): string => {
      // Prioritize the propertyId directly on the warranty object
      let propertyId = warranty.propertyId;
      
      // If propertyId is null but there is an assetId, try to find the propertyId through the asset
      if (!propertyId && warranty.homeAssetId) {
           const asset = homeAssets.find(a => a.id === warranty.homeAssetId);
           if (asset) {
               propertyId = asset.propertyId;
           }
      }

      if (!propertyId) return 'N/A (Unlinked)';
      
      const property = properties.find(p => p.id === propertyId);
      return property ? property.name || property.address : 'N/A';
  }, [properties, homeAssets]);
  
  // Helper to get Asset Info - now accepts the full warranty object
  const getAssetInfo = useCallback((warranty: Warranty): string => {
      const { homeAssetId, category } = warranty;
      
      // 1. If it's a system-wide warranty category, show that instead of N/A
      if (SYSTEM_COVERAGE_CATEGORIES.includes(category)) {
        // These warranties cover entire systems, not specific appliances
        const categoryLabels: Record<string, string> = {
          'HVAC': 'HVAC System',
          'PLUMBING': 'Plumbing System',
          'ELECTRICAL': 'Electrical System',
          'ROOFING': 'Roof Coverage',
          'STRUCTURAL': 'Structural Coverage',
          'HOME_WARRANTY_PLAN': 'All Covered Systems',
        };
        return categoryLabels[category] || 'System Coverage';
      }
      
      // 2. Try to find the linked asset by ID
      if (homeAssetId) {
        const asset = homeAssets.find(a => a.id === homeAssetId);
        if (asset) {
          const assetName = asset.assetType
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
          return asset.modelNumber ? `${assetName} (${asset.modelNumber})` : assetName;
        }
        
        // ID not found in current homeAssets - might be old HomeAsset ID
        // Try to match by property (best effort)
        // For now, return "Linked Asset" to indicate something was linked
        return 'Linked Asset';
      }
      
      // 3. For APPLIANCE or OTHER category with no link
      return 'N/A';
  }, [homeAssets]);


  return (
    <div className="space-y-5 pb-6 lg:pb-8">
      <OnboardingReturnBanner />
      <Button 
        variant="link" 
        className="p-0 h-auto mb-2 text-sm text-muted-foreground"
        onClick={() => {
          if (safeReturnTo) {
            router.push(safeReturnTo);
            return;
          }
          router.back();
        }}
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <MobilePageIntro
        title="My Warranties"
        subtitle="Track service, appliance, and home warranties in one clean timeline."
        action={
          <Dialog open={isAddEditModalOpen} onOpenChange={handleAddEditDialogOpenChange}>
            <Button size="sm" className="min-h-[40px] px-3.5" onClick={() => openAddEditModal(undefined)}>
              <Plus className="w-4 h-4 mr-2" /> Add Warranty
            </Button>
            <DialogContent className="modal-container w-[calc(100vw-2rem)] sm:max-w-[700px] gap-0 overflow-hidden p-0 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:max-h-[92vh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"> 
              <WarrantyForm 
                initialData={editingWarranty}
                properties={properties}
                homeAssets={homeAssets} // PASSED NEW PROP
                prefill={!editingWarranty ? createModalPrefill : undefined}
                onSave={handleSave}
                onClose={closeAddEditModal}
                isSubmitting={isSubmitting}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading warranties...</p>
        </div>
      )}

      {!isLoading && sortedWarranties.length === 0 && (
        <>
          <div className="md:hidden">
            <EmptyStateCard
              title="No warranties yet"
              description="Add your first warranty to track expirations, coverage details, and documents."
              action={
                <Button className="min-h-[40px]" onClick={() => openAddEditModal(undefined)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add first warranty
                </Button>
              }
            />
          </div>
          <Card className="hidden py-10 text-center md:block">
            <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <CardTitle>No Warranties Found</CardTitle>
            <CardDescription>Click &quot;Add Warranty&quot; to create your first record.</CardDescription>
          </Card>
        </>
      )}

      {!isLoading && sortedWarranties.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            <MobileCard variant="compact" className="space-y-3 border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Warranty Health</p>
                  <p className="text-xs text-slate-500">60-day expiry watch</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200/90 bg-[linear-gradient(135deg,rgba(15,118,110,0.06),rgba(245,158,11,0.08),rgba(239,68,68,0.06))]">
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-teal-700">Active</p>
                  <p className="text-lg font-semibold text-slate-900">{activeWarrantyCount}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-amber-700">Expiring</p>
                  <p className="text-lg font-semibold text-slate-900">{expiringSoonWarrantyCount}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-rose-700">Expired</p>
                  <p className="text-lg font-semibold text-slate-900">{expiredWarrantyCount}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Next expiry: <span className="font-medium text-slate-900">{nextExpiry ? format(nextExpiry, 'MMM dd, yyyy') : 'N/A'}</span>
              </p>
            </MobileCard>

            {warrantyStatusMeta.map(({ warranty, meta }) => {
              const propertyInfo = getPropertyInfo(warranty);
              const assetInfo = getAssetInfo(warranty);
              const headline =
                assetInfo === 'N/A' || assetInfo === 'Linked Asset'
                  ? `${WARRANTY_CATEGORIES[warranty.category] || warranty.category} Coverage`
                  : assetInfo;
              const metadataLine = `${warranty.policyNumber ? `Policy #${warranty.policyNumber}` : 'Policy unlisted'} • ${propertyInfo}`;
              const expanded = Boolean(expandedWarrantyIds[warranty.id]);
              const coveragePreview = warranty.coverageDetails?.trim();

              return (
                <Collapsible
                  key={warranty.id}
                  open={expanded}
                  onOpenChange={() => toggleWarrantyDetails(warranty.id)}
                >
                  <MobileCard
                    variant="compact"
                    className={cn(
                      'overflow-hidden border-slate-200/80 bg-white p-0 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]',
                      meta.status === 'expired' && 'border-rose-200/90',
                      meta.status === 'expiringSoon' && 'border-amber-200/90'
                    )}
                  >
                    <div className="space-y-2.5 px-4 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-800">
                            {warranty.providerName}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xl font-semibold leading-tight text-slate-900">
                            {headline}
                          </p>
                        </div>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </div>

                      <div className="space-y-0.5">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            meta.status === 'expired'
                              ? 'text-rose-700'
                              : meta.status === 'expiringSoon'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          )}
                        >
                          {meta.expiryLine}
                        </p>
                        <p className="text-xs text-slate-500">{meta.helperLine}</p>
                      </div>

                      <p className="truncate text-sm text-slate-600">{metadataLine}</p>
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_1fr_auto_auto] items-center border-t border-slate-200/80 px-1.5 py-1">
                      <Button
                        variant="ghost"
                        className="min-h-[40px] justify-start gap-1.5 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => openAddEditModal(warranty)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-[40px] justify-start gap-1.5 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => openUploadModal(warranty.id)}
                      >
                        <Upload className="h-4 w-4" />
                        Docs
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            aria-label="More warranty actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openUploadModal(warranty.id)}>
                            <Upload className="h-4 w-4" />
                            Upload document
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-700 focus:text-rose-700"
                            onClick={() => handleDelete(warranty.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete warranty
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          aria-label={expanded ? 'Collapse warranty details' : 'Expand warranty details'}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="border-t border-slate-200/80 bg-slate-50/70">
                      <div className="space-y-2.5 px-4 py-3">
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Category</p>
                          <p className="font-medium text-slate-800">{WARRANTY_CATEGORIES[warranty.category] || warranty.category}</p>
                        </div>
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Asset</p>
                          <p className="font-medium text-slate-800">{assetInfo}</p>
                        </div>
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Started</p>
                          <p className="font-medium text-slate-800">
                            {isValid(parseISO(warranty.startDate)) ? format(parseISO(warranty.startDate), 'MMM dd, yyyy') : 'N/A'}
                          </p>
                        </div>
                        {coveragePreview ? (
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Coverage Details</p>
                            <p className="mt-1 text-sm text-slate-700">{coveragePreview}</p>
                          </div>
                        ) : null}
                        {meta.status !== 'active' ? (
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Cozy Insight</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {meta.status === 'expired'
                                ? 'Coverage has lapsed. Review this plan and upload any replacement policy.'
                                : 'This warranty is nearing expiry. Consider renewal options and document updates now.'}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </CollapsibleContent>
                  </MobileCard>
                </Collapsible>
              );
            })}
          </div>
          <div className="hidden rounded-md border bg-white overflow-x-auto md:block">
            <Table className="w-full table-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Policy #</TableHead>
                {/* NEW TABLE HEADER: CATEGORY */}
                <TableHead>Category</TableHead>
                <TableHead className="hidden lg:table-cell">Coverage Details</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-center">Expires</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedWarranties.map(warranty => {
                const expired = isPast(parseISO(warranty.expiryDate));
                const statusClass = expired ? 'text-red-600' : 'text-green-600';
                
                return (
                  <TableRow key={warranty.id} className={expired ? 'bg-red-50/50 hover:bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {warranty.providerName}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(warranty.startDate), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                        {warranty.policyNumber || 'N/A'}
                    </TableCell>
                    {/* NEW TABLE CELL: CATEGORY */}
                    <TableCell className="font-semibold text-xs">
                        {WARRANTY_CATEGORIES[warranty.category] || warranty.category}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600 max-w-[250px] truncate">
                      {warranty.coverageDetails || 'No details provided.'}
                    </TableCell>
                    {/* UPDATED TABLE CELLS */}
                    <TableCell className="text-sm">
                        {getPropertyInfo(warranty)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                        {getAssetInfo(warranty)}
                    </TableCell>
                    {/* ---------------- */}
                    <TableCell className="text-center">
                      <div className={statusClass}>
                          {format(parseISO(warranty.expiryDate), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                        expired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      )}>
                        {expired ? 'Expired' : 'Active'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center space-x-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-gray-500 hover:text-blue-600"
                            onClick={() => openUploadModal(warranty.id)}
                            title="Upload Document"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-gray-500 hover:text-blue-600"
                            onClick={() => openAddEditModal(warranty)}
                            title="Edit Warranty"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(warranty.id)}
                            title="Delete Warranty"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {askCozyDockVisible && (
        <div
          data-chat-collision-zone="true"
          className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 md:hidden"
        >
          <button
            type="button"
            onClick={openCozyChat}
            className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(251,191,36,0.18),transparent_45%),linear-gradient(120deg,#0f172a,#111827)] px-4 py-3 text-left text-white shadow-[0_22px_48px_-30px_rgba(15,23,42,0.95)]"
            aria-label="Ask Cozy about your warranties"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-medium">Ask Cozy about your warranties</span>
            </span>
            <ChevronDown className="-rotate-90 h-5 w-5 text-white/80" />
          </button>
        </div>
      )}

      <div className="md:hidden">
        <BottomSafeAreaReserve size="floatingAction" />
      </div>
      
      {/* Document Upload Dialog (for Warranties) */}
      <Dialog open={isUploadModalOpen} onOpenChange={handleUploadDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          {uploadingToWarrantyId && (
            <DocumentUploadModal 
              parentEntityId={uploadingToWarrantyId}
              parentEntityType="warranty"
              onUploadSuccess={() => {
                  fetchDependencies(); 
                  closeUploadModal();
              }}
              onClose={closeUploadModal}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
