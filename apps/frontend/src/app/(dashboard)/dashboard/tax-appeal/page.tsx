// apps/frontend/src/app/(dashboard)/dashboard/tax-appeal/page.tsx
'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TaxAppealAssistant from '@/components/TaxAppealAssistant';
import { Scale, Loader2, ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import {
  BottomSafeAreaGuard,
  EmptyStateCard,
  MobileFilterSurface,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';

function TaxAppealContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<Property[]>([]);
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(propertyIdFromUrl);
  const [loading, setLoading] = useState(true);

  const loadProperties = useCallback(async () => {
    try {
      const response = await api.getProperties();
      if (response.success && response.data) {
        const props = response.data.properties || response.data;
        setProperties(props);
        
        if (props.length > 0) {
          setSelectedPropertyId((prev) => prev || props[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }, [setSelectedPropertyId]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
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
        title="Property Tax Appeal Assistant"
        subtitle="AI-powered analysis to help reduce your property taxes."
        action={
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-blue-700">
            <Scale className="h-5 w-5" />
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

      {/* Tax Appeal Assistant Component */}
      {selectedPropertyId ? (
        <TaxAppealAssistant propertyId={selectedPropertyId} />
      ) : (
        <EmptyStateCard
          title="Select a property"
          description="Choose a property to start tax appeal analysis."
        />
      )}
      <BottomSafeAreaGuard />
    </div>
  );
}

export default function TaxAppealPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TaxAppealContent />
    </Suspense>
  );
}

// ========================================
// API CLIENT METHODS
// Add to apps/frontend/src/lib/api/client.ts
// ========================================

/*
  async extractTaxBill(formData: FormData): Promise<APIResponse<any>> {
    return this.request('/api/tax-appeal/extract-bill', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
  }

  async analyzeTaxAppeal(data: {
    propertyId: string;
    taxBillData: any;
    userMarketEstimate?: number;
    comparableSales?: any[];
    propertyConditionNotes?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/api/tax-appeal/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
*/
