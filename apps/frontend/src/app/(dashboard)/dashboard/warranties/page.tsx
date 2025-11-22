// apps/frontend/src/app/(dashboard)/dashboard/warranties/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Wrench, Trash2, Edit, X, Save, Upload, ExternalLink } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Warranty, CreateWarrantyInput, UpdateWarrantyInput, Property, APIResponse, APIError, Document, DocumentUploadInput, DocumentType } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

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
        description: res.message, 
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
// --- End Document Upload Modal Component ---


// --- Warranty Form Component ---
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
const DocumentsView = ({ documents }: { documents: Warranty['documents'] }) => {
  if (!documents || documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No documents associated with this warranty.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {documents.map(doc => (
        <li key={doc.id} className="flex items-center justify-between p-2 border rounded-md">
          <div className="flex items-center">
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            <span className="text-sm font-medium truncate">{doc.name}</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs">
              View <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
};


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
        description: warrantiesRes.message,
        variant: "destructive",
      });
      setWarranties([]);
    }

    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
    }
    setIsLoading(false);
  }, [toast]); 

  // Initial Data Fetch
  useEffect(() => {
    fetchDependencies();
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
      await fetchDependencies(); 
      setIsAddEditModalOpen(false);
      setEditingWarranty(undefined);
    } else {
      toast({
        title: 'Operation Failed',
        description: res.message,
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
      toast({ title: 'Deletion Failed', description: res.message, variant: 'destructive' });
      setIsLoading(false);
    }
  };
  
  // Handlers for Add/Edit Modal
  const openAddEditModal = (warranty?: Warranty) => {
    setEditingWarranty(warranty);
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    setIsAddEditModalOpen(false);
    setEditingWarranty(undefined);
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedWarranties.map(warranty => {
            const isExpired = isPast(parseISO(warranty.expiryDate));
            const property = properties.find(p => p.id === warranty.propertyId);
            
            return (
              <Card 
                key={warranty.id} 
                className={cn(
                  "flex flex-col",
                  isExpired ? "border-red-400 bg-red-50/50" : "border-gray-200"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle 
                      className={cn(
                        "text-lg",
                        isExpired && "text-red-700"
                      )}
                    >
                      {warranty.providerName}
                    </CardTitle>
                    <div className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                      style={{ backgroundColor: isExpired ? 'rgb(220 38 38)' : 'rgb(37 99 235)' }}
                    >
                      {isExpired ? 'EXPIRED' : format(parseISO(warranty.expiryDate), 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <CardDescription>
                    Policy: {warranty.policyNumber || 'N/A'} 
                    {property && ` | Property: ${property.name || property.address}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-3 text-sm">
                    <p className="text-gray-600 line-clamp-2">{warranty.coverageDetails || 'No detailed coverage summary provided.'}</p>
                    <p className="font-medium text-gray-700">Cost: {warranty.cost ? `$${warranty.cost.toFixed(2)}` : 'N/A'}</p>
                    <div className="border-t pt-3">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-1 text-gray-600">
                            <FileText className="w-3 h-3" /> Documents ({warranty.documents.length})
                        </h4>
                        <DocumentsView documents={warranty.documents} />
                    </div>
                </CardContent>
                <div className="flex border-t">
                  {/* NEW: Upload Button - calls the new openUploadModal handler */}
                  <Button variant="ghost" className="w-1/3 rounded-none text-green-600" onClick={() => openUploadModal(warranty.id)}>
                    <Upload className="w-4 h-4 mr-1" /> Upload
                  </Button>
                  <Button variant="ghost" className="w-1/3 rounded-none text-blue-600" onClick={() => openAddEditModal(warranty)}>
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="ghost" className="w-1/3 rounded-none rounded-br-lg text-red-600 hover:bg-red-50" onClick={() => handleDelete(warranty.id)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* NEW: Document Upload Dialog (for Warranties) */}
      <Dialog open={isUploadModalOpen} onOpenChange={closeUploadModal}>
        <DialogContent className="sm:max-w-[500px]">
          {uploadingToWarrantyId && (
            <DocumentUploadModal 
              parentEntityId={uploadingToWarrantyId}
              parentEntityType="warranty"
              onUploadSuccess={() => {
                  // After successful upload, refresh the list and close the modal
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