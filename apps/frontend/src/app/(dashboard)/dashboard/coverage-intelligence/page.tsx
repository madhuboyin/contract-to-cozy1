'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import { ToolTrustBanner } from '@/components/tools/ToolTrustBanner';
import { ToolMethodologyAccordion } from '@/components/tools/ToolMethodologyAccordion';
import { MobileFilterSurface, MobilePageIntro } from '@/components/mobile/dashboard/MobilePrimitives';

function CoverageIntelligenceContent() {
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
        title="Coverage Intelligence"
        subtitle="Insurance + warranty coverage assessment for your home."
        action={
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
        }
      />

      <ToolTrustBanner
        tone="blue"
        dataSources={[
          'Warranty records',
          'Insurance policy',
          'Inventory items',
          'System age',
          'Coverage dates',
        ]}
        calculationMethod="Compares your actual coverage documents against your home's inventory to find gaps, overlaps, and expiring protections. Analysis is based on your uploaded and saved records."
        disclaimer="Gap analysis reflects your uploaded documents. Always verify coverage details directly with your provider."
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
        <CoverageIntelligencePanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to load Coverage Intelligence.
        </div>
      )}

      <ToolMethodologyAccordion
        anchorId="methodology"
        whatItDoes="Reviews your warranties and insurance policy together to surface gaps, overlaps, and expiring protections across your home's key systems."
        steps={[
          {
            number: 1,
            title: 'Inventory your systems',
            description: "We read your home's inventory - appliances, HVAC, plumbing, electrical - including age and condition data.",
          },
          {
            number: 2,
            title: 'Map your coverage',
            description: "We parse your saved warranties and insurance policy to understand what is and isn't covered.",
          },
          {
            number: 3,
            title: 'Detect gaps',
            description: 'We identify systems that are past warranty, uninsured for failure, or approaching coverage expiry.',
          },
          {
            number: 4,
            title: 'Flag overlaps',
            description: 'We surface any redundant coverage so you avoid paying for protection you already have.',
          },
          {
            number: 5,
            title: 'Prioritise by risk',
            description: 'Gaps are ranked by the replacement cost and age of the underlying system - highest financial exposure first.',
          },
        ]}
        columns={[
          {
            heading: 'What it reviews',
            items: [
              'Active and expiring warranties',
              'Home warranty plan coverage',
              'Homeowners insurance exclusions',
              'System age vs. coverage duration',
            ],
          },
          {
            heading: 'When to use it',
            items: [
              'When adding or replacing a major system',
              'Before a warranty expires',
              'At policy renewal time',
              'After buying a home with inherited coverage',
            ],
          },
        ]}
      />
    </div>
  );
}

export default function CoverageIntelligencePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CoverageIntelligenceContent />
    </Suspense>
  );
}
