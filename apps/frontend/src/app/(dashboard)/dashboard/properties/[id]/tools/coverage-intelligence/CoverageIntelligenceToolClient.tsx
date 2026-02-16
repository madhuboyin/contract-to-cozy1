'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import CoverageIntelligencePanel from '@/components/ai/CoverageIntelligencePanel';

export default function CoverageIntelligenceToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="🛡️"
        title="Coverage Intelligence"
        description="Insurance + warranty worth-it assessment for this property."
      />

      <HomeToolsRail propertyId={propertyId} />

      <CoverageIntelligencePanel propertyId={propertyId} />
    </div>
  );
}
