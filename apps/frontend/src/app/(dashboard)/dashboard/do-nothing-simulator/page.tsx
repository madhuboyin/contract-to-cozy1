'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, PauseCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { useDashboardPropertySelection } from '@/lib/property/useDashboardPropertySelection';
import { Property } from '@/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';
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

function DoNothingSimulatorContent() {
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
            title="Do-Nothing Simulator"
            subtitle="Model risk and cost growth when maintenance is delayed."
            action={
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-700">
                <PauseCircle className="h-5 w-5" />
              </div>
            }
          />
        </div>
      }
      summary={
        <ResultHeroCard
          eyebrow="Delay Cost Simulator"
          title={selectedProperty ? selectedProperty.name || selectedProperty.address : 'Select a property'}
          value="6-36 month scenarios"
          status={<StatusChip tone="elevated">Educational</StatusChip>}
          summary="Stress test the cost of inaction and identify minimum actions to reduce downside."
          highlights={[
            'Deterministic risk/cost model',
            'Scenario save + rerun support',
            'Traceable impact drivers',
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
        <DoNothingSimulatorPanel propertyId={selectedPropertyId} />
      ) : (
        <div className="rounded-2xl border border-black/10 bg-white p-8 text-center text-gray-600">
          Select a property to run Do-Nothing Simulator.
        </div>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Trust & methodology
        </summary>
        <div className="mt-4 space-y-4">
          <ToolTrustBanner
            tone="amber"
            dataSources={[
              'Risk score',
              'Inventory age',
              'Maintenance history',
              'Claims (36-month)',
              'Insurance policy',
            ]}
            calculationMethod="Deterministic model. Compounds aging inventory, skipped maintenance, and claim history into a projected cost range over your chosen horizon. Every factor is traceable - no black-box estimates."
            disclaimer="Educational only. Not financial or insurance advice."
            learnMoreHref="#methodology"
          />

          <ToolMethodologyAccordion
            anchorId="methodology"
            whatItDoes="This tool shows the financial impact of delaying maintenance - so you can see how small issues grow into bigger costs."
            steps={[
              {
                number: 1,
                title: 'Select the issue',
                description: 'Choose the repair, risk, or home item you are evaluating.',
              },
              {
                number: 2,
                title: "Estimate today's cost",
                description: 'We calculate the current repair or replacement cost based on your home data.',
              },
              {
                number: 3,
                title: 'Project cost growth',
                description: 'We model how costs rise over time using inflation and common escalation patterns.',
              },
              {
                number: 4,
                title: 'Simulate failure risk',
                description: 'We estimate how the probability of failure increases as time passes.',
              },
              {
                number: 5,
                title: 'Compare scenarios',
                description: 'See proactive vs delayed outcomes side-by-side, including cost ranges.',
              },
            ]}
            columns={[
              {
                heading: "Why it's smart",
                items: [
                  'Models compounding risk over time',
                  'Includes inflation and cost escalation',
                  'Shows best-case and worst-case ranges',
                  'Highlights the cost of inaction clearly',
                ],
              },
              {
                heading: 'When to use it',
                items: [
                  "When you're debating whether to repair now or later",
                  'When planning a maintenance budget for the next 6-12 months',
                  'Before ignoring a recurring issue',
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

export default function DoNothingSimulatorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DoNothingSimulatorContent />
    </Suspense>
  );
}
