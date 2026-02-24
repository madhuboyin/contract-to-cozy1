'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';
import { Button } from '@/components/ui/button';
import ToolExplainerSection, {
  openToolExplainer,
} from '@/components/tool-explainer/ToolExplainerSection';

export default function DoNothingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="⏳"
        title="Do-Nothing Simulator"
        description="See risk and cost impact if you delay action for 6, 12, 24, or 36 months."
        action={(
          <Button
            variant="link"
            className="h-auto p-0 text-sm text-brand-primary"
            onClick={() =>
              openToolExplainer({
                id: 'how-it-works',
                toolKey: 'doNothingSimulator',
              })
            }
          >
            Learn how it works
          </Button>
        )}
      />

      <HomeToolsRail propertyId={propertyId} />

      <ToolExplainerSection toolKey="doNothingSimulator" id="how-it-works" />

      <DoNothingSimulatorPanel propertyId={propertyId} />
    </div>
  );
}
