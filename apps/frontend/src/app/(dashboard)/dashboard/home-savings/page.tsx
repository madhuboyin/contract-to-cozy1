'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, PiggyBank } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';

function HomeSavingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyIdFromUrl || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProperties = async () => {
      setLoading(true);
      try {
        const response = await api.getProperties();
        if (response.success && response.data) {
          const nextProperties = response.data.properties || response.data;
          setProperties(nextProperties);

          if (!selectedPropertyId && nextProperties.length > 0) {
            setSelectedPropertyId(nextProperties[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to load properties:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (propertyIdFromUrl && !selectedPropertyId) {
      setSelectedPropertyId(propertyIdFromUrl);
    }
  }, [propertyIdFromUrl, selectedPropertyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[calc(8rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-8">
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
        title="Home Savings Check"
        subtitle="Find simple ways to lower recurring home bills."
        action={
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
            <PiggyBank className="h-5 w-5" />
          </div>
        }
      />

      {properties.length > 0 && (
        <MobileFilterSurface className="border border-slate-200/80 bg-white">
          <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Property</Label>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name || property.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MobileFilterSurface>
      )}

      {selectedPropertyId ? (
        <HomeSavingsCheckPanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to run Home Savings Check.
        </div>
      )}
    </div>
  );
}

export default function HomeSavingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeSavingsContent />
    </Suspense>
  );
}
