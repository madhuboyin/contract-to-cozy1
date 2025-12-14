// apps/frontend/src/app/(dashboard)/dashboard/moving-concierge/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import MovingConcierge from '@/components/MovingConcierge';
import { Truck, Loader2, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

function MovingConciergeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userSegment } = useAuth();
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
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  // Check if user is HOME_BUYER
  if (userSegment && userSegment !== 'HOME_BUYER') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-orange-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-orange-900 mb-2">
              Moving Concierge Not Available
            </h2>
            <p className="text-orange-800 mb-4">
              The Moving Concierge feature is exclusively for home buyers who are in the process of closing on a new home.
            </p>
            <p className="text-orange-700 text-sm">
              This feature helps with moving planning, utility setup, and transition tasks. 
              Since you're an existing homeowner, you can explore our other property management features!
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-6 px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
            >
              Return to Dashboard
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg">
          <Truck className="w-8 h-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Moving Concierge</h1>
          <p className="text-gray-600 mt-1">
            Your personalized moving assistant for a stress-free transition
          </p>
        </div>
      </div>

      {/* Property Selector */}
      {properties.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
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
        </div>
      )}

      {/* Moving Concierge Component */}
      {selectedPropertyId ? (
        <MovingConcierge 
          propertyId={selectedPropertyId}
          propertyAddress={selectedProperty?.address || ''}
          squareFootage={selectedProperty?.squareFootage}
        />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to start your moving plan</p>
        </div>
      )}
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