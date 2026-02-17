'use client';

import { useParams } from 'next/navigation';
import { SectionHeader } from '@/app/(dashboard)/dashboard/components/SectionHeader';
import HomeToolsRail from '../../components/HomeToolsRail';
import HomeSavingsCheckPanel from '@/components/ai/HomeSavingsCheckPanel';

export default function HomeSavingsToolClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <SectionHeader
        icon="💸"
        title="Home Savings Check"
        description="See where you may be overpaying and compare simple savings opportunities."
      />

      <HomeToolsRail propertyId={propertyId} />

      <HomeSavingsCheckPanel propertyId={propertyId} />
    </div>
  );
}
