// apps/frontend/src/app/(dashboard)/dashboard/documents/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Plus, Loader2, Trash2, ExternalLink, Filter, X, Save, Upload } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Document, DocumentType, Property, Warranty, InsurancePolicy, DocumentUploadInput } from '@/types';

// --- Document Type Constants for UI ---
const DOCUMENT_TYPES: DocumentType[] = [
    'INSPECTION_REPORT', 'ESTIMATE', 'INVOICE', 'CONTRACT', 'PERMIT', 
    'PHOTO', 'VIDEO', 'INSURANCE_CERTIFICATE', 'LICENSE', 'OTHER',
];

// --- Document Upload Modal Component (Re-implemented for self-containment/general upload) ---
// NOTE: For a real application, this component should be shared across the three pages.
interface DocumentUploadModalProps {
    properties: Property[];
    warranties: Warranty[];
    policies: InsurancePolicy[];
    onUploadSuccess: () => void;
    onClose: () => void;
}

// Temporary placeholder for "None" to prevent type errors in Select
const SELECT_NONE_VALUE = '__NONE__';

const DocumentUploadModal = ({ properties, warranties, policies, onUploadSuccess, onClose }: DocumentUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('OTHER');
  const [description, setDescription] = useState('');
  const [selectedParent, setSelectedParent] = useState<string>(SELECT_NONE_VALUE); // Format: ENTITY_ID|ENTITY_TYPE
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  const parentOptions = useMemo(() => {
    const propertyOptions = properties.map(p => ({
        value: `${p.id}|property`,
        label: `Property: ${p.name || p.address}`,
    }));
    const warrantyOptions = warranties.map(w => ({
        value: `${w.id}|warranty`,
        label: `Warranty: ${w.providerName} (${w.policyNumber || 'N/A'})`,
    }));
    const policyOptions = policies.map(p => ({
        value: `${p.id}|policy`,
        label: `Policy: ${p.carrierName} (${p.policyNumber})`,
    }));
    
    return [
        ...propertyOptions,
        ...warrantyOptions,
        ...policyOptions,
    ].sort((a, b) => a.label.localeCompare(b.label));

  }, [properties, warranties, policies]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) {
      toast({ title: "Error", description: "Please select a file and provide a name.", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    
    const [parentEntityId, parentEntityType] = selectedParent.split('|');
    
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
    // If SELECT_NONE_VALUE, no ID is assigned, and the document is "Unattached"
    
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Upload New Document</DialogTitle>
        <CardDescription>Upload a file and optionally link it to a specific property, warranty, or insurance policy.</CardDescription>
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
                  {dt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid gap-2">
        <Label htmlFor="parentEntity">Link to Entity (Optional)</Label>
        <Select 
          value={selectedParent} 
          onValueChange={setSelectedParent}
          disabled={isUploading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a parent entity (Optional)" />
          </SelectTrigger>
          <SelectContent>
             <SelectItem value={SELECT_NONE_VALUE}>
                None (Unattached / General File)
              </SelectItem> 
            {parentOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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


// --- Main Page Component ---
export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  
  // Filter States
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterParentType, setFilterParentType] = useState<string>('ALL');
  
  const { toast } = useToast();

  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    
    // Fetch all documents and supporting lists concurrently
    const [docsRes, propertiesRes, warrantiesRes, policiesRes] = await Promise.all([
      api.listDocuments(),
      api.getProperties(),
      api.listWarranties(),
      api.listInsurancePolicies(),
    ]);

    if (docsRes.success) {
      setDocuments(docsRes.data.documents);
    } else {
      toast({ title: "Error", description: docsRes.message, variant: "destructive" });
    }
    
    // Always update supporting lists even on partial failure
    if (propertiesRes.success) setProperties(propertiesRes.data.properties);
    if (warrantiesRes.success) setWarranties(warrantiesRes.data.warranties);
    if (policiesRes.success) setPolicies(policiesRes.data.policies);

    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const handleDelete = async (documentId: string) => {
    if (!window.confirm("Are you sure you want to delete this document? This cannot be undone.")) {
      return;
    }
    // NOTE: Requires a deleteDocument API method. This is a mock action.
    toast({ title: 'Delete Action Mocked', description: 'Document delete functionality pending API completion.', variant: 'default' });
  };
  
  const getParentEntityDisplay = useCallback((doc: Document) => {
    if (doc.warrantyId) {
      const warranty = warranties.find(w => w.id === doc.warrantyId);
      return `Warranty: ${warranty?.providerName || 'ID:' + doc.warrantyId.substring(0, 4) + '...'}`;
    }
    if (doc.policyId) {
      const policy = policies.find(p => p.id === doc.policyId);
      return `Policy: ${policy?.carrierName || 'ID:' + doc.policyId.substring(0, 4) + '...'}`;
    }
    if (doc.propertyId) {
      const property = properties.find(p => p.id === doc.propertyId);
      return `Property: ${property?.name || property?.address || 'ID:' + doc.propertyId.substring(0, 4) + '...'}`;
    }
    return 'Unattached';
  }, [warranties, policies, properties]);

  const filteredDocuments = useMemo(() => {
    let list = documents;

    if (filterType !== 'ALL') {
      list = list.filter(doc => doc.type === filterType);
    }

    if (filterParentType !== 'ALL') {
        list = list.filter(doc => {
            if (filterParentType === 'Warranty') return !!doc.warrantyId;
            if (filterParentType === 'Policy') return !!doc.policyId;
            if (filterParentType === 'Property') return !!doc.propertyId;
            if (filterParentType === 'Unattached') return !doc.warrantyId && !doc.policyId && !doc.propertyId;
            return true;
        });
    }

    return list.sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime());
  }, [documents, filterType, filterParentType]);

  const handleUploadSuccess = () => {
      setIsUploadModalOpen(false);
      fetchDependencies();
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="w-7 h-7 text-purple-600" /> Document Vault
        </h2>
        <Button onClick={() => setIsUploadModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Upload New Document
        </Button>
      </div>
      <p className="text-muted-foreground">A centralized repository for all your home-related files, reports, and receipts.</p>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className='flex items-center gap-2'>
                <Filter className='w-4 h-4 text-gray-500'/>
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Filter by Document Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        {DOCUMENT_TYPES.map(dt => (
                            <SelectItem key={dt} value={dt}>
                                {dt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className='flex items-center gap-2 md:col-span-2'>
                 <Filter className='w-4 h-4 text-gray-500'/>
                <Select value={filterParentType} onValueChange={setFilterParentType}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Filter by Parent Entity" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Entities</SelectItem>
                        <SelectItem value="Warranty">Warranties</SelectItem>
                        <SelectItem value="Policy">Insurance Policies</SelectItem>
                        <SelectItem value="Property">Properties</SelectItem>
                        <SelectItem value="Unattached">Unattached</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>


      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading documents...</p>
        </div>
      )}

      {!isLoading && filteredDocuments.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Documents Found</CardTitle>
          <CardDescription>Click "Upload New Document" to add your first file.</CardDescription>
        </Card>
      )}

      {!isLoading && filteredDocuments.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Associated With</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                  <th className="relative px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocuments.map(doc => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 truncate max-w-xs">{doc.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {doc.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden sm:table-cell">
                        {getParentEntityDisplay(doc)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                       {format(parseISO(doc.createdAt), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700" asChild>
                         <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                         </a>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" 
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Central Upload Dialog */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DocumentUploadModal 
              properties={properties}
              warranties={warranties}
              policies={policies}
              onUploadSuccess={handleUploadSuccess}
              onClose={() => setIsUploadModalOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}