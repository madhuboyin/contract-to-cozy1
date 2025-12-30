// apps/frontend/src/app/(dashboard)/dashboard/insurance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Shield, Trash2, Edit, X, Save, ExternalLink, Upload, AlertCircle } from 'lucide-react';
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
// NEW IMPORTS for Table structure
import { useRouter, useSearchParams } from 'next/navigation';
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

// --- Document Upload Modal Component ---
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


// --- Insurance Policy Form Component ---
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
  
  // NEW: Navigation Hooks
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openedFromSetup, setOpenedFromSetup] = useState(false); // State to track if the modal opened automatically
  
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
        description: (policiesRes as APIError).message,
        variant: "destructive",
      });
      setPolicies([]);
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
      
      // NEW: Conditional redirection after successful creation
      if (!editingPolicy && openedFromSetup) {
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
  
  // Handlers for Add/Edit Modal
  const openAddEditModal = (policy?: InsurancePolicy) => {
    setEditingPolicy(policy);
    setOpenedFromSetup(false); // Reset for manual opens
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    const wasOpenedFromSetup = openedFromSetup;
    setIsAddEditModalOpen(false);
    setEditingPolicy(undefined);
    setOpenedFromSetup(false);

    if (wasOpenedFromSetup) {
        // If canceled after being opened from maintenance-setup, navigate back.
        router.push('/dashboard/maintenance-setup');
    } else if (searchParams.has('action') || searchParams.has('from')) {
        // Otherwise, clean up the URL without navigating away from the current page.
        router.replace('/dashboard/insurance', { scroll: false });
    }
  };
  
  // Handlers for Document Upload Modal
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
  
  const getPropertyInfo = useCallback((propertyId: string | null) => {
      if (!propertyId) return 'General';
      const property = properties.find(p => p.id === propertyId);
      return property ? property.name || property.address : 'N/A';
  }, [properties]);


  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 sm:text-3xl">
          <Shield className="w-6 h-6 text-green-600 sm:w-7 sm:h-7" /> My Insurance Policies
        </h2>
        
        <Dialog open={isAddEditModalOpen} onOpenChange={closeAddEditModal}>
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
        <>
          <div className="grid gap-4 md:hidden">
            {sortedPolicies.map(policy => {
              const expired = isPast(parseISO(policy.expiryDate));
              const statusClass = expired ? 'text-red-600' : 'text-green-600';

              return (
                <Card key={policy.id} className={expired ? 'border-red-200' : undefined}>
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{policy.carrierName}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(parseISO(policy.startDate), 'MMM dd, yyyy')}
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
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Policy #</span>
                        <span>{policy.policyNumber || 'N/A'}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Coverage Type</span>
                        <span className="text-foreground">{policy.coverageType || 'N/A'}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Property</span>
                        <span className="text-foreground">{getPropertyInfo(policy.propertyId)}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Premium</span>
                        <span className="text-foreground">${policy.premiumAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground/70">Expires</span>
                        <span className={statusClass}>
                          {format(parseISO(policy.expiryDate), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-green-600"
                        onClick={() => openUploadModal(policy.id)}
                        title="Upload Document"
                      >
                        <Upload className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-blue-600"
                        onClick={() => openAddEditModal(policy)}
                        title="Edit Policy"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-red-600"
                        onClick={() => handleDelete(policy.id)}
                        title="Delete Policy"
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
                <TableHead>Carrier</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead className="hidden lg:table-cell">Coverage Type</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-center">Expires</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPolicies.map(policy => {
                const expired = isPast(parseISO(policy.expiryDate));
                const statusClass = expired ? 'text-red-600' : 'text-green-600';
                
                return (
                  <TableRow key={policy.id} className={expired ? 'bg-red-50/50 hover:bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {policy.carrierName}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(policy.startDate), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                        {policy.policyNumber || 'N/A'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                      {policy.coverageType || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">
                        {getPropertyInfo(policy.propertyId)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                        ${policy.premiumAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={statusClass}>
                          {format(parseISO(policy.expiryDate), 'MMM dd, yyyy')}
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
                            className="h-8 w-8 text-gray-500 hover:text-green-600"
                            onClick={() => openUploadModal(policy.id)}
                            title="Upload Document"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-blue-600"
                            onClick={() => openAddEditModal(policy)}
                            title="Edit Policy"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(policy.id)}
                            title="Delete Policy"
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
      
      {/* Document Upload Dialog (for Insurance Policies) */}
      <Dialog open={isUploadModalOpen} onOpenChange={closeUploadModal}>
        <DialogContent className="sm:max-w-[500px]">
          {uploadingToPolicyId && (
            <DocumentUploadModal 
              parentEntityId={uploadingToPolicyId}
              parentEntityType="policy"
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
