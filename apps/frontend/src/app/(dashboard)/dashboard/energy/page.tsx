// apps/frontend/src/app/(dashboard)/dashboard/energy/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import EnergyAuditor from '@/components/EnergyAuditor';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client'; 
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { Button } from '@/components/ui/button';  
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';
function EnergyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<any[]>([]);
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(propertyIdFromUrl);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
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
      <MobilePageIntro
        title="AI Home Energy Auditor"
        subtitle="Get personalized energy-saving recommendations."
        action={
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-700">
            <Zap className="h-5 w-5" />
          </div>
        }
      />

      {/* Property Selector */}
      {properties.length > 0 && (
        <MobileFilterSurface className="border border-slate-200/80 bg-white">
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
        </MobileFilterSurface>
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
