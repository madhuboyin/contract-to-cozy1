// apps/frontend/src/components/SmartDocumentUpload.tsx
'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, X, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentInsights {
  documentType: string;
  confidence: number;
  extractedData: {
    productName?: string;
    modelNumber?: string;
    serialNumber?: string;
    purchaseDate?: string;
    warrantyExpiration?: string;
    vendor?: string;
    manufacturer?: string;
    amount?: number;
    category?: string;
  };
  suggestedActions: string[];
}

interface SmartDocumentUploadProps {
  propertyId: string;
  onUploadComplete?: (documentId: string) => void;
  autoCreateWarranty?: boolean;
}

export default function SmartDocumentUpload({ 
  propertyId, 
  onUploadComplete,
  autoCreateWarranty = true 
}: SmartDocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [insights, setInsights] = useState<DocumentInsights | null>(null);
  const [warranty, setWarranty] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Please upload JPEG, PNG, WEBP, or PDF files only.');
      return;
    }

    // Validate file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selectedFile);
    setError('');
    setInsights(null);
    setWarranty(null);
    setSuccess(false);

    // Generate preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setAnalyzing(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('propertyId', propertyId);
    formData.append('autoCreateWarranty', autoCreateWarranty.toString());

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setInsights(data.data.insights);
        setWarranty(data.data.warranty);
        setSuccess(true);

        if (onUploadComplete) {
          onUploadComplete(data.data.document.id);
        }

        // Clear file after 3 seconds on success
        setTimeout(() => {
          setFile(null);
          setPreview(null);
        }, 3000);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setInsights(null);
    setWarranty(null);
    setError('');
    setSuccess(false);
  };

  const getDocTypeColor = (type: string) => {
    switch (type) {
      case 'WARRANTY': return 'text-green-700 bg-green-100';
      case 'RECEIPT': return 'text-blue-700 bg-blue-100';
      case 'INVOICE': return 'text-purple-700 bg-purple-100';
      case 'MANUAL': return 'text-gray-700 bg-gray-100';
      case 'INSPECTION': return 'text-orange-700 bg-orange-100';
      case 'INSURANCE': return 'text-indigo-700 bg-indigo-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      {!file && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="doc-upload"
          />
          <label htmlFor="doc-upload" className="cursor-pointer">
            <Button variant="outline" className="mt-4" type="button">
              Select Document
            </Button>
          </label>
          <p className="text-sm text-gray-500 mt-2">
            Upload receipts, warranties, manuals, or inspection reports
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Supported: JPEG, PNG, WEBP, PDF (max 10MB)
          </p>
        </div>
      )}

      {/* File Preview & Upload */}
      {file && !success && (
        <div className="border-2 border-gray-300 rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <button onClick={clearFile} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          {preview && (
            <div className="mb-4">
              <img
                src={preview}
                alt="Preview"
                className="max-h-48 mx-auto rounded border"
              />
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={analyzing}
            className="w-full"
          >
            {analyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                AI Analyzing Document...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload & Analyze with AI
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success & Insights Display */}
      {success && insights && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-3">
            <FileCheck className="h-6 w-6 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-semibold text-green-900 text-lg mb-2">
                Document Analyzed Successfully
              </h4>

              {/* Document Type */}
              <div className="mb-3">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getDocTypeColor(insights.documentType)}`}>
                  {insights.documentType}
                </span>
                <span className="ml-2 text-sm text-gray-600">
                  {Math.round(insights.confidence * 100)}% confidence
                </span>
              </div>

              {/* Extracted Information */}
              {Object.keys(insights.extractedData).length > 0 && (
                <div className="bg-white border border-green-200 rounded p-4 space-y-2 text-sm">
                  <p className="font-semibold text-gray-700 mb-2">Extracted Information:</p>
                  
                  {insights.extractedData.productName && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Product:</span>
                      <span className="font-medium text-gray-900">{insights.extractedData.productName}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.modelNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Model:</span>
                      <span className="font-mono text-gray-900">{insights.extractedData.modelNumber}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.serialNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Serial:</span>
                      <span className="font-mono text-gray-900">{insights.extractedData.serialNumber}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.vendor && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Vendor:</span>
                      <span className="font-medium text-gray-900">{insights.extractedData.vendor}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.purchaseDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Purchase Date:</span>
                      <span className="text-gray-900">{new Date(insights.extractedData.purchaseDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.warrantyExpiration && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Warranty Expires:</span>
                      <span className="font-medium text-red-700">{new Date(insights.extractedData.warrantyExpiration).toLocaleDateString()}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.amount && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Amount:</span>
                      <span className="font-medium text-gray-900">${insights.extractedData.amount.toFixed(2)}</span>
                    </div>
                  )}
                  
                  {insights.extractedData.category && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Category:</span>
                      <span className="text-gray-900">{insights.extractedData.category}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Auto-Created Warranty */}
              {warranty && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    ✓ Warranty Auto-Created
                  </p>
                  <p className="text-xs text-blue-700">
                    {warranty.providerName} - Expires {new Date(warranty.expiryDate).toLocaleDateString()}
                  </p>
                </div>
              )}

              {/* Suggested Actions */}
              {insights.suggestedActions && insights.suggestedActions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-200">
                  <p className="font-medium text-sm text-gray-700 mb-2">Suggested Actions:</p>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {insights.suggestedActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={clearFile}
            variant="outline"
            className="w-full"
          >
            Upload Another Document
          </Button>
        </div>
      )}
    </div>
  );
}