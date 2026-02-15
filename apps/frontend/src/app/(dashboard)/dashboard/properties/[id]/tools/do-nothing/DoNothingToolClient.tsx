'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import DoNothingSimulatorPanel from '@/components/ai/DoNothingSimulatorPanel';

export default function DoNothingToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-6 space-y-4">
      <SectionHeader
        icon="⏳"
        title="Do-Nothing Simulator"
        description="See risk and cost impact if you delay action for 6, 12, 24, or 36 months."
      />

      <DoNothingSimulatorPanel propertyId={propertyId} />
    </div>
  );
}
