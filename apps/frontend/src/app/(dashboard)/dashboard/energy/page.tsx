// apps/frontend/src/app/(dashboard)/dashboard/energy/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EnergyAuditor from '@/components/EnergyAuditor';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client'; 
import { Button } from '@/components/ui/button';  
function EnergyContent() {
  const router = useRouter();
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
        <Loader2 className="w-8 h-8 animate-spin text-yellow-600" />
      </div>
    );
  }

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Back Navigation */}
      {propertyIdFromUrl && (
        <Button 
          variant="link" 
          className="p-0 h-auto mb-2 text-sm text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 sm:p-3 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-lg">
          <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">AI Home Energy Auditor</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Get personalized energy-saving recommendations
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

      {/* Energy Auditor Component */}
      {selectedPropertyId && selectedProperty ? (
        <EnergyAuditor
          propertyId={selectedPropertyId}
          squareFootage={selectedProperty.squareFootage}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to start energy audit</p>
        </div>
      )}
    </div>
  );
}

export default function EnergyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EnergyContent />
    </Suspense>
  );
}

// ========================================
// API CLIENT METHODS
// Add to apps/frontend/src/lib/api/client.ts
// ========================================

/*
  async getEnergyAudit(formData: FormData): Promise<APIResponse<any>> {
    // FormData automatically sets Content-Type with boundary
    return this.request('/api/energy/audit', {
      method: 'POST',
      body: formData,
      // Don't set Content-Type header - let browser handle it for FormData
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
  }
*/