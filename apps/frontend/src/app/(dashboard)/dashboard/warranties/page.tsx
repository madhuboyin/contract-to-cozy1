// apps/frontend/src/app/(dashboard)/dashboard/warranties/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Wrench, Trash2, Edit, X, Save, Upload, ExternalLink, AlertCircle } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
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
// NEW IMPORTS for Table structure
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
// NEW: CATEGORY-TO-ASSET MAPPING (Fulfills Request)
// Maps a WarrantyCategory to an array of compatible HomeAsset.assetType strings.
// Note: assetType is the internal string value (e.g., HVAC_FURNACE, REFRIGERATOR)
// ============================================================================
const CATEGORY_ASSET_MAP: Record<WarrantyCategory, string[]> = {
    APPLIANCE: ['REFRIGERATOR', 'OVEN', 'DISHWASHER', 'WASHER', 'DRYER', 'MICROWAVE', 'GARBAGE_DISPOSAL'],
    HVAC: ['HVAC_FURNACE', 'HEAT_PUMP', 'CENTRAL_AC'],
    PLUMBING: ['WATER_HEATER', 'SUMP_PUMP', 'SEPTIC_SYSTEM'],
    ELECTRICAL: ['ELECTRICAL_PANEL', 'GENERATOR'],
    ROOFING: ['ROOF'], // Can be linked if roof is added as an asset type
    STRUCTURAL: ['FOUNDATION', 'SIDING', 'GARAGE_DOOR'], // If these become asset types
    // These categories can cover multiple, non-specific or undefined assets
    HOME_WARRANTY_PLAN: [], 
    OTHER: [],
};


// Placeholder for "None" option, necessary to avoid Radix UI error on value=""
const SELECT_NONE_VALUE = '__NONE__';

// --- Document Type Constants for UI (NEW) ---
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
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('OTHER');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) {
      toast({ title: "Error", description: "Please select a file and provide a name.", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    
    const inputData: DocumentUploadInput = {
        name,
        type,
        description: description || undefined,
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
      toast({ title: 'Document Uploaded', description: `"${res.data.name}" linked successfully.` });
      onUploadSuccess();
    } else {
      toast({ 
        title: 'Upload Failed', 
        description: (res as APIError).message, 
        variant: 'destructive' 
      });
    }
    setIsUploading(false);
  };
  
  const title = `Upload Document for ${parentEntityType.charAt(0).toUpperCase() + parentEntityType.slice(1)}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="file">File to Upload *</Label>
        <Input 
          id="file" 
          type="file" 
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} 
          required 
          disabled={isUploading}
        />
        {file && <p className="text-xs text-muted-foreground">Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Document Name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={isUploading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="type">Document Type</Label>
           <Select 
            value={type} 
            onValueChange={(v) => setType(v as DocumentType)}
            disabled={isUploading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map(dt => (
                <SelectItem key={dt} value={dt}>
                  {/* Convert DOCUMENT_TYPE_ENUM_NAME to "Document Type Enum Name" for display */}
                  {dt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={isUploading} />
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isUploading || !file || !name}>
          {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />} 
          Upload & Save
        </Button>
      </DialogFooter>
    </form>
  );
};


// --- Warranty Form Component ---
interface WarrantyFormProps {
  initialData?: Warranty;
  properties: Property[];
  homeAssets: HomeAsset[];
  onSave: (data: CreateWarrantyInput | UpdateWarrantyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const WarrantyForm = ({ initialData, properties, homeAssets, onSave, onClose, isSubmitting }: WarrantyFormProps) => {
  const [formData, setFormData] = useState<CreateWarrantyInput | UpdateWarrantyInput>({
    providerName: initialData?.providerName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageDetails: initialData?.coverageDetails || '',
    cost: initialData?.cost || undefined,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || undefined,
    homeAssetId: initialData?.homeAssetId || undefined, 
    
    // *** NEW FIELD: CATEGORY (Required) ***
    category: initialData?.category || ('' as WarrantyCategory),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'cost' ? (value ? parseFloat(value) : undefined) : value,
    }));
  };
  
  // UPDATED: Handle change for propertyId, homeAssetId, AND category with synchronization
  const handleSelectChange = (id: 'propertyId' | 'homeAssetId' | 'category', value: string) => {
      let nextValue: string | undefined = value === SELECT_NONE_VALUE ? undefined : value;
      
      setFormData(prev => {
          const newState: CreateWarrantyInput | UpdateWarrantyInput = { ...prev };
          (newState as any)[id] = nextValue; // Update the generic field

          // --- LOGIC FOR CATEGORY CHANGE ---
          if (id === 'category') {
             // If category changes, invalidate asset selection to force re-filter
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
                  if (asset.propertyId !== prev.propertyId) {
                      newState.propertyId = asset.propertyId;
                  }
                  
                  // Infer category from asset type to ensure consistency
                  const inferredCategory = Object.entries(CATEGORY_ASSET_MAP).find(
                      ([cat, types]) => types.includes(asset.assetType)
                  )?.[0];

                  if (inferredCategory && inferredCategory !== prev.category) {
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

  const title = initialData ? `Edit Warranty: ${initialData.providerName}` : 'Add New Warranty';
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE;
  const selectedHomeAssetId = formData.homeAssetId || SELECT_NONE_VALUE;
  const selectedCategory = formData.category || SELECT_NONE_VALUE;

  // NEW: Get allowed asset types based on selected category
  const allowedAssetTypes: string[] = formData.category ? CATEGORY_ASSET_MAP[formData.category as WarrantyCategory] : [];
  const isSystemOrApplianceCategory = allowedAssetTypes.length > 0;

  // Filter assets based on the currently selected property AND the selected category (Fulfills Request)
  const filteredHomeAssets = useMemo(() => {
    if (!formData.propertyId || !formData.category) {
       return [];
    }
    
    // Only filter by category if it's a specific system/appliance category
    if (isSystemOrApplianceCategory) {
        return homeAssets.filter(asset => 
            asset.propertyId === formData.propertyId && 
            allowedAssetTypes.includes(asset.assetType)
        );
    }
    
    // If category is General/Structural/Other, show all assets for the property, 
    // though linking is optional/discouraged for these types.
    return homeAssets.filter(asset => asset.propertyId === formData.propertyId);
    
  }, [formData.propertyId, formData.category, homeAssets, allowedAssetTypes, isSystemOrApplianceCategory]);


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="providerName">Provider Name *</Label>
        <Input id="providerName" value={formData.providerName} onChange={handleChange} required />
      </div>

      {/* NEW: CATEGORY SELECTION (Fulfills Request 1 - replaces "General" with specific categories) */}
      <div className="grid gap-2">
        <Label htmlFor="category">Warranty Category *</Label>
        <Select 
            value={selectedCategory} 
            onValueChange={(v) => handleSelectChange('category', v)}
            required={!initialData} // Always required on creation
        >
          <SelectTrigger>
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

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="policyNumber">Policy Number</Label>
          <Input id="policyNumber" value={formData.policyNumber} onChange={handleChange} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cost">Cost ($)</Label>
          <Input id="cost" type="number" step="0.01" value={formData.cost ?? ''} onChange={handleChange} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Start Date *</Label>
          <Input id="startDate" type="date" value={formData.startDate} onChange={handleChange} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="expiryDate">Expiry Date *</Label>
          <Input id="expiryDate" type="date" value={formData.expiryDate} onChange={handleChange} required />
        </div>
      </div>

      {/* UPDATED: Property and Asset Selection in one row */}
      <div className="grid sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="propertyId">Associated Property</Label>
            <Select 
              value={selectedPropertyId} 
              onValueChange={(v) => handleSelectChange('propertyId', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a property (Optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE_VALUE}>
                  None (Not linked to a specific property)
                </SelectItem> 
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.zipCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="homeAssetId">Linked Home System/Appliance</Label>
            <Select 
              value={selectedHomeAssetId} 
              onValueChange={(v) => handleSelectChange('homeAssetId', v)}
              // Logic: Disable if NO Category OR NO Property is selected, OR if the filtered list is empty.
              disabled={!formData.category || !formData.propertyId || (filteredHomeAssets.length === 0 && !isSubmitting)} 
            >
              <SelectTrigger>
                <SelectValue 
                    placeholder={
                       !formData.category
                           ? 'Select Category First'
                           : !formData.propertyId
                           ? 'Select Property First'
                           : filteredHomeAssets.length === 0
                               ? `No ${formData.category} Assets found for this property` 
                               : 'Select an Asset (Optional)'
                    }
                />
              </SelectTrigger>
              <SelectContent>
                {/* Updated the generic "None" option text */}
                <SelectItem value={SELECT_NONE_VALUE}> 
                  None (Covers entire category, e.g., All Plumbing Lines)
                </SelectItem> 
                {filteredHomeAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.assetType.replace(/_/g, ' ')} {asset.modelNumber ? `(${asset.modelNumber})` : ''}
                  </SelectItem>
                ))}
                
                {filteredHomeAssets.length === 0 && formData.category && formData.propertyId && (
                    <div className="p-2 text-sm text-muted-foreground italic">
                        No compatible assets found.
                    </div>
                )}
              </SelectContent>
            </Select>
          </div>
      </div>


      <div className="grid gap-2">
        <Label htmlFor="coverageDetails">Coverage Details</Label>
        <Textarea id="coverageDetails" value={formData.coverageDetails} onChange={handleChange} rows={3} />
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button 
          type="submit" 
          // Disable submit if category is not selected on a new form
          disabled={isSubmitting || (!initialData && !formData.category)} 
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
          {initialData ? 'Save Changes' : 'Create Warranty'}
        </Button>
      </DialogFooter>
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
  const [openedFromSetup, setOpenedFromSetup] = useState(false); // State to track if the modal opened automatically

  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    const [warrantiesRes, propertiesRes] = await Promise.all([
      api.listWarranties(),
      // Assuming api.getProperties() now fetches nested homeAssets
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
      
      // NEW LOGIC: Flatten assets from all properties for easy lookup
      const allAssets: HomeAsset[] = propertiesRes.data.properties
          .flatMap((p: Property) => p.homeAssets || [])
          .filter((asset): asset is HomeAsset => !!asset.id); 

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
        openAddEditModal(undefined);
        
        // Check if navigation originated from the maintenance setup page
        if (from === 'maintenance-setup') {
            setOpenedFromSetup(true);
        }
    }

  }, [fetchDependencies, searchParams]);

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
      
      // NEW: Conditional redirection after successful creation
      if (!editingWarranty && openedFromSetup) {
          router.push('/dashboard/maintenance-setup'); // Navigate back to setup page
      } else {
          await fetchDependencies(); // Refresh list to show new/updated item
          closeAddEditModal();
      }
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
  const openAddEditModal = (warranty?: Warranty) => {
    setEditingWarranty(warranty);
    setOpenedFromSetup(false); // Reset for manual opens
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    const wasOpenedFromSetup = openedFromSetup;
    setIsAddEditModalOpen(false);
    setEditingWarranty(undefined);
    setOpenedFromSetup(false);
    
    if (wasOpenedFromSetup) {
        // If canceled after being opened from maintenance-setup, navigate back.
        router.push('/dashboard/maintenance-setup');
    } else if (searchParams.has('action') || searchParams.has('from')) {
        // Otherwise, clean up the URL without navigating away from the current page.
        router.replace('/dashboard/warranties', { scroll: false });
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
  
  // NEW: Helper to get Asset Info
  const getAssetInfo = useCallback((assetId: string | null): string => {
      if (!assetId) return 'N/A';
      const asset = homeAssets.find(a => a.id === assetId);
      if (asset) {
        // Format the assetType from SNAKE_CASE to "Title Case"
        const assetName = asset.assetType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        return asset.modelNumber ? `${assetName} (${asset.modelNumber})` : assetName;
      }
      return 'N/A';
  }, [homeAssets]);


  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> My Home Warranties
        </h2>
        
        <Dialog open={isAddEditModalOpen} onOpenChange={closeAddEditModal}>
          <Button onClick={() => openAddEditModal(undefined)}>
            <Plus className="w-4 h-4 mr-2" /> Add Warranty
          </Button>
          {/* FIX: Increased max-width from sm:max-w-[500px] to sm:max-w-[700px] 
             to accommodate the new dual-column dropdowns without overlap/overflow. */}
          <DialogContent className="sm:max-w-[700px]"> 
            <WarrantyForm 
              initialData={editingWarranty}
              properties={properties}
              homeAssets={homeAssets} // PASSED NEW PROP
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
          <CardDescription>Click "Add Warranty" to create your first record.</CardDescription>
        </Card>
      )}

      {!isLoading && sortedWarranties.length > 0 && (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Provider</TableHead>
                <TableHead className="w-[150px]">Policy #</TableHead>
                {/* NEW TABLE HEADER: CATEGORY */}
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Coverage Details</TableHead>
                <TableHead className="w-[120px]">Property</TableHead>
                <TableHead className="w-[150px]">Asset</TableHead>
                <TableHead className="w-[120px] text-center">Expires</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
                <TableHead className="w-[120px] text-center">Actions</TableHead>
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
                        {getAssetInfo(warranty.homeAssetId)}
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
      )}
      
      {/* Document Upload Dialog (for Warranties) */}
      <Dialog open={isUploadModalOpen} onOpenChange={closeUploadModal}>
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