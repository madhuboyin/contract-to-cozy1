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
// FIX: Ensure APIError is explicitly imported from types
import { Warranty, CreateWarrantyInput, UpdateWarrantyInput, Property, APIResponse, APIError, Document, DocumentUploadInput, DocumentType } from '@/types';
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

// --- Document Upload Modal Component (NEW) ---
// (omitted for brevity, content remains the same)
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
// (omitted for brevity, content remains the same)
interface WarrantyFormProps {
  initialData?: Warranty;
  properties: Property[];
  onSave: (data: CreateWarrantyInput | UpdateWarrantyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const WarrantyForm = ({ initialData, properties, onSave, onClose, isSubmitting }: WarrantyFormProps) => {
  const [formData, setFormData] = useState<CreateWarrantyInput | UpdateWarrantyInput>({
    providerName: initialData?.providerName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageDetails: initialData?.coverageDetails || '',
    cost: initialData?.cost || undefined,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || undefined,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'cost' ? (value ? parseFloat(value) : undefined) : value,
    }));
  };
  
  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, propertyId: value === SELECT_NONE_VALUE ? undefined : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateWarrantyInput | UpdateWarrantyInput);
  };

  const title = initialData ? `Edit Warranty: ${initialData.providerName}` : 'Add New Warranty';
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE;


  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="providerName">Provider Name *</Label>
        <Input id="providerName" value={formData.providerName} onChange={handleChange} required />
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

      <div className="grid gap-2">
        <Label htmlFor="propertyId">Associated Property</Label>
        <Select 
          value={selectedPropertyId} 
          onValueChange={handleSelectChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a property (Optional)" />
          </SelectTrigger>
          <SelectContent>
             <SelectItem value={SELECT_NONE_VALUE}>
                None (General Warranty)
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
        <Label htmlFor="coverageDetails">Coverage Details</Label>
        <Textarea id="coverageDetails" value={formData.coverageDetails} onChange={handleChange} rows={3} />
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
          {initialData ? 'Save Changes' : 'Create Warranty'}
        </Button>
      </DialogFooter>
    </form>
  );
};

// --- Documents View Component ---
// (omitted for brevity, content remains the same, but it's not strictly needed for the table view)


// --- Main Page Component ---
export default function WarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false); 
  const [editingWarranty, setEditingWarranty] = useState<Warranty | undefined>(undefined);
  
  // NEW STATE for Document Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
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
      api.getProperties(),
    ]);

    if (warrantiesRes.success) {
      setWarranties(warrantiesRes.data.warranties);
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

  }, [fetchDependencies]);

  const handleSave = async (data: CreateWarrantyInput | UpdateWarrantyInput) => {
    setIsSubmitting(true);
    let res: APIResponse<Warranty>;
    
    if (editingWarranty) {
      res = await api.updateWarranty(editingWarranty.id, data as UpdateWarrantyInput);
    } else {
      res = await api.createWarranty(data as CreateWarrantyInput);
    }

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
    setIsAddEditModalOpen(false);
    setEditingWarranty(undefined);
    // Clear the 'action' and 'from' parameters from the URL history on close
    if (searchParams.has('action') || searchParams.has('from')) {
        router.replace('/dashboard/warranties', { scroll: false });
    }
  };

  // NEW Handlers for Document Upload Modal
  const openUploadModal = (warrantyId: string) => {
    setUploadingToWarrantyId(warrantyId);
    setIsUploadModalOpen(true);
  };
  
  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadingToWarrantyId(null);
  };


  const sortedWarranties = useMemo(() => {
    return [...warranties].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [warranties]);
  
  const getPropertyInfo = useCallback((propertyId: string | null) => {
      if (!propertyId) return 'General';
      const property = properties.find(p => p.id === propertyId);
      return property ? property.name || property.address : 'N/A';
  }, [properties]);


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
          <DialogContent className="sm:max-w-[500px]">
            <WarrantyForm 
              initialData={editingWarranty}
              properties={properties}
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
                <TableHead className="hidden lg:table-cell">Coverage Details</TableHead>
                <TableHead className="w-[100px]">Property</TableHead>
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
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600 max-w-[250px] truncate">
                      {warranty.coverageDetails || 'No details provided.'}
                    </TableCell>
                    <TableCell className="text-sm">
                        {getPropertyInfo(warranty.propertyId)}
                    </TableCell>
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