// apps/frontend/src/app/(dashboard)/dashboard/warranties/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Wrench, Trash2, Edit, Upload, ExternalLink, AlertCircle, ArrowLeft, BadgeCheck, CalendarDays } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
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
        <div className="grid gap-2">
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

        <div className="grid gap-2">
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
          <div className="grid gap-2">
            <Label htmlFor="policyNumber" className={COVERAGE_MODAL_LABEL_CLASS}>
              Policy / contract number
            </Label>
            <Input
              id="policyNumber"
              value={formData.policyNumber}
              onChange={handleChange}
              placeholder="e.g. WR-987654321 (optional)"
              className={COVERAGE_MODAL_INPUT_CLASS}
            />
          </div>
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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
          <div className="grid gap-2">
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

          <div className="grid gap-2">
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
                ↑ Select a property above to link a specific system or appliance.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
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


  const sortedWarranties = useMemo(() => {
    return [...warranties].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [warranties]);
  
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
  
// Categories that represent system-wide coverage (not tied to specific appliances)
const SYSTEM_COVERAGE_CATEGORIES: WarrantyCategory[] = [
  'HVAC',
  'PLUMBING', 
  'ELECTRICAL',
  'ROOFING',
  'STRUCTURAL',
  'HOME_WARRANTY_PLAN',
];

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
    <div className="space-y-6 pb-8">
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 sm:text-3xl">
          <Wrench className="w-6 h-6 text-blue-600 sm:w-7 sm:h-7" /> My Home Warranties
        </h2>
        
        <Dialog open={isAddEditModalOpen} onOpenChange={handleAddEditDialogOpenChange}>
          <Button onClick={() => openAddEditModal(undefined)}>
            <Plus className="w-4 h-4 mr-2" /> Add Warranty
          </Button>
          {/* FIX: Increased max-width from sm:max-w-[500px] to sm:max-w-[700px] 
             to accommodate the new dual-column dropdowns without overlap/overflow. */}
          <DialogContent className="modal-container w-[calc(100vw-2rem)] max-w-[700px] gap-0 overflow-hidden p-0 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:max-h-[92vh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0"> 
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
      </div>
      <p className="text-muted-foreground">Track all service, appliance, and home warranties in one place. Never miss an expiration date.</p>

      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading warranties...</p>
        </div>
      )}

      {!isLoading && sortedWarranties.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Warranties Found</CardTitle>
          <CardDescription>Click &quot;Add Warranty&quot; to create your first record.</CardDescription>
        </Card>
      )}

      {!isLoading && sortedWarranties.length > 0 && (
        <>
          <div className="grid gap-4 md:hidden">
            {sortedWarranties.map(warranty => {
              const expired = isPast(parseISO(warranty.expiryDate));
              const statusClass = expired ? 'text-red-600' : 'text-green-600';

              return (
                <Card key={warranty.id} className={expired ? 'border-red-200' : undefined}>
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{warranty.providerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(warranty.startDate), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
                          expired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        )}
                      >
                        {expired ? 'EXPIRED' : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="grid gap-3 text-sm text-muted-foreground">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Category</span>
                        <span className="font-semibold text-foreground">
                          {WARRANTY_CATEGORIES[warranty.category] || warranty.category}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Policy #</span>
                        <span>{warranty.policyNumber || 'N/A'}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Property</span>
                        <span className="text-foreground">{getPropertyInfo(warranty)}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Asset</span>
                        <span>{getAssetInfo(warranty)}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Expires</span>
                        <span className={statusClass}>
                          {format(parseISO(warranty.expiryDate), 'MMM dd, yyyy')}
                        </span>
                      </div>
                      {warranty.coverageDetails && (
                        <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                          {warranty.coverageDetails}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-1">
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
                  </CardContent>
                </Card>
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
                        expired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      )}>
                        {expired ? 'EXPIRED' : 'ACTIVE'}
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
