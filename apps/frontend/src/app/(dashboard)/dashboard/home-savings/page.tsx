'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, PiggyBank } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import {
  BottomSafeAreaReserve,
  MobileFilterStack,
  MobilePageIntro,
  MobileToolWorkspace,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

function HomeSavingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyIdFromUrl = searchParams.get('propertyId');

  const [properties, setProperties] = useState<Property[]>([]);
  const { selectedPropertyId, setSelectedPropertyId } = useDashboardPropertySelection(propertyIdFromUrl);
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
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <MobileToolWorkspace
      className="space-y-6 lg:max-w-7xl lg:px-8 lg:pb-10"
      intro={
        <div className="space-y-3">
          {propertyIdFromUrl ? (
            <Button
              variant="link"
              className="h-auto p-0 text-sm text-muted-foreground"
              onClick={() => router.back()}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
          ) : null}
          <MobilePageIntro
            title="Home Savings Check"
            subtitle="Find simple ways to reduce recurring home bills."
            action={
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
                <PiggyBank className="h-5 w-5" />
              </div>
            }
          />
        </div>
      }
      summary={
        <ResultHeroCard
          eyebrow="Bill Optimization"
          title={selectedProperty ? selectedProperty.name || selectedProperty.address : 'Select a property'}
          value="Savings opportunities"
          status={<StatusChip tone="good">Actionable</StatusChip>}
          summary="Compare current plan costs against potential lower-cost options across key home categories."
          highlights={[
            'Insurance, warranty, internet, utilities',
            'Category-level plan capture',
            'Track follow-up status',
          ]}
        />
      }
      filters={
        properties.length > 0 ? (
          <MobileFilterStack
            primaryFilters={
              <div>
                <Label className="mb-2 block text-sm font-medium text-gray-700">Select Property</Label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="w-full bg-white">
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
              </div>
            }
          />
        ) : undefined
      }
    >
      {selectedPropertyId ? (
        <HomeSavingsCheckPanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to run Home Savings Check.
        </div>
      )}
      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}

export default function HomeSavingsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeSavingsContent />
    </Suspense>
  );
}
