// apps/frontend/src/app/(dashboard)/dashboard/climate/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ClimateRiskPredictor from '@/components/ClimateRiskPredictor';
import { Cloud, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';

function ClimateContent() {
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyIdFromUrl || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    if (propertyIdFromUrl && !selectedPropertyId) {
      setSelectedPropertyId(propertyIdFromUrl);
    }
  }, [propertyIdFromUrl]);

  const loadProperties = async () => {
    try {
      const response = await api.getProperties();
      if (response.success && response.data) {
        const props = response.data.properties || response.data;
        setProperties(props);
        
        if (!selectedPropertyId && props.length > 0) {
          setSelectedPropertyId(props[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 sm:p-3 bg-gradient-to-br from-sky-100 to-blue-100 rounded-lg">
          <Cloud className="w-6 h-6 sm:w-8 sm:h-8 text-sky-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Climate Risk Analyzer</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            AI-powered climate risk assessment for your property
          </p>
        </div>
      </div>

      {/* Property Selector */}
      {properties.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Property
          </Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map(property => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name || property.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Climate Risk Component */}
      {selectedPropertyId ? (
        <ClimateRiskPredictor propertyId={selectedPropertyId} />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Cloud className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to view climate risk analysis</p>
        </div>
      )}
    </div>
  );
}

export default function ClimatePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ClimateContent />
    </Suspense>
  );
}

// ========================================
// API CLIENT METHODS
// Add to apps/frontend/src/lib/api/client.ts
// ========================================

/*
  async getClimateRisk(propertyId: string): Promise<APIResponse<any>> {
    return this.request(`/api/climate/analyze/${propertyId}`);
  }
*/