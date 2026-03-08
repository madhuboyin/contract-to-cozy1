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
import {
  BottomSafeAreaReserve,
  MobileFilterStack,
  MobilePageIntro,
  MobileToolWorkspace,
  ResultHeroCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
      className="max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8"
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
            title="Coverage Intelligence"
            subtitle="Insurance and warranty gap analysis for your home."
            action={
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-2.5 text-teal-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
            }
          />
        </div>
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
      summary={
        <ResultHeroCard
          eyebrow="Coverage Decision Support"
          title="Coverage Intelligence"
          value="Gap & overlap scan"
          status={<StatusChip tone="info">Deterministic</StatusChip>}
          summary="Find expiring protections, uninsured systems, and redundant coverage."
          highlights={[
            'Warranty + policy cross-check',
            'Priority-ranked exposure insights',
            'Actionable what-if simulation',
          ]}
        />
      }
    >
      {selectedPropertyId ? (
        <CoverageIntelligencePanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to load Coverage Intelligence.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Trust & methodology
        </summary>
        <div className="mt-4 space-y-4">
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
      </details>
      <BottomSafeAreaReserve size="chatAware" />
    </MobileToolWorkspace>
  );
}

export default function CoverageIntelligencePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CoverageIntelligenceContent />
    </Suspense>
  );
}
