// apps/frontend/src/app/(dashboard)/dashboard/insurance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Shield, Trash2, Edit, X, Save, ExternalLink, Upload } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InsurancePolicy, CreateInsurancePolicyInput, UpdateInsurancePolicyInput, Property, APIResponse, APIError, Document, DocumentType, DocumentUploadInput } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// Placeholder for "None" option, necessary to avoid Radix UI error on value=""
const SELECT_NONE_VALUE = '__NONE__';

// --- Document Type Constants for UI ---
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

// --- Document Upload Modal Component (Integrated) ---
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


// --- Insurance Policy Form Component (PolicyForm remains the same) ---
interface PolicyFormProps {
  initialData?: InsurancePolicy;
  properties: Property[];
  onSave: (data: CreateInsurancePolicyInput | UpdateInsurancePolicyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const PolicyForm = ({ initialData, properties, onSave, onClose, isSubmitting }: PolicyFormProps) => {
  const [formData, setFormData] = useState<CreateInsurancePolicyInput | UpdateInsurancePolicyInput>({
    carrierName: initialData?.carrierName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageType: initialData?.coverageType || 'Homeowner',
    premiumAmount: initialData?.premiumAmount || 0,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || undefined,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'premiumAmount' ? (value ? parseFloat(value) : 0) : value,
    }));
  };

  const handleSelectChange = (key: keyof (CreateInsurancePolicyInput), value: string) => {
    setFormData(prev => ({ ...prev, [key]: value === SELECT_NONE_VALUE ? undefined : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateInsurancePolicyInput | UpdateInsurancePolicyInput);
  };

  const title = initialData ? `Edit Policy: ${initialData.carrierName}` : 'Add New Insurance Policy';
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="carrierName">Insurance Carrier *</Label>
        <Input id="carrierName" value={formData.carrierName} onChange={handleChange} required />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="policyNumber">Policy Number *</Label>
          <Input id="policyNumber" value={formData.policyNumber} onChange={handleChange} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="premiumAmount">Annual Premium ($) *</Label>
          <Input id="premiumAmount" type="number" step="0.01" value={formData.premiumAmount ?? ''} onChange={handleChange} required />
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

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="coverageType">Coverage Type</Label>
          <Select 
            value={formData.coverageType || SELECT_NONE_VALUE} 
            onValueChange={(v) => handleSelectChange('coverageType', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
               <SelectItem value={SELECT_NONE_VALUE}>None / N/A</SelectItem>
              <SelectItem value="Homeowner">Homeowner</SelectItem>
              <SelectItem value="Landlord">Landlord</SelectItem>
              <SelectItem value="Flood">Flood</SelectItem>
              <SelectItem value="Renter">Renter</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                None (General Policy)
              </SelectItem>
              {properties.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.zipCode})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} 
          {initialData ? 'Save Changes' : 'Create Policy'}
        </Button>
      </DialogFooter>
    </form>
  );
};

// --- Documents View Component (Reused from Warranties) ---
const DocumentsView = ({ documents }: { documents: InsurancePolicy['documents'] }) => {
  if (!documents || documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No documents associated with this policy.</p>
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
export default function InsurancePage() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false); 
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | undefined>(undefined);
  
  // NEW STATE for Document Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadingToPolicyId, setUploadingToPolicyId] = useState<string | null>(null);

  const { toast } = useToast();
  
  // FIX: Wrap fetchDependencies in useCallback and ensure proper loading state management
  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    const [policiesRes, propertiesRes] = await Promise.all([
      api.listInsurancePolicies(),
      api.getProperties(),
    ]);

    if (policiesRes.success) {
      setPolicies(policiesRes.data.policies);
    } else {
      toast({
        title: "Error fetching policies",
        description: policiesRes.message,
        variant: "destructive",
      });
      setPolicies([]);
    }

    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
    }
    setIsLoading(false);
  }, [toast]); // Dependency on toast is included as good practice

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const handleSave = async (data: CreateInsurancePolicyInput | UpdateInsurancePolicyInput) => {
    setIsSubmitting(true);
    let res: APIResponse<InsurancePolicy>;
    
    if (editingPolicy) {
      res = await api.updateInsurancePolicy(editingPolicy.id, data as UpdateInsurancePolicyInput);
    } else {
      res = await api.createInsurancePolicy(data as CreateInsurancePolicyInput);
    }

    if (res.success) {
      toast({
        title: editingPolicy ? 'Policy Updated' : 'Policy Created',
        description: `${res.data.carrierName}'s policy was saved successfully.`,
      });
      await fetchDependencies(); // Refresh list to show new/updated item
      setIsAddEditModalOpen(false);
      setEditingPolicy(undefined);
    } else {
      toast({
        title: 'Operation Failed',
        description: (res as APIError).message,
        variant: 'destructive',
      });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (policyId: string) => {
    if (!window.confirm("Are you sure you want to delete this insurance policy? This cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    const res = await api.deleteInsurancePolicy(policyId);

    if (res.success) {
      toast({ title: 'Policy Deleted', description: 'The insurance policy record was removed.' });
      await fetchDependencies(); // Refresh list to remove deleted item
    } else {
      toast({ title: 'Deletion Failed', description: (res as APIError).message, variant: 'destructive' });
      setIsLoading(false);
    }
  };
  
  // Update signature to accept InsurancePolicy | undefined
  const openAddEditModal = (policy?: InsurancePolicy) => {
    setEditingPolicy(policy);
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    setIsAddEditModalOpen(false);
    setEditingPolicy(undefined);
  };
  
  // NEW Upload Handlers
  const openUploadModal = (policyId: string) => {
    setUploadingToPolicyId(policyId);
    setIsUploadModalOpen(true);
  };
  
  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadingToPolicyId(null);
  };


  const sortedPolicies = useMemo(() => {
    return [...policies].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [policies]);


  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-7 h-7 text-green-600" /> My Insurance Policies
        </h2>
        {/* FIX 1: Use only one controlled Dialog for Add/Edit */}
        <Dialog open={isAddEditModalOpen} onOpenChange={closeAddEditModal}>
          {/* FIX 2: Button directly calls the modal setup function (Removed DialogTrigger) */}
          <Button onClick={() => openAddEditModal(undefined)}>
            <Plus className="w-4 h-4 mr-2" /> Add Policy
          </Button>
          <DialogContent className="sm:max-w-[500px]">
            <PolicyForm 
              initialData={editingPolicy}
              properties={properties}
              onSave={handleSave}
              onClose={closeAddEditModal}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-muted-foreground">Track policy details and renewal dates for all your properties.</p>
      
      {/* FIX: Corrected Loading and Empty State rendering logic */}
      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading policies...</p>
        </div>
      )}

      {!isLoading && sortedPolicies.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Policies Found</CardTitle>
          <CardDescription>Click "Add Policy" to create your first policy record.</CardDescription>
        </Card>
      )}

      {!isLoading && sortedPolicies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPolicies.map(policy => {
            const isExpired = isPast(parseISO(policy.expiryDate));
            const property = properties.find(p => p.id === policy.propertyId);
            
            return (
              <Card 
                key={policy.id} 
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
                      {policy.carrierName}
                    </CardTitle>
                    <div className="text-xs font-semibold px-2 py-1 rounded-full text-white"
                      style={{ backgroundColor: isExpired ? 'rgb(220 38 38)' : 'rgb(22 163 74)' }}
                    >
                      {isExpired ? 'EXPIRED' : format(parseISO(policy.expiryDate), 'MMM dd, yyyy')}
                    </div>
                  </div>
                  <CardDescription>
                    Policy: {policy.policyNumber || 'N/A'} 
                    {property && ` | Property: ${property.name || property.address}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-3 text-sm">
                    <p className="text-gray-600">Coverage: {policy.coverageType || 'N/A'}</p>
                    <p className="font-medium text-gray-700">Premium: ${policy.premiumAmount.toFixed(2)} / yr</p>
                    <div className="border-t pt-3">
                        <h4 className="font-semibold text-xs mb-2 flex items-center gap-1 text-gray-600">
                            <FileText className="w-3 h-3" /> Documents ({policy.documents.length})
                        </h4>
                        <DocumentsView documents={policy.documents} />
                    </div>
                </CardContent>
                <div className="flex border-t">
                  {/* NEW: Upload Button - calls the new openUploadModal handler */}
                  <Button variant="ghost" className="w-1/3 rounded-none text-green-600" onClick={() => openUploadModal(policy.id)}>
                    <Upload className="w-4 h-4 mr-1" /> Upload
                  </Button>
                  <Button variant="ghost" className="w-1/3 rounded-none text-blue-600" onClick={() => openAddEditModal(policy)}>
                    <Edit className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  <Button variant="ghost" className="w-1/3 rounded-none rounded-br-lg text-red-600 hover:bg-red-50" onClick={() => handleDelete(policy.id)}>
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      
      {/* NEW: Document Upload Dialog (for Insurance Policies) */}
      <Dialog open={isUploadModalOpen} onOpenChange={closeUploadModal}>
        <DialogContent className="sm:max-w-[500px]">
          {uploadingToPolicyId && (
            <DocumentUploadModal 
              parentEntityId={uploadingToPolicyId}
              parentEntityType="policy"
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