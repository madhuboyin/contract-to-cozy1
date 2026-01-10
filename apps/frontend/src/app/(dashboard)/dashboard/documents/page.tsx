// apps/frontend/src/app/(dashboard)/dashboard/documents/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Plus, Loader2, Trash2, ExternalLink, Filter, X, Save, Upload, Sparkles, FileCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Document, DocumentType, Property, Warranty, InsurancePolicy, DocumentUploadInput } from '@/types';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

// --- Document Type Constants for UI ---
const DOCUMENT_TYPES: DocumentType[] = [
    'INSPECTION_REPORT', 'ESTIMATE', 'INVOICE', 'CONTRACT', 'PERMIT', 
    'PHOTO', 'VIDEO', 'INSURANCE_CERTIFICATE', 'LICENSE', 'OTHER',
];

const SELECT_NONE_VALUE = '__NONE__';

// --- AI Smart Upload Component ---
interface AISmartUploadProps {
  properties: Property[];
  onUploadSuccess: () => void;
  onClose: () => void;
}

const AISmartUpload = ({ properties, onUploadSuccess, onClose }: AISmartUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [warranty, setWarranty] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId');

  useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Please upload JPEG, PNG, WEBP, or PDF files only.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setInsights(null);
    setWarranty(null);
    setSuccess(false);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !selectedPropertyId) return;

    setAnalyzing(true);
    setError('');

    try {
      const response = await api.analyzeDocument(file, selectedPropertyId, true);

      if (response.success && response.data) {
        setInsights(response.data.insights);
        setWarranty(response.data.warranty);
        setSuccess(true);

        toast({ 
          title: 'Document Analyzed Successfully', 
          description: `${response.data.insights.documentType} detected with ${Math.round(response.data.insights.confidence * 100)}% confidence` 
        });
      } else {
        setError(response.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const getDocTypeColor = (type: string) => {
    switch (type) {
      case 'WARRANTY': return 'text-green-700 bg-green-100';
      case 'RECEIPT': return 'text-blue-700 bg-blue-100';
      case 'INVOICE': return 'text-purple-700 bg-purple-100';
      case 'MANUAL': return 'text-gray-700 bg-gray-100';
      case 'INSPECTION': return 'text-orange-700 bg-orange-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };
  
  // [NEW HANDLER] Explicitly trigger click on the hidden input
  const handleSelectDocumentClick = () => {
    document.getElementById('ai-doc-upload')?.click();
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          AI Smart Upload
        </DialogTitle>
        <CardDescription>Upload documents and let AI extract information automatically</CardDescription>
      </DialogHeader>

      {/* Property Selector */}
      <div className="grid gap-2">
        <Label>Select Property *</Label>
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger>
            <SelectValue placeholder="Select property" />
          </SelectTrigger>
          <SelectContent>
            {properties.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.name || p.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* File Upload */}
      {!file && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          {/* Hidden input - accessible via ID */}
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="ai-doc-upload"
          />
          {/* [FIXED] Removed the <label> wrapper which caused the conflict.
            Button now explicitly calls handleSelectDocumentClick which triggers the hidden input.
          */}
          <Button 
            variant="outline" 
            className="mt-4" 
            type="button"
            onClick={handleSelectDocumentClick} // <-- FIX: Added explicit onClick handler
          >
            Select Document
          </Button>
          <p className="text-sm text-gray-500 mt-2">
            Upload receipts, warranties, manuals, or inspection reports
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Supported: JPEG, PNG, WEBP, PDF (max 10MB)
          </p>
        </div>
      )}

      {/* File Preview */}
      {file && !success && (
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {preview && (
            <div className="mb-4">
              <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded border" />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Success with Insights */}
      {success && insights && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-green-600" />
            <p className="font-semibold text-green-900">Document Analyzed Successfully!</p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDocTypeColor(insights.documentType)}`}>
                {insights.documentType}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Confidence:</span>
              <span className="font-medium">{Math.round(insights.confidence * 100)}%</span>
            </div>
            {insights.extractedData.productName && (
              <div className="flex justify-between">
                <span className="text-gray-600">Product:</span>
                <span className="font-medium">{insights.extractedData.productName}</span>
              </div>
            )}
            {insights.extractedData.modelNumber && (
              <div className="flex justify-between">
                <span className="text-gray-600">Model:</span>
                <span className="font-medium">{insights.extractedData.modelNumber}</span>
              </div>
            )}
            {insights.extractedData.warrantyExpiration && (
              <div className="flex justify-between">
                <span className="text-gray-600">Warranty Expires:</span>
                <span className="font-medium">
                  {new Date(insights.extractedData.warrantyExpiration).toLocaleDateString()}
                </span>
              </div>
            )}
            {warranty && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                <p className="text-xs font-semibold text-blue-900 mb-1">✓ Warranty Auto-Created</p>
                <p className="text-xs text-blue-700">
                  {warranty.providerName} - Expires {new Date(warranty.expiryDate).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {/* Manual Close Buttons */}
          <div className="pt-3 border-t border-green-300 flex gap-2">
            <Button 
              onClick={() => {
                onUploadSuccess();
                onClose();
              }}
              className="flex-1"
            >
              Done - View Documents
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setSuccess(false);
                setInsights(null);
                setWarranty(null);
                setError('');
              }}
            >
              Upload Another
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={analyzing}>
          Cancel
        </Button>
        {!success && (
          <Button onClick={handleUpload} disabled={analyzing || !file}>
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze & Upload
              </>
            )}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
};

// --- Standard Upload Modal (Existing) ---
interface DocumentUploadModalProps {
    properties: Property[];
    warranties: Warranty[];
    policies: InsurancePolicy[];
    onUploadSuccess: () => void;
    onClose: () => void;
}

const DocumentUploadModal = ({ properties, warranties, policies, onUploadSuccess, onClose }: DocumentUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('OTHER');
  const [description, setDescription] = useState('');
  const [selectedParent, setSelectedParent] = useState<string>(SELECT_NONE_VALUE);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  const parentOptions = useMemo(() => {
    const safeProperties = properties || [];
    const safeWarranties = warranties || [];
    const safePolicies = policies || [];
      
    const propertyOptions = safeProperties.map(p => ({
        value: `${p.id}|property`,
        label: `Property: ${p.name || p.address}`,
    }));
    const warrantyOptions = safeWarranties.map(w => ({
        value: `${w.id}|warranty`,
        label: `Warranty: ${w.providerName} (${w.policyNumber || 'N/A'})`,
    }));
    const policyOptions = safePolicies.map(p => ({
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Standard Upload</DialogTitle>
        <CardDescription>Upload a file with manual metadata entry</CardDescription>
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

// --- Main Page Component ---
export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'ai' | 'standard'>('ai');
  const [filterType, setFilterType] = useState<string | 'ALL'>('ALL');
  const [filterParentType, setFilterParentType] = useState<string | 'ALL'>('ALL');
  const { toast } = useToast();

  // Get propertyId from URL parameters
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');

  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    
    // FIXED: Use correct API method names
    const [documentsRes, propertiesRes, warrantiesRes, policiesRes] = await Promise.all([
        api.listDocuments(propertyIdFromUrl || undefined),
        api.getProperties(),
        api.listWarranties(),
        api.listInsurancePolicies(),
    ]);

    if (documentsRes.success) {
        // FIX: Ensure setDocuments is called with an array fallback
        setDocuments(documentsRes.data.documents || []);
    } else {
        toast({ title: 'Error', description: 'Failed to load documents.', variant: 'destructive' });
    }
    
    // FIX: Apply defensive checks to all successful state updates
    if (propertiesRes.success) setProperties(propertiesRes.data.properties || []);
    if (warrantiesRes.success) setWarranties(warrantiesRes.data.warranties || []);
    if (policiesRes.success) setPolicies(policiesRes.data.policies || []);

    setIsLoading(false);
  }, [toast,propertyIdFromUrl]);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const handleDelete = async (documentId: string) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    
    try {
      await api.deleteDocument(documentId);
      toast({ title: 'Document Deleted', description: 'Document removed successfully.' });
      fetchDependencies();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete document.', variant: 'destructive' });
    }
  };
  
  const getParentEntityDisplay = useCallback((doc: Document) => {
    if (doc.warrantyId) {
      const warranty = warranties.find(w => w.id === doc.warrantyId);
      return `Warranty: ${warranty?.providerName || 'Unknown'}`;
    }
    if (doc.policyId) {
      const policy = policies.find(p => p.id === doc.policyId);
      return `Policy: ${policy?.carrierName || 'Unknown'}`;
    }
    if (doc.propertyId) {
      const property = properties.find(p => p.id === doc.propertyId);
      return `Property: ${property?.name || property?.address || 'Unknown'}`;
    }
    return 'Unattached';
  }, [warranties, policies, properties]);

  const filteredDocuments = useMemo(() => {
    // FIX: Ensure 'documents' is an array before attempting to read 'sort'
    let list = documents || [];

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
      {propertyIdFromUrl && (
        <Link 
          href={`/dashboard/properties/${propertyIdFromUrl}`}
          className="text-sm text-blue-600 hover:underline mb-4 inline-block"
        >
          ← Back to Property
        </Link>
      )}      
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-purple-600" /> Document Vault
          </h2>
          <p className="text-muted-foreground mt-1">Centralized repository with AI-powered analysis</p>
        </div>
        <Button onClick={() => setIsUploadModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Upload New Document
        </Button>
      </div>

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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">AI Analysis</th>
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
                    <td className="px-6 py-4 text-sm hidden md:table-cell">
                      {(doc as any).confidence ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                          <Sparkles className="w-3 h-3" />
                          {Math.round((doc as any).confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Manual</span>
                      )}
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

      {/* Upload Dialog with Tabs */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as 'ai' | 'standard')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Smart Upload
              </TabsTrigger>
              <TabsTrigger value="standard" className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Standard Upload
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="ai" className="mt-4">
              <AISmartUpload
                properties={properties}
                onUploadSuccess={handleUploadSuccess}
                onClose={() => setIsUploadModalOpen(false)}
              />
            </TabsContent>
            
            <TabsContent value="standard" className="mt-4">
              <DocumentUploadModal 
                properties={properties}
                warranties={warranties}
                policies={policies}
                onUploadSuccess={handleUploadSuccess}
                onClose={() => setIsUploadModalOpen(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}