// apps/frontend/src/app/(dashboard)/dashboard/moving-concierge/page.tsx
'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import MovingConcierge from '@/components/MovingConcierge';
import { Truck, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  BottomSafeAreaGuard,
  EmptyStateCard,
  MobileFilterSurface,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';

function MovingConciergeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userSegment } = useAuth();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<any[]>([]);
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
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  // Check if user is HOME_BUYER
  if (userSegment && userSegment !== 'HOME_BUYER') {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <EmptyStateCard
          title="Moving Concierge not available"
          description="This feature is for home buyers in a closing journey. Explore your other property management tools instead."
          action={
            <Button onClick={() => router.push('/dashboard')}>
              Return to Dashboard
            </Button>
          }
        />
        <BottomSafeAreaGuard />
      </div>
    );
  }

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <MobilePageIntro
        title="AI Moving Concierge"
        subtitle="Your personalized moving assistant for a stress-free transition."
        action={
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700">
            <Truck className="h-5 w-5" />
          </div>
        }
      />

      {/* Property Selector */}
      {properties.length > 0 && (
        <MobileFilterSurface className="border border-slate-200/80 bg-white">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Property (Closing Soon)
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

      {/* Moving Concierge Component */}
      {selectedPropertyId ? (
        <MovingConcierge 
          propertyId={selectedPropertyId}
          propertyAddress={selectedProperty?.address || ''}
          squareFootage={selectedProperty?.squareFootage}
        />
      ) : (
        <EmptyStateCard
          title="Select a property"
          description="Choose a property to start your moving plan."
        />
      )}
      <BottomSafeAreaGuard />
    </div>
  );
}

export default function MovingConciergePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MovingConciergeContent />
    </Suspense>
  );
}

// ========================================
// API CLIENT METHODS
// Add to apps/frontend/src/lib/api/client.ts
// ========================================

/*
  async generateMovingPlan(data: {
    propertyId: string;
    closingDate: string;
    currentAddress?: string;
    newAddress?: string;
    homeSize: number;
    numberOfRooms: number;
    familySize: number;
    hasPets: boolean;
    hasValuableItems: boolean;
    movingDistance: string;
    specialRequirements?: string;
  }): Promise<APIResponse<any>> {
    return this.request('/api/moving-concierge/generate-plan', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
*/
