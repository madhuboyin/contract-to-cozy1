'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ToolWorkspaceTemplate from '../../components/route-templates/ToolWorkspaceTemplate';
import HiddenAssetFinderClient from '../hidden-asset-finder/HiddenAssetFinderClient';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';
import { InProgressPanel, RealizedPanel } from './SavingsBenefitsUnifiedPanels';

type Section = 'benefits' | 'recurring' | 'in-progress' | 'realized';

const VALID_SECTIONS: Section[] = ['benefits', 'recurring', 'in-progress', 'realized'];

export default function SavingsBenefitsClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();

  const requestedSection = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<Section>(
    (VALID_SECTIONS as string[]).includes(requestedSection ?? '')
      ? (requestedSection as Section)
      : 'benefits',
  );

  const backHref = `/dashboard/properties/${propertyId}`;

  return (
    <ToolWorkspaceTemplate
      backHref={backHref}
      backLabel="Back to property"
      eyebrow="Home tool"
      title="Savings and Benefits"
      subtitle="Find rebates, credits, and recurring-cost savings for this home, verify what remains, and track decisions in progress."
      trust={{
        confidenceLabel: 'Match quality varies by program and category — verify official criteria before acting',
        freshnessLabel: 'Refreshed when you re-scan or update linked bills and policies',
        sourceLabel: 'Property profile + linked accounts + program registry',
      }}
    >
      <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as Section)}>
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="benefits" className="px-2 text-xs sm:px-3 sm:text-sm">
            Benefits &amp; rebates
          </TabsTrigger>
          <TabsTrigger value="recurring" className="px-2 text-xs sm:px-3 sm:text-sm">
            Recurring costs
          </TabsTrigger>
          <TabsTrigger value="in-progress" className="px-2 text-xs sm:px-3 sm:text-sm">
            In progress
          </TabsTrigger>
          <TabsTrigger value="realized" className="px-2 text-xs sm:px-3 sm:text-sm">
            Realized
          </TabsTrigger>
        </TabsList>

        <TabsContent value="benefits" className="mt-5">
          <HiddenAssetFinderClient />
        </TabsContent>

        <TabsContent value="recurring" className="mt-5">
          <HomeSavingsCheckPanel propertyId={propertyId} />
        </TabsContent>

        <TabsContent value="in-progress" className="mt-5">
          <InProgressPanel propertyId={propertyId} />
        </TabsContent>

        <TabsContent value="realized" className="mt-5">
          <RealizedPanel propertyId={propertyId} />
        </TabsContent>
      </Tabs>
    </ToolWorkspaceTemplate>
  );
}
