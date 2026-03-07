// apps/frontend/src/app/(dashboard)/dashboard/modifications/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import HomeModificationAdvisor from '@/components/HomeModificationAdvisor';
import { ArrowLeft, Home, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';

function ModificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<Property[]>([]);
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
        title="Home Modification Advisor"
        subtitle="AI-powered recommendations for home improvements."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <Home className="h-5 w-5" />
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

      {/* Modification Advisor Component */}
      {selectedPropertyId ? (
        <HomeModificationAdvisor propertyId={selectedPropertyId} />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Home className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to get modification recommendations</p>
        </div>
      )}
    </div>
  );
}

export default function ModificationPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ModificationContent />
    </Suspense>
  );
}

// ========================================
// API CLIENT METHODS
// Add to apps/frontend/src/lib/api/client.ts
// ========================================

/*
  async getHomeModifications(propertyId: string, userNeeds: string[]): Promise<APIResponse<any>> {
    return this.request('/api/modifications/recommend', {
      method: 'POST',
      body: JSON.stringify({ propertyId, userNeeds }),
    });
  }
*/
