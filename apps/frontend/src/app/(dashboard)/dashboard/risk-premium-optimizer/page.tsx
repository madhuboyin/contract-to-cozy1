'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RiskPremiumOptimizerPanel from '@/components/ai/RiskPremiumOptimizerPanel';
import { ToolTrustBanner } from '@/components/tools/ToolTrustBanner';
import { ToolMethodologyAccordion } from '@/components/tools/ToolMethodologyAccordion';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';

function RiskPremiumOptimizerContent() {
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
        title="Risk-to-Premium Optimizer"
        subtitle="Lower premium pressure without increasing risk."
        action={
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
        }
      />

      <ToolTrustBanner
        tone="teal"
        dataSources={[
          'Insurance policy',
          'Risk signals',
          'Inventory exposure',
          'Claims history',
          'Deductible data',
        ]}
        calculationMethod="Identifies your top premium drivers by cross-referencing your policy data with property risk signals. Rankings are deterministic - not influenced by any insurer or carrier."
        disclaimer="Not a carrier recommendation. For strategic planning only."
        learnMoreHref="#methodology"
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
        <RiskPremiumOptimizerPanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to run Risk-to-Premium Optimizer.
        </div>
      )}

      <ToolMethodologyAccordion
        anchorId="methodology"
        whatItDoes="Identifies your top premium cost drivers and ranks mitigation actions that reduce premium pressure without increasing your risk exposure."
        steps={[
          {
            number: 1,
            title: 'Read your policy data',
            description: 'We pull your premium, deductible, and coverage details from your saved insurance records.',
          },
          {
            number: 2,
            title: 'Map your risk signals',
            description: "We cross-reference your property's risk score, claim history, and high-exposure inventory items.",
          },
          {
            number: 3,
            title: 'Identify premium drivers',
            description: 'We rank the factors contributing most to your current premium posture - from highest to lowest impact.',
          },
          {
            number: 4,
            title: 'Generate mitigation actions',
            description: 'We produce ranked recommendations that reduce your risk exposure and may lower premium pressure over time.',
          },
          {
            number: 5,
            title: 'Estimate savings range',
            description: 'We provide a conservative savings estimate based on typical outcomes - not guaranteed figures.',
          },
        ]}
        columns={[
          {
            heading: "Why it's independent",
            items: [
              'No insurer or carrier influences results',
              'Deterministic logic - no black-box scoring',
              'Based entirely on your own property data',
              'Every driver is explained and traceable',
            ],
          },
          {
            heading: 'When to use it',
            items: [
              'Before your annual policy renewal',
              'After a claim or coverage change',
              'When your premium increases unexpectedly',
              'When planning home improvements',
            ],
          },
        ]}
      />
    </div>
  );
}

export default function RiskPremiumOptimizerPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RiskPremiumOptimizerContent />
    </Suspense>
  );
}
