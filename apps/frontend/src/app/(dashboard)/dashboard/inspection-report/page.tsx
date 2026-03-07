// apps/frontend/src/app/(dashboard)/dashboard/inspection-report/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import InspectionReportAnalyzer from '@/components/InspectionReportAnalyzer';
import { FileText, Loader2, Home as HomeIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';

function InspectionReportContent() {
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');
  
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyIdFromUrl || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSegment, setUserSegment] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (propertyIdFromUrl && !selectedPropertyId) {
      setSelectedPropertyId(propertyIdFromUrl);
    }
  }, [propertyIdFromUrl]);

  const loadData = async () => {
    try {
      // Load user profile to check segment
      const profileResponse = await api.getUserProfile();
      console.log('🔍 Profile Response:', profileResponse); // ADD
      if (profileResponse.success && profileResponse.data) {
        setUserSegment(profileResponse.data.homeownerProfile?.segment || null);
        
        // Only HOME_BUYER can access this feature
        if (profileResponse.data.homeownerProfile?.segment !== 'HOME_BUYER') {
          setError('This feature is only available for home buyers.');
          setLoading(false);
          return;
        }
      }

      // Load properties
      const response = await api.getProperties();
      console.log('🔍 Properties Response:', response); // ADD
      if (response.success && response.data) {
        const props = response.data.properties || response.data;
        console.log('🔍 Parsed Properties:', props); // ADD
        setProperties(props);
        console.log('🔍 Properties set:', properties); // ADD
        if (!selectedPropertyId && properties.length > 0) {
          console.log('🔍 Setting propertyId to:', properties[0].id); // ADD
          setSelectedPropertyId(properties[0].id);
        }
      } else {
        console.error('Failed to load properties:', response.message || 'Unknown error'); // ADD
      }
    } catch (error) {
      console.error('Failed to load data:', error); // ADD
      setError('Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Show error for non-HOME_BUYER users
  if (userSegment !== 'HOME_BUYER') {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
        <Alert variant="destructive">
          <AlertDescription>
            This feature is only available for home buyers actively closing on a property.
            If you believe this is an error, please contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
      <MobilePageIntro
        title="Inspection Report Intelligence"
        subtitle="AI-powered analysis of your home inspection report."
        action={
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-2.5 text-indigo-700">
            <FileText className="h-5 w-5" />
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
                  <div className="flex items-center gap-2">
                    <HomeIcon className="w-4 h-4" />
                    {property.name || property.address}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MobileFilterSurface>
      )}

      {/* Inspection Analyzer Component */}
      {selectedPropertyId ? (
        <InspectionReportAnalyzer propertyId={selectedPropertyId} />
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Select a property to analyze inspection report</p>
        </div>
      )}
    </div>
  );
}

export default function InspectionReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}>
      <InspectionReportContent />
    </Suspense>
  );
}
