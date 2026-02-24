'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, {
  openToolExplainer,
} from '@/components/tool-explainer/ToolExplainerSection';

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="🛡️"
        title="Coverage Intelligence"
        description="Insurance + warranty coverage assessment for this property."
        action={(
          <Button
            variant="link"
            className="h-auto p-0 text-sm text-brand-primary"
            onClick={() =>
              openToolExplainer({
                id: 'how-it-works',
                toolKey: 'coverageIntelligence',
              })
            }
          >
            Learn how it works
          </Button>
        )}
      />

      <HomeToolsRail propertyId={propertyId} />

      <ToolExplainerSection toolKey="coverageIntelligence" id="how-it-works" />

      <CoverageIntelligencePanel propertyId={propertyId} />
    </div>
  );
}
